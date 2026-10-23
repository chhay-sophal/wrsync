import { isLinkableFile } from "./webResourceTypes";

export interface SuggestionResource {
  webresourceid: string;
  name: string;
  webresourcetype: number;
}

/** How a suggestion was found, strongest first. "identical" is assigned later, once the
 * content check confirms a candidate's local content equals what's in Dataverse. */
export type MatchKind = "identical" | "path" | "name";

export interface LinkSuggestion {
  resource: SuggestionResource;
  /** Best candidates first; more than one means the name alone can't decide. */
  candidates: string[];
  kind: Exclude<MatchKind, "identical">;
  /** True when the user must pick: several equally good candidates, or the best candidate is
   * also the best match for another resource. Ambiguous suggestions start unticked. */
  ambiguous: boolean;
}

function segments(path: string): string[] {
  return path.toLowerCase().split(/[\\/]/).filter(Boolean);
}

/** The resource name's path segments, plus a variant without the publisher prefix, which
 * local layouts usually omit: "new_/scripts/a.js" -> also "scripts/a.js", and
 * "contoso_account_form.js" -> also "account_form.js". */
function nameVariants(name: string): string[][] {
  const parts = segments(name);
  const variants = [parts];
  const [first, ...rest] = parts;
  if (rest.length > 0 && /^[a-z0-9]+_$/.test(first)) {
    variants.push(rest);
  } else {
    const prefixed = /^[a-z0-9]+_(.+)$/.exec(first);
    if (prefixed) variants.push([prefixed[1], ...rest]);
  }
  return variants;
}

/** Number of trailing path segments the file shares with the resource name (best variant).
 * 0 means even the file name differs. */
function trailingMatch(variants: string[][], filePath: string): number {
  const fileParts = segments(filePath);
  let best = 0;
  for (const variant of variants) {
    let n = 0;
    while (
      n < variant.length &&
      n < fileParts.length &&
      variant[variant.length - 1 - n] === fileParts[fileParts.length - 1 - n]
    ) {
      n++;
    }
    best = Math.max(best, n);
  }
  return best;
}

/** Proposes a local file for each unlinked resource by comparing its name with the paths of
 * unlinked files of a matching type. Name matching only - the caller confirms candidates by
 * content. A file-name-only match ("name") is weak on its own (main.js, utils.js...), so it's
 * kept as a suggestion but never preferred over a deeper path match. */
export function suggestLinks(resources: SuggestionResource[], filePaths: string[]): LinkSuggestion[] {
  const suggestions: LinkSuggestion[] = [];
  for (const resource of resources) {
    const variants = nameVariants(resource.name);
    let bestScore = 0;
    let candidates: string[] = [];
    for (const path of filePaths) {
      if (!isLinkableFile(resource.webresourcetype, path)) continue;
      const score = trailingMatch(variants, path);
      if (score === 0 || score < bestScore) continue;
      if (score > bestScore) {
        bestScore = score;
        candidates = [];
      }
      candidates.push(path);
    }
    if (candidates.length === 0) continue;
    candidates.sort();
    suggestions.push({
      resource,
      candidates,
      kind: bestScore >= 2 ? "path" : "name",
      ambiguous: candidates.length > 1,
    });
  }

  // A file can back only one resource. If the same file is the sole best candidate for more
  // than one resource, none of them can be trusted to claim it automatically.
  const claims = new Map<string, number>();
  for (const s of suggestions) {
    if (!s.ambiguous) claims.set(s.candidates[0], (claims.get(s.candidates[0]) ?? 0) + 1);
  }
  for (const s of suggestions) {
    if (!s.ambiguous && (claims.get(s.candidates[0]) ?? 0) > 1) s.ambiguous = true;
  }

  return suggestions.sort((a, b) => a.resource.name.localeCompare(b.resource.name));
}
