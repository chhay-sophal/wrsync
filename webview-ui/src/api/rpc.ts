import vscodeApi from "../vscodeApi";

interface RpcResponse {
  type: "rpcResponse";
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

const pending = new Map<string, { resolve: (data: unknown) => void; reject: (err: Error) => void }>();
let nextId = 0;

window.addEventListener("message", (event) => {
  const message = event.data as { type?: string };
  if (message?.type !== "rpcResponse") return;
  const response = message as RpcResponse;
  const entry = pending.get(response.id);
  if (!entry) return;
  pending.delete(response.id);
  if (response.ok) entry.resolve(response.data);
  else entry.reject(new Error(response.error ?? "RPC call failed"));
});

/** Calls an extension-side function by name over postMessage, standing in for the old
 * server's fetch()-based backendJson() - same call shape, so the ported api/ modules only
 * need this swapped in, not rewritten. */
export function callRpc<T>(method: string, params?: unknown): Promise<T> {
  const id = String(nextId++);
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (data: unknown) => void, reject });
    vscodeApi.postMessage({ type: "rpc", id, method, params });
  });
}
