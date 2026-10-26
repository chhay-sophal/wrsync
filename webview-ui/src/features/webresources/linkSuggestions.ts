import { isLinkableFile } from "./webResourceTypes";

export interface SuggestionResource {
  webresourceid: string;
  name: string;
  webresourcetype: number;
}

/** How a candidate was found, strongest first: identical content (whatever the name), a
 * match on the file name plus folder(s), or the file name only. */
export type MatchKind = "identical" | "path" | "name";

/** A name-based proposal for one resource (see suggestByName). */
export interface NameSuggestion {
  resource: SuggestionResource;
  /** Best candidates first; more than one means the name alone can't decide. */
  candidates: string[];
  kind: Exclude<MatchKind, "identical">;
  /** True when the user must pick: several equally good candidates, or the best candidate is
   * also the best match for another resource. */
  ambiguous: boolean;
}

/** Identical-content matches found by the extension (src/linkSuggestionContent.ts). */
export interface ContentMatches {
  /** webresourceid -> local files of a matching type whose content is identical to it. */
  identical: Record<string, string[]>;
  /** Resources whose content another resource in the list shares - content alone can't tell
   * them apart. */
  shared: string[];
}

/** One row of the review: what to offer and what to pre-select. */
export interface LinkSuggestion {
  resource: SuggestionResource;
  /** Everything worth offering: identical-content files first, then name candidates. */
  candidates: string[];
  identicalPaths: string[];
  namePaths: string[];
  nameKind: Exclude<MatchKind, "identical"> | undefined;
  /** The initial choice, and whether it starts ticked. */
  path: string;
  checked: boolean;
  /** The user has to decide - shown with the Ambiguous badge and never pre-ticked. */
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
 * unlinked files of a matching type. A file-name-only match ("name") is weak on its own
 * (main.js, utils.js...), so it's kept as a suggestion but never preferred over a deeper path
 * match. */
export function suggestByName(resources: SuggestionResource[], filePaths: string[]): NameSuggestion[] {
  const suggestions: NameSuggestion[] = [];
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

/** How the given file was found for this suggestion. */
export function matchKindOf(suggestion: LinkSuggestion, path: string): MatchKind | undefined {
  if (suggestion.identicalPaths.includes(path)) return "identical";
  if (suggestion.namePaths.includes(path)) return suggestion.nameKind;
  return undefined;
}

/**
 * Combines name matching with identical-content matches into the rows to review. Content is
 * the stronger signal and wins - it finds renamed or moved copies whatever their names - while
 * names still cover edited copies, which content can't. A row starts ticked only when one file
 * is certain:
 *  - the resource's content is identical to exactly one file, which no other resource claims; or
 *  - several files are identical (or the content is shared with another resource) but one of
 *    them is also the resource's only path match (folder + name);
 *  - otherwise, with no content match, a unique path match (as name matching alone does).
 * Anything else is offered unticked as Ambiguous, for the user to pick.
 */
export function mergeSuggestions(
  resources: SuggestionResource[],
  filePaths: string[],
  content: ContentMatches | undefined
): LinkSuggestion[] {
  const byName = new Map(suggestByName(resources, filePaths).map((s) => [s.resource.webresourceid, s]));
  const identical = content?.identical ?? {};
  const shared = new Set(content?.shared ?? []);
  const claimsByFile = new Map<string, number>();
  for (const paths of Object.values(identical)) {
    for (const path of paths) claimsByFile.set(path, (claimsByFile.get(path) ?? 0) + 1);
  }

  const suggestions: LinkSuggestion[] = [];
  for (const resource of resources) {
    const name = byName.get(resource.webresourceid);
    const identicalPaths = identical[resource.webresourceid] ?? [];
    if (!name && identicalPaths.length === 0) continue;
    const namePaths = name?.candidates ?? [];
    const candidates = [...new Set([...identicalPaths, ...namePaths])];
    const base = { resource, candidates, identicalPaths, namePaths, nameKind: name?.kind };

    if (identicalPaths.length > 0) {
      const sole = identicalPaths[0];
      if (identicalPaths.length === 1 && !shared.has(resource.webresourceid) && claimsByFile.get(sole) === 1) {
        suggestions.push({ ...base, path: sole, checked: true, ambiguous: false });
        continue;
      }
      // Several identical files, or content shared with another resource: a single path match
      // (folder + name, not just the file name) among them settles it - even if another
      // resource wants that file by file name alone; the tie check below catches real clashes.
      const confirmed =
        name && name.kind === "path" && name.candidates.length === 1
          ? identicalPaths.filter((p) => p === name.candidates[0])
          : [];
      if (confirmed.length === 1) {
        suggestions.push({ ...base, path: confirmed[0], checked: true, ambiguous: false });
      } else {
        suggestions.push({ ...base, path: sole, checked: false, ambiguous: true });
      }
      continue;
    }

    // No content match: name matching alone, as before.
    suggestions.push({
      ...base,
      path: namePaths[0],
      checked: name!.kind === "path" && !name!.ambiguous,
      ambiguous: name!.ambiguous,
    });
  }

  // Two rows must never start ticked for the same file - neither is certain then.
  const tickedByFile = new Map<string, number>();
  for (const s of suggestions) if (s.checked) tickedByFile.set(s.path, (tickedByFile.get(s.path) ?? 0) + 1);
  for (const s of suggestions) {
    if (s.checked && (tickedByFile.get(s.path) ?? 0) > 1) {
      s.checked = false;
      s.ambiguous = true;
    }
  }

  return suggestions.sort((a, b) => a.resource.name.localeCompare(b.resource.name));
}
