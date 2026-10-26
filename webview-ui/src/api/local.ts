import type { ContentMatches } from "../features/webresources/linkSuggestions";
import { callRpc } from "./rpc";

export interface ResourceLink {
  id: string;
  environmentId: string;
  solutionUniqueName: string;
  webresourceId: string;
  webresourceName: string;
  localPath: string;
}

/** Asks the extension to compare the content of these web resources with these local files
 * (batched downloads, local reads and fingerprints all happen there - see
 * src/linkSuggestionContent.ts) and return the identical matches. */
export function findIdenticalContent(params: {
  orgApiUrl: string;
  resources: { webresourceid: string; webresourcetype: number }[];
  filePaths: string[];
}): Promise<ContentMatches> {
  return callRpc<ContentMatches>("suggestions.findIdenticalContent", params);
}

export function createLinks(links: Omit<ResourceLink, "id">[]): Promise<ResourceLink[]> {
  return callRpc<ResourceLink[]>("links.createMany", { links });
}
