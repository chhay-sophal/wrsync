import { callRpc } from "./rpc";

export interface DataverseEnvironment {
  id: string;
  displayName: string;
  domainName: string;
  apiUrl: string;
  tenantId: string;
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

export function listEnvironments(): Promise<DataverseEnvironment[]> {
  return callRpc<DataverseEnvironment[]>("dataverse.listEnvironments");
}

export function listSolutions(orgApiUrl: string): Promise<Solution[]> {
  return callRpc<Solution[]>("dataverse.listSolutions", { orgApiUrl });
}

export function listWebResourcesForSolution(orgApiUrl: string, solutionId: string): Promise<WebResource[]> {
  return callRpc<WebResource[]>("dataverse.listWebResourcesForSolution", { orgApiUrl, solutionId });
}

export function getWebResourceDetails(orgApiUrl: string, webresourceId: string): Promise<WebResourceDetails> {
  return callRpc<WebResourceDetails>("dataverse.getWebResourceDetails", { orgApiUrl, webresourceId });
}

export function getWebResourceContent(orgApiUrl: string, webresourceId: string): Promise<string> {
  return callRpc<string>("dataverse.getWebResourceContent", { orgApiUrl, webresourceId });
}

export function updateWebResourceContent(
  orgApiUrl: string,
  webresourceId: string,
  base64Content: string
): Promise<void> {
  return callRpc<void>("dataverse.updateWebResourceContent", { orgApiUrl, webresourceId, base64Content });
}

export function publishWebResources(orgApiUrl: string, webresourceIds: string[]): Promise<void> {
  return callRpc<void>("dataverse.publishWebResources", { orgApiUrl, webresourceIds });
}
