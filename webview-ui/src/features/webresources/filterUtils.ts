export type ManagedFilter = "all" | "managed" | "unmanaged";
export type SortColumn = "name" | "displayname" | "type" | "managed";
export type SortState = { column: SortColumn; direction: "asc" | "desc" } | null;

export interface Filters {
  name: string;
  displayname: string;
  types: Set<number>;
  managed: ManagedFilter;
}

export const EMPTY_FILTERS: Filters = { name: "", displayname: "", types: new Set(), managed: "all" };

/** localStorage can't hold a Set directly, so filters get flattened to a plain array for
 * persistence and rebuilt into a Set on the way back out. */
export interface SerializedFilters {
  name: string;
  displayname: string;
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

export function deserializeFilters(s: SerializedFilters): Filters {
  return { ...s, types: new Set(s.types) };
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
