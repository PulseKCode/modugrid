# Changelog

All notable changes to this project are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versioning follows [Semantic Versioning](https://semver.org/).

---

## [1.1.0] — 2026-09-02

### Added

- `options.height` · `options.maxHeight` — set the grid box. Number = px, string as given (`'50vh'`)
- `options.height:'fill'` — stretch the grid to the bottom of the window, following resizes
- `options.fitLast` — let the last column absorb any leftover width. Off by default
- `col.render` now gets a third argument, `ctx` = `{col, key, rowIndex}`, so one formatter can serve several columns. Renderers written against `(value, row)` are unaffected
- `cellClick` event — `{id, key, target}`. `target` is the element pressed, so buttons drawn by `render` can route their own actions

### Changed

- **The grid holds a fixed 420px by default** and no longer shrinks to fit a few rows. Pass `maxHeight` on its own for the old content-height sizing
- The table now draws its closing border on the last column and the last row

### Fixed

- A row added with `addRow()` was marked as inserted one render late, so `N` additions showed `N-1` of the `+` marks
- `height:'fill'` added a second scrollbar to the page
- `height` above 420px was silently clamped by the stylesheet's cap

## [1.0.0] — 2026

First public release.

### Features

- Plain JavaScript with no dependencies. Works from a single `<script>` tag
- Several instances on one page, with fully separate state (no global pollution)
- Inline editing — text · number · date · select · textarea · autocomplete · images
- Dirty tracking with a diff sent by `submit()`
- Sorting (including multi-column) · filtering · search · paging · virtual scrolling
- Frozen columns · group headers · tree view · group aggregates
- Per-row and per-cell edit locks (`options.rowEditable` · `col.editable`)
- Validation that keeps the value and only marks the cell, with `isValid()` / `getInvalidCells()`
- Undo / redo, range selection, Excel-compatible copy and paste
- IME-safe input for Korean and other composed scripts (hidden-input approach)
- Theme and font settings, soft delete, right-click context menu

### Distribution

- Full sources published (`modugrid.js` · `modugrid.css`) under MIT
- `dist/` committed for CDN and build-tool-free environments — UMD · minified UMD · ESM · CSS · minified CSS
- 131 tests on jsdom, run against both the sources and the minified build
- CI on Node 18 · 20 · 22, with a job that fails when the committed `dist/` drifts from the sources
- 113 sample pages in English and Korean, plus a bilingual API and feature reference

[1.1.0]: https://github.com/PulseKCode/modugrid/releases/tag/v1.1.0
[1.0.0]: https://github.com/PulseKCode/modugrid/releases/tag/v1.0.0