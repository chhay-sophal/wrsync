export type ManagedFilter = "all" | "managed" | "unmanaged";
export type SortColumn = "name" | "displayname" | "type" | "managed";
export type SortState = { column: SortColumn; direction: "asc" | "desc" } | null;

export interface Filters {
  /** Matches against name OR displayname - a single combined search box, since the sidebar's
   * narrow width has no room for the original app's two separate per-column text filters. */
  search: string;
  types: Set<number>;
  managed: ManagedFilter;
}

export const EMPTY_FILTERS: Filters = { search: "", types: new Set(), managed: "all" };

/** localStorage can't hold a Set directly, so filters get flattened to a plain array for
 * persistence and rebuilt into a Set on the way back out. */
export interface SerializedFilters {
  search: string;
  types: number[];
  managed: ManagedFilter;
}

export interface PersistedFilterEntry {
  filters: SerializedFilters;
  sort: SortState;
}

/** Exported so App.tsx can wipe this on sign-out — filters should only persist while the
 * same user stays signed in, not across accounts on a shared machine. */
export const FILTERS_STORAGE_KEY = "wrsync.webResourceFilters";

export function serializeFilters(f: Filters): SerializedFilters {
  return { ...f, types: [...f.types] };
}

/** Guards against a persisted entry from before the two-field name/displayname filter was
 * combined into a single search box - old data has no `search` key, which would otherwise
 * flow through as `undefined` and crash matchesText()'s .trim() call. */
export function deserializeFilters(s: Partial<SerializedFilters>): Filters {
  return {
    search: s.search ?? "",
    types: new Set(s.types ?? []),
    managed: s.managed ?? "all",
  };
}

/** Matches `pattern` against `value`. Plain text is a case-insensitive "contains" match;
 * `*` (any run of characters) and `?` (any single character) make it a full wildcard match. */
export function matchesText(value: string, pattern: string): boolean {
  if (!pattern.trim()) return true;
  if (!/[*?]/.test(pattern)) {
    return value.toLowerCase().includes(pattern.toLowerCase());
  }
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i").test(value);
}
