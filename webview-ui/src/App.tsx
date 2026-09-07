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
  ArrowSyncRegular,
  CloudRegular,
  DocumentBulletListRegular,
  FolderRegular,
  SignOutRegular,
  WeatherMoonRegular,
  WeatherSunnyRegular,
} from "@fluentui/react-icons";
import { useEffect, useRef, useState } from "react";
import { getAuthStatus, login, logout } from "./api/auth";
import type { DataverseEnvironment, Solution } from "./api/dataverse";
import { SectionCard } from "./components/SectionCard";
import { SettingsBarItem } from "./components/SettingsBarItem";
import { EnvironmentPicker } from "./features/environments/EnvironmentPicker";
import { SolutionPicker } from "./features/solutions/SolutionPicker";
import {
  FILTERS_STORAGE_KEY,
  WebResourceList,
  type WebResourceListHandle,
} from "./features/webresources/WebResourceList";
import { usePersistedState } from "./hooks/usePersistedState";
import { useWorkspaceFiles } from "./hooks/useWorkspaceFiles";

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
  const [hasActiveWebResourceFilters, setHasActiveWebResourceFilters] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const webResourceListRef = useRef<WebResourceListHandle>(null);
  const workspaceFiles = useWorkspaceFiles();

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
    // Web resource filters persist across refreshes while signed in, but shouldn't outlive
    // the session (e.g. on a shared machine).
    localStorage.removeItem(FILTERS_STORAGE_KEY);
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
            <div className="flex flex-1 items-center gap-2 px-3 py-1">
              <FolderRegular />
              <div className="min-w-0 flex flex-1 flex-col items-start leading-tight">
                <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
                  Workspace
                </Text>
                <Text size={300} truncate wrap={false} className="w-full text-left truncate">
                  {workspaceFiles.root
                    ? `${workspaceFiles.root} — ${workspaceFiles.files.length} file(s)`
                    : "No folder open"}
                </Text>
              </div>
            </div>

            <Divider vertical className="h-7 max-w-1" />

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

      <main className="mx-auto flex w-full flex-1 flex-col p-2 overflow-hidden">
        {checkingStatus ? (
          <div className="flex justify-center p-12">
            <Spinner label="Checking sign-in status..." />
          </div>
        ) : !username ? (
          <Card className="mx-auto my-12 max-w-[420px] p-8">
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
          <SectionCard
            icon={<DocumentBulletListRegular />}
            title="Web resources"
            action={
              <div className="flex gap-2">
                {hasActiveWebResourceFilters && (
                  <Button
                    appearance="subtle"
                    onClick={() => webResourceListRef.current?.clearAllFiltersAndSort()}
                  >
                    Clear filters
                  </Button>
                )}
                <Button
                  appearance="secondary"
                  icon={<ArrowSyncRegular />}
                  onClick={() => webResourceListRef.current?.refreshAll()}
                  disabled={refreshing}
                >
                  {refreshing ? "Refreshing..." : "Refresh"}
                </Button>
              </div>
            }
          >
            <WebResourceList
              ref={webResourceListRef}
              orgApiUrl={environment.apiUrl}
              solutionId={solution.solutionid}
              onActiveFilterOrSortChange={setHasActiveWebResourceFilters}
              onRefreshingChange={setRefreshing}
            />
          </SectionCard>
        ) : (
          <div className="flex justify-center p-16">
            <Text style={{ color: tokens.colorNeutralForeground3 }}>
              Pick an environment and solution above to see its web resources.
            </Text>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
