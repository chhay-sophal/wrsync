import {
  Button,
  Divider,
  Dropdown,
  Field,
  Input,
  Option,
  Spinner,
  Text,
  tokens,
} from "@fluentui/react-components";
import { PlugConnectedRegular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { listEnvironments, type DataverseEnvironment } from "../../api/dataverse";

interface Props {
  selected: DataverseEnvironment | null;
  onSelect: (environment: DataverseEnvironment) => void;
}

/** Accepts the Web API endpoint shown on a Dataverse environment's "Developer resources"
 * page, with or without the trailing /api/data/v9.x/ path, and returns just the origin. */
function normalizeApiUrl(input: string): string {
  return input.trim().replace(/\/+$/, "").replace(/\/api\/data\/v[\d.]+$/i, "");
}

export function EnvironmentPicker({ selected, onSelect }: Props) {
  const [environments, setEnvironments] = useState<DataverseEnvironment[] | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState("");

  useEffect(() => {
    listEnvironments()
      .then(setEnvironments)
      .catch((err) => setDiscoveryError(err.message));
  }, []);

  function connectManually() {
    const apiUrl = normalizeApiUrl(manualUrl);
    if (!apiUrl) return;
    let host: string;
    try {
      host = new URL(apiUrl).hostname;
    } catch {
      host = apiUrl;
    }
    onSelect({ id: host, displayName: host, domainName: host, apiUrl, tenantId: "" });
  }

  return (
    <div className="flex flex-col gap-3">
      {!environments && !discoveryError && <Spinner label="Loading environments..." />}
      {discoveryError && (
        <Text style={{ color: tokens.colorPaletteRedForeground1 }}>
          Couldn't list environments: {discoveryError}
        </Text>
      )}
      {environments && environments.length === 0 && (
        <Text>No environments found via discovery — connect directly below instead.</Text>
      )}
      {environments && environments.length > 0 && (
        <Dropdown
          placeholder="Choose an environment"
          value={selected?.displayName ?? ""}
          onOptionSelect={(_, data) => {
            const env = environments.find((e) => e.id === data.optionValue);
            if (env) onSelect(env);
          }}
        >
          {environments.map((env) => (
            <Option key={env.id} value={env.id}>
              {env.displayName}
            </Option>
          ))}
        </Dropdown>
      )}

      <Divider />

      <Field
        label="Or connect directly"
        hint="Paste the Web API endpoint from the environment's Power Apps 'Developer resources' page."
      >
        <div className="flex gap-2">
          <Input
            className="flex-1"
            value={manualUrl}
            onChange={(_, data) => setManualUrl(data.value)}
            placeholder="https://yourorg.api.crm.dynamics.com/api/data/v9.2/"
          />
          <Button icon={<PlugConnectedRegular />} onClick={connectManually} disabled={!manualUrl.trim()}>
            Connect
          </Button>
        </div>
      </Field>
    </div>
  );
}
