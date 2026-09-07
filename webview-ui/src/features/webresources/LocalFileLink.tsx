import { Badge, Button, Dropdown, Option, Text, tokens } from "@fluentui/react-components";
import { LinkDismissRegular, LinkRegular } from "@fluentui/react-icons";
import { useState } from "react";
import { createLink, deleteLink, type LocalFile, type ResourceLink } from "../../api/local";

interface Props {
  environmentId: string;
  solutionUniqueName: string;
  webresourceId: string;
  webresourceName: string;
  localFiles: LocalFile[];
  link: ResourceLink | undefined;
  /** Whether the linked local file's content currently differs from what's published in
   * Dataverse. Publishing itself comes in a later step - for now this is informational. */
  isModified: boolean;
  onLinksChanged: () => void;
}

export function LocalFileLink({
  environmentId,
  solutionUniqueName,
  webresourceId,
  webresourceName,
  localFiles,
  link,
  isModified,
  onLinksChanged,
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
