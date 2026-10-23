# Web Resource Sync

Edit Power Apps (Dataverse) web resources from local files, right inside VS Code.

Sign in with your Microsoft account, browse a solution's web resources, link them to
files in your open workspace, and publish changes back to Dataverse — from a native
sidebar view that works like VS Code's Explorer.

## Features

- **Sign in** with your Microsoft account (no app registration or admin consent needed).
- **Browse** Dataverse environments, solutions, and their web resources in a native tree,
  with filtering, sorting, Explorer-style selection, and details on hover.
- **Link** a web resource to a file in your open workspace folder.
- **Suggest links** for a whole solution at once, matched by name and confirmed by content.
- **Live change detection** — linked files are watched automatically, and a resource is
  marked **M** as soon as its local content diverges from what's published.
- **Compare** with a diff editor, **pull** the Dataverse version, or **publish** a single
  resource, a selection, or the file you're editing — with a warning before you overwrite
  someone else's change.
- **Create** new web resources directly from the sidebar.

## Requirements

- VS Code 1.135.0 or newer.
- A Microsoft account with access to at least one Dataverse environment.
- A folder open in VS Code containing the local files (HTML/JS/CSS/etc.) you want to link
  to web resources.

## Usage guide

### 1. Open the Web Resources view

Click the Web Resource Sync icon in the Activity Bar (the left-most vertical bar). The
**Web Resources** view opens in the sidebar. It's a native VS Code tree, so it looks and
behaves like Explorer, and it stays open alongside the code you're editing.

### 2. Sign in

Click **Sign In**. A browser window opens for you to sign in with your Microsoft
account; once you're done, return to VS Code.

If your Dataverse environment belongs to a different organization than your account's home
tenant (for example, you're a guest user there), use **Sign in to another tenant** and enter
that tenant's domain (e.g. `contoso.onmicrosoft.com`) or ID.

### 3. Pick an environment and solution

After signing in you're asked to pick a **Dataverse environment**, then an **unmanaged
solution**. The view's title shows both (e.g. *Contoso Dev · Contoso Sales*). To switch
later, use **Pick Solution...** or **Pick Environment...** from the view's **...** menu.

### 4. Browse, filter, and sort

The view lists the solution's web resources, with file icons from your icon theme:

- **Hover** a web resource for its details: display name, type, managed state, linked file,
  sync status, and who last modified it in Dataverse.
- **Find**: with the view focused, start typing (or press <kbd>Ctrl</kbd>+<kbd>F</kbd>) to
  find or filter by name — VS Code's built-in tree find.
- **Filter** (funnel button): by type, by managed state, or **Show Modified Only**. The
  funnel turns solid while a filter is on; **Clear Filters** resets it.
- **Sort By...** (in the **...** menu): name, display name, type, or managed state.
- **Show Details** (right-click) adds the description, dates, and ID, with buttons to
  copy the name or ID.

Selection works like Explorer: click to select, <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+click to add,
<kbd>Shift</kbd>+click for a range, arrow keys to move, <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>A</kbd>
for all.

### 5. Link a web resource to a local file

Hover a web resource and click its **link** button (or right-click → **Link to Local
File...**), then pick a file. Only files matching the resource's type are offered (e.g.
`.js` for JavaScript); image types (PNG, JPG, GIF, ICO) can't be linked. The linked path
appears next to the name.

Once linked, the file is compared with Dataverse automatically — no manual refresh needed.
When they differ, the resource is marked **M** in the modified colour, just like a changed
file in Explorer, and the Activity Bar icon shows a count of modified resources.

To link many at once, click **Suggest Links** (sparkle button). It matches unlinked web
resources to unlinked local files by name — e.g. `new_/scripts/account.js` ↔
`src/scripts/account.js` — and confirms each candidate by comparing its content with
Dataverse. The suggestions open in an editor tab; untick anything wrong:

- **Identical content** — the file matches what's in Dataverse; ticked.
- **Path match** — a unique match on the file name plus its folder(s); ticked.
- **Name only** / **Ambiguous** — only the file name matches, or several files do;
  unticked, and you pick the file from a dropdown.

Only the ticked rows are linked. Nothing is published or changed.

To remove a link, use the **unlink** button or right-click → **Unlink Local File**.

### 6. Compare and resolve changes

Click a modified (**M**) web resource to open a diff editor with the Dataverse content on
the left and your local file on the right (the same tab you'd get from `git diff`). The
Dataverse side is read-only, but you can hover over a changed block and click its arrow to
copy that block into your local file. Clicking a linked resource that's in sync opens its
local file instead.

To take the Dataverse version wholesale, use the **pull** button (or right-click → **Pull
(Replace Local File)**). It replaces the local file's content after a confirmation; if the
file is open with unsaved changes, Pull refuses until you save or discard them.

### 7. Publish your changes

- Use the **publish** button on a modified web resource, or right-click → **Publish**.
- To publish several, select them (<kbd>Ctrl</kbd>/<kbd>Shift</kbd>+click) and right-click →
  **Publish**. Selected resources that aren't linked and modified are skipped.

You're always asked to confirm, with the target environment named. If someone else changed a
resource in Dataverse since, the confirmation says who and when, so you don't overwrite a
colleague's change by accident.

You can also publish straight from the editor. In a linked file, click the
**cloud-upload** button in the editor title bar, press
<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>U</kbd> (<kbd>Cmd</kbd>+<kbd>Alt</kbd>+<kbd>U</kbd> on
macOS), or run **Web Resource Sync: Publish This File**. Unsaved changes are saved first. If
the file is linked in more than one environment, you're asked which one to publish to.

### 8. Create a new web resource

Click **Create Web Resource** (new-file button), then enter a name with your publisher
prefix (e.g. `new_/scripts/myscript.js`), a display name, and a type (JavaScript, HTML or
CSS). It's created empty in the current solution.

### 9. Sign out

Use **Sign Out** from the view's **...** menu. This clears your session and the selected
environment and solution.

## Building a local .vsix

This extension isn't published to the Marketplace. To install it yourself:

```
npm install
npm run package:vsix
```

This produces a `.vsix` file in the project root. Install it via the Extensions view's
"..." menu → **Install from VSIX...**, or `code --install-extension wrsync-<version>.vsix`.

## Known limitations

- Only the first open workspace folder is used as the source of local files.
- No delete action for web resources (matching the original desktop app, which never
  exposed one either).

## Issues and feedback

Found a bug, or have a feature request? Please
[open an issue](https://github.com/chhay-sophal/wrsync/issues) on this repository.

## Contributing

The extension is split into two parts:

- **The extension host** (`src/`) — runs in Node, talks to Microsoft Entra ID (via
  `@azure/msal-node`) and the Dataverse Web API, and hosts the sidebar webview.
- **The webview UI** (`webview-ui/`) — a separate React + Vite + Fluent UI project. It
  never calls `fetch()` directly; it talks to the extension host over `postMessage()`
  through the RPC bridge in `src/rpc.ts` / `webview-ui/src/api/rpc.ts`.

### Setup

```
git clone https://github.com/chhay-sophal/wrsync.git
cd wrsync
npm install
```

`npm install` also installs `webview-ui`'s dependencies (via a `postinstall` script) —
you don't need a separate step for that.

### Running it

Open the folder in VS Code and press **F5** to launch an Extension Development Host with
the extension loaded. The default build task watches both parts and rebuilds on save; to
see a change in the Extension Development Host:

- `webview-ui/` (the Suggested links tab): nothing to do. When run from F5, the extension
  watches `webview-ui/dist` and reloads the tab as soon as each rebuild is complete.
- `src/` (the extension): restart debugging (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F5</kbd>).
- `package.json`'s `contributes`: **Developer: Reload Window**, since that's read at
  activation.

### Working on the Suggested links page in a browser

```
npm run dev:mock
```

The sidebar is a native tree view, so the only webview UI left is the Suggested links tab.
This serves it at http://localhost:5173 with Vite's hot reload, against fake data instead of
VS Code and Dataverse (`webview-ui/src/dev/mockVscode.ts`), so edits show up as you type. The
fixture covers each suggestion outcome: identical content, path match, flat name, ambiguous,
and no match. `?latency=1000` slows calls down to check loading states. The mock is only
loaded in this mode, never in the extension build.

### Before committing

```
npm run compile
```

This typechecks and lints both parts, builds `webview-ui`, and bundles the extension
host — the same checks `npm run package` runs before packaging a `.vsix`.

### Project layout

| Path | Purpose |
| --- | --- |
| `src/auth.ts` | Microsoft sign-in, token cache, account persistence |
| `src/dataverseClient.ts` | Dataverse Web API calls |
| `src/workspaceFiles.ts` / `src/fileWatcher.ts` | Listing and watching workspace files |
| `src/linksStore.ts` | Web-resource ↔ local-file link storage |
| `src/state.ts` | Selected environment/solution, filters and sort (per workspace) |
| `src/webResourceTree.ts` | The native Web Resources tree: items, hovers, M decorations |
| `src/webResourceCommands.ts` | Commands behind the tree's buttons, menus and pickers |
| `src/syncActions.ts` | Publish / pull / unlink flows with their confirmations |
| `src/modifiedTracker.ts` | Batched local-vs-Dataverse comparison and the Activity Bar badge |
| `src/publishCurrentFile.ts` | "Publish This File" from the editor |
| `src/linkSuggestionsPanel.ts` | Hosts the Suggested links webview tab |
| `src/rpc.ts` | Routes the Suggested links tab's calls to the functions above |
| `webview-ui/src/features/webresources/` | The Suggested links page |
