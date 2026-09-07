/** acquireVsCodeApi() may only be called once per webview session - VS Code throws on a
 * second call. Both main.tsx (the ready handshake) and api/rpc.ts (RPC calls) need it, so
 * this module calls it exactly once and everyone else imports the same instance. */
const vscodeApi = acquireVsCodeApi();

export default vscodeApi;
