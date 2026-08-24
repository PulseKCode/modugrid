**English** | [한국어](../ko/FEATURES.md)

# ModuGrid v1.0.0 — full feature list

Compiled straight from the `modugrid.min.js` / `modugrid.min.css` source and grouped by feature.
`☐` marks a checkbox for verifying the behaviour yourself.

---

## Contents

| # | Group | Covers |
|---|---|---|
| 1 | [Basic structure](#1-basic-structure) | files · initialisation · instances |
| 2 | [Columns](#2-columns) | definition · types · system columns · manipulation |
| 3 | [Presenting data](#3-presenting-data) | sorting · filtering · search · grouping · tree |
| 4 | [Selection](#4-selection) | row selection · cell selection · ranges |
| 5 | [Editing](#5-editing) | entry points · permissions · input control |
| 6 | [Coded values](#6-coded-values-code--display-name) | code and display name · dropdowns · autocomplete |
| 7 | [Validation](#7-validation) | validate · error display |
| 8 | [Change tracking and submitting](#8-change-tracking-and-submitting) | diff · soft delete · submit · **four image transfer modes** |
| 9 | [Copy, paste and export](#9-copy-paste-and-export) | TSV · JSON · CSV |
| 10 | [Layout](#10-layout) | widths · freezing · paging · virtual scrolling |
| 11 | [Modals](#11-modals) | detail · edit · add |
| 12 | [Appearance](#12-appearance) | themes · fonts · display options |
| 13 | [Server integration](#13-server-integration) | dataSource · filterSource |
| 14 | [Other](#14-other) | undo/redo · images · i18n · authorship |
| 15 | [Keyboard shortcuts](#15-keyboard-shortcuts) | |
| 16 | [All options](#16-all-options) | |
| 17 | [All API methods](#17-all-api-methods) | |
| 18 | [Events](#18-events) | |

---

## 1. Basic structure

| File | Required | Role |
|---|---|---|
| `modugrid.min.js` | O | the entire grid engine (one file, no external dependencies) |
| `modugrid.min.css` | O | styles and theme variables |
| `submit.jsp` | | server receiver sample (JSP + Oracle) |

```javascript
const G = ModuGrid('#grid', { cols: COLS, options: {...} });
G.setData(rows);
```

- The grid builds its own DOM inside the container — table, footer, popups, modals, toast ☐
- Multiple instances — several grids on one page, each with independent state, theme and fonts ☐
- No global pollution — `ModuGrid` is the only thing registered on `window` ☐
- Zero inline event handlers, everything delegated (no need for CSP `unsafe-inline`) ☐
- Inside a form, neither buttons nor Enter trigger a submit ☐
- `destroy()` — releases listeners, empties the DOM, drops the registry entry ☐

---

## 2. Columns

### 2.1 Column properties

| Property | Type | Description |
|---|---|---|
| `key` | string | data key (required) |
| `label` | string | header text. `\n` forces a line break |
| `w` | number | width in px. 120 when unset |
| `type` | string | cell render type (2.2) |
| `group` | string | group header name — columns sharing a value form a two-row header |
| `freeze` | 1 | frozen column (while `freezeOn` is on) |
| `noSort` | 1 | sorting disabled |
| `noResize` | 1 | resizing disabled |
| `noFilter` | 1 | filter icon hidden |
| `noMove` | 1 | drag reordering disabled |
| `editor` | false ǀ 'text' ǀ 'number' ǀ 'select' ǀ 'date' ǀ 'textarea' | choose the editor / `false` = not editable |
| `options` | array ǀ (row)=>array | list values (code and display name supported) |
| `optionFormat` | string ǀ (o,row)=>string | display format for the list and the cell |
| `acHints` | array ǀ (row)=>array | autocomplete list for this column |
| `acSource` | (key,q,col)=>Promise | server autocomplete for this column |
| `acLimit` | number | number of suggestions shown (8 by default) |
| `ac` | false | disable autocomplete for this column |
| `validate` | (v,row)=>bool ǀ string | validation |
| `render` | (v,row)=>html | custom cell renderer |
| `textCase` | 'upper' ǀ 'lower' | force letter case |
| `placeholder` | string | hint text for an empty cell |

### 2.2 Cell types

| `type` | Shown as |
|---|---|
| (none) | plain text |
| `number` | right-aligned number |
| `currency` | currency format (thousands separators) |
| `progress` | progress bar |
| `date` | date (using `dateFormat`) |
| `avatar` | circular initials plus the name |
| `images` | image thumbnails |
| `textarea` | multi-line text |

### 2.3 System columns

Declared directly in the `cols` array.

```javascript
{key:'_rn', label:'#', w:42, type:'rn', noSort:1,noResize:1,noFilter:1},
{key:'_st', label:'',  w:28, type:'st', noSort:1,noResize:1,noFilter:1},
{key:'_cb', label:'',  w:36, type:'cb', noSort:1,noResize:1,noFilter:1},
```

| Key | Contents | Option | Toggle |
|---|---|---|---|
| `_rn` | row number plus the row-height handle | `showRN` | `toggleRowNum()` |
| `_st` | change status marker `+` `*` `-` | `showST` | `toggleStatusCol()` |
| `_cb` | row checkbox | `showCB` | `toggleCheckbox()` |

- Always placed in the left frozen pane ☐
- Given the header background (`--bg-gut`) in the body, like Excel's row gutter ☐

### 2.4 Manipulating columns

```javascript
G.addCol({key:'memo', label:'Memo', w:150});    // at the end
G.addCol({...}, 2);          // at an index
G.addCol({...}, 'qty');      // before that column
G.addCols([...]);            // several at once (one re-render)
G.removeCol('memo');
G.updateCol('memo', {label:'Notes', w:200});
G.setCols([...]);            // replace everything
G.getCols();                 // a copy
```

- Width registration, cache invalidation, committing an open edit, and cleaning up sorts and filters all happen automatically ☐
- Changing `key` is blocked, to protect the data mapping ☐
- Fires `dataChange {type:'cols'}` ☐

---

## 3. Presenting data

### 3.1 Sorting

- Sorting happens **only by clicking the sort icons** (clicking the header label does not sort) ☐
- Cycles through three states: ascending → descending → off ☐
- Only the active direction's arrow is shown, and the label is emphasised ☐
- Multi-sort — order badges, each column cycling independently ☐
- Remove one or clear all from the sort bar ☐

### 3.2 Filtering

- Per-column list filter (multi-select checkboxes) ☐
- **Select all** — three states (all/some/none) plus `selected / total` ☐
- Search within the popup — while searching, select-all applies to the visible entries only ☐
- Per-column range filter (numeric min/max) ☐
- A dot marks columns with an active filter ☐
- Turn everything off with `showFilter:false` or `toggleFilter()` — which also clears active filters ☐
- Turn off per column with `noFilter:1` ☐

### 3.3 Search

```javascript
G.search('kim');
options: { searchKeys: ['name','memo'] }   // derived from COLS when unset
```

- Coded columns match on **both the code and the display name** ☐

### 3.4 Grouping and tree

- Aggregate rows per group (Count · Avg · Sum), collapsible ☐
- Tree mode — hierarchy built from `parentId`, collapsible ☐

---

## 4. Selection

| Mode | Behaviour |
|---|---|
| `selMode:'row'` | by row. Click · drag · Ctrl+click · Shift+click |
| `selMode:'cell'` | cell focus plus drag ranges |

- Checkboxes are independent of selection ☐
- **The select-all checkbox in the `_cb` header** — three states: all checked / some checked (indeterminate) / clear ☐
- Checking an individual row updates the header state immediately ☐
- Select-all applies to the rows currently rendered (the current page under ordinary paging) ☐
- Passing a string such as `cbHeader:'Select'` puts that text in the header instead of a checkbox ☐
- `cbHeader:'none'` or `false` → an empty header ☐
- `toggleCheckAll(on)` — the same behaviour from the API ☐
- Shift+arrow extends the range ☐
- Tiny movements within one cell do not start a range (holding the button down changes nothing) ☐
- Range display only updates classes — there is no re-render while dragging ☐
- `getSelected()` / `getChecked()` → **arrays of ids** ☐

---

## 5. Editing

### 5.1 Entry points

These only work in edit mode (`editMode`).

| Type | Double-click | F2 / Enter | Typing a character | Icon |
|---|---|---|---|---|
| text · number | hidden input | hidden input | hidden input | — |
| textarea | expanded editor | expanded editor | expanded editor | — |
| select | combo + list | combo + list | combo + list (filtered) | ▼ |
| date | editor + calendar | editor + calendar | editor only | 📅 (calendar on the first click) |

- All three paths use the **same editor** for text and number, down to the border thickness ☐
- Click a cell once and start typing and the input goes in, whether `selMode` is `'row'` or `'cell'` ☐
- Clicking another cell mid-edit commits the previous value and moves the input to the new cell ☐
- Tab / Shift+Tab — commit and move left or right ☐
- Enter — commit and move down / Esc — cancel ☐
- **Delete — clear the cell contents.** With a range selected, the whole range, as one `snap` ☐
- Numeric columns are cleared to `null`, distinct from `0` ☐

### 5.2 Edit permissions

```javascript
options: { editMode:true, canInsert:true, canUpdate:true, canDelete:true }
```

| Option | Blocks |
|---|---|
| `canUpdate:false` | all cell editing · paste · Delete · the edit modal (opens as detail) |
| `canInsert:false` | the add modal · Insert Above/Below |
| `canDelete:false` | deleting rows |

- The right-click menu hides entries according to these permissions ☐

**Per-row and per-cell locks**

```javascript
options: { rowEditable: (row) => row.status !== 'CLOSED' }          // whole row
{ key:'salary', editable: (row, col) => row.owner === myId }        // that cell only
```

- Returning `true` allows editing, `false` locks it. With both in play, **the row lock is applied first** ☐
- If the callback throws, it is treated as locked and the error is logged to the console ☐
- A locked cell loses the `editable` class, so it gets no text cursor and no hover highlight ☐

| Path | Lock respected |
|---|---|
| Click then type · double-click · F2 | ○ ☐ |
| Clearing a cell with Delete | ○ (skipped) ☐ |
| Paste | ○ (skipped and counted in `skipped`) ☐ |
| Row modal | ○ (shown read-only) ☐ |
| The `updateRow()` API | **✗** — programmatic calls are not blocked ☐ |

### 5.3 Input control

- Forced letter case — `textCase:'upper'ǀ'lower'` (per column or grid-wide), applied after IME composition ends ☐
- Placeholders — `col.placeholder` with `placeholderMode:'all'ǀ'first'ǀ'none'` ☐
- Adding, deleting and inserting rows (above/below) ☐
- Reordering rows by drag, adjusting individual row heights ☐

---

## 6. Coded values (code / display name)

Dropdowns and autocomplete run through the **same interpreter**.

```javascript
options: [
  'active',                     // code = display name
  {code:'A', name:'Active'},     // Oracle common-code style
  {value:'A', label:'Active'},   // JS convention
  {id:'A', text:'Active'},
  {v:'A', t:'Active'},
]
optionFormat: '{code} - {name}'          // or (o,row)=>string
```

**List precedence** — `col.options` → `col.acHints` → `options.acHints[key]`

- The **code** goes into the data, the **display name or format** onto the screen ☐
- Placeholders `{code}` `{value}` `{name}` `{label}` `{text}` plus any field of the original object ☐
- Applies to cells · dropdowns · autocomplete · the filter popup · search · CSV · Excel copy ☐
- The combo filter matches on all three: the format, the display name and the code ☐
- A value that is not in the list is stored as typed (and not added to the list) ☐
- **Runtime label dictionary** — a code received from server autocomplete keeps its display name in the cell after selection ☐
- `toCode()` / `toCodeRow()` — reduce to codes before sending ☐

**Autocomplete** — `acSource` queries the server (debounced), falls back to the local list on failure, with an LRU cache ☐

---

## 7. Validation

```javascript
validate: v => !!String(v).trim() || 'name is required'
```

Return values — `true` · `undefined` · `null` · `''` = pass / `false` = fail with the default message / a string = fail with that message

- **The value is not reverted** — the input stays, only the cell background turns red, with a tooltip ☐
- Once a value passes, the mark is cleared on that cell alone ☐
- All four paths behave the same (full editor · hidden input · cell calendar · modal) ☐
- `getInvalidCells()` / `isValid()` — check before saving ☐

**Auto-dismissing error tooltip** (`errorMsgDuration`, 3000ms by default)

- After the delay the `⚠ message` tooltip disappears. Zero or below keeps it visible ☐
- **Only the tooltip goes; the error state remains** — the red cell, `isValid()` and `getInvalidCells()` are untouched ☐
- A fresh error on the same cell restarts the timer ☐
- Once the value passes, the mark clears immediately regardless of the timer ☐

> Text and number cells **store the value** even when validation fails, leaving the cell red (Enter still moves to the next row).
> select, date and textarea do not store the value and stay in edit mode. Check `isValid()` before saving.

---

## 8. Change tracking and submitting

```javascript
G.markClean();          // the baseline (automatic on setData and on a server refetch)
G.getChanges();         // {inserted, updated, deleted}
G.getChangeCount();     // {inserted, updated, deleted, total}
G.isDirty();  G.getDirtyIds();  G.getPendingDeletes();

await G.submit('submit.jsp', { json:false, paramName:'changes', isOk:r=>r.ok });
```

- Snapshot diff — editing, modals, insertion, deletion and undo/redo are all picked up automatically ☐
- Codes are restored, so option objects never leave as they are ☐
- The diff result is cached by data version (for rendering performance on large sets) ☐
- `submitFields` is derived from COLS when unset ☐
- **Moving or removing a column does not mark rows as modified** — only changed values count ☐
- `getChanges().updated` carries **only the changed fields**, ready to drop into an UPDATE statement ☐
- The JSON key order of `inserted` follows the column order ☐

**Soft delete** (`softDelete:true`)

- A deleted row stays in the list with a strikethrough and is removed for real once `submit()` succeeds ☐
- New rows are removed immediately, since there is nothing to send. `Ctrl+Z` brings them back ☐

**Delete confirmation** — only shown when the action cannot be undone.

| Setting | Toolbar delete | Right-click delete | `deleteRows()` |
|---|---|---|---|
| `softDelete:true` (default) | none ☐ | none ☐ | none ☐ |
| `softDelete:false` | `Delete N row(s)?` ☐ | `Delete this row?` ☐ | none ☐ |
- Rows pending deletion cannot be edited or pasted into ☐
- Restore with `restoreRows()` or `Ctrl+Z` ☐

**Change marks** (`dirtyMark`)

| Class | Applies to | Marker |
|---|---|---|
| `jnew` | new | `+` green |
| `jupd` | modified | `*` amber |
| `jdel` | pending deletion | `-` red with a strikethrough |

- `dirtyMark:false` turns off the background colour only (the deletion strikethrough stays) ☐
- The left gutter keeps a constant background regardless of change state ☐

### 8.1 Four image transfer modes

These decide **when and in what form** the files of a `type:'images'` column are sent.

```javascript
options: {
  imageMode: 'none',              // none | upload | multipart | base64
  imageMaxSize: 2*1024*1024,      // maximum bytes per image. 0 = unlimited
  imageLimit: 5,                  // maximum images per row
}
```

| Mode | Uploaded | submit payload | Suits |
|---|---|---|---|
| `none` | never | images excluded | no images · preview only |
| `upload` | **as soon as a file is picked** | JSON (URL reference) | large or numerous files |
| `multipart` | at submit time | FormData (JSON + files) | saving everything in one go |
| `base64` | converted immediately, sent at submit | dataURL embedded in the JSON | small things like signatures or icons |

- A file exceeding the size or count limit is excluded on its own, with a message ☐
- **Do not change the mode at runtime** — the storage form differs, so images already held would be sent in the wrong shape ☐

#### `none` — nothing is sent (the default)

The image column drops out of the submit entirely. `getChanges()` carries no `images` field either. ☐

#### `upload` — each file uploaded as soon as it is picked

```javascript
options: {
  imageMode: 'upload',
  imageUpload: async (file, row) => {
    const fd = new FormData();
    fd.append('file', file); fd.append('rowId', row.id);
    const res = await fetch('upload.jsp', { method:'POST', body:fd });
    return await res.json();          // { id, url }
  }
}
```

- The `imageUpload` function is **required**. Without it, a console warning is logged and nothing uploads ☐
- Progress is shown during the upload, the `{id,url}` from the server replaces it on success, and failures are marked ☐
- Use `hasPendingUploads()` to check everything finished before submitting ☐

The submit payload — the files are already on the server, so only references are sent.

```json
{ "id":3, "changes":{ "images":[
    { "id":"F123", "url":"/files/F123.jpg", "name":"photo.jpg", "size":204800 } ]}}
```

> Leaving without saving orphans the files. Schedule a batch job to clear unreferenced ones.

#### `multipart` — files sent together at submit time

The original files are held until `submit()`, then bundled with the change JSON into a single `FormData`.

<!-- sync:ignore-code -->
```
POST submit.jsp
Content-Type: multipart/form-data; boundary=...

changes         = {"inserted":[...],"updated":[...],"deleted":[...]}
img_3_images_0  = (file binary)
img_7_images_0  = (file binary)
```

- Part names follow `img_{rowId}_{columnKey}_{index}` ☐
- The `ref` value of an image entry in the JSON is exactly that part name, so the server finds the file by `ref` ☐
- `Content-Type` is set by the browser along with the boundary — do not set it yourself ☐
- The held file references are released once the submit succeeds ☐

```json
{ "id":3, "changes":{ "images":[
    { "name":"photo.jpg", "size":204800, "ref":"img_3_images_0" } ]}}
```

#### `base64` — embedded in the JSON as a string

Files are converted to a dataURL as soon as they are picked, held, and put straight into the JSON at submit time.

```json
{ "id":3, "changes":{ "images":[
    { "name":"sign.png", "size":8200, "data":"data:image/png;base64,iVBORw0KG..." } ]}}
```

```jsp
String dataUrl = img.getString("data");
byte[] bytes   = Base64.getDecoder().decode(dataUrl.substring(dataUrl.indexOf(',') + 1));
```

> **base64 is roughly 33% larger than the original.** Use it only for small, few items such as signatures
> and icons, and always set `imageMaxSize` alongside it. ☐

---

---

## 9. Copy, paste and export

| Action | Format |
|---|---|
| `Ctrl+C` | range as TSV |
| Right-click `Copy Row(Json)` | JSON |
| Right-click `Copy Row(Excel)` | TSV (every selected row) |
| `Ctrl+V` | TSV across multiple cells |
| `exportCSV()` | CSV (with a BOM) |

- CSV and the Excel copy share value rules — display values for lists, **unformatted originals for numbers and currency** ☐
- A paste is one `snap`, so a single `Ctrl+Z` undoes all of it ☐
- Cells failing validation, `editor:false` columns, system and image columns, and rows pending deletion are skipped and counted ☐
- **Selection, copy and paste outside the grid are not intercepted** ☐

---

## 10. Layout

- Drag to resize columns ☐
- **Double-click a column boundary to auto-fit the width** (the Excel behaviour, measured on displayed values) ☐
- Drag to reorder columns, plus a show/hide panel ☐
- Frozen pane — `col.freeze` with `freezeOn`, header and row heights synchronised automatically ☐
- Group headers (two rows) — sticky offsets measured at runtime ☐
- Header line breaks — `\n` in the label (manual) or `headerWrap:true` (automatic) ☐
- **Header ellipsis** — a label wider than the column ends in `...`, with space always reserved for the sort arrow and filter funnel ☐
- Left and right header heights (frozen pane and body) stay matched even while a column is being resized ☐
- Widening a column until the wrap resolves shrinks the header height again ☐
- Paging — 10/25/50/100/**everything (`pageSize:0`)** ☐
- Virtual scrolling (`toggleVS`) ☐
- Save and restore the layout — `getLayout()` / `setLayout()` ☐

---

## 11. Modals

```javascript
G.openDetail(id);              // detail (read-only)
G.openRowModal('edit', id);    // edit
G.openRowModal('add');         // add
```

- **Fields generated from the COLS definitions**, with no dependency on the app's HTML ☐
- Rendered by type — select · textarea · date · number ☐
- **Only editable columns accept input**; the rest are shown read-only alongside ☐
- The rules are the same as for cell editing (permissions · column definition · row state) ☐
- Validation runs on save ☐

---

## 12. Appearance

### 12.1 Themes (11 of them)

```javascript
G.setTheme('dark');
G.setTheme('ocean', { ac:'#ff6600' });   // preset plus variable overrides
G.setTheme(undefined, { ROW:'30px' });   // variables only
G.getThemes();
```

`light` `dark` `midnight` `slate` `ocean` `forest` `sunset` `rose` `contrast` `compact` `compact-dark`

- `data-theme` goes on the grid container, so each grid can use a different theme ☐
- Switching preset clears any previous custom variables automatically ☐

### 12.2 Fonts (header and body, independently)

```javascript
G.setFont({
  header: { size:12, family:'Pretendard', bold:true },
  body:   { size:14, italic:true, weight:500 }
});
G.setFont(14);      // body size only
G.setFont(null);    // reset
```

- Partial specifications are fine (the rest is kept); `null` on an individual property resets just that one ☐
- Row numbers and numeric cells scale with the body size (via `calc`) ☐

### 12.3 Display options

```javascript
options: {
  showFoot:true, showRows:true, showPager:true, showPageSize:true,
  showRN:true, showST:true, showCB:true,
  striped:true, dirtyMark:true, showFilter:true,
}
```

- Status bar order: `Rows info` → `page list` → `Per page` ☐
- Hiding an individual item **keeps its place**, so nothing else shifts ☐
- When every item is off, the status bar hides itself ☐
- The toast appears **centred on the grid**, independently per grid ☐

---

## 13. Server integration

```javascript
options: {
  dataSource:   (req) => Promise<{rows, total, agg}>,
  filterSource: (colKey, req) => Promise<string[]>,
  acSource:     (colKey, q) => Promise<string[]>,
}
```

- Sorting, filtering, search and paging state are passed in `req` ☐
- Request sequencing — responses that arrive late are discarded ☐
- Loading overlay / the `dataError` event / `reload()` ☐
- Built-in LRU cache for distinct lists and autocomplete ☐

---

## 14. Other

- Undo / redo — snapshot based, fires `dataChange {type:'undo'ǀ'redo'}` ☐
- Automatic id assignment — filled in when missing, duplicates cleaned up, never reused, replaceable via `genId` ☐
- Image cells — file picker · drag and drop · preview · delete · count and size limits ☐
- Four image transfer modes — `imageMode` (see 8.1) ☐
- **Right-click menu configuration** — `contextMenu` ☐

```javascript
options: { contextMenu: false }                       // off entirely
options: { contextMenu: { copy:false, delete:false } } // per item
```

  Item names — `detail` · `edit` · `copy` · `copyExcel` · `insertAbove` · `insertBelow` · `tree` · `delete`

- Anything not listed is shown. The option is an **additional restriction** layered on top of permissions ☐
- With `contextMenu:false` the browser's own menu appears normally ☐
- No empty menu is opened when there is nothing left to show ☐
- Hiding items tidies up the separators too ☐
- i18n — 31 keys, overridable in part or in full through `options.i18n` ☐
- **Console logs, warnings and exception messages are all in English** (only the comments are in Korean) ☐
- Authorship — `ModuGrid.about`, frozen and read-only ☐

```javascript
ModuGrid.about
// { name:'ModuGrid', version:'1.0.0', author:'BongJun Park', license:'MIT',
//   copyright:'© 2026 BongJun Park', homepage:'https://github.com/PulseKCode' }
```
- Mapping app controls — `options.controls` ☐

---

## 15. Keyboard shortcuts

| Key | Action |
|---|---|
| `↑` `↓` `←` `→` | move the cell focus |
| `Ctrl` + arrow | jump to the end of the data (crossing pages) |
| `Shift` + arrow | extend the range |
| `Tab` / `Shift+Tab` | commit and move left or right |
| `Enter` | start editing / commit and move down |
| `F2` | start editing (selecting the existing value) |
| `Esc` | cancel editing |
| `Delete` | clear the cell contents |
| any character key | start editing immediately |
| `Ctrl+C` / `Ctrl+V` | copy / paste the range |
| `Ctrl+Z` / `Ctrl+Y` | undo / redo |

Keys pressed in an input outside the grid are not intercepted. ☐

---

## 16. All options

```javascript
options: {
  // display
  showRN, showST, showCB, striped, rowHeight, freezeOn,
  showFoot, showRows, showPager, showPageSize, showFilter,
  headerWrap, placeholderMode, dirtyMark, cbHeader, contextMenu,

  // appearance
  theme, themeVars, headerFont, bodyFont,

  // selection and editing
  selMode, editMode, canInsert, canUpdate, canDelete,
  rowEditable, errorMsgDuration, keyboardOnLoad,
  dateFormat, textCase, numericKeys, newRowDefaults, genId,

  // images
  imageMode, imageUpload, imageMaxSize, imageLimit,

  // sorting, search, paging
  multiSort, searchKeys, pageSize,

  // lists and autocomplete
  acHints, acSource, acDebounce,

  // change tracking
  submitFields, softDelete,

  // server
  dataSource, filterSource,

  // miscellaneous
  controls, i18n, on,
}
```

---

## 17. All API methods

**Data** `setData` `addRow` `insertAt` `updateRow` `deleteRows` `restoreRows` `deleteSelected` `editSelected`

**Reading state** `getSelected` `getChecked` `getFilteredData` `getState` `getPendingDeletes`

**Selection** `setSelMode` `toggleRowSel` `toggleRowCheck` `toggleCheckAll`

**Images** `getImages` `hasPendingUploads`

**Columns** `addCol` `addCols` `removeCol` `updateCol` `setCols` `getCols` `moveCol` `hideCol` `showCol` `toggleColHidden` `openColPanel` `autoFit`

**Sorting, filtering, search** `doSort` `rmSort` `clearSorts` `openCF` `applyCF` `clearCF` `search` `toggleFilter` `toggleMultiSort`

**Editing** `startEdit` `startEditIME` `openPicker` `openDatePicker` `setCellDate` `clearCells` `pasteText` `canInsert` `canUpdate` `canDelete`

**Change tracking** `markClean` `getChanges` `getChangeCount` `isDirty` `getDirtyIds` `submit` `toCode` `toCodeRow`

**Validation** `getInvalidCells` `isValid`

**Modals** `openDetail` `openRowModal` `closeRowModal` `saveRowModal`

**Appearance** `setTheme` `getTheme` `getThemes` `setFont` `getFont` `setPlaceholderMode` `toggleStripe` `toggleDirtyMark`

**Display toggles** `toggleFreeze` `toggleRowNum` `toggleStatusCol` `toggleCheckbox` `toggleVS` `toggleEditMode` `toggleGroup` `toggleTree` `toggleFoot` `toggleRowsInfo` `togglePager` `togglePageSize`

**Rows** `moveRow` `setRowHeight` `toggleRowSel` `toggleRowCheck` `setSelMode`

**Paging** `goPage` `changePS`

**Copy and export** `copyRange` `ctxCopy` `ctxCopyExcel` `exportCSV`

**Layout and lifecycle** `getLayout` `setLayout` `reload` `undo` `redo` `destroy` `renderGrid`

---

## 18. Events

```javascript
options: { on: { dataChange, cellEdit, selectionChange, rowClick, dataError, dirtyChange } }
```

| Event | Payload |
|---|---|
| `dataChange` | `{type, ...}` |
| `cellEdit` | `{id, key, value}` |
| `selectionChange` | `{selected, checked}` |
| `rowClick` | `{id, selected}` |
| `dataError` | `{error}` |
| `dirtyChange` | `{inserted, updated, deleted, total}` |

`dataChange.type` — `load` `add` `insert` `update` `delete` `restore` `clear` `paste` `move` `cols` `undo` `redo`
