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
import { SignOutRegular, WeatherMoonRegular, WeatherSunnyRegular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { getAuthStatus, login, logout } from "./api/auth";

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
  }

  return (
    <div className="flex h-screen flex-col" style={{ background: tokens.colorNeutralBackground2 }}>
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
        ) : (
          <Text style={{ color: tokens.colorNeutralForeground3 }}>
            Signed in as {username}. Environment and solution pickers come next.
          </Text>
        )}
      </main>
    </div>
  );
}

export default App;
