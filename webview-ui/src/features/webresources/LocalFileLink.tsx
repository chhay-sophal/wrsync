import { Badge, Button, Combobox, Option, Text, tokens } from "@fluentui/react-components";
import { BranchCompareRegular, CloudArrowUpRegular, LinkDismissRegular } from "@fluentui/react-icons";
import { useMemo, useState } from "react";
import { openCompareDiff } from "../../api/compare";
import { publishWebResources, updateWebResourceContent } from "../../api/dataverse";
import { createLink, deleteLink, getLocalFileContent, type LocalFile, type ResourceLink } from "../../api/local";
import { utf8ToBase64 } from "../../lib/base64";

interface Props {
  orgApiUrl: string;
  environmentId: string;
  solutionUniqueName: string;
  webresourceId: string;
  webresourceName: string;
  localFiles: LocalFile[];
  link: ResourceLink | undefined;
  /** Whether the linked local file's content currently differs from what's published in
   * Dataverse - computed by the parent, which needs this across all rows for a future
   * "Publish All" action. */
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
            {isModified && <Badge color="warning">Modified</Badge>}
            {isModified && (
              <Button
                size="small"
                appearance="primary"
                icon={<CloudArrowUpRegular />}
                onClick={handlePublish}
                disabled={busy}
              >
                Publish
              </Button>
            )}
            {isModified && (
              <Button size="small" appearance="secondary" icon={<BranchCompareRegular />} onClick={handleCompare}>
                Compare
              </Button>
            )}
            <Button
              size="small"
              appearance="subtle"
              icon={<LinkDismissRegular />}
              onClick={handleUnlink}
              disabled={busy}
            >
              Unlink
            </Button>
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
    </div>
  );
}
