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

/** Opens VS Code's read-only diff of the web resource's Dataverse content and a local file, in
 * a new tab next to the Suggested Links tab. */
export function openCompareDiff(params: {
  orgApiUrl: string;
  webresourceId: string;
  webresourceName: string;
  webresourcetype: number;
  localPath: string;
}): Promise<void> {
  return callRpc<void>("compare.openDiff", params);
}

export function createLinks(links: Omit<ResourceLink, "id">[]): Promise<ResourceLink[]> {
  return callRpc<ResourceLink[]>("links.createMany", { links });
}
