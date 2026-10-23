import { Checkbox, Spinner, Text, tokens } from "@fluentui/react-components";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import {
  listWebResourcesForSolution,
  publishWebResources,
  updateWebResourceContent,
  type WebResource,
} from "../../api/dataverse";
import {
  checkLinksModified,
  getLocalFileContent,
  listLinks,
  type LocalFile,
  type ResourceLink,
} from "../../api/local";
import { openLinkSuggestions } from "../../api/ui";
import { usePersistedState } from "../../hooks/usePersistedState";
import { utf8ToBase64 } from "../../lib/base64";
import { ConfirmPublishDialog } from "./ConfirmPublishDialog";
import { CreateWebResourceDialog } from "./CreateWebResourceDialog";
import {
  deserializeFilters,
  EMPTY_FILTERS,
  FILTERS_STORAGE_KEY,
  matchesText,
  serializeFilters,
  type Filters,
  type PersistedFilterEntry,
  type SortColumn,
  type SortState,
} from "./filterUtils";
import { WebResourceCard } from "./WebResourceCard";
import { WebResourceDetailsDialog } from "./WebResourceDetailsDialog";
import { WebResourceToolbar } from "./WebResourceToolbar";
import { isLinkableFile, linkableExtensions, TYPE_LABELS } from "./webResourceTypes";

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
  /** Asks for confirmation first; the publish itself runs once the user confirms. */
  publishSelected: () => void;
  openCreateDialog: () => void;
  openLinkSuggestions: () => void;
  refreshAll: () => Promise<void>;
}

interface Props {
  orgApiUrl: string;
  solutionId: string;
  environmentId: string;
  solutionUniqueName: string;
  solutionName: string;
  localFiles: LocalFile[];
  modifiedPaths: Set<string>;
  onFilePublished: (localPath: string) => void;
  onSelectedCountChange?: (count: number) => void;
  onPublishingChange?: (publishing: boolean) => void;
  onRefreshingChange?: (refreshing: boolean) => void;
  ref?: Ref<WebResourceListHandle>;
}

export function WebResourceList({
  orgApiUrl,
  solutionId,
  environmentId,
  solutionUniqueName,
  solutionName,
  localFiles,
  modifiedPaths,
  onFilePublished,
  onSelectedCountChange,
  onPublishingChange,
  onRefreshingChange,
  ref,
}: Props) {
  const [resources, setResources] = useState<WebResource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortState>(null);
  const [links, setLinks] = useState<ResourceLink[]>([]);
  const [modifiedStatus, setModifiedStatus] = useState<Map<string, boolean>>(new Map());
  const [publishError, setPublishError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [pendingPublishIds, setPendingPublishIds] = useState<string[] | null>(null);

  const refreshLinks = useCallback(() => {
    listLinks().then(setLinks);
  }, []);

  useEffect(() => {
    refreshLinks();
  }, [refreshLinks]);

  // Links can change outside this view - e.g. from the "Suggested links" editor tab - and the
  // extension announces it so the cards update without a manual refresh.
  useEffect(() => {
    function handleMessage(ev: MessageEvent) {
      if ((ev.data as { type?: string })?.type === "linksChanged") refreshLinks();
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [refreshLinks]);

  /** Checks the given links in one RPC; the extension fetches their Dataverse content in
   * batched requests and compares it with the local files. Links stored for other
   * environments are skipped - they can't exist in this one. */
  const checkModified = useCallback(
    async (toCheck: ResourceLink[]) => {
      const inEnvironment = toCheck.filter((l) => l.environmentId === environmentId);
      if (inEnvironment.length === 0) return;
      try {
        const result = await checkLinksModified(orgApiUrl, inEnvironment);
        setModifiedStatus((prev) => {
          const next = new Map(prev);
          for (const [id, modified] of Object.entries(result)) next.set(id, modified);
          return next;
        });
      } catch {
        // Transient fetch error — leave the previous known state alone rather than guess.
      }
    },
    [orgApiUrl, environmentId]
  );

  // Full check whenever the linked-files list changes (initial load, solution switch, or a
  // link was just created/removed).
  useEffect(() => {
    checkModified(links);
  }, [links, checkModified]);

  // Content can also change in Dataverse from outside this view ("Publish This File" in the
  // editor); the extension announces it so the cards' Modified state catches up.
  useEffect(() => {
    function handleMessage(ev: MessageEvent) {
      if ((ev.data as { type?: string })?.type === "recheckModified") checkModified(links);
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [links, checkModified]);

  // Incremental re-check when a watched local file changes.
  useEffect(() => {
    checkModified(links.filter((link) => modifiedPaths.has(link.localPath)));
  }, [modifiedPaths, links, checkModified]);

  const handleCardSynced = useCallback(
    (webresourceId: string, localPath: string) => {
      setModifiedStatus((prev) => new Map(prev).set(webresourceId, false));
      onFilePublished(localPath);
    },
    [onFilePublished]
  );

  useEffect(() => {
    onSelectedCountChange?.(selectedIds.size);
  }, [selectedIds, onSelectedCountChange]);

  /** Updates local-linked content for the given resources (in parallel) and publishes
   * everything that either updated successfully or has no local link to update from. */
  async function publishResources(requestedIds: string[]) {
    if (requestedIds.length === 0) return;
    // A link whose file type doesn't match its resource (made before linking was restricted
    // by type) is left out entirely: uploading it would overwrite the resource with the wrong
    // kind of content, and publishing it un-updated would be misleading.
    const typeById = new Map((resources ?? []).map((r) => [r.webresourceid, r.webresourcetype]));
    const mismatched = links.filter(
      (l) =>
        requestedIds.includes(l.webresourceId) &&
        !isLinkableFile(typeById.get(l.webresourceId) ?? 0, l.localPath)
    );
    const mismatchedIds = new Set(mismatched.map((l) => l.webresourceId));
    const skippedMessage =
      mismatched.length > 0
        ? `Skipped (linked file type doesn't match): ${mismatched.map((l) => l.webresourceName).join(", ")}`
        : null;
    const webresourceIds = requestedIds.filter((id) => !mismatchedIds.has(id));
    setPublishError(skippedMessage);
    if (webresourceIds.length === 0) return;
    const idSet = new Set(webresourceIds);
    const linked = links.filter((l) => idSet.has(l.webresourceId));
    onPublishingChange?.(true);
    try {
      const results = await Promise.allSettled(
        linked.map(async (link) => {
          const content = await getLocalFileContent(link.localPath);
          await updateWebResourceContent(orgApiUrl, link.webresourceId, utf8ToBase64(content));
          return link;
        })
      );
      const failedIds = new Set<string>();
      const failedNames: string[] = [];
      const succeededLinks: ResourceLink[] = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled") succeededLinks.push(result.value);
        else {
          failedIds.add(linked[index].webresourceId);
          failedNames.push(linked[index].webresourceName);
        }
      });
      const toPublish = webresourceIds.filter((id) => !failedIds.has(id));
      if (toPublish.length > 0) {
        await publishWebResources(orgApiUrl, toPublish);
        setModifiedStatus((prev) => {
          const next = new Map(prev);
          for (const id of toPublish) next.set(id, false);
          return next;
        });
        succeededLinks.forEach((l) => onFilePublished(l.localPath));
      }
      if (failedNames.length > 0) {
        setPublishError(
          [skippedMessage, `Failed to update: ${failedNames.join(", ")}`].filter(Boolean).join(". ")
        );
      }
    } catch (err) {
      setPublishError((err as Error).message);
    } finally {
      onPublishingChange?.(false);
    }
  }

  function publishSelected() {
    if (selectedIds.size > 0) setPendingPublishIds([...selectedIds]);
  }

  async function confirmPublish() {
    if (!pendingPublishIds) return;
    const ids = pendingPublishIds;
    setPendingPublishIds(null);
    await publishResources(ids);
    setSelectedIds(new Set());
  }

  const pendingPublishItems = useMemo(() => {
    if (!pendingPublishIds) return null;
    return pendingPublishIds.map((id) => ({
      id,
      name:
        resources?.find((r) => r.webresourceid === id)?.name ??
        links.find((l) => l.webresourceId === id)?.webresourceName ??
        id,
    }));
  }, [pendingPublishIds, resources, links]);

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
    publishSelected,
    openCreateDialog: () => setCreateDialogOpen(true),
    openLinkSuggestions: () => {
      if (!resources) return;
      openLinkSuggestions({
        orgApiUrl,
        environmentId,
        solutionUniqueName,
        solutionName,
        resources: resources
          .filter((r) => linkableExtensions(r.webresourcetype) && !links.some((l) => l.webresourceId === r.webresourceid))
          .map(({ webresourceid, name, webresourcetype }) => ({ webresourceid, name, webresourcetype })),
        filePaths: localFiles.map((f) => f.path).filter((path) => !links.some((l) => l.localPath === path)),
      }).catch((err) => setPublishError((err as Error).message));
    },
    refreshAll,
  }));

  useEffect(() => {
    setResources(null);
    const saved = persistedFiltersRef.current[scopeKey];
    setFilters(saved ? deserializeFilters(saved.filters) : EMPTY_FILTERS);
    setSort(saved ? saved.sort : null);
    refreshResources();
    // scopeKey is derived from orgApiUrl/solutionId, which are already deps; persistedFiltersRef
    // is deliberately read via ref, not as a dep, so this only re-runs on an actual solution
    // switch rather than on every filter edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgApiUrl, solutionId, refreshResources]);

  // Persist the applied filters/sort for this solution whenever they change.
  useEffect(() => {
    setPersistedFilters((prev) => ({
      ...prev,
      [scopeKey]: { filters: serializeFilters(filters), sort },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, filters, sort]);

  function handleCreated() {
    setCreateDialogOpen(false);
    refreshResources();
  }

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
        (matchesText(r.name, filters.search) || matchesText(r.displayname, filters.search)) &&
        (filters.types.size === 0 || filters.types.has(r.webresourcetype)) &&
        (filters.managed === "all" || (filters.managed === "managed") === r.ismanaged) &&
        (!filters.modifiedOnly || modifiedStatus.get(r.webresourceid) === true)
    );
    if (sort) {
      const dir = sort.direction === "asc" ? 1 : -1;
      list = [...list].sort((a, b) => sortValue(a, sort.column).localeCompare(sortValue(b, sort.column)) * dir);
    }
    return list;
  }, [resources, filters, sort, modifiedStatus]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allDisplayedSelected =
    displayedResources.length > 0 && displayedResources.every((r) => selectedIds.has(r.webresourceid));
  const someDisplayedSelected = displayedResources.some((r) => selectedIds.has(r.webresourceid));

  function toggleSelectAllDisplayed() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allDisplayedSelected) {
        displayedResources.forEach((r) => next.delete(r.webresourceid));
      } else {
        displayedResources.forEach((r) => next.add(r.webresourceid));
      }
      return next;
    });
  }

  const createDialog = (
    <CreateWebResourceDialog
      orgApiUrl={orgApiUrl}
      solutionUniqueName={solutionUniqueName}
      open={createDialogOpen}
      onClose={() => setCreateDialogOpen(false)}
      onCreated={handleCreated}
    />
  );

  if (error)
    return (
      <>
        <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{error}</Text>
        {createDialog}
      </>
    );
  if (!resources)
    return (
      <>
        <Spinner label="Loading web resources..." />
        {createDialog}
      </>
    );
  if (resources.length === 0)
    return (
      <>
        <Text>No web resources found in this solution.</Text>
        {createDialog}
      </>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {publishError && (
        <Text block style={{ color: tokens.colorPaletteRedForeground1 }}>
          {publishError}
        </Text>
      )}

      <WebResourceToolbar
        filters={filters}
        onFiltersChange={setFilters}
        sort={sort}
        onSortChange={setSort}
        availableTypes={availableTypes}
      />

      <Checkbox
        className="shrink-0"
        checked={allDisplayedSelected ? true : someDisplayedSelected ? "mixed" : false}
        onChange={toggleSelectAllDisplayed}
        label={`${displayedResources.length} resource(s)`}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
        {displayedResources.map((r) => (
          <WebResourceCard
            key={r.webresourceid}
            resource={r}
            isSelected={selectedIds.has(r.webresourceid)}
            onToggleSelected={toggleSelected}
            onShowDetails={setDetailsId}
            orgApiUrl={orgApiUrl}
            environmentId={environmentId}
            solutionUniqueName={solutionUniqueName}
            localFiles={localFiles}
            link={links.find((l) => l.webresourceId === r.webresourceid)}
            isModified={modifiedStatus.get(r.webresourceid) ?? false}
            onLinksChanged={refreshLinks}
            onSynced={handleCardSynced}
          />
        ))}
        {displayedResources.length === 0 && <Text>No web resources match the current filters.</Text>}
      </div>

      <WebResourceDetailsDialog orgApiUrl={orgApiUrl} webresourceId={detailsId} onClose={() => setDetailsId(null)} />
      <ConfirmPublishDialog
        orgApiUrl={orgApiUrl}
        items={pendingPublishItems}
        onConfirm={confirmPublish}
        onCancel={() => setPendingPublishIds(null)}
      />
      {createDialog}
    </div>
  );
}
