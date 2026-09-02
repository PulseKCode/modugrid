# Changelog

All notable changes to this project are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versioning follows [Semantic Versioning](https://semver.org/).

---

## [1.1.0] — 2026-09-03

### Added

- `options.height` and `options.maxHeight` set the grid box directly. `height`
  holds the same size whatever the row count; `maxHeight` caps how far it grows
  before scrolling. Numbers are read as px, strings pass through (`'50vh'`, `'80%'`).
- `options.height: 'fill'` stretches the grid so its bottom edge meets the bottom
  of the browser window, and follows along when the window is resized. The sort
  bar and footer sit outside the table area, so a plain `'100vh'` would overshoot
  by their height; `'fill'` hands the table whatever is left after them instead.
  `maxHeight` still applies as a ceiling.
- `col.render` now receives a third argument, `ctx` — `{col, key, rowIndex}`.
  Until now a renderer only got `(value, row)` and could not tell which column it
  was drawing, so a shared formatter could not serve several columns and each one
  needed its own closure. `ctx` was appended rather than inserted, so renderers
  written against two arguments are unaffected.
- `cellClick` event — `{id, key, target}`. `rowClick` fires per row, which left no
  way to tell two buttons in the same row apart; `target` is the element that was
  actually clicked, so markup drawn by `render` can route its own actions. Fires
  after `rowClick`. Grid-internal widgets do not raise it.

- `options.fitLast` — the last column absorbs whatever width is left over, so the
  table closes flush with the right edge of the grid instead of trailing off into
  an empty strip. Off by default, since turning it on changes existing column
  widths. Recalculated when the window is resized.

### Changed

- **The table now closes on its last column and last row.** Both dropped their
  border, which reads fine while the table fills the grid, but a fixed-height grid
  holding a few narrow columns was left visibly open on two sides.
- **The grid now holds a fixed 420px by default.** Previously the only height rule
  was the stylesheet's `.gsc-wrap{max-height:420px}`, so a grid with few rows
  collapsed to its content and never kept a steady size — and with nothing to
  overflow, no scrollbar appeared either. Grids that pass no height option will
  render taller than they did in 1.0.0 when holding fewer than about ten rows.
  To get the old content-height sizing back, pass `maxHeight` on its own.

### Fixed

- A row added with `addRow()` was not marked as inserted until the *next* render,
  so `N` additions showed `N-1` of the `+` marks in the `_st` column. The row was
  pushed and drawn before `dataChange` fired, and the cached diff is only
  invalidated by that event — so the render read the diff from before the push.
  Only grids that read the diff between changes were affected, which is any screen
  showing a change indicator.
- `height: 'fill'` put a second scrollbar on the page. It measured against
  `window.innerHeight`, which counts a horizontal scrollbar's thickness, and it
  reached the window bottom exactly — leaving any padding below the grid to spill
  past it. It now measures `clientHeight` and takes back whatever the document
  actually overflows.
- `max-height` clamps `height`, so the stylesheet's 420px cap silently held a grid
  at 420px. Passing `height` now clears that cap, and a value above 420px is
  honoured rather than quietly ignored.

---

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