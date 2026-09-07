import { callRpc } from "./rpc";

export interface AuthStatus {
  signedIn: boolean;
  username?: string;
}

export function getAuthStatus(): Promise<AuthStatus> {
  return callRpc<AuthStatus>("auth.status");
}

export function login(tenant?: string): Promise<{ username: string }> {
  return callRpc<{ username: string }>("auth.login", { tenant });
}

export function logout(): Promise<void> {
  return callRpc<void>("auth.logout");
}
