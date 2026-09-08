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

### 6. Publish your changes

- Click **Publish** on an individual card once it shows **Modified**.
- Or select multiple cards (checkboxes) and click **Publish Selected** in the toolbar.
- Or click **Publish All** to publish every modified, linked resource at once.

Publishing uploads the linked file's current content and publishes it in one step.

### 7. Create a new web resource

Click **Create** in the toolbar, fill in a name (e.g. `new_/scripts/myscript.js`),
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
