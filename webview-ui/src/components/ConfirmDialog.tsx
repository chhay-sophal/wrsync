import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
} from "@fluentui/react-components";
import type { ReactElement, ReactNode } from "react";

interface Props {
  open: boolean;
  title: ReactNode;
  confirmLabel: string;
  confirmIcon?: ReactElement;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;
}

/** Generic Cancel/confirm dialog for actions that change Dataverse or local link state. */
export function ConfirmDialog({
  open,
  title,
  confirmLabel,
  confirmIcon,
  confirmDisabled,
  onConfirm,
  onCancel,
  children,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(_, data) => !data.open && onCancel()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>
            <div className="flex flex-col gap-2 py-2">{children}</div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button appearance="primary" icon={confirmIcon} onClick={onConfirm} disabled={confirmDisabled}>
              {confirmLabel}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
