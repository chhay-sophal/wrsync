import { Text } from "@fluentui/react-components";
import { CloudArrowDownRegular, LinkDismissRegular } from "@fluentui/react-icons";
import { useMemo, useState } from "react";
import { openCompareDiff } from "../../api/compare";
import { publishWebResources, updateWebResourceContent } from "../../api/dataverse";
import {
  createLink,
  deleteLink,
  getLocalFileContent,
  pullFromDataverse,
  type LocalFile,
  type ResourceLink,
} from "../../api/local";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { utf8ToBase64 } from "../../lib/base64";
import { ConfirmPublishDialog } from "./ConfirmPublishDialog";
import { isLinkableFile, linkableExtensions, TYPE_LABELS } from "./webResourceTypes";

interface Options {
  orgApiUrl: string;
  environmentId: string;
  solutionUniqueName: string;
  webresourceId: string;
  webresourceName: string;
  webresourcetype: number;
  localFiles: LocalFile[];
  link: ResourceLink | undefined;
  /** Whether the linked local file differs from what's in Dataverse - tracked by the list,
   * which needs it across all rows (e.g. for the "Modified only" filter). */
  isModified: boolean;
  onLinksChanged: () => void;
  onSynced: (webresourceId: string, localPath: string) => void;
}

/** Everything one web resource row can do with its local file - link, unlink, publish, pull,
 * compare - plus the confirmation dialogs those need, so the row only lays out buttons.
 * Render the returned `dialogs` somewhere in the row. */
export function useWebResourceActions({
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
  onSynced,
}: Options) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingPublish, setConfirmingPublish] = useState(false);
  const [confirmingUnlink, setConfirmingUnlink] = useState(false);
  const [confirmingPull, setConfirmingPull] = useState(false);

  /** Extensions this resource's type can be linked to; null for types that can't be linked
   * at all (binary). */
  const extensions = linkableExtensions(webresourcetype);
  const typeLabel = TYPE_LABELS[webresourcetype] ?? `Type ${webresourcetype}`;
  // Links made before linking was restricted by type can still point at the wrong kind of
  // file; publishing one would overwrite the resource with mismatched content.
  const linkMismatched = link !== undefined && !isLinkableFile(webresourcetype, link.localPath);
  /** Publish, pull and compare only make sense for a usable link that's out of sync. */
  const canSync = link !== undefined && isModified && !linkMismatched;

  const matchingFiles = useMemo(
    () => localFiles.filter((f) => isLinkableFile(webresourcetype, f.path)),
    [localFiles, webresourcetype]
  );

  /** Runs one action with the shared busy/error handling. */
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const linkFile = (localPath: string) =>
    run(async () => {
      await createLink({ environmentId, solutionUniqueName, webresourceId, webresourceName, localPath });
      onLinksChanged();
    });

  function unlink() {
    setConfirmingUnlink(false);
    if (!link) return;
    run(async () => {
      await deleteLink(link.id);
      onLinksChanged();
    });
  }

  function publish() {
    setConfirmingPublish(false);
    if (!link) return;
    run(async () => {
      const content = await getLocalFileContent(link.localPath);
      await updateWebResourceContent(orgApiUrl, webresourceId, utf8ToBase64(content));
      await publishWebResources(orgApiUrl, [webresourceId]);
      onSynced(webresourceId, link.localPath);
    });
  }

  function pull() {
    setConfirmingPull(false);
    if (!link) return;
    run(async () => {
      await pullFromDataverse(orgApiUrl, webresourceId, link.localPath);
      onSynced(webresourceId, link.localPath);
    });
  }

  async function compare() {
    if (!link) return;
    setError(null);
    try {
      await openCompareDiff({ orgApiUrl, webresourceId, webresourceName, localPath: link.localPath });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const dialogs = (
    <>
      <ConfirmPublishDialog
        orgApiUrl={orgApiUrl}
        items={confirmingPublish ? [{ id: webresourceId, name: webresourceName }] : null}
        onConfirm={publish}
        onCancel={() => setConfirmingPublish(false)}
      />
      <ConfirmDialog
        open={confirmingUnlink}
        title="Unlink local file?"
        confirmLabel="Unlink"
        confirmIcon={<LinkDismissRegular />}
        onConfirm={unlink}
        onCancel={() => setConfirmingUnlink(false)}
      >
        <Text>
          <Text weight="semibold">{webresourceName}</Text> will no longer be linked to{" "}
          <Text weight="semibold">{link?.localPath}</Text>. Neither the file nor the web resource is changed.
        </Text>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmingPull}
        title="Replace local file?"
        confirmLabel="Pull"
        confirmIcon={<CloudArrowDownRegular />}
        onConfirm={pull}
        onCancel={() => setConfirmingPull(false)}
      >
        <Text>
          <Text weight="semibold">{link?.localPath}</Text> will be overwritten with the current Dataverse content
          of <Text weight="semibold">{webresourceName}</Text>, and your local changes to it will be lost. Use Compare
          first to keep some of them.
        </Text>
      </ConfirmDialog>
    </>
  );

  return {
    busy,
    error,
    extensions,
    typeLabel,
    linkMismatched,
    canSync,
    matchingFiles,
    linkFile,
    requestUnlink: () => setConfirmingUnlink(true),
    requestPublish: () => setConfirmingPublish(true),
    requestPull: () => setConfirmingPull(true),
    compare,
    dialogs,
  };
}
