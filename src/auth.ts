import { createServer } from "node:http";
import * as vscode from "vscode";
import {
  PublicClientApplication,
  type AccountInfo,
  type ICachePlugin,
} from "@azure/msal-node";

/**
 * Microsoft's published sample/native client for XRM tooling (used by XrmToolBox, the
 * Dataverse ServiceClient, and pac cli). Reusing it means users sign in with their own
 * Microsoft account without us registering an app or anyone granting admin consent for a
 * custom one — the tradeoff is Microsoft documents it as a prototyping credential, not a
 * long-term-guaranteed one.
 */
const CLIENT_ID = "51f81489-12ee-4a9e-aaae-a2591f45987d";
const DEFAULT_AUTHORITY = "https://login.microsoftonline.com/organizations";
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

const SECRET_KEY_MSAL_CACHE = "wrsync.msalCache";
const GLOBAL_KEY_ACTIVE_ACCOUNT = "wrsync.activeHomeAccountId";

let secrets: vscode.SecretStorage;
let globalState: vscode.Memento;
let pca: PublicClientApplication;

/** Must be called once from activate() before any other function in this module is used. */
export function initAuth(context: vscode.ExtensionContext): void {
  secrets = context.secrets;
  globalState = context.globalState;

  const cachePlugin: ICachePlugin = {
    beforeCacheAccess: async (cacheContext) => {
      const data = await secrets.get(SECRET_KEY_MSAL_CACHE);
      if (data) {cacheContext.tokenCache.deserialize(data);}
    },
    afterCacheAccess: async (cacheContext) => {
      if (cacheContext.cacheHasChanged) {
        await secrets.store(SECRET_KEY_MSAL_CACHE, cacheContext.tokenCache.serialize());
      }
    },
  };

  pca = new PublicClientApplication({
    auth: { clientId: CLIENT_ID, authority: DEFAULT_AUTHORITY },
    cache: { cachePlugin },
  });
}

/**
 * Picks the account this extension is "signed in as". Guest users can end up with multiple
 * cached accounts (e.g. one per tenant they've signed into) — pin to whichever one last
 * completed a login rather than an arbitrary first entry.
 */
async function getAccount(): Promise<AccountInfo | null> {
  const accounts = await pca.getTokenCache().getAllAccounts();
  if (accounts.length === 0) {return null;}
  const activeId = globalState.get<string>(GLOBAL_KEY_ACTIVE_ACCOUNT);
  const pinned = accounts.find((a) => a.homeAccountId === activeId);
  return pinned ?? accounts[0];
}

async function setActiveAccount(account: AccountInfo | null): Promise<void> {
  await globalState.update(GLOBAL_KEY_ACTIVE_ACCOUNT, account?.homeAccountId ?? undefined);
}

function createLoopbackServer(): Promise<{
  redirectUri: string;
  waitForCode: () => Promise<string>;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    let resolveCode: (code: string) => void;
    let rejectCode: (err: Error) => void;
    const codePromise = new Promise<string>((res, rej) => {
      resolveCode = res;
      rejectCode = rej;
    });

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html><body>Signed in. You can close this tab and return to VS Code.</body></html>");
      if (code) {resolveCode(code);}
      else if (error) {rejectCode(new Error(url.searchParams.get("error_description") ?? error));}
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to start loopback sign-in listener"));
        return;
      }
      resolve({
        redirectUri: `http://localhost:${address.port}`,
        waitForCode: () => {
          const timeout = new Promise<string>((_, rej) =>
            setTimeout(() => rej(new Error("Sign-in timed out")), LOGIN_TIMEOUT_MS)
          );
          return Promise.race([codePromise, timeout]);
        },
        close: () => server.close(),
      });
    });
  });
}

interface InteractiveOptions {
  /** Overrides the app-level authority, e.g. to target a specific tenant a guest belongs to. */
  authority?: string;
  loginHint?: string;
}

async function acquireTokenInteractive(scopes: string[], opts: InteractiveOptions = {}) {
  const { redirectUri, waitForCode, close } = await createLoopbackServer();
  try {
    const authCodeUrl = await pca.getAuthCodeUrl({
      scopes,
      redirectUri,
      authority: opts.authority,
      loginHint: opts.loginHint,
    });
    await vscode.env.openExternal(vscode.Uri.parse(authCodeUrl));
    const code = await waitForCode();
    const result = await pca.acquireTokenByCode({
      code,
      scopes,
      redirectUri,
      authority: opts.authority,
    });
    if (!result) {throw new Error("Sign-in did not return a token");}
    return result;
  } finally {
    close();
  }
}

/**
 * Acquires a bearer token for a Dataverse (or Power Platform API) resource, silently when
 * a cached refresh token covers it, falling back to an interactive system-browser sign-in
 * the first time a new resource needs consent.
 */
export async function getAccessToken(resourceBaseUrl: string): Promise<string> {
  const scopes = [`${resourceBaseUrl}/.default`];
  const account = await getAccount();
  if (!account) {
    const result = await acquireTokenInteractive(scopes);
    await setActiveAccount(result.account);
    return result.accessToken;
  }
  try {
    const result = await pca.acquireTokenSilent({ account, scopes });
    return result.accessToken;
  } catch {
    const result = await acquireTokenInteractive(scopes, {
      authority: `https://login.microsoftonline.com/${account.tenantId}`,
      loginHint: account.username,
    });
    return result.accessToken;
  }
}

export const POWER_PLATFORM_RESOURCE = "https://api.powerplatform.com";

export async function getAuthStatus(): Promise<{ signedIn: boolean; username?: string }> {
  const account = await getAccount();
  return account ? { signedIn: true, username: account.username } : { signedIn: false };
}

/**
 * @param tenant Domain (e.g. "contoso.onmicrosoft.com") or tenant ID to sign into. Needed
 * for guest accounts — signing in without it resolves to the user's home tenant, which
 * won't see environments in a tenant they're only a guest in.
 */
export async function login(tenant?: string): Promise<{ username: string }> {
  const authority = tenant ? `https://login.microsoftonline.com/${tenant}` : undefined;
  const result = await acquireTokenInteractive([`${POWER_PLATFORM_RESOURCE}/.default`], { authority });
  if (!result.account) {throw new Error("Sign-in completed but no account was returned");}
  await setActiveAccount(result.account);
  return { username: result.account.username };
}

export async function logout(): Promise<void> {
  const account = await getAccount();
  if (account) {
    await pca.getTokenCache().removeAccount(account);
  }
  await setActiveAccount(null);
  await secrets.delete(SECRET_KEY_MSAL_CACHE);
}
