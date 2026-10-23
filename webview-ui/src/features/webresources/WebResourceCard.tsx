import {
  Button,
  Combobox,
  Option,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Text,
  Tooltip,
  tokens,
} from "@fluentui/react-components";
import {
  CloudArrowDownRegular,
  CloudArrowUpRegular,
  InfoRegular,
  LinkDismissRegular,
  LinkMultipleRegular,
} from "@fluentui/react-icons";
import { memo, useState } from "react";
import type { WebResource } from "../../api/dataverse";
import type { LocalFile, ResourceLink } from "../../api/local";
import { IconButton } from "../../components/IconButton";
import { isRowClick } from "../../lib/rowClick";
import { useWebResourceActions } from "./useWebResourceActions";
import { TYPE_LABELS } from "./webResourceTypes";

/** Ctrl/Cmd toggles one row; Shift selects the range from the anchor row; both together add
 * the range to the selection. Neither: select only this row. */
export interface RowSelectModifiers {
  toggle: boolean;
  range: boolean;
}

interface Props {
  resource: WebResource;
  isSelected: boolean;
  onSelect: (id: string, modifiers: RowSelectModifiers) => void;
  onMoveSelection: (fromId: string, delta: 1 | -1, extend: boolean) => void;
  onShowDetails: (id: string) => void;
  orgApiUrl: string;
  environmentId: string;
  solutionUniqueName: string;
  localFiles: LocalFile[];
  link: ResourceLink | undefined;
  isModified: boolean;
  onLinksChanged: () => void;
  onSynced: (webresourceId: string, localPath: string) => void;
}

/** The Link button: a popover with a search over the local files matching this resource's
 * type. Written as PopoverTrigger > Tooltip > Button rather than IconButton, because the
 * trigger has to pass its props straight to the button. */
function LinkFileButton({
  files,
  extensions,
  disabled,
  onPick,
}: {
  files: LocalFile[];
  extensions: string[];
  disabled: boolean;
  onPick: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q ? files.filter((f) => f.path.toLowerCase().includes(q)) : files;
  const extensionList = extensions.map((e) => `.${e}`).join(" / ");

  return (
    <Popover
      open={open}
      onOpenChange={(_, data) => {
        setOpen(data.open);
        if (!data.open) setQuery("");
      }}
      trapFocus
      withArrow
    >
      <PopoverTrigger disableButtonEnhancement>
        <Tooltip content="Link a local file" relationship="label" withArrow>
          <Button
            size="small"
            shape="rounded"
            appearance="subtle"
            icon={<LinkMultipleRegular />}
            disabledFocusable={disabled}
            className="shrink-0"
          />
        </Tooltip>
      </PopoverTrigger>
      <PopoverSurface>
        <div className="flex w-72 flex-col gap-1">
          <Text size={200} weight="semibold">
            Link a {extensionList} file
          </Text>
          {files.length === 0 ? (
            <Text size={200}>No {extensionList} files found in the workspace.</Text>
          ) : (
            <Combobox
              autoFocus
              placeholder="Search files..."
              value={query}
              selectedOptions={[]}
              onChange={(ev) => setQuery(ev.target.value)}
              onOptionSelect={(_, data) => {
                if (!data.optionValue) return;
                setOpen(false);
                setQuery("");
                onPick(data.optionValue);
              }}
            >
              {filtered.map((f) => (
                <Option key={f.path} value={f.path} text={f.path}>
                  {f.path}
                </Option>
              ))}
            </Combobox>
          )}
        </div>
      </PopoverSurface>
    </Popover>
  );
}

/** Memoized so that editing one card (selection, linking, publishing) doesn't force every
 * other card in the list to re-render too. */
function WebResourceCardImpl({
  resource: r,
  isSelected,
  onSelect,
  onMoveSelection,
  onShowDetails,
  orgApiUrl,
  environmentId,
  solutionUniqueName,
  localFiles,
  link,
  isModified,
  onLinksChanged,
  onSynced,
}: Props) {
  const actions = useWebResourceActions({
    orgApiUrl,
    environmentId,
    solutionUniqueName,
    webresourceId: r.webresourceid,
    webresourceName: r.name,
    webresourcetype: r.webresourcetype,
    localFiles,
    link,
    isModified,
    onLinksChanged,
    onSynced,
  });

  return (
    // Selection works like VS Code's Explorer: click selects just this row (and opens Compare
    // when it's modified), Ctrl/Cmd+click toggles, Shift+click selects a range. Keyboard:
    // arrows move (Shift extends), Space toggles, Enter compares. Ctrl/Cmd+A (select all) is
    // handled page-wide by the list.
    <div
      data-row-id={r.webresourceid}
      className={`px-2 cursor-pointer hover:bg-gray-200 ${actions.canSync ? "text-yellow-700 dark:text-yellow-400" : ""}`}
      style={isSelected ? { background: tokens.colorNeutralBackground1Selected } : undefined}
      tabIndex={0}
      aria-selected={isSelected}
      onClick={(e) => {
        if (!isRowClick(e)) return;
        const modifiers = { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey };
        onSelect(r.webresourceid, modifiers);
        // Only a plain single click opens Compare - not when building a multi-selection, and
        // not again on the second click of a double-click.
        if (!modifiers.toggle && !modifiers.range && e.detail === 1 && actions.canSync) actions.compare();
      }}
      // Shift+click and double-click would otherwise select text (the span between clicks, or
      // the word under the cursor), which isRowClick treats as copying and ignores. Dragging to
      // select text still works. Preventing the default also skips the browser's focus move, so
      // focus the row by hand - arrow keys continue from the row clicked last, like Explorer.
      onMouseDown={(e) => {
        if (!(e.shiftKey || e.detail > 1)) return;
        if ((e.target as HTMLElement).closest('button, input, [role="combobox"]')) return;
        e.preventDefault();
        e.currentTarget.focus();
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault(); // Don't scroll the list; focus moves instead.
          onMoveSelection(r.webresourceid, e.key === "ArrowDown" ? 1 : -1, e.shiftKey);
        } else if (e.key === " ") {
          e.preventDefault();
          onSelect(r.webresourceid, { toggle: true, range: false });
        } else if (e.key === "Enter" && actions.canSync) {
          actions.compare();
        }
      }}
    >
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center justify-between">
            <Text weight="medium" size={300} truncate wrap={false} title={r.name} className="min-w-0">
              {r.name}
            </Text>
            <div className="flex-1"></div>
            <IconButton
              shape="rounded"
              appearance="subtle"
              icon={<InfoRegular />}
              onClick={() => onShowDetails(r.webresourceid)}
              label={`View details for ${r.name}`}
              className="shrink-0"
            />
            {!link && actions.extensions && (
              <LinkFileButton
                files={actions.matchingFiles}
                extensions={actions.extensions}
                disabled={actions.busy}
                onPick={actions.linkFile}
              />
            )}
            {link && (
              <IconButton
                shape="rounded"
                appearance="subtle"
                icon={<LinkDismissRegular />}
                onClick={actions.requestUnlink}
                disabled={actions.busy}
                label={`Unlink ${link.localPath}`}
                className="shrink-0"
              />
            )}
            {actions.canSync && (
              <IconButton
                shape="rounded"
                appearance="subtle"
                icon={<CloudArrowUpRegular />}
                onClick={actions.requestPublish}
                disabled={actions.busy}
                label={`Publish ${link?.localPath} to Dataverse`}
                className="shrink-0"
              />
            )}
            {actions.canSync && (
              <IconButton
                shape="rounded"
                appearance="subtle"
                icon={<CloudArrowDownRegular />}
                onClick={actions.requestPull}
                disabled={actions.busy}
                label={`Pull: replace ${link?.localPath} with the Dataverse version`}
                className="shrink-0"
              />
            )}
            {/* {actions.canSync && (
              <IconButton
                shape="rounded"
                appearance="subtle"
                icon={<BranchCompareRegular />}
                onClick={actions.compare}
                label="Compare Dataverse content with the local file"
                className="shrink-0"
              />
            )} */}
            {actions.canSync && (
              <Tooltip
                content="Modified: the local file differs from what's in Dataverse. Click the row to compare."
                relationship="label"
                withArrow
              >
                <span className="shrink-0 px-1 font-semibold" tabIndex={0}>
                  M
                </span>
              </Tooltip>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-1">
            <Text
              block
              truncate
              wrap={false}
              size={200}
              title={r.displayname}
              style={{ color: tokens.colorNeutralForeground3 }}
            >
              {r.displayname} ·
            </Text>
            <Text block size={100} style={{ color: tokens.colorNeutralForeground3 }}>
              {TYPE_LABELS[r.webresourcetype] ?? r.webresourcetype} · {r.ismanaged ? "Managed" : "Unmanaged"}
            </Text>
          </div>
          {actions.linkMismatched && (
            <Text block size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>
              {link?.localPath} can't be published to a {actions.typeLabel} web resource. Unlink it and link a{" "}
              {actions.extensions ? actions.extensions.map((e) => `.${e}`).join(" / ") : "matching"} file instead.
            </Text>
          )}
          {!link && !actions.extensions && (
            <Text block size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              {actions.typeLabel}: linking not supported
            </Text>
          )}
          {actions.error && (
            <Text block size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>
              {actions.error}
            </Text>
          )}
        </div>
      </div>
      {actions.dialogs}
    </div>
  );
}

export const WebResourceCard = memo(WebResourceCardImpl);
