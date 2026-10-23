import { callRpc } from "./rpc";

export interface LinkSuggestionsData {
  orgApiUrl: string;
  environmentId: string;
  solutionUniqueName: string;
  solutionName: string;
  resources: { webresourceid: string; name: string; webresourcetype: number }[];
  filePaths: string[];
}

/** Opens (or reuses) the "Suggested links" editor tab with this data. */
export function openLinkSuggestions(data: LinkSuggestionsData): Promise<void> {
  return callRpc<void>("ui.openLinkSuggestions", data);
}
