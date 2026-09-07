import {
  Checkbox,
  Input,
  Radio,
  RadioGroup,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  tokens,
} from "@fluentui/react-components";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { listWebResourcesForSolution, type WebResource } from "../../api/dataverse";
import { usePersistedState } from "../../hooks/usePersistedState";
import { ColumnHeaderMenu, type SortDirection } from "./ColumnHeaderMenu";
import {
  deserializeFilters,
  EMPTY_FILTERS,
  FILTERS_STORAGE_KEY,
  matchesText,
  serializeFilters,
  type Filters,
  type ManagedFilter,
  type PersistedFilterEntry,
  type SortColumn,
  type SortState,
} from "./filterUtils";
import { WebResourceDetailsDialog } from "./WebResourceDetailsDialog";
import { WebResourceRow } from "./WebResourceRow";
import { TYPE_LABELS } from "./webResourceTypes";

export { FILTERS_STORAGE_KEY };

function sortValue(r: WebResource, column: SortColumn): string {
  switch (column) {
    case "name":
      return r.name;
    case "displayname":
      return r.displayname;
    case "type":
      return TYPE_LABELS[r.webresourcetype] ?? String(r.webresourcetype);
    case "managed":
      return r.ismanaged ? "Yes" : "No";
  }
}

export interface WebResourceListHandle {
  clearAllFiltersAndSort: () => void;
  refreshAll: () => Promise<void>;
}

interface Props {
  orgApiUrl: string;
  solutionId: string;
  onActiveFilterOrSortChange?: (active: boolean) => void;
  onRefreshingChange?: (refreshing: boolean) => void;
  ref?: Ref<WebResourceListHandle>;
}

export function WebResourceList({
  orgApiUrl,
  solutionId,
  onActiveFilterOrSortChange,
  onRefreshingChange,
  ref,
}: Props) {
  const [resources, setResources] = useState<WebResource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortState>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  // Persisted per-solution so switching solutions doesn't show another solution's filters,
  // but returning to one you've already filtered restores it. Read via a ref inside the
  // solution-switch effect below so that effect only fires on an actual solution switch, not
  // on every filter edit (which would otherwise re-trigger it through this dependency).
  const [persistedFilters, setPersistedFilters] = usePersistedState<Record<string, PersistedFilterEntry>>(
    FILTERS_STORAGE_KEY,
    {}
  );
  const persistedFiltersRef = useRef(persistedFilters);
  useEffect(() => {
    persistedFiltersRef.current = persistedFilters;
  }, [persistedFilters]);
  const scopeKey = `${orgApiUrl}::${solutionId}`;

  const hasActiveFilterOrSort =
    sort !== null ||
    filters.name !== "" ||
    filters.displayname !== "" ||
    filters.types.size > 0 ||
    filters.managed !== "all";

  useEffect(() => {
    onActiveFilterOrSortChange?.(hasActiveFilterOrSort);
  }, [hasActiveFilterOrSort, onActiveFilterOrSortChange]);

  const refreshResources = useCallback(() => {
    return listWebResourcesForSolution(orgApiUrl, solutionId)
      .then(setResources)
      .catch((err) => setError(err.message));
  }, [orgApiUrl, solutionId]);

  async function refreshAll() {
    onRefreshingChange?.(true);
    try {
      await refreshResources();
    } finally {
      onRefreshingChange?.(false);
    }
  }

  useImperativeHandle(ref, () => ({
    clearAllFiltersAndSort: () => {
      setFilters(EMPTY_FILTERS);
      setDraftFilters(EMPTY_FILTERS);
      setSort(null);
    },
    refreshAll,
  }));

  useEffect(() => {
    setResources(null);
    const saved = persistedFiltersRef.current[scopeKey];
    const restoredFilters = saved ? deserializeFilters(saved.filters) : EMPTY_FILTERS;
    setFilters(restoredFilters);
    setDraftFilters(restoredFilters);
    setSort(saved ? saved.sort : null);
    refreshResources();
    // scopeKey is derived from orgApiUrl/solutionId, which are already deps; persistedFiltersRef
    // is deliberately read via ref, not as a dep, so this only re-runs on an actual solution
    // switch rather than on every filter edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgApiUrl, solutionId, refreshResources]);

  // Persist the applied (not draft) filters/sort for this solution whenever they change.
  useEffect(() => {
    setPersistedFilters((prev) => ({
      ...prev,
      [scopeKey]: { filters: serializeFilters(filters), sort },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, filters, sort]);

  const availableTypes = useMemo(() => {
    const seen = new Map<number, string>();
    for (const r of resources ?? []) {
      if (!seen.has(r.webresourcetype)) {
        seen.set(r.webresourcetype, TYPE_LABELS[r.webresourcetype] ?? String(r.webresourcetype));
      }
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [resources]);

  const displayedResources = useMemo(() => {
    let list = (resources ?? []).filter(
      (r) =>
        matchesText(r.name, filters.name) &&
        matchesText(r.displayname, filters.displayname) &&
        (filters.types.size === 0 || filters.types.has(r.webresourcetype)) &&
        (filters.managed === "all" || (filters.managed === "managed") === r.ismanaged)
    );
    if (sort) {
      const dir = sort.direction === "asc" ? 1 : -1;
      list = [...list].sort((a, b) => sortValue(a, sort.column).localeCompare(sortValue(b, sort.column)) * dir);
    }
    return list;
  }, [resources, filters, sort]);

  function sortDirectionFor(column: SortColumn): SortDirection {
    return sort?.column === column ? sort.direction : null;
  }

  function toggleDraftType(code: number) {
    setDraftFilters((f) => {
      const types = new Set(f.types);
      if (types.has(code)) types.delete(code);
      else types.add(code);
      return { ...f, types };
    });
  }

  if (error) return <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{error}</Text>;
  if (!resources) return <Spinner label="Loading web resources..." />;
  if (resources.length === 0) return <Text>No web resources found in this solution.</Text>;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <Table className="w-full table-fixed min-w-[640px]">
          <TableHeader className="sticky top-0 z-10" style={{ background: tokens.colorNeutralBackground1 }}>
            <TableRow>
              <TableHeaderCell className="w-1/3">
                <HeaderContent label="Name">
                  <ColumnHeaderMenu
                    active={sortDirectionFor("name") !== null || filters.name !== ""}
                    sortDirection={sortDirectionFor("name")}
                    onSort={(direction) => setSort(direction ? { column: "name", direction } : null)}
                    onOpenChange={(open) => open && setDraftFilters(filters)}
                    onApply={() => setFilters(draftFilters)}
                    onClear={() => {
                      setFilters((f) => ({ ...f, name: "" }));
                      setDraftFilters((f) => ({ ...f, name: "" }));
                      setSort((s) => (s?.column === "name" ? null : s));
                    }}
                  >
                    <Input
                      size="small"
                      value={draftFilters.name}
                      onChange={(_, data) => setDraftFilters((f) => ({ ...f, name: data.value }))}
                      placeholder="e.g. *_form or contact"
                    />
                  </ColumnHeaderMenu>
                </HeaderContent>
              </TableHeaderCell>
              <TableHeaderCell className="w-1/3">
                <HeaderContent label="Display Name">
                  <ColumnHeaderMenu
                    active={sortDirectionFor("displayname") !== null || filters.displayname !== ""}
                    sortDirection={sortDirectionFor("displayname")}
                    onSort={(direction) =>
                      setSort(direction ? { column: "displayname", direction } : null)
                    }
                    onOpenChange={(open) => open && setDraftFilters(filters)}
                    onApply={() => setFilters(draftFilters)}
                    onClear={() => {
                      setFilters((f) => ({ ...f, displayname: "" }));
                      setDraftFilters((f) => ({ ...f, displayname: "" }));
                      setSort((s) => (s?.column === "displayname" ? null : s));
                    }}
                  >
                    <Input
                      size="small"
                      value={draftFilters.displayname}
                      onChange={(_, data) => setDraftFilters((f) => ({ ...f, displayname: data.value }))}
                      placeholder="e.g. Contact*"
                    />
                  </ColumnHeaderMenu>
                </HeaderContent>
              </TableHeaderCell>
              <TableHeaderCell className="w-[15%]">
                <HeaderContent label="Type">
                  <ColumnHeaderMenu
                    active={sortDirectionFor("type") !== null || filters.types.size > 0}
                    sortDirection={sortDirectionFor("type")}
                    onSort={(direction) => setSort(direction ? { column: "type", direction } : null)}
                    onOpenChange={(open) => open && setDraftFilters(filters)}
                    onApply={() => setFilters(draftFilters)}
                    onClear={() => {
                      setFilters((f) => ({ ...f, types: new Set() }));
                      setDraftFilters((f) => ({ ...f, types: new Set() }));
                      setSort((s) => (s?.column === "type" ? null : s));
                    }}
                  >
                    <div className="flex flex-col gap-1">
                      {availableTypes.map(([code, label]) => (
                        <Checkbox
                          key={code}
                          label={label}
                          checked={draftFilters.types.has(code)}
                          onChange={() => toggleDraftType(code)}
                        />
                      ))}
                    </div>
                  </ColumnHeaderMenu>
                </HeaderContent>
              </TableHeaderCell>
              <TableHeaderCell className="w-[15%]">
                <HeaderContent label="Managed">
                  <ColumnHeaderMenu
                    active={sortDirectionFor("managed") !== null || filters.managed !== "all"}
                    sortDirection={sortDirectionFor("managed")}
                    onSort={(direction) => setSort(direction ? { column: "managed", direction } : null)}
                    onOpenChange={(open) => open && setDraftFilters(filters)}
                    onApply={() => setFilters(draftFilters)}
                    onClear={() => {
                      setFilters((f) => ({ ...f, managed: "all" }));
                      setDraftFilters((f) => ({ ...f, managed: "all" }));
                      setSort((s) => (s?.column === "managed" ? null : s));
                    }}
                  >
                    <RadioGroup
                      value={draftFilters.managed}
                      onChange={(_, data) =>
                        setDraftFilters((f) => ({ ...f, managed: data.value as ManagedFilter }))
                      }
                    >
                      <Radio value="all" label="All" />
                      <Radio value="managed" label="Managed" />
                      <Radio value="unmanaged" label="Unmanaged" />
                    </RadioGroup>
                  </ColumnHeaderMenu>
                </HeaderContent>
              </TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayedResources.map((r) => (
              <WebResourceRow key={r.webresourceid} resource={r} onShowDetails={setDetailsId} />
            ))}
            {displayedResources.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Text>No web resources match the current filters.</Text>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <WebResourceDetailsDialog orgApiUrl={orgApiUrl} webresourceId={detailsId} onClose={() => setDetailsId(null)} />
    </div>
  );
}

function HeaderContent({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 font-bold">
      <span>{label}</span>
      {children}
    </div>
  );
}
