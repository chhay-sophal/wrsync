import {
  Badge,
  Button,
  Checkbox,
  Divider,
  Dropdown,
  Option,
  Spinner,
  Text,
  Tooltip,
  tokens,
} from "@fluentui/react-components";
import { ArrowRightRegular, BranchCompareRegular, LinkMultipleRegular } from "@fluentui/react-icons";
import { useEffect, useMemo, useState } from "react";
import vscodeApi from "../../vscodeApi";
import { createLinks, findIdenticalContent, openCompareDiff } from "../../api/local";
import { isRowClick } from "../../lib/rowClick";
import {
  matchKindOf,
  mergeSuggestions,
  type ContentMatches,
  type LinkSuggestion,
  type MatchKind,
  type SuggestionResource,
} from "./linkSuggestions";

/** Sent by the extension (src/linkSuggestionsPanel.ts) once this page reports ready. */
interface LinkSuggestionsData {
  orgApiUrl: string;
  environmentId: string;
  solutionUniqueName: string;
  solutionName: string;
  /** Unlinked web resources of a linkable type. */
  resources: SuggestionResource[];
  /** Local files not linked to any web resource yet. */
  filePaths: string[];
}

interface Props extends LinkSuggestionsData {
  onClose: () => void;
}

interface Row {
  checked: boolean;
  path: string;
}

const KIND_BADGE: Record<MatchKind, { label: string; color: "success" | "brand" | "informative" }> = {
  identical: { label: "Identical content", color: "success" },
  path: { label: "Path match", color: "brand" },
  name: { label: "Name only", color: "informative" },
};

function closePanel() {
  vscodeApi.postMessage({ type: "close" });
}

/** The "Suggested Links" editor tab. Waits for its data from the extension, and remounts the
 * review whenever new data arrives (the tab is reused when opened again), so each opening
 * starts fresh. Links it creates reach the sidebar through the extension's links-changed
 * event, so there's nothing to hand back. */
export function LinkSuggestionsPage() {
  const [init, setInit] = useState<{ nonce: number; data: LinkSuggestionsData } | null>(null);

  useEffect(() => {
    function handleMessage(ev: MessageEvent) {
      const message = ev.data as { type?: string; nonce?: number; data?: LinkSuggestionsData };
      if (message?.type === "init" && message.data && message.nonce !== undefined) {
        setInit({ nonce: message.nonce, data: message.data });
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  if (!init) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner label="Loading..." />
      </div>
    );
  }
  return <LinkSuggestionsReview key={init.nonce} {...init.data} onClose={closePanel} />;
}

/** Proposes links for unlinked resources by name, confirms candidates by comparing content,
 * and links only what the user ticks. */
function LinkSuggestionsReview({
  orgApiUrl,
  environmentId,
  solutionUniqueName,
  solutionName,
  resources,
  filePaths,
  onClose,
}: Props) {
  // The extension compares the content of every unlinked resource with every candidate file in
  // one call (src/linkSuggestionContent.ts). Undefined while it runs; a failure falls back to
  // name matching alone. Fetched once per opening: links created meanwhile shouldn't reshuffle
  // rows mid-review.
  const [content, setContent] = useState<{ matches?: ContentMatches; error?: string } | undefined>(undefined);
  const [rows, setRows] = useState<Map<string, Row>>(new Map());
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    findIdenticalContent({
      orgApiUrl,
      resources: resources.map(({ webresourceid, webresourcetype }) => ({ webresourceid, webresourcetype })),
      filePaths,
    })
      .then((matches) => !cancelled && setContent({ matches }))
      .catch((err) => !cancelled && setContent({ error: (err as Error).message }));
    return () => {
      cancelled = true;
    };
    // resources/filePaths are fixed for this opening (the page remounts for new data).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgApiUrl]);

  const checking = content === undefined;
  const suggestions = useMemo<LinkSuggestion[]>(
    () => (content ? mergeSuggestions(resources, filePaths, content.matches) : []),
    [content, resources, filePaths]
  );

  const view = suggestions.map((s) => {
    const touched = rows.get(s.resource.webresourceid);
    const row: Row = { checked: s.checked, path: s.path, ...touched };
    // The badges describe the file currently chosen, which the user may have changed; once
    // they've picked or ticked, the decision is theirs, so it's no longer "ambiguous".
    const kind = matchKindOf(s, row.path) ?? "name";
    return { suggestion: s, ...row, kind, ambiguous: s.ambiguous && !touched };
  });

  const selected = view.filter((v) => v.checked);
  const pathCounts = new Map<string, number>();
  for (const v of selected) pathCounts.set(v.path, (pathCounts.get(v.path) ?? 0) + 1);
  const hasConflict = [...pathCounts.values()].some((n) => n > 1);

  function updateRow(id: string, base: Row, patch: Partial<Row>) {
    setRows((prev) => new Map(prev).set(id, { ...base, ...prev.get(id), ...patch }));
  }

  /** Opens a read-only diff of the Dataverse content and the chosen candidate in a new tab. */
  async function handleCompare(resource: SuggestionResource, path: string) {
    setError(null);
    try {
      await openCompareDiff({
        orgApiUrl,
        webresourceId: resource.webresourceid,
        webresourceName: resource.name,
        webresourcetype: resource.webresourcetype,
        localPath: path,
      });
    } catch (err) {
      setError(`Couldn't compare ${path}: ${(err as Error).message}`);
    }
  }

  async function handleLink() {
    setLinking(true);
    setError(null);
    try {
      await createLinks(
        selected.map((v) => ({
          environmentId,
          solutionUniqueName,
          webresourceId: v.suggestion.resource.webresourceid,
          webresourceName: v.suggestion.resource.name,
          localPath: v.path,
        }))
      );
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setLinking(false);
    }
  }

  return (
    <div className="flex h-screen flex-col" style={{ background: tokens.colorNeutralBackground2 }}>
      <header
        className="flex flex-col gap-1 px-6 py-4"
        style={{ background: tokens.colorNeutralBackground1, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` }}
      >
        <Text size={500} weight="semibold">
          Suggested Links
        </Text>
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          {solutionName} - files with identical content are found whatever their names; the rest are matched by
          name. Only ticked rows are linked; nothing is published or changed.
        </Text>
        {content?.error && (
          <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>
            Couldn't compare content ({content.error}) - showing name matches only.
          </Text>
        )}
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-auto px-6 py-4">
        {checking ? (
          <Spinner
            labelPosition="below"
            label={`Comparing the content of ${resources.length} web resource${resources.length === 1 ? "" : "s"} with ${filePaths.length} local file${filePaths.length === 1 ? "" : "s"}...`}
          />
        ) : suggestions.length === 0 ? (
          <Text>
            No suggestions: no unlinked local file has identical content or a matching name. Link these from the Web
            Resources view instead.
          </Text>
        ) : (
          <div
            className="flex flex-col rounded"
            style={{ background: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}` }}
          >
            {view.map((v, index) => {
              const id = v.suggestion.resource.webresourceid;
              const base = { checked: v.checked, path: v.path };
              const conflict = v.checked && (pathCounts.get(v.path) ?? 0) > 1;
              const badge = KIND_BADGE[v.kind];
              return (
                <div key={id}>
                  {index > 0 && <Divider />}
                  <div
                    className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
                    style={v.checked ? { background: tokens.colorNeutralBackground1Selected } : undefined}
                    onClick={(e) => isRowClick(e) && updateRow(id, base, { checked: !v.checked })}
                  >
                    <Checkbox
                      checked={v.checked}
                      onChange={(_, data) => updateRow(id, base, { checked: data.checked === true })}
                      aria-label={`Link ${v.suggestion.resource.name}`}
                    />
                    <Text weight="semibold" className="min-w-[12rem] flex-1 break-all">
                      {v.suggestion.resource.name}
                    </Text>
                    <ArrowRightRegular style={{ color: tokens.colorNeutralForeground3 }} />
                    <div className="min-w-[12rem] flex-1">
                      {v.suggestion.candidates.length > 1 ? (
                        <Dropdown
                          className="w-full min-w-0"
                          value={v.path}
                          selectedOptions={[v.path]}
                          onOptionSelect={(_, data) =>
                            data.optionValue && updateRow(id, base, { path: data.optionValue, checked: true })
                          }
                        >
                          {v.suggestion.candidates.map((path) => (
                            <Option key={path} value={path} text={path}>
                              {path}
                            </Option>
                          ))}
                        </Dropdown>
                      ) : (
                        <Text className="break-all">{v.path}</Text>
                      )}
                      {conflict && (
                        <Text block size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>
                          This file is selected for more than one web resource.
                        </Text>
                      )}
                    </div>
                    <Tooltip content={`Compare ${v.path} with the Dataverse content`} relationship="label" withArrow>
                      <Button
                        size="small"
                        appearance="subtle"
                        icon={<BranchCompareRegular />}
                        onClick={() => handleCompare(v.suggestion.resource, v.path)}
                      />
                    </Tooltip>
                    <div className="flex w-[13rem] flex-wrap items-center gap-1">
                      <Badge size="small" color={badge.color}>
                        {badge.label}
                      </Badge>
                      {v.ambiguous && (
                        <Badge size="small" color="warning">
                          Ambiguous
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <footer
        className="flex items-center justify-end gap-2 px-6 py-3"
        style={{ background: tokens.colorNeutralBackground1, borderTop: `1px solid ${tokens.colorNeutralStroke2}` }}
      >
        {error && (
          <Text className="mr-auto" style={{ color: tokens.colorPaletteRedForeground1 }}>
            {error}
          </Text>
        )}
        <Button appearance="secondary" onClick={onClose} disabled={linking}>
          {suggestions.length > 0 ? "Cancel" : "Close"}
        </Button>
        {suggestions.length > 0 && (
          <Button
            appearance="primary"
            icon={<LinkMultipleRegular />}
            onClick={handleLink}
            disabled={linking || selected.length === 0 || hasConflict}
          >
            {linking ? "Linking..." : `Link ${selected.length}`}
          </Button>
        )}
      </footer>
    </div>
  );
}
