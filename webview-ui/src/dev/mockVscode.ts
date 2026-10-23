/**
 * Browser stand-in for the VS Code extension, for working on the UI with Vite's hot reload:
 * `npm run dev:mock` (repo root) or `npm run dev:mock` (webview-ui/). Injected ahead of main.tsx
 * only in `--mode mock` (see vite.config.ts) - never part of the extension build.
 *
 * It defines acquireVsCodeApi() and answers every RPC from the in-memory fixture below, with
 * a little latency so spinners show. State lives in this tab only and resets on reload.
 *
 * URL options:
 *   ?view=linkSuggestions  open the "Suggested links" page instead of the sidebar app
 *   ?latency=1000          RPC delay in ms (default 300)
 *   ?signedOut             start signed out
 *
 * In the console:
 *   wrsyncMock.editLocalFile("src/scripts/account.js", "new content")  simulate saving a file
 *   wrsyncMock.state                                                    inspect/tweak the fixture
 */
import type { DataverseEnvironment, Solution, WebResource } from "../api/dataverse";
import type { ResourceLink } from "../api/local";
import { utf8ToBase64 } from "../lib/base64";

const params = new URLSearchParams(location.search);
const LATENCY_MS = Number(params.get("latency") ?? 300);
const ME = "Me (mock)";

interface MockResource extends WebResource {
  content: string;
  modifiedby: string;
  modifiedon: string;
}

const environments: DataverseEnvironment[] = [
  { id: "env-dev", displayName: "Contoso Dev", domainName: "contoso-dev", apiUrl: "https://contoso-dev.api.crm5.dynamics.com", tenantId: "t1" },
  { id: "env-test", displayName: "Contoso Test", domainName: "contoso-test", apiUrl: "https://contoso-test.api.crm5.dynamics.com", tenantId: "t1" },
];

const solutions: Solution[] = [
  { solutionid: "sol-sales", uniquename: "ContosoSales", friendlyname: "Contoso Sales", ismanaged: false },
  { solutionid: "sol-service", uniquename: "ContosoService", friendlyname: "Contoso Service", ismanaged: false },
];

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

let nextId = 100;
function resource(name: string, type: number, content: string, extra: Partial<MockResource> = {}): MockResource {
  return {
    webresourceid: `00000000-0000-0000-0000-${String(nextId++).padStart(12, "0")}`,
    name,
    displayname: name.split("/").pop() ?? name,
    webresourcetype: type,
    ismanaged: false,
    content,
    modifiedby: ME,
    modifiedon: hoursAgo(48),
    ...extra,
  };
}

/** Covers each card state: in sync, modified, modified by someone else, mismatched legacy
 * link, unlinked with a path match / ambiguous / no match, binary, managed. */
const resources: MockResource[] = [
  resource("new_/scripts/account.js", 3, "// account form\nfunction onLoad() {}\n"),
  resource("new_/scripts/contact.js", 3, "// contact form\nfunction onLoad() { return 1; }\n"),
  resource("new_/styles/site.css", 2, "body { color: black; }\n", { modifiedby: "Dana Smith", modifiedon: hoursAgo(0.2) }),
  resource("new_/scripts/legacy.js", 3, "// legacy\n"),
  resource("new_/pages/dashboard.html", 1, "<h1>Dashboard</h1>\n"),
  resource("new_/scripts/utils.js", 3, "export const x = 1;\n"),
  resource("new_/scripts/orphan.js", 3, "// no local file\n"),
  resource("new_/xsl/report.xsl", 9, "<xsl:stylesheet/>\n"),
  resource("new_/img/logo.png", 5, "PNG"),
  resource("msdyn_/scripts/managed.js", 3, "// managed\n", { ismanaged: true }),
];
const byName = (name: string) => resources.find((r) => r.name === name)!;

const localFiles = new Map<string, string>([
  ["src/scripts/account.js", byName("new_/scripts/account.js").content],
  ["src/scripts/contact.js", "// contact form\nfunction onLoad() { return 2; }\n"],
  ["src/styles/site.css", "body { color: navy; }\n"],
  ["src/styles/legacy.css", "/* linked to a JS resource before type checks existed */\n"],
  ["src/pages/dashboard.html", byName("new_/pages/dashboard.html").content],
  ["src/scripts/utils.js", "export const x = 0;\n"],
  ["lib/scripts/utils.js", byName("new_/scripts/utils.js").content],
  ["src/xsl/report.xsl", "<xsl:stylesheet/>\n"],
]);

const link = (r: MockResource, localPath: string): ResourceLink => ({
  id: `link-${r.webresourceid}`,
  environmentId: "env-dev",
  solutionUniqueName: "ContosoSales",
  webresourceId: r.webresourceid,
  webresourceName: r.name,
  localPath,
});

let links: ResourceLink[] = [
  link(byName("new_/scripts/account.js"), "src/scripts/account.js"),
  link(byName("new_/scripts/contact.js"), "src/scripts/contact.js"),
  link(byName("new_/styles/site.css"), "src/styles/site.css"),
  link(byName("new_/scripts/legacy.js"), "src/styles/legacy.css"),
];

const state = { signedIn: !params.has("signedOut"), resources, localFiles, get links() { return links; } };

const findResource = (id: string) => {
  const r = resources.find((x) => x.webresourceid === id);
  if (!r) throw new Error(`Mock: no web resource ${id}`);
  return r;
};

/** Posts to the page the way the extension's webview.postMessage() does. */
function post(message: unknown) {
  window.postMessage(message, "*");
}

// RPC params arrive as untyped JSON from the app, same as in the real extension.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (params: any) => unknown;

const handlers: Record<string, Handler> = {
  "auth.status": () => (state.signedIn ? { signedIn: true, username: "me@contoso.com" } : { signedIn: false }),
  "auth.login": () => {
    state.signedIn = true;
    return { username: "me@contoso.com" };
  },
  "auth.logout": () => {
    state.signedIn = false;
  },

  "dataverse.listEnvironments": () => environments,
  "dataverse.listSolutions": () => solutions,
  "dataverse.listWebResourcesForSolution": () =>
    resources.map(({ webresourceid, name, displayname, webresourcetype, ismanaged }) => ({
      webresourceid,
      name,
      displayname,
      webresourcetype,
      ismanaged,
    })),
  "dataverse.getWebResourceDetails": (p: { webresourceId: string }) => {
    const r = findResource(p.webresourceId);
    return {
      ...r,
      description: null,
      languagecode: 1033,
      createdon: hoursAgo(24 * 30),
      modifiedbyname: r.modifiedby,
    };
  },
  "dataverse.getOthersChanges": (p: { webresourceIds: string[] }) =>
    p.webresourceIds
      .map(findResource)
      .filter((r) => r.modifiedby !== ME)
      .map((r) => ({ webresourceId: r.webresourceid, modifiedbyname: r.modifiedby, modifiedon: r.modifiedon })),
  "dataverse.getWebResourceContent": (p: { webresourceId: string }) => utf8ToBase64(findResource(p.webresourceId).content),
  "dataverse.updateWebResourceContent": (p: { webresourceId: string; base64Content: string }) => {
    const r = findResource(p.webresourceId);
    const binary = atob(p.base64Content);
    r.content = new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
    r.modifiedby = ME;
    r.modifiedon = new Date().toISOString();
  },
  "dataverse.publishWebResources": () => undefined,
  "dataverse.createWebResource": (p: { resource: { name: string; displayname: string; webresourcetype: number } }) => {
    const r = resource(p.resource.name, p.resource.webresourcetype, "", { displayname: p.resource.displayname });
    resources.push(r);
    return r.webresourceid;
  },

  "workspace.listFiles": () => ({
    root: "C:/mock/contoso-webresources",
    files: [...localFiles.keys()].sort().map((path) => ({ path, mtimeMs: Date.now() })),
  }),
  "workspace.getFileContent": (p: { path: string }) => {
    const content = localFiles.get(p.path);
    if (content === undefined) throw new Error(`Mock: no local file ${p.path}`);
    return content;
  },
  "workspace.pullFromDataverse": (p: { webresourceId: string; localPath: string }) => {
    localFiles.set(p.localPath, findResource(p.webresourceId).content);
    post({ type: "fileEvent", event: { type: "changed", path: p.localPath } });
  },

  "links.list": () => links,
  "links.checkModified": (p: { links: { webresourceId: string; localPath: string }[] }) => {
    const result: Record<string, boolean> = {};
    for (const l of p.links) {
      const local = localFiles.get(l.localPath);
      const r = resources.find((x) => x.webresourceid === l.webresourceId);
      if (local !== undefined && r) result[l.webresourceId] = local !== r.content;
    }
    return result;
  },
  "links.create": (p: Omit<ResourceLink, "id">) => {
    const created = { id: `link-${Date.now()}`, ...p };
    links = [...links.filter((l) => l.webresourceId !== p.webresourceId), created];
    return created;
  },
  "links.createMany": (p: { links: Omit<ResourceLink, "id">[] }) => {
    const ids = new Set(p.links.map((l) => l.webresourceId));
    const created = p.links.map((l, i) => ({ id: `link-${Date.now()}-${i}`, ...l }));
    links = [...links.filter((l) => !ids.has(l.webresourceId)), ...created];
    return created;
  },
  "links.delete": (p: { id: string }) => {
    links = links.filter((l) => l.id !== p.id);
  },

  // The real extension opens an editor tab; here it's a new browser tab, which builds its
  // own data from its own copy of the fixture when it reports ready.
  "ui.openLinkSuggestions": () => {
    window.open(`${location.pathname}?view=linkSuggestions&latency=${LATENCY_MS}`, "_blank");
  },
  "compare.openDiff": (p: { webresourceName: string; localPath: string }) => {
    console.info(`[wrsync mock] Would open a diff: ${p.webresourceName} <-> ${p.localPath}`);
  },
};

/** What the extension sends the "Suggested links" page: unlinked linkable resources and
 * unlinked files (linkable = not binary; the page itself filters by extension). */
function linkSuggestionsData() {
  const linkedIds = new Set(links.map((l) => l.webresourceId));
  const linkedPaths = new Set(links.map((l) => l.localPath));
  return {
    orgApiUrl: environments[0].apiUrl,
    environmentId: "env-dev",
    solutionUniqueName: "ContosoSales",
    solutionName: "Contoso Sales",
    resources: resources
      .filter((r) => !linkedIds.has(r.webresourceid) && ![5, 6, 7, 8, 10].includes(r.webresourcetype))
      .map(({ webresourceid, name, webresourcetype }) => ({ webresourceid, name, webresourcetype })),
    filePaths: [...localFiles.keys()].filter((p) => !linkedPaths.has(p)),
  };
}

function handleMessage(message: { type: string; id?: string; method?: string; params?: unknown }) {
  if (message.type === "ready") {
    if (params.get("view") === "linkSuggestions") {
      setTimeout(() => post({ type: "init", nonce: Date.now(), data: linkSuggestionsData() }), LATENCY_MS);
    }
  } else if (message.type === "reload") {
    location.reload();
  } else if (message.type === "close") {
    window.close();
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

if (params.get("view")) {
  document.getElementById("root")?.setAttribute("data-view", params.get("view")!);
}

let vscodeState: unknown;
Object.assign(window, {
  acquireVsCodeApi: () => ({
    postMessage: handleMessage,
    getState: () => vscodeState,
    setState: (s: unknown) => (vscodeState = s),
  }),
  wrsyncMock: {
    state,
    /** Simulates saving a local file, as the extension's file watcher would report it. */
    editLocalFile(path: string, content: string) {
      const isNew = !localFiles.has(path);
      localFiles.set(path, content);
      post({ type: "fileEvent", event: { type: isNew ? "added" : "changed", path } });
    },
  },
});

console.info("[wrsync mock] Running against fake data. See src/dev/mockVscode.ts for options.");
