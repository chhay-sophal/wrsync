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
import type { ContentMatches } from "../features/webresources/linkSuggestions";
import { isLinkableFile } from "../features/webresources/webResourceTypes";

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

const ACCOUNT = "// account form\nfunction onLoad(context) { return context; }\n";
const SHARED = "/* shared helper copied into two resources */\nexport const helper = () => 1;\n";

/** Unlinked resources covering each suggestion outcome. */
const resources: MockResource[] = [
  resource("new_/scripts/account.js", 3, ACCOUNT), // identical + path match
  resource("new_/scripts/utils.js", 3, "export const x = 1; // the published version\n"), // identical among 2 name candidates
  resource("contoso_ribbon_commands.js", 3, "// ribbon commands\nfunction enableButton() { return true; }\n"), // identical, but renamed locally
  resource("new_/styles/site.css", 2, "body { color: black; } /* published */\n"), // name match only (edited locally)
  resource("new_/a/helper.js", 3, SHARED), // content shared by two resources
  resource("new_/b/helper.js", 3, SHARED),
  resource("new_/scripts/stub.js", 3, "// todo\n"), // trivial content - left to name matching
  resource("new_/scripts/orphan.js", 3, "// no local file anywhere\nfunction nothing() {}\n"), // no match
];
const byName = (name: string) => resources.find((r) => r.name === name)!;

const localFiles = new Map<string, string>([
  ["src/scripts/account.js", ACCOUNT.replace(/\n/g, "\r\n")], // CRLF only - still identical
  ["src/scripts/utils.js", "export const x = 0; // edited locally\n"],
  ["lib/scripts/utils.js", byName("new_/scripts/utils.js").content],
  ["ribbon/commandBar.js", byName("contoso_ribbon_commands.js").content],
  ["src/styles/site.css", "body { color: navy; } /* edited locally */\n"],
  ["src/a/helper.js", SHARED],
  ["src/scripts/stub.js", "// todo\n"],
]);

const createdLinks: ResourceLink[] = [];

/** Posts to the page the way the extension's webview.postMessage() does. */
function post(message: unknown) {
  window.postMessage(message, "*");
}

/** Same rules as src/linkSuggestionContent.ts: normalized content (line endings, BOM), trivial
 * content ignored, shared content flagged, only files of a matching type. */
function findIdenticalContent(p: { resources: { webresourceid: string; webresourcetype: number }[]; filePaths: string[] }): ContentMatches {
  const normalize = (text: string) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).replace(/\r\n?/g, "\n");
  const key = (text: string) => (normalize(text).trim().length < 20 ? undefined : normalize(text));
  const contentOf = new Map(resources.map((r) => [r.webresourceid, r.content]));
  const byKey = new Map<string, typeof p.resources>();
  for (const r of p.resources) {
    const k = key(contentOf.get(r.webresourceid) ?? "");
    if (k) byKey.set(k, [...(byKey.get(k) ?? []), r]);
  }
  const identical: Record<string, string[]> = {};
  const shared: string[] = [];
  for (const [k, group] of byKey) {
    const files = p.filePaths.filter((path) => localFiles.has(path) && key(localFiles.get(path)!) === k);
    for (const r of group) {
      const matching = files.filter((path) => isLinkableFile(r.webresourcetype, path)).sort();
      if (matching.length > 0) identical[r.webresourceid] = matching;
      if (group.length > 1) shared.push(r.webresourceid);
    }
  }
  return { identical, shared };
}

// RPC params arrive as untyped JSON from the page, same as in the real extension.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handlers: Record<string, (params: any) => unknown> = {
  "suggestions.findIdenticalContent": findIdenticalContent,
  "compare.openDiff": (p: { webresourceName: string; localPath: string }) => {
    console.info(`[wrsync mock] Would open a diff in a new tab: ${p.webresourceName} <-> ${p.localPath}`);
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
