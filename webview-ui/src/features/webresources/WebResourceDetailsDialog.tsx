import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Spinner,
  Text,
  tokens,
} from "@fluentui/react-components";
import { useEffect, useState } from "react";
import { getWebResourceDetails, type WebResourceDetails } from "../../api/dataverse";
import { TYPE_LABELS } from "./webResourceTypes";

interface Props {
  orgApiUrl: string;
  /** null closes the dialog. */
  webresourceId: string | null;
  linkedPath?: string;
  onClose: () => void;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export function WebResourceDetailsDialog({ orgApiUrl, webresourceId, linkedPath, onClose }: Props) {
  const [details, setDetails] = useState<WebResourceDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Closing (webresourceId -> null) intentionally leaves the last-viewed details in state
    // rather than clearing them - clearing here would flash the loading spinner during the
    // dialog's own close transition, since it'd briefly re-render with no details to show.
    if (!webresourceId) return;
    setDetails(null);
    setError(null);
    getWebResourceDetails(orgApiUrl, webresourceId)
      .then(setDetails)
      .catch((err) => setError(err.message));
  }, [orgApiUrl, webresourceId]);

  return (
    <Dialog open={webresourceId !== null} onOpenChange={(_, data) => !data.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Web resource details</DialogTitle>
          <DialogContent>
            <div className="flex min-h-[400px] flex-col">
              {error && <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{error}</Text>}
              {!error && !details && (
                <div className="flex flex-1 items-center justify-center">
                  <Spinner label="Loading details..." />
                </div>
              )}
              {details && (
                <div className="flex flex-col gap-3 py-2">
                  <DetailRow label="Name" value={details.name} mono />
                  <DetailRow label="Display name" value={details.displayname} />
                  <DetailRow label="Type" value={TYPE_LABELS[details.webresourcetype] ?? String(details.webresourcetype)} />
                  <DetailRow label="Managed" value={details.ismanaged ? "Yes" : "No"} />
                  <DetailRow label="Description" value={details.description || "—"} />
                  <DetailRow label="Language code" value={details.languagecode?.toString() ?? "—"} />
                  <DetailRow label="Created on" value={formatDate(details.createdon)} />
                  <DetailRow label="Modified on" value={formatDate(details.modifiedon)} />
                  <DetailRow label="Web resource ID" value={details.webresourceid} mono />
                  {linkedPath && <DetailRow label="Linked local file" value={linkedPath} mono />}
                </div>
              )}
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={onClose}>
              Close
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-3">
      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
        {label}
      </Text>
      <Text size={300} className={mono ? "break-all font-mono" : "break-words"}>
        {value}
      </Text>
    </div>
  );
}
