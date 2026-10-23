import { Badge, Button, Combobox, Option, Text, tokens } from "@fluentui/react-components";
import { BranchCompareRegular, CloudArrowUpRegular, LinkDismissRegular } from "@fluentui/react-icons";
import { useMemo, useState } from "react";
import { openCompareDiff } from "../../api/compare";
import { publishWebResources, updateWebResourceContent } from "../../api/dataverse";
import { createLink, deleteLink, getLocalFileContent, type LocalFile, type ResourceLink } from "../../api/local";
import { utf8ToBase64 } from "../../lib/base64";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ConfirmPublishDialog } from "./ConfirmPublishDialog";

interface Props {
  orgApiUrl: string;
  environmentId: string;
  solutionUniqueName: string;
  webresourceId: string;
  webresourceName: string;
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

  const filteredFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return localFiles;
    return localFiles.filter((f) => f.path.toLowerCase().includes(q));
  }, [localFiles, query]);

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
          <div className="flex flex-wrap items-center gap-1.5">
            {isModified && <Badge color="warning" title="This web resource content on Dataverse is different from local code. Compare to see the difference.">Modified</Badge>}
            {isModified && (
              <Button
                size="small"
                appearance="primary"
                icon={<CloudArrowUpRegular />}
                onClick={() => setConfirmingPublish(true)}
                disabled={busy}
                title="Publish this web resource"
              />
            )}
            {isModified && (
              <Button size="small" appearance="secondary" icon={<BranchCompareRegular />} onClick={handleCompare} title="Compare this web resource content from Dataverse against local code"/>
            )}
            <Button
              size="small"
              appearance="subtle"
              icon={<LinkDismissRegular />}
              onClick={() => setConfirmingUnlink(true)}
              disabled={busy}
              title="Unlink this web resource from local file"
            />
          </div>
        </div>
      ) : (
        <Combobox
          placeholder={localFiles.length === 0 ? "No local files found" : "Link a file..."}
          disabled={busy || localFiles.length === 0}
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
        names={confirmingPublish ? [webresourceName] : null}
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
