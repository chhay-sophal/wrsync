import { callRpc } from "./rpc";

export interface LocalFile {
  path: string;
  mtimeMs: number;
}

export interface ResourceLink {
  id: string;
  environmentId: string;
  solutionUniqueName: string;
  webresourceId: string;
  webresourceName: string;
  localPath: string;
}

export function listWorkspaceFiles(): Promise<{ root: string | null; files: LocalFile[] }> {
  return callRpc<{ root: string | null; files: LocalFile[] }>("workspace.listFiles");
}

export function listLinks(): Promise<ResourceLink[]> {
  return callRpc<ResourceLink[]>("links.list");
}

export function createLink(link: Omit<ResourceLink, "id">): Promise<ResourceLink> {
  return callRpc<ResourceLink>("links.create", link);
}

/** Whether each link's local file differs from its Dataverse content, keyed by webresourceId.
 * Links that couldn't be checked (e.g. unreadable file) are absent. */
export function checkLinksModified(
  orgApiUrl: string,
  links: Pick<ResourceLink, "webresourceId" | "localPath">[]
): Promise<Record<string, boolean>> {
  return callRpc<Record<string, boolean>>("links.checkModified", {
    orgApiUrl,
    links: links.map(({ webresourceId, localPath }) => ({ webresourceId, localPath })),
  });
}

export function createLinks(links: Omit<ResourceLink, "id">[]): Promise<ResourceLink[]> {
  return callRpc<ResourceLink[]>("links.createMany", { links });
}

export function deleteLink(id: string): Promise<void> {
  return callRpc<void>("links.delete", { id });
}

export function getLocalFileContent(path: string): Promise<string> {
  return callRpc<string>("workspace.getFileContent", { path });
}

/** Overwrites the linked local file with the web resource's current Dataverse content. */
export function pullFromDataverse(orgApiUrl: string, webresourceId: string, localPath: string): Promise<void> {
  return callRpc<void>("workspace.pullFromDataverse", { orgApiUrl, webresourceId, localPath });
}
