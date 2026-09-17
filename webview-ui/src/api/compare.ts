import { callRpc } from "./rpc";

export function openCompareDiff(params: {
  orgApiUrl: string;
  webresourceId: string;
  webresourceName: string;
  localPath: string;
}): Promise<void> {
  return callRpc<void>("compare.openDiff", params);
}
