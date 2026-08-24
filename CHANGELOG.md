# Changelog

All notable changes to this project are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versioning follows [Semantic Versioning](https://semver.org/).

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

[1.0.0]: https://github.com/PulseKCode/modugrid/releases/tag/v1.0.0
