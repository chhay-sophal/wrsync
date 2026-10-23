/**
 * Browser stand-in for the VS Code extension, for working on the webview UI (now just the
 * "Suggested links" page - the sidebar is a native tree view) with Vite's hot reload:
 * `npm run dev:mock` (repo root or webview-ui/). Injected ahead of main.tsx only in
 * `--mode mock` (see vite.config.ts) - never part of the extension build.
 *
 * It defines acquireVsCodeApi(), sends the page its data the way src/linkSuggestionsPanel.ts
 * does, and answers the page's RPCs from the fixture below, with a little latency so loading
 * states show. State lives in this tab only and resets on reload.
 *
 * URL options:
 *   ?latency=1000  RPC delay in ms (default 300)
 *
 * In the console:
 *   wrsyncMock.createdLinks  links the page created so far
 */
import type { ResourceLink } from "../api/local";
import { utf8ToBase64 } from "../lib/base64";

const params = new URLSearchParams(location.search);
const LATENCY_MS = Number(params.get("latency") ?? 300);

interface MockResource {
  webresourceid: string;
  name: string;
  webresourcetype: number;
  content: string;
}

let nextId = 100;
const resource = (name: string, webresourcetype: number, content: string): MockResource => ({
  webresourceid: `00000000-0000-0000-0000-${String(nextId++).padStart(12, "0")}`,
  name,
  webresourcetype,
  content,
});

/** Unlinked resources covering each suggestion outcome: identical content, path match,
 * flat name with publisher prefix, ambiguous candidates, and no match at all. */
const resources: MockResource[] = [
  resource("new_/scripts/account.js", 3, "// account form\n"),
  resource("new_/scripts/utils.js", 3, "export const x = 1;\n"),
  resource("contoso_account_form.js", 3, "// account form (flat name)\n"),
  resource("new_/styles/site.css", 2, "body { color: black; }\n"),
  resource("new_/pages/dashboard.html", 1, "<h1>Dashboard</h1>\n"),
  resource("new_/scripts/orphan.js", 3, "// no local file\n"),
];
const byName = (name: string) => resources.find((r) => r.name === name)!;

const localFiles = new Map<string, string>([
  ["src/scripts/account.js", byName("new_/scripts/account.js").content],
  ["src/scripts/utils.js", "export const x = 0;\n"],
  ["lib/scripts/utils.js", byName("new_/scripts/utils.js").content],
  ["forms/account_form.js", byName("contoso_account_form.js").content],
  ["src/styles/site.css", "body { color: navy; }\n"],
  ["src/pages/dashboard.html", byName("new_/pages/dashboard.html").content],
]);

const createdLinks: ResourceLink[] = [];

/** Posts to the page the way the extension's webview.postMessage() does. */
function post(message: unknown) {
  window.postMessage(message, "*");
}

// RPC params arrive as untyped JSON from the page, same as in the real extension.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handlers: Record<string, (params: any) => unknown> = {
  "dataverse.getWebResourceContent": (p: { webresourceId: string }) => {
    const r = resources.find((x) => x.webresourceid === p.webresourceId);
    if (!r) throw new Error(`Mock: no web resource ${p.webresourceId}`);
    return utf8ToBase64(r.content);
  },
  "workspace.getFileContent": (p: { path: string }) => {
    const content = localFiles.get(p.path);
    if (content === undefined) throw new Error(`Mock: no local file ${p.path}`);
    return content;
  },
  "links.createMany": (p: { links: Omit<ResourceLink, "id">[] }) => {
    const created = p.links.map((l, i) => ({ id: `link-${Date.now()}-${i}`, ...l }));
    createdLinks.push(...created);
    console.info("[wrsync mock] Created links:", created.map((l) => `${l.webresourceName} -> ${l.localPath}`));
    return created;
  },
};

function handleMessage(message: { type: string; id?: string; method?: string; params?: unknown }) {
  if (message.type === "ready") {
    setTimeout(
      () =>
        post({
          type: "init",
          nonce: Date.now(),
          data: {
            orgApiUrl: "https://contoso-dev.api.crm5.dynamics.com",
            environmentId: "env-dev",
            solutionUniqueName: "ContosoSales",
            solutionName: "Contoso Sales",
            resources: resources.map(({ webresourceid, name, webresourcetype }) => ({ webresourceid, name, webresourcetype })),
            filePaths: [...localFiles.keys()],
          },
        }),
      LATENCY_MS
    );
  } else if (message.type === "reload") {
    location.reload();
  } else if (message.type === "close") {
    console.info("[wrsync mock] The page asked to close its tab.");
  } else if (message.type === "rpc" && message.id && message.method) {
    const { id, method } = message;
    setTimeout(() => {
      const handler = handlers[method];
      try {
        if (!handler) throw new Error(`Mock: no handler for ${method}`);
        post({ type: "rpcResponse", id, ok: true, data: handler(message.params) });
      } catch (err) {
        post({ type: "rpcResponse", id, ok: false, error: (err as Error).message });
      }
    }, LATENCY_MS);
  }
}

let vscodeState: unknown;
Object.assign(window, {
  acquireVsCodeApi: () => ({
    postMessage: handleMessage,
    getState: () => vscodeState,
    setState: (s: unknown) => (vscodeState = s),
  }),
  wrsyncMock: { createdLinks },
});

console.info("[wrsync mock] Running the Suggested links page against fake data. See src/dev/mockVscode.ts.");
