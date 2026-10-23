import {
  Badge,
  Button,
  Checkbox,
  Divider,
  Dropdown,
  Option,
  Spinner,
  Text,
  tokens,
} from "@fluentui/react-components";
import { ArrowRightRegular, LinkMultipleRegular } from "@fluentui/react-icons";
import { useEffect, useMemo, useState } from "react";
import vscodeApi from "../../vscodeApi";
import { getWebResourceContent } from "../../api/dataverse";
import { createLinks, getLocalFileContent } from "../../api/local";
import { base64ToUtf8 } from "../../lib/base64";
import { isRowClick } from "../../lib/rowClick";
import { normalizeForCompare } from "../../lib/text";
import { suggestLinks, type LinkSuggestion, type MatchKind, type SuggestionResource } from "./linkSuggestions";

/** Candidates per resource whose content is compared - enough to settle real ambiguity
 * (src/ vs lib/ copies) without fetching every file named utils.js in a large workspace. */
const MAX_CONTENT_CHECKS_PER_RESOURCE = 5;
const CONTENT_CHECK_CONCURRENCY = 6;

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

/** Runs tasks with at most `limit` in flight, so a large solution doesn't fire hundreds of
 * Dataverse requests at once. */
async function runLimited(tasks: (() => Promise<void>)[], limit: number): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < tasks.length) await tasks[next++]();
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

function closePanel() {
  vscodeApi.postMessage({ type: "close" });
}

/** The "Suggested links" editor tab. Waits for its data from the extension, and remounts the
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
  // Computed once per opening: links created meanwhile shouldn't reshuffle rows mid-review.
  const [suggestions] = useState<LinkSuggestion[]>(() => suggestLinks(resources, filePaths));
  const [identical, setIdentical] = useState<Map<string, string[]>>(new Map());
  const [checked, setChecked] = useState(0);
  const [rows, setRows] = useState<Map<string, Row>>(new Map());
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalChecks = useMemo(
    () => suggestions.reduce((n, s) => n + Math.min(s.candidates.length, MAX_CONTENT_CHECKS_PER_RESOURCE), 0),
    [suggestions]
  );
  const checking = checked < totalChecks;

  useEffect(() => {
    let cancelled = false;
    const tasks = suggestions.map((s) => async () => {
      const candidates = s.candidates.slice(0, MAX_CONTENT_CHECKS_PER_RESOURCE);
      try {
        const remote = normalizeForCompare(base64ToUtf8(await getWebResourceContent(orgApiUrl, s.resource.webresourceid)));
        const matches: string[] = [];
        for (const path of candidates) {
          try {
            if (normalizeForCompare(await getLocalFileContent(path)) === remote) matches.push(path);
          } catch {
            // Unreadable file - just not confirmed.
          }
          if (!cancelled) setChecked((n) => n + 1);
        }
        if (!cancelled && matches.length > 0) {
          setIdentical((prev) => new Map(prev).set(s.resource.webresourceid, matches));
        }
      } catch {
        // Dataverse content unavailable: fall back to the name match alone.
        if (!cancelled) setChecked((n) => n + candidates.length);
      }
    });
    runLimited(tasks, CONTENT_CHECK_CONCURRENCY);
    return () => {
      cancelled = true;
    };
  }, [suggestions, orgApiUrl]);

  /** What a row shows until the user touches it: an identical-content candidate when exactly
   * one exists (certain), otherwise the best name match - ticked only when unambiguous and
   * deeper than a bare file name. */
  function defaultRow(s: LinkSuggestion): Row {
    const matches = identical.get(s.resource.webresourceid) ?? [];
    if (matches.length === 1) return { checked: true, path: matches[0] };
    return { checked: s.kind === "path" && !s.ambiguous, path: s.candidates[0] };
  }

  const view = suggestions.map((s) => {
    const row = { ...defaultRow(s), ...rows.get(s.resource.webresourceid) };
    // The badge describes the file currently chosen, which the user may have changed.
    const matches = identical.get(s.resource.webresourceid) ?? [];
    const isIdentical = matches.includes(row.path);
    const kind: MatchKind = isIdentical ? "identical" : s.kind;
    const ambiguous = !isIdentical && (s.ambiguous || matches.length > 1);
    return { suggestion: s, ...row, kind, ambiguous };
  });

  const selected = view.filter((v) => v.checked);
  const pathCounts = new Map<string, number>();
  for (const v of selected) pathCounts.set(v.path, (pathCounts.get(v.path) ?? 0) + 1);
  const hasConflict = [...pathCounts.values()].some((n) => n > 1);

  function updateRow(id: string, base: Row, patch: Partial<Row>) {
    setRows((prev) => new Map(prev).set(id, { ...base, ...prev.get(id), ...patch }));
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
          Suggested links
        </Text>
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          {solutionName} - based on matching names, confirmed by comparing content where possible. Only ticked
          rows are linked; nothing is published or changed.
        </Text>
        {checking && (
          <Spinner size="tiny" labelPosition="after" label={`Comparing content... ${checked}/${totalChecks}`} />
        )}
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-auto px-6 py-4">
        {suggestions.length === 0 ? (
          <Text>
            No suggestions: no unlinked local file's path matches an unlinked web resource's name. Link these from
            each card in the sidebar instead.
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
