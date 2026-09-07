import { Badge, Button, Dropdown, Option, Text, tokens } from "@fluentui/react-components";
import { CloudArrowUpRegular, LinkDismissRegular, LinkRegular } from "@fluentui/react-icons";
import { useState } from "react";
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
  onPublished: (webresourceId: string) => void;
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
      onPublished(webresourceId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {link ? (
        <div className="flex min-w-0 items-center gap-1.5">
          <Text size={200} title={link.localPath} className="min-w-0 flex-1 truncate">
            {link.localPath}
          </Text>
          {isModified && (
            <Badge color="warning" className="shrink-0">
              Modified
            </Badge>
          )}
          {isModified && (
            <Button
              size="small"
              appearance="primary"
              icon={<CloudArrowUpRegular />}
              onClick={handlePublish}
              disabled={busy}
              className="shrink-0"
            >
              Publish
            </Button>
          )}
          <Button
            size="small"
            appearance="subtle"
            icon={<LinkDismissRegular />}
            onClick={handleUnlink}
            disabled={busy}
            className="shrink-0"
          >
            Unlink
          </Button>
        </div>
      ) : (
        <Dropdown
          placeholder={localFiles.length === 0 ? "No local files found" : "Link a file..."}
          disabled={busy || localFiles.length === 0}
          onOptionSelect={(_, data) => data.optionValue && handleLink(data.optionValue)}
          button={
            <span className="flex items-center gap-1.5">
              <LinkRegular />
              {localFiles.length === 0 ? "No local files found" : "Link a file..."}
            </span>
          }
        >
          {localFiles.map((f) => (
            <Option key={f.path} value={f.path}>
              {f.path}
            </Option>
          ))}
        </Dropdown>
      )}
      {error && (
        <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>
          {error}
        </Text>
      )}
    </div>
  );
}
