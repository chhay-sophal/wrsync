# Change Log

All notable changes to the "wrsync" extension will be documented in this file.

## [0.1.1]

- **Suggest Links finds files by content, whatever their names**: it compares every unlinked
  web resource with every unlinked local file of a matching type, so renamed or moved
  identical copies are matched with certainty; the rest are still matched by name. Very
  short content and files over 1 MB are left to name matching.
- Suggest Links is faster: the content comparison runs in the extension in one batched pass
  instead of one request per candidate file.
- Each suggestion has a **Compare** button that opens a read-only diff of the Dataverse
  content and the chosen file in a new tab.

## [0.1.0]

### Upgrading from 0.0.2

- **The sidebar looks and works differently** - it's now a native tree, like Explorer. See
  the README's usage guide for where everything moved.
- **Pick your environment and solution again** once after upgrading: they're stored in a
  new place. Filters from 0.0.2 don't carry over either. Your links to local files and your
  sign-in are kept.
- **Publish All is gone.** To publish everything that changed: Filter → **Show Modified
  Only**, select all (<kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>A</kbd>), then **Publish
  Selected**.

### Changes

- **The sidebar is now a native VS Code tree view** ("Web Resources") instead of a webview,
  so it behaves like Explorer: file icons from your icon theme, hovers that can extend past
  the sidebar, Explorer-style multi-selection and keyboard navigation, inline action
  buttons, right-click menus, built-in find, and welcome steps for signing in and picking an
  environment and solution.
- Modified web resources are marked **M** in the modified colour (like changed files in
  Explorer), and clicking one opens Compare; clicking an in-sync linked one opens its local
  file. Clicks open a preview tab and keep focus in the view, so you can keep moving through
  the list. Hovering shows details, including who last modified it in Dataverse.
- Web resources whose name has no extension (e.g. `sync_Lookup`) get the file icon and
  syntax highlighting for their type.
- Added **View Content**: opens a web resource's Dataverse content in a read-only tab - text
  with syntax highlighting, images in VS Code's image preview; clicking a managed or unlinked
  web resource does this. Managed web resources are read-only - they can't be linked or
  published.
- SVG web resources get **Preview Image** (the rendered graphic) alongside their XML, and
  hovering an image or SVG shows a thumbnail.
- Filters (type, managed state, modified only, linked only, unlinked only) and sort live in
  the view's title bar and are remembered per environment and solution.
- Publishing asks for confirmation first, naming the target environment, and warns when a
  resource was last changed in Dataverse by someone else (with who and when), so you don't
  silently overwrite a colleague's change. Select several resources and use **Publish
  Selected** (title bar or right-click) to publish them together.
- Removed **Publish All**. To publish everything that changed: **Show Modified Only**,
  select all (<kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>A</kbd>), then **Publish Selected**.
- Added **Pull**: replaces the linked local file with the current Dataverse content in one
  step (after a confirmation). Open editors update in place, the file keeps its line
  endings, and files with unsaved changes are left alone.
- Added **Suggest Links**: opens an editor tab proposing local files for unlinked web
  resources by matching names, confirms candidates by comparing content, and links the rows
  you tick in one go. Ambiguous and name-only matches start unticked.
- Added **Publish This File**: publish a linked file straight from the editor via its
  title-bar button, <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>U</kbd>, or the Command Palette. It
  saves first and confirms like publishing from the view. The extension now activates on
  startup so the button is available before the view is opened.
- Unlinking a local file now asks for confirmation first.
- Linking only offers files matching the web resource's type (e.g. `.js` for JavaScript).
  Binary types (PNG, JPG, GIF, ICO) can't be linked, and existing links with a mismatched
  file type are marked **!** and can't be published.
- XSL web resources can now be linked to local `.xsl` / `.xslt` files.
- Line-ending (CRLF vs LF) and UTF-8 BOM differences no longer mark a linked file as
  modified.
- Much lighter change detection: saving a linked file re-checks only that file (a burst of
  auto-saves is checked once), adding or re-pointing a link checks only that link, and
  publishing re-checks only what was published - instead of re-downloading every linked
  web resource each time. A full check happens on startup, sign-in, and Refresh, with
  content fetched in batches of up to 50 per request.
- Large solutions no longer fail to load: web resources are listed in batches instead of one
  request whose URL could exceed Dataverse's length limit.
- Linking a file and Suggest Links list workspace files faster in large repositories.
- An unexpected error in the Suggested links tab shows a recovery screen (Try again /
  Reload / Reset & reload, plus error details) instead of a blank view.

## [0.0.2]

- Moved the UI from an editor-tab panel into a persistent Activity Bar sidebar view, so
  it stays open alongside the code you're editing instead of living in a tab.
- Redesigned the web resource list for the sidebar's narrow width: stacked cards instead
  of a wide table, and a compact toolbar (search, a Type/Managed filter popover, and a
  sort dropdown) replacing the old per-column filter/sort menus.
- Made the solution, environment, and local file pickers searchable instead of only
  scrollable.
- Added a "Modified only" checkbox to the filter popover.
- Added a **Compare** button on modified resources that opens a VS Code diff editor tab
  between the published Dataverse content and the linked local file, letting you copy
  individual changed blocks over instead of publishing or discarding the whole file.
- Added a live modified-file count badge on the sidebar's Activity Bar icon.

## [0.0.1]

- Initial version: sign-in, environment/solution browsing, web resource list with
  filtering/sorting/details, workspace file linking with live modified detection,
  publish (single/selected/all), and creating new web resources.
