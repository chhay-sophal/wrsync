# Web Resource Sync

Edit Power Apps (Dataverse) web resources from local files, right inside VS Code.

Sign in with your Microsoft account, browse a solution's web resources, link them to
files in your open workspace, and publish changes back to Dataverse — without leaving
the editor.

## Features

- **Sign in** with your Microsoft account (no app registration or admin consent needed).
- **Browse** Dataverse environments, solutions, and their web resources, with filtering,
  sorting, and a details view.
- **Link** a web resource to a file in your open workspace folder.
- **Live change detection** — linked files are watched automatically, and a resource shows
  a "Modified" badge as soon as its local content diverges from what's published.
- **Publish** a single resource, a selection, or everything that's changed at once.
- **Create** new web resources directly from the panel.

## Requirements

- VS Code 1.135.0 or newer.
- A Microsoft account with access to at least one Dataverse environment.
- A folder open in VS Code containing the local files (HTML/JS/CSS/etc.) you want to link
  to web resources.

## Getting started

1. Run **Web Resource Sync: Open Panel** from the Command Palette.
2. Click **Sign in** and complete the Microsoft sign-in flow in your browser.
3. Pick an **Environment** and **Solution** from the settings bar.
4. Link a web resource to a file in your workspace, edit the file, and publish.

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
