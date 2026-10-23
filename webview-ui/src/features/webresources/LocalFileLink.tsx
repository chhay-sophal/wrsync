import { Badge, Combobox, Option, Text, Tooltip, tokens } from "@fluentui/react-components";
import { BranchCompareRegular, CloudArrowUpRegular, LinkDismissRegular } from "@fluentui/react-icons";
import { useMemo, useState } from "react";
import { openCompareDiff } from "../../api/compare";
import { publishWebResources, updateWebResourceContent } from "../../api/dataverse";
import { createLink, deleteLink, getLocalFileContent, type LocalFile, type ResourceLink } from "../../api/local";
import { utf8ToBase64 } from "../../lib/base64";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { IconButton } from "../../components/IconButton";
import { ConfirmPublishDialog } from "./ConfirmPublishDialog";
import { isLinkableFile, linkableExtensions, TYPE_LABELS } from "./webResourceTypes";

interface Props {
  orgApiUrl: string;
  environmentId: string;
  solutionUniqueName: string;
  webresourceId: string;
  webresourceName: string;
  webresourcetype: number;
  localFiles: LocalFile[];
  link: ResourceLink | undefined;
  /** Whether the linked local file's content currently differs from what's published in
   * Dataverse - computed by the parent, which tracks it across all rows (e.g. for the
   * "Modified only" filter). */
  isModified: boolean;
  onLinksChanged: () => void;
  onPublished: (webresourceId: string, localPath: string) => void;
}

export function LocalFileLink({
  orgApiUrl,
  environmentId,
  solutionUniqueName,
  webresourceId,
  webresourceName,
  webresourcetype,
  localFiles,
  link,
  isModified,
  onLinksChanged,
  onPublished,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [confirmingPublish, setConfirmingPublish] = useState(false);
  const [confirmingUnlink, setConfirmingUnlink] = useState(false);

  const extensions = linkableExtensions(webresourcetype);
  const typeLabel = TYPE_LABELS[webresourcetype] ?? `Type ${webresourcetype}`;
  // Links made before linking was restricted by type can still point at the wrong kind of
  // file; publishing one would overwrite the resource with mismatched content.
  const linkMismatched = link !== undefined && !isLinkableFile(webresourcetype, link.localPath);

  const matchingFiles = useMemo(
    () => localFiles.filter((f) => isLinkableFile(webresourcetype, f.path)),
    [localFiles, webresourcetype]
  );

  const filteredFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return matchingFiles;
    return matchingFiles.filter((f) => f.path.toLowerCase().includes(q));
  }, [matchingFiles, query]);

  async function handleLink(localPath: string) {
    setBusy(true);
    setError(null);
    try {
      await createLink({
        environmentId,
        solutionUniqueName,
        webresourceId,
        webresourceName,
        localPath,
      });
      onLinksChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlink() {
    setConfirmingUnlink(false);
    if (!link) return;
    setBusy(true);
    setError(null);
    try {
      await deleteLink(link.id);
      onLinksChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePublish() {
    setConfirmingPublish(false);
    if (!link) return;
    setBusy(true);
    setError(null);
    try {
      const content = await getLocalFileContent(link.localPath);
      await updateWebResourceContent(orgApiUrl, webresourceId, utf8ToBase64(content));
      await publishWebResources(orgApiUrl, [webresourceId]);
      onPublished(webresourceId, link.localPath);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCompare() {
    if (!link) return;
    setError(null);
    try {
      await openCompareDiff({ orgApiUrl, webresourceId, webresourceName, localPath: link.localPath });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {link ? (
        <div className="flex min-w-0 flex-col gap-1">
          <Text size={200} title={link.localPath} className="min-w-0 truncate">
            {link.localPath}
          </Text>
          {linkMismatched && (
            <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>
              This file type can't be published to a {typeLabel} web resource. Unlink it and link a{" "}
              {extensions ? extensions.map((e) => `.${e}`).join(" / ") : "matching"} file instead.
            </Text>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            {isModified && !linkMismatched && (
              <Tooltip
                content="The local file differs from what's in Dataverse. Compare to see the difference."
                relationship="description"
                withArrow
              >
                <Badge color="warning">Modified</Badge>
              </Tooltip>
            )}
            {isModified && !linkMismatched && (
              <IconButton
                appearance="primary"
                icon={<CloudArrowUpRegular />}
                onClick={() => setConfirmingPublish(true)}
                disabled={busy}
                label="Publish this web resource"
              />
            )}
            {isModified && !linkMismatched && (
              <IconButton
                appearance="secondary"
                icon={<BranchCompareRegular />}
                onClick={handleCompare}
                label="Compare Dataverse content with the local file"
              />
            )}
            <IconButton
              appearance="subtle"
              icon={<LinkDismissRegular />}
              onClick={() => setConfirmingUnlink(true)}
              disabled={busy}
              label="Unlink the local file"
            />
          </div>
        </div>
      ) : !extensions ? (
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          {typeLabel}: linking not supported
        </Text>
      ) : (
        <Combobox
          placeholder={
            matchingFiles.length === 0
              ? `No ${extensions.map((e) => `.${e}`).join(" / ")} files found`
              : "Link a file..."
          }
          disabled={busy || matchingFiles.length === 0}
          value={query}
          selectedOptions={[]}
          onOptionSelect={(_, data) => data.optionValue && handleLink(data.optionValue)}
          onChange={(ev) => setQuery(ev.target.value)}
        >
          {filteredFiles.map((f) => (
            <Option key={f.path} value={f.path} text={f.path}>
              {f.path}
            </Option>
          ))}
        </Combobox>
      )}
      {error && (
        <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>
          {error}
        </Text>
      )}
      <ConfirmPublishDialog
        orgApiUrl={orgApiUrl}
        items={confirmingPublish ? [{ id: webresourceId, name: webresourceName }] : null}
        onConfirm={handlePublish}
        onCancel={() => setConfirmingPublish(false)}
      />
      <ConfirmDialog
        open={confirmingUnlink}
        title="Unlink local file?"
        confirmLabel="Unlink"
        confirmIcon={<LinkDismissRegular />}
        onConfirm={handleUnlink}
        onCancel={() => setConfirmingUnlink(false)}
      >
        <Text>
          <Text weight="semibold">{webresourceName}</Text> will no longer be linked to{" "}
          <Text weight="semibold">{link?.localPath}</Text>. Neither the file nor the web resource is changed.
        </Text>
      </ConfirmDialog>
    </div>
  );
}
