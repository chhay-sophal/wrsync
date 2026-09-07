import { POWER_PLATFORM_RESOURCE, getAccessToken } from "./auth";

const API_VERSION = "v9.2";

/** Solution component type code for Web Resource records, per Dataverse's componenttype option set. */
const WEBRESOURCE_COMPONENT_TYPE = 61;

export interface DataverseEnvironment {
  id: string;
  displayName: string;
  domainName: string;
  apiUrl: string;
  tenantId: string;
}

interface EnvironmentResponse {
  id: string;
  displayName: string;
  domainName: string;
  url: string;
  tenantId: string;
  state: string;
}

/** Converts an environment's app URL (https://org.crm5.dynamics.com) to its dedicated
 * Web API endpoint (https://org.api.crm5.dynamics.com) — the same transform Global
 * Discovery used to hand back directly as a separate "ApiUrl" field. */
export function toApiUrl(orgUrl: string): string {
  const url = new URL(orgUrl);
  const labels = url.hostname.split(".");
  if (labels.length > 1 && labels[1] !== "api") {
    labels.splice(1, 0, "api");
  }
  return `${url.protocol}//${labels.join(".")}`;
}

/** Power Platform API's "List Environments For User" — returns environments across every
 * tenant the account can see, including tenantId per environment, which Global Discovery
 * (its now-legacy predecessor) doesn't surface as cleanly for guest accounts. */
export async function listEnvironments(): Promise<DataverseEnvironment[]> {
  const token = await getAccessToken(POWER_PLATFORM_RESOURCE);
  const res = await fetch(
    `${POWER_PLATFORM_RESOURCE}/environmentmanagement/environments?api-version=2024-10-01`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
  );
  if (!res.ok) {
    throw new Error(`Failed to list environments: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { value: EnvironmentResponse[] };
  return data.value
    .filter((env) => env.url)
    .map((env) => ({
      id: env.id,
      displayName: env.displayName,
      domainName: env.domainName,
      apiUrl: toApiUrl(env.url.replace(/\/+$/, "")),
      tenantId: env.tenantId,
    }));
}

export interface Solution {
  solutionid: string;
  uniquename: string;
  friendlyname: string;
  ismanaged: boolean;
}

export interface WebResource {
  webresourceid: string;
  name: string;
  displayname: string;
  webresourcetype: number;
  ismanaged: boolean;
}

export interface WebResourceDetails extends WebResource {
  description: string | null;
  languagecode: number | null;
  createdon: string | null;
  modifiedon: string | null;
}

async function callDataverse(
  orgApiUrl: string,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = await getAccessToken(orgApiUrl);
  const res = await fetch(`${orgApiUrl}/api/data/${API_VERSION}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`Dataverse request failed: ${res.status} ${await res.text()}`);
  }
  return res;
}

export async function listSolutions(orgApiUrl: string): Promise<Solution[]> {
  const res = await callDataverse(
    orgApiUrl,
    "solutions?$select=solutionid,uniquename,friendlyname,ismanaged" +
      "&$filter=isvisible eq true and ismanaged eq false and uniquename ne 'Default'"
  );
  const data = (await res.json()) as { value: Solution[] };
  return data.value;
}

export async function listWebResourcesForSolution(
  orgApiUrl: string,
  solutionId: string
): Promise<WebResource[]> {
  const componentsRes = await callDataverse(
    orgApiUrl,
    `solutioncomponents?$select=objectid&$filter=_solutionid_value eq ${solutionId} and componenttype eq ${WEBRESOURCE_COMPONENT_TYPE}`
  );
  const components = (await componentsRes.json()) as { value: { objectid: string }[] };
  const ids = components.value.map((c) => c.objectid);
  if (ids.length === 0) {return [];}

  const filter = ids.map((id) => `webresourceid eq ${id}`).join(" or ");
  const resourcesRes = await callDataverse(
    orgApiUrl,
    `webresourceset?$select=webresourceid,name,displayname,webresourcetype,ismanaged&$filter=${filter}`
  );
  const data = (await resourcesRes.json()) as { value: WebResource[] };
  return data.value;
}

export async function getWebResourceDetails(
  orgApiUrl: string,
  webresourceId: string
): Promise<WebResourceDetails> {
  const res = await callDataverse(
    orgApiUrl,
    `webresourceset(${webresourceId})?$select=webresourceid,name,displayname,description,` +
      "webresourcetype,ismanaged,languagecode,createdon,modifiedon"
  );
  return (await res.json()) as WebResourceDetails;
}

export async function getWebResourceContent(
  orgApiUrl: string,
  webresourceId: string
): Promise<string> {
  const res = await callDataverse(orgApiUrl, `webresourceset(${webresourceId})?$select=content`);
  const data = (await res.json()) as { content: string };
  return data.content;
}

export async function createWebResource(
  orgApiUrl: string,
  solutionUniqueName: string,
  resource: { name: string; displayname: string; webresourcetype: number; content: string }
): Promise<string> {
  const res = await callDataverse(orgApiUrl, "webresourceset", {
    method: "POST",
    headers: { "MSCRM.SolutionUniqueName": solutionUniqueName },
    body: JSON.stringify(resource),
  });
  const location = res.headers.get("OData-EntityId") ?? "";
  const match = location.match(/\(([0-9a-fA-F-]+)\)/);
  if (!match) {throw new Error("Could not determine new web resource id from response");}
  return match[1];
}

export async function updateWebResourceContent(
  orgApiUrl: string,
  webresourceId: string,
  base64Content: string
): Promise<void> {
  await callDataverse(orgApiUrl, `webresourceset(${webresourceId})`, {
    method: "PATCH",
    body: JSON.stringify({ content: base64Content }),
  });
}

export async function deleteWebResource(orgApiUrl: string, webresourceId: string): Promise<void> {
  await callDataverse(orgApiUrl, `webresourceset(${webresourceId})`, { method: "DELETE" });
}

export async function publishWebResources(
  orgApiUrl: string,
  webresourceIds: string[]
): Promise<void> {
  const inner = webresourceIds.map((id) => `<webresource>{${id}}</webresource>`).join("");
  const parameterXml = `<importexportxml><webresources>${inner}</webresources></importexportxml>`;
  await callDataverse(orgApiUrl, "PublishXml", {
    method: "POST",
    body: JSON.stringify({ ParameterXml: parameterXml }),
  });
}
