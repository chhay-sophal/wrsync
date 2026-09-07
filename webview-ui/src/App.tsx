import {
  Button,
  Card,
  Field,
  Input,
  Spinner,
  Text,
  Title2,
  tokens,
} from "@fluentui/react-components";
import {
  AddRegular,
  AppsListDetailRegular,
  ArrowSyncRegular,
  CloudArrowUpRegular,
  CloudRegular,
  FolderRegular,
  SignOutRegular,
  WeatherMoonRegular,
  WeatherSunnyRegular,
} from "@fluentui/react-icons";
import { useEffect, useRef, useState } from "react";
import { getAuthStatus, login, logout } from "./api/auth";
import type { DataverseEnvironment, Solution } from "./api/dataverse";
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
  const [modifiedCount, setModifiedCount] = useState(0);
  const [selectedCount, setSelectedCount] = useState(0);
  const [publishingAll, setPublishingAll] = useState(false);
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
          className="flex items-center justify-between gap-2 px-2 py-1"
          style={{
            background: tokens.colorNeutralBackground1,
            borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
          }}
        >
          <Text size={200} truncate wrap={false} className="min-w-0 flex-1">
            {username ?? "Not signed in"}
          </Text>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="small"
              appearance="subtle"
              icon={isDark ? <WeatherSunnyRegular /> : <WeatherMoonRegular />}
              onClick={onToggleTheme}
              title="Toggle theme"
            />
            {username && (
              <Button
                size="small"
                appearance="subtle"
                icon={<SignOutRegular />}
                onClick={handleSignOut}
                title="Sign out"
              />
            )}
          </div>
        </header>

        {username && (
          <div
            className="flex flex-col gap-1 px-2 py-2"
            style={{
              background: tokens.colorNeutralBackground1,
              borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
            }}
          >
            <div className="flex items-center gap-2 px-1">
              <FolderRegular />
              <div className="min-w-0 flex flex-1 flex-col items-start leading-tight">
                <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
                  Workspace
                </Text>
                <Text size={200} truncate wrap={false} className="w-full text-left truncate">
                  {workspaceFiles.root
                    ? `${workspaceFiles.root} — ${workspaceFiles.files.length} file(s)`
                    : "No folder open"}
                </Text>
              </div>
            </div>

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

      <main className="flex w-full flex-1 flex-col overflow-hidden p-2">
        {checkingStatus ? (
          <div className="flex justify-center p-8">
            <Spinner label="Checking sign-in status..." />
          </div>
        ) : !username ? (
          <Card className="p-4">
            <Title2 as="h1" className="mb-4" style={{ fontSize: tokens.fontSizeBase500 }}>
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
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap gap-1">
              {selectedCount > 0 && (
                <Button
                  size="small"
                  appearance="primary"
                  icon={<CloudArrowUpRegular />}
                  onClick={() => webResourceListRef.current?.publishSelected()}
                  disabled={publishingAll}
                >
                  {publishingAll ? "Publishing..." : `Publish Selected (${selectedCount})`}
                </Button>
              )}
              {modifiedCount > 0 && (
                <Button
                  size="small"
                  appearance={selectedCount > 0 ? "secondary" : "primary"}
                  icon={<CloudArrowUpRegular />}
                  onClick={() => webResourceListRef.current?.publishAll()}
                  disabled={publishingAll}
                >
                  {publishingAll ? "Publishing..." : `Publish All (${modifiedCount})`}
                </Button>
              )}
              {hasActiveWebResourceFilters && (
                <Button
                  size="small"
                  appearance="subtle"
                  onClick={() => webResourceListRef.current?.clearAllFiltersAndSort()}
                >
                  Clear filters
                </Button>
              )}
              <Button
                size="small"
                appearance="secondary"
                icon={<AddRegular />}
                onClick={() => webResourceListRef.current?.openCreateDialog()}
              >
                Create
              </Button>
              <Button
                size="small"
                appearance="secondary"
                icon={<ArrowSyncRegular />}
                onClick={() => webResourceListRef.current?.refreshAll()}
                disabled={refreshing || publishingAll}
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </Button>
            </div>

            <WebResourceList
              ref={webResourceListRef}
              orgApiUrl={environment.apiUrl}
              solutionId={solution.solutionid}
              environmentId={environment.id}
              solutionUniqueName={solution.uniquename}
              localFiles={workspaceFiles.files}
              modifiedPaths={workspaceFiles.modifiedPaths}
              onFilePublished={workspaceFiles.clearModified}
              onActiveFilterOrSortChange={setHasActiveWebResourceFilters}
              onModifiedCountChange={setModifiedCount}
              onSelectedCountChange={setSelectedCount}
              onPublishingAllChange={setPublishingAll}
              onRefreshingChange={setRefreshing}
            />
          </div>
        ) : (
          <div className="flex justify-center p-8">
            <Text style={{ color: tokens.colorNeutralForeground3 }} align="center">
              Pick an environment and solution above to see its web resources.
            </Text>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
