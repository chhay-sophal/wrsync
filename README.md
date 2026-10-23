# Web Resource Sync

Edit Power Apps (Dataverse) web resources from local files, right inside VS Code.

Sign in with your Microsoft account, browse a solution's web resources, link them to
files in your open workspace, and publish changes back to Dataverse — from a sidebar
view that stays open alongside the code you're editing.

## Features

- **Sign in** with your Microsoft account (no app registration or admin consent needed).
- **Browse** Dataverse environments, solutions, and their web resources, with filtering,
  sorting, and a details view.
- **Link** a web resource to a file in your open workspace folder.
- **Live change detection** — linked files are watched automatically, and a resource shows
  a "Modified" badge as soon as its local content diverges from what's published.
- **Publish** a single resource, a selection, or everything that's changed at once.
- **Create** new web resources directly from the sidebar.

## Requirements

- VS Code 1.135.0 or newer.
- A Microsoft account with access to at least one Dataverse environment.
- A folder open in VS Code containing the local files (HTML/JS/CSS/etc.) you want to link
  to web resources.

## Usage guide

### 1. Open the sidebar

Click the Web Resource Sync icon in the Activity Bar (the left-most vertical bar). It
stays open alongside your editor, so you don't need to switch tabs to use it.

### 2. Sign in

Click **Sign in**. A browser window opens for you to sign in with your Microsoft
account — no app registration or admin consent is needed.

If your Dataverse environment lives in a different organization than your account's home
tenant (e.g. you're a guest user there), enter that organization's domain — such as
`contoso.onmicrosoft.com` — in the **Tenant (optional)** field before signing in.

### 3. Pick an environment and solution

- **Workspace** shows the folder you currently have open in VS Code and how many
  linkable files it found — this is where local files come from, so make sure the right
  folder is open before linking anything.
- **Environment** lists the Dataverse environments your account can see. If discovery
  doesn't find the one you want, use **Or connect directly** and paste the Web API
  endpoint from that environment's Power Apps "Developer resources" page.
- **Solution** lists the unmanaged solutions in the picked environment.

### 4. Browse, search, and filter web resources

Once an environment and solution are picked, its web resources load as a list of cards.

- Use the **search box** to match by name or display name (supports `*`/`?` wildcards,
  e.g. `*_form`).
- Use the **filter button** to narrow by type (HTML/CSS/JS/etc.) or managed status.
- Use the **sort dropdown** to order by name, display name, type, or managed status.
- Click the **(i)** button on a card to see its full details (description, language code,
  created/modified dates, IDs).

### 5. Link a web resource to a local file

On a card, click **Link a file...** and pick a file from your open workspace. Once
linked, that file's content is compared against what's published in Dataverse
automatically — no manual refresh needed. If they differ, a **Modified** badge appears
as soon as you save the file.

The picker only lists files matching the resource's type (e.g. `.js` for JavaScript).
Image types (PNG, JPG, GIF, ICO) can't be linked.

To link many at once, click the **Suggest links** button (linked-chain icon) in the
toolbar. It matches unlinked web resources to unlinked local files by name — e.g.
`new_/scripts/account.js` ↔ `src/scripts/account.js` — and confirms each candidate by
comparing its content with Dataverse. The suggestions open in an editor tab, where there's
room to review them; untick anything wrong:

- **Identical content** — the file matches what's in Dataverse; ticked.
- **Path match** — a unique match on the file name plus its folder(s); ticked.
- **Name only** / **Ambiguous** — only the file name matches, or several files do;
  unticked, and you pick the file from a dropdown.

Only the ticked rows are linked. Nothing is published or changed.

### 6. Compare and resolve changes

Click **Compare** on a card that shows **Modified** to open a VS Code diff editor tab
with the published Dataverse content on the left and your local file on the right (the
same tab you'd get from `git diff`). The Dataverse side is read-only, but you can hover
over a changed block and click its arrow to copy that block into your local file — pick
Dataverse's version block-by-block instead of publishing (overwrite) or discarding
(ignore) the whole file at once. Leaving a block alone keeps your local version.

To take the Dataverse version wholesale instead, click **Pull** (the cloud-download
button) on the card. It replaces the linked local file's content with what's in Dataverse,
after a confirmation. If the file is open with unsaved changes, Pull refuses until you save
or discard them, so nothing unsaved is lost silently.

### 7. Publish your changes

- Click the publish (cloud) button on an individual card once it shows **Modified**.
- Or select multiple cards (checkboxes) and click the publish button in the toolbar.

Publishing uploads the linked file's current content and publishes it in one step.

You can also publish straight from the editor, without opening the sidebar. In a linked
file, click the **cloud-upload** button in the editor title bar, press
<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>U</kbd> (<kbd>Cmd</kbd>+<kbd>Alt</kbd>+<kbd>U</kbd> on
macOS), or run **Web Resource Sync: Publish This File** from the Command Palette. Unsaved
changes are saved first, and you get the same confirmation as in the sidebar, including the
warning when someone else changed the resource last. If the file is linked in more than one
environment, you're asked which one to publish to. The shortcut can be changed in
**Keyboard Shortcuts**.

### 8. Create a new web resource

Click the **+** (Create) button in the toolbar, fill in a name (e.g. `new_/scripts/myscript.js`),
display name, and type, then click **Create**. It's added to the current solution
immediately, ready to be linked to a local file.

### 8. Sign out

Click the sign-out icon in the header. This clears your session and any active
environment/solution selection.

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

- `webview-ui/` (the UI): run **Developer: Reload Webviews**. Give the rebuild a second
  first; reloading mid-build shows a blank view.
- `src/` (the extension): restart debugging (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F5</kbd>).
- `package.json`'s `contributes`: **Developer: Reload Window**, since that's read at
  activation.

### Working on the UI in a browser

```
npm run dev:mock
```

Serves the UI at http://localhost:5173 with Vite's hot reload, against fake data instead of
VS Code and Dataverse, so edits show up as you type. The fake extension lives in
`webview-ui/src/dev/mockVscode.ts`: it answers every call the UI makes, from a fixture that
covers each card state (in sync, modified, changed by someone else, mismatched link,
unlinked, binary, managed). It's only loaded in this mode, never in the extension build.

- `?view=linkSuggestions` opens the Suggested links page; `?latency=1000` slows calls down
  to check loading states; `?signedOut` starts signed out.
- In the browser console, `wrsyncMock.editLocalFile("src/scripts/account.js", "...")`
  simulates saving a local file, and `wrsyncMock.state` shows the fake data.
- State resets on reload. Use it for building and styling, then check against real data
  with F5 before committing.

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
| `src/rpc.ts` | Routes RPC calls from the webview to the functions above |
| `src/sidebarView.ts` | Hosts the webview as an Activity Bar sidebar view |
| `webview-ui/src/api/` | RPC-backed clients mirroring the modules above |
| `webview-ui/src/features/` | The environment/solution pickers and web resource list |
