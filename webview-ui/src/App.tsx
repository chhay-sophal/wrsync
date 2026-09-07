import {
  Button,
  Card,
  Divider,
  Field,
  Input,
  Spinner,
  Text,
  Title2,
  tokens,
} from "@fluentui/react-components";
import {
  AppsListDetailRegular,
  CloudRegular,
  SignOutRegular,
  WeatherMoonRegular,
  WeatherSunnyRegular,
} from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { getAuthStatus, login, logout } from "./api/auth";
import type { DataverseEnvironment, Solution } from "./api/dataverse";
import { SettingsBarItem } from "./components/SettingsBarItem";
import { EnvironmentPicker } from "./features/environments/EnvironmentPicker";
import { SolutionPicker } from "./features/solutions/SolutionPicker";
import { usePersistedState } from "./hooks/usePersistedState";

interface Props {
  isDark: boolean;
  onToggleTheme: () => void;
}

function App({ isDark, onToggleTheme }: Props) {
  const [username, setUsername] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [tenant, setTenant] = useState("");
  const [environment, setEnvironment] = usePersistedState<DataverseEnvironment | null>(
    "wrsync.environment",
    null
  );
  const [solution, setSolution] = usePersistedState<Solution | null>("wrsync.solution", null);
  const [environmentBarOpen, setEnvironmentBarOpen] = useState(false);
  const [solutionBarOpen, setSolutionBarOpen] = useState(false);

  useEffect(() => {
    getAuthStatus()
      .then((status) => setUsername(status.signedIn ? status.username ?? null : null))
      .finally(() => setCheckingStatus(false));
  }, []);

  async function handleSignIn() {
    setSigningIn(true);
    setAuthError(null);
    try {
      const result = await login(tenant.trim() || undefined);
      setUsername(result.username);
    } catch (err) {
      setAuthError((err as Error).message);
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSignOut() {
    await logout();
    setUsername(null);
    setEnvironment(null);
    setSolution(null);
  }

  return (
    <div className="flex h-screen flex-col" style={{ background: tokens.colorNeutralBackground2 }}>
      <div>
        <header
          className="flex items-center justify-between px-6 py-2.5"
          style={{
            background: tokens.colorNeutralBackground1,
            borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
          }}
        >
          <Text weight="semibold" size={500}>
            Web Resource Sync
          </Text>
          <div className="flex items-center gap-2">
            {username && <Text size={200}>{username}</Text>}
            <Button
              appearance="subtle"
              icon={isDark ? <WeatherSunnyRegular /> : <WeatherMoonRegular />}
              onClick={onToggleTheme}
            />
            {username && (
              <Button appearance="subtle" icon={<SignOutRegular />} onClick={handleSignOut}>
                Sign out
              </Button>
            )}
          </div>
        </header>

        {username && (
          <div
            className="flex flex-wrap items-center gap-1 px-6 py-1"
            style={{
              background: tokens.colorNeutralBackground1,
              borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
            }}
          >
            <SettingsBarItem
              icon={<CloudRegular />}
              label="Environment"
              value={environment?.displayName ?? "Not selected"}
              open={environmentBarOpen}
              onOpenChange={setEnvironmentBarOpen}
            >
              <EnvironmentPicker
                selected={environment}
                onSelect={(env) => {
                  setEnvironment(env);
                  setSolution(null);
                  setEnvironmentBarOpen(false);
                }}
              />
            </SettingsBarItem>

            <Divider vertical className="h-7 max-w-1" />

            <SettingsBarItem
              icon={<AppsListDetailRegular />}
              label="Solution"
              value={solution?.friendlyname ?? (environment ? "Not selected" : "Pick an environment first")}
              disabled={!environment}
              open={solutionBarOpen}
              onOpenChange={setSolutionBarOpen}
            >
              {environment && (
                <SolutionPicker
                  orgApiUrl={environment.apiUrl}
                  selected={solution}
                  onSelect={(sol) => {
                    setSolution(sol);
                    setSolutionBarOpen(false);
                  }}
                />
              )}
            </SettingsBarItem>
          </div>
        )}
      </div>

      <main className="flex flex-1 items-center justify-center p-6">
        {checkingStatus ? (
          <Spinner label="Checking sign-in status..." />
        ) : !username ? (
          <Card className="max-w-[420px] p-6">
            <Title2 as="h1" className="mb-5">
              Sign in to get started
            </Title2>
            <Field
              label="Tenant (optional)"
              hint="Only needed if your Dataverse environment is in a different organization than your account's home tenant — e.g. a domain like contoso.onmicrosoft.com."
            >
              <Input
                value={tenant}
                onChange={(_, data) => setTenant(data.value)}
                placeholder="contoso.onmicrosoft.com"
                disabled={signingIn}
              />
            </Field>
            <Button appearance="primary" onClick={handleSignIn} disabled={signingIn} className="mt-4 w-full">
              {signingIn ? "Waiting for browser sign-in..." : "Sign in"}
            </Button>
            {signingIn && (
              <Text size={200} className="mt-2 block">
                A browser window has opened to sign in with your Microsoft account.
              </Text>
            )}
            {authError && (
              <Text className="mt-2 block" style={{ color: tokens.colorPaletteRedForeground1 }}>
                {authError}
              </Text>
            )}
          </Card>
        ) : environment && solution ? (
          <Text style={{ color: tokens.colorNeutralForeground3 }}>
            {solution.friendlyname} in {environment.displayName}. The web resource list comes next.
          </Text>
        ) : (
          <Text style={{ color: tokens.colorNeutralForeground3 }}>
            Pick an environment and solution above to see its web resources.
          </Text>
        )}
      </main>
    </div>
  );
}

export default App;
