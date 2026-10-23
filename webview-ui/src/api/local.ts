import { callRpc } from "./rpc";

export interface ResourceLink {
  id: string;
  environmentId: string;
  solutionUniqueName: string;
  webresourceId: string;
  webresourceName: string;
  localPath: string;
}

export function getLocalFileContent(path: string): Promise<string> {
  return callRpc<string>("workspace.getFileContent", { path });
}

export function createLinks(links: Omit<ResourceLink, "id">[]): Promise<ResourceLink[]> {
  return callRpc<ResourceLink[]>("links.createMany", { links });
}
