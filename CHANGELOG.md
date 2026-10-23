# Change Log

All notable changes to the "wrsync" extension will be documented in this file.

## [Unreleased]

- **The sidebar is now a native VS Code tree view** ("Web Resources") instead of a webview,
  so it behaves like Explorer: file icons from your icon theme, hovers that can extend past
  the sidebar, Explorer-style multi-selection and keyboard navigation, inline action
  buttons, right-click menus, built-in find, and welcome steps for signing in and picking an
  environment and solution.
- Modified web resources are marked **M** in the modified colour (like changed files in
  Explorer), and clicking one opens Compare; clicking an in-sync linked one opens its local
  file. Hovering shows details, including who last modified it in Dataverse.
- Added **View Content**: opens a web resource's Dataverse content in a read-only tab - text
  with syntax highlighting, images in VS Code's image preview; clicking a managed or unlinked
  web resource does this. Managed web resources are read-only - they can't be linked or
  published.
- SVG web resources get **Preview Image** (the rendered graphic) alongside their XML, and
  hovering an image or SVG shows a thumbnail.
- Filters (type, managed state, modified only, linked only, unlinked only) and sort live in the view's title bar and
  are remembered per environment and solution.
- Publishing asks for confirmation first, naming the target environment, and warns when a
  resource was last changed in Dataverse by someone else (with who and when), so you don't
  silently overwrite a colleague's change. Select several resources and use **Publish
  Selected** (title bar or right-click) to publish them together.
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
  file type are flagged and can't be published.
- XSL web resources can now be linked to local `.xsl` / `.xslt` files.
- Line-ending (CRLF vs LF) and UTF-8 BOM differences no longer mark a linked file as
  modified.
- Faster change detection for large solutions: linked resources' Dataverse content is
  fetched in batched requests (up to 50 per request) instead of one request per resource.
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
