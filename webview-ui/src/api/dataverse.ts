import { callRpc } from "./rpc";

export function getWebResourceContent(orgApiUrl: string, webresourceId: string): Promise<string> {
  return callRpc<string>("dataverse.getWebResourceContent", { orgApiUrl, webresourceId });
}
