# Change Log

All notable changes to the "wrsync" extension will be documented in this file.

## [Unreleased]

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

## [0.0.1]

- Initial version: sign-in, environment/solution browsing, web resource list with
  filtering/sorting/details, workspace file linking with live modified detection,
  publish (single/selected/all), and creating new web resources.
