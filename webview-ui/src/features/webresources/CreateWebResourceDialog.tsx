import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Field,
  Input,
  Option,
  Text,
  tokens,
} from "@fluentui/react-components";
import { useState } from "react";
import { createWebResource, WEBRESOURCE_TYPES } from "../../api/dataverse";
import { utf8ToBase64 } from "../../lib/base64";

const TYPE_OPTIONS: { value: number; label: string }[] = [
  { value: WEBRESOURCE_TYPES.HTML, label: "HTML" },
  { value: WEBRESOURCE_TYPES.JS, label: "JavaScript" },
  { value: WEBRESOURCE_TYPES.CSS, label: "CSS" },
];

interface Props {
  orgApiUrl: string;
  solutionUniqueName: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateWebResourceDialog({ orgApiUrl, solutionUniqueName, open, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [displayname, setDisplayname] = useState("");
  const [webresourcetype, setWebresourcetype] = useState<number>(WEBRESOURCE_TYPES.JS);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setDisplayname("");
    setWebresourcetype(WEBRESOURCE_TYPES.JS);
    setError(null);
  }

  function handleClose() {
    if (creating) return;
    reset();
    onClose();
  }

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      await createWebResource(orgApiUrl, solutionUniqueName, {
        name: name.trim(),
        displayname: displayname.trim(),
        webresourcetype,
        content: utf8ToBase64(""),
      });
      reset();
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const selectedType = TYPE_OPTIONS.find((t) => t.value === webresourcetype);

  return (
    <Dialog open={open} onOpenChange={(_, data) => !data.open && handleClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Create web resource</DialogTitle>
          <DialogContent>
            <div className="flex flex-col gap-3 py-2">
              <Field label="Name" hint="e.g. new_/scripts/myscript.js" required>
                <Input
                  value={name}
                  onChange={(_, data) => setName(data.value)}
                  disabled={creating}
                  autoFocus
                />
              </Field>
              <Field label="Display name" required>
                <Input
                  value={displayname}
                  onChange={(_, data) => setDisplayname(data.value)}
                  disabled={creating}
                />
              </Field>
              <Field label="Type" required>
                <Dropdown
                  value={selectedType?.label ?? ""}
                  selectedOptions={selectedType ? [String(selectedType.value)] : []}
                  onOptionSelect={(_, data) => {
                    if (data.optionValue) setWebresourcetype(Number(data.optionValue));
                  }}
                  disabled={creating}
                >
                  {TYPE_OPTIONS.map((t) => (
                    <Option key={t.value} value={String(t.value)}>
                      {t.label}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
              {error && <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{error}</Text>}
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={handleClose} disabled={creating}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              onClick={handleCreate}
              disabled={creating || !name.trim() || !displayname.trim()}
            >
              {creating ? "Creating..." : "Create"}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
