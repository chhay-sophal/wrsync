import {
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Text,
  tokens,
} from "@fluentui/react-components";
import { CloudArrowUpRegular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { getOthersChanges, type OthersChange } from "../../api/dataverse";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { formatRelativeTime } from "../../lib/time";

export interface PublishItem {
  id: string;
  name: string;
}

interface Props {
  orgApiUrl: string;
  /** The web resources about to be published; the dialog is open while non-null. */
  items: PublishItem[] | null;
  onConfirm: () => void;
  onCancel: () => void;
}

type OthersChangesCheck =
  | { status: "checking" }
  | { status: "done"; changes: OthersChange[] }
  | { status: "failed"; error: string };

function orgHost(orgApiUrl: string): string {
  try {
    return new URL(orgApiUrl).hostname;
  } catch {
    return orgApiUrl;
  }
}

/** Asks before overwriting and publishing web resources, naming the target org so a publish
 * to the wrong environment is caught, and warning about any resource someone else changed
 * last - publishing would silently overwrite their change. */
export function ConfirmPublishDialog({ orgApiUrl, items, onConfirm, onCancel }: Props) {
  const count = items?.length ?? 0;
  // A stable key so the check re-runs only when a different set of resources is confirmed,
  // not on every parent render that rebuilds the items array.
  const idsKey = items ? `${orgApiUrl}|${items.map((i) => i.id).join(",")}` : "";
  // Each result remembers which key it was for; a result for any other key (including one
  // left over from the last time the dialog was open) counts as still checking, so reopening
  // never flashes a stale answer.
  const [result, setResult] = useState<{ key: string; check: OthersChangesCheck } | null>(null);
  const check: OthersChangesCheck = result?.key === idsKey ? result.check : { status: "checking" };

  useEffect(() => {
    if (!idsKey || !items) return;
    let cancelled = false;
    getOthersChanges(orgApiUrl, items.map((i) => i.id))
      .then((changes) => !cancelled && setResult({ key: idsKey, check: { status: "done", changes } }))
      .catch(
        (err) =>
          !cancelled && setResult({ key: idsKey, check: { status: "failed", error: (err as Error).message } })
      );
    return () => {
      cancelled = true;
    };
    // items is read for its ids, which idsKey already captures; depending on the array itself
    // would re-run the check on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgApiUrl, idsKey]);

  const nameById = new Map(items?.map((i) => [i.id, i.name]));
  const othersChanges = check.status === "done" ? check.changes : [];

  return (
    <ConfirmDialog
      open={items !== null}
      title={`Publish ${count} web resource${count === 1 ? "" : "s"}?`}
      confirmLabel={othersChanges.length > 0 ? "Publish anyway" : "Publish"}
      confirmIcon={<CloudArrowUpRegular />}
      confirmDisabled={check.status === "checking"}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <Text>
        Linked local content will overwrite what's in <Text weight="semibold">{orgHost(orgApiUrl)}</Text> and be
        published.
      </Text>
      <ul className="m-0 max-h-48 list-disc overflow-auto pl-5" style={{ color: tokens.colorNeutralForeground2 }}>
        {items?.map((item) => (
          <li key={item.id} className="break-all">
            <Text size={200}>{item.name}</Text>
          </li>
        ))}
      </ul>

      {check.status === "checking" && <Spinner size="tiny" label="Checking for changes by others..." />}

      {check.status === "failed" && (
        <MessageBar intent="warning">
          <MessageBarBody>
            Couldn't check whether someone else changed these resources: {check.error}
          </MessageBarBody>
        </MessageBar>
      )}

      {othersChanges.length > 0 && (
        <MessageBar intent="warning" layout="multiline">
          <MessageBarBody>
            <MessageBarTitle>Changed by someone else</MessageBarTitle>
            Publishing will overwrite their changes:
            <ul className="m-0 mt-1 max-h-32 list-disc overflow-auto pl-5">
              {othersChanges.map((change) => (
                <li key={change.webresourceId} className="break-all">
                  <Text size={200} weight="semibold">
                    {nameById.get(change.webresourceId) ?? change.webresourceId}
                  </Text>
                  <Text size={200}>
                    {" "}
                    - {change.modifiedbyname ?? "Unknown user"}
                    {change.modifiedon &&
                      `, ${formatRelativeTime(change.modifiedon)} (${new Date(change.modifiedon).toLocaleString()})`}
                  </Text>
                </li>
              ))}
            </ul>
          </MessageBarBody>
        </MessageBar>
      )}
    </ConfirmDialog>
  );
}
