import { Text, tokens } from "@fluentui/react-components";
import { CloudArrowUpRegular } from "@fluentui/react-icons";
import { ConfirmDialog } from "../../components/ConfirmDialog";

interface Props {
  orgApiUrl: string;
  /** Names of the web resources about to be published; the dialog is open while non-null. */
  names: string[] | null;
  onConfirm: () => void;
  onCancel: () => void;
}

function orgHost(orgApiUrl: string): string {
  try {
    return new URL(orgApiUrl).hostname;
  } catch {
    return orgApiUrl;
  }
}

/** Asks before overwriting and publishing web resources, naming the target org so a publish
 * to the wrong environment is caught before it happens. */
export function ConfirmPublishDialog({ orgApiUrl, names, onConfirm, onCancel }: Props) {
  const count = names?.length ?? 0;

  return (
    <ConfirmDialog
      open={names !== null}
      title={`Publish ${count} web resource${count === 1 ? "" : "s"}?`}
      confirmLabel="Publish"
      confirmIcon={<CloudArrowUpRegular />}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <Text>
        Linked local content will overwrite what's in <Text weight="semibold">{orgHost(orgApiUrl)}</Text> and be
        published.
      </Text>
      <ul className="m-0 max-h-48 list-disc overflow-auto pl-5" style={{ color: tokens.colorNeutralForeground2 }}>
        {names?.map((name) => (
          <li key={name} className="break-all">
            <Text size={200}>{name}</Text>
          </li>
        ))}
      </ul>
    </ConfirmDialog>
  );
}
