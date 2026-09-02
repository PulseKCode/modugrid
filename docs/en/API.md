**English** | [한국어](../ko/API.md)

# ModuGrid v1.1.0 — API reference

Written against the current `modugrid.min.js`. For a feature overview see [FEATURES.md](FEATURES.md).

---

## Contents

- [Construction and static members](#construction-and-static-members)
- [Column definition](#column-definition)
- [Options](#options)
- [Events](#events)
- [Data](#data)
- [Reading state](#reading-state)
- [Columns](#columns)
- [Sorting, filtering and search](#sorting-filtering-and-search)
- [Editing](#editing)
- [Change tracking and submitting](#change-tracking-and-submitting)
- [Validation](#validation)
- [Modals](#modals)
- [Appearance](#appearance)
- [Display toggles](#display-toggles)
- [Rows and selection](#rows-and-selection)
- [Paging](#paging)
- [Copy and export](#copy-and-export)
- [Layout and lifecycle](#layout-and-lifecycle)

---

## Construction and static members

### `ModuGrid(container, config)`

| Argument | Type | Description |
|---|---|---|
| `container` | string ǀ Element | CSS selector or DOM element |
| `config.cols` | array | column definitions **(required)** |
| `config.options` | object | options |

**Returns** the instance object (`G`)

```javascript
const G = ModuGrid('#grid', { cols: COLS, options: {...} });
```

You can create several grids on one page; their state is entirely independent.

### Static members

| Member | Description |
|---|---|
| `ModuGrid.get(id)` | look up an instance (used for internal routing) |
| `ModuGrid.about` | authorship information (read-only, frozen) |
| `ModuGrid.version` | version string (`'1.1.0'`) |

```javascript
ModuGrid.about
// { name:'ModuGrid', version:'1.1.0', author:'BongJun Park', license:'MIT',
//   copyright:'© 2026 BongJun Park', homepage:'https://github.com/PulseKCode', signature:'...' }
```

Console and warning messages are all in English. UI wording can be overridden with `options.i18n`.

---

## Column definition

```javascript
{ key, label, w, type, group, freeze,
  noSort, noResize, noFilter, noMove,
  editor, editable, options, optionFormat,
  acHints, acSource, acLimit, ac,
  validate, render, textCase, placeholder }
```

| Property | Type | Default | Description |
|---|---|---|---|
| `key` | string | — | data key **(required)** |
| `label` | string | `key` | header text. `\n` forces a line break. Truncated with `...` when wider than the column (space for the sort and filter icons is always reserved) |
| `w` | number | 120 | width in px |
| `type` | string | — | `number` `currency` `progress` `date` `avatar` `images` `textarea` |
| `group` | string | — | group header name (columns sharing a value are grouped into a two-row header) |
| `freeze` | truthy | — | frozen column (only applied while `freezeOn` is on) |
| `noSort` | truthy | — | hide the sort icon |
| `noResize` | truthy | — | disable resizing and auto-fit |
| `noFilter` | truthy | — | hide the filter icon |
| `noMove` | truthy | — | disable drag reordering |
| `editor` | string ǀ false | automatic | force a specific editor. `false` makes the whole column read-only |
| `editable` | fn | — | `(row, col) => boolean`. **Per-cell edit lock.** Returning `false` locks that cell only |
| `options` | array ǀ fn | — | coded values (code and display name) |
| `optionFormat` | string ǀ fn | — | display format for the list and the cell |
| `acHints` | array ǀ fn | — | autocomplete list for this column |
| `acSource` | fn | — | `(colKey, q, col) => Promise<array>` |
| `acLimit` | number | 8 | number of autocomplete suggestions shown |
| `ac` | false | — | disable autocomplete for this column |
| `validate` | fn | — | `(value, row) => true ǀ false ǀ 'message'` |
| `render` | fn | — | `(value, row, ctx) => HTML string`. Returned markup is inserted as-is, so escaping is the caller's job. `ctx` is `{col, key, rowIndex}` — it lets one formatter serve several columns |
| `textCase` | string | — | `'upper'` ǀ `'lower'` |
| `placeholder` | string | — | hint text shown in an empty cell |

### System columns

Declared through `type`, directly in the `cols` array.

```javascript
{ key:'_rn', label:'#', w:42, type:'rn', noSort:1, noResize:1, noFilter:1 }   // row number
{ key:'_st', label:'',  w:28, type:'st', noSort:1, noResize:1, noFilter:1 }   // change status
{ key:'_cb', label:'',  w:36, type:'cb', noSort:1, noResize:1, noFilter:1 }   // checkbox
```

By default the `_cb` header carries a **select-all checkbox**. It has three states: checked when every
row in range is checked, indeterminate when only some are, and clear when none are. The range is the
rows currently rendered (the current page under ordinary paging). Change it with `options.cbHeader`.

### `options` entry formats

All of the following are recognised. The **code** is stored, the **display name** is shown.

```javascript
'active'                  // code = display name
{ code:'A',  name:'Active' }
{ code:'A',  label:'Active' }
{ value:'A', label:'Active' }
{ id:'A',    text:'Active' }
{ v:'A',     t:'Active' }
```

### `optionFormat`

```javascript
optionFormat: '{code} - {name}'
optionFormat: (o, row) => `[${o.code}] ${o.name}`
```

Placeholders — `{code}` `{value}` = code / `{name}` `{label}` `{text}` = display name / any other `{key}` = a field of the original object

---

## Options

### Display

| Option | Default | Description |
|---|---|---|
| `showRN` `showST` `showCB` | `true` | show the left-hand system columns |
| `showFoot` | `true` | the status bar as a whole |
| `showRows` `showPager` `showPageSize` | `true` | individual status bar items |
| `showFilter` | `true` | header filter icons |
| `striped` | `true` | zebra striping |
| `dirtyMark` | `true` | background colour for changed rows |
| `rowHeight` | 25 | row height in px |
| `height` | `420px` | grid height, held whatever the row count. Number = px, string = as given (`'50vh'`, `'80%'`). `'fill'` = stretch to the bottom of the window |
| `maxHeight` | — | grid grows to this height, then scrolls. Same value formats as `height`. Given on its own it also drops the fixed default, so the grid sizes to its content |
| `fitLast` | `false` | let the last column absorb any width left over, so the table closes flush with the grid. Off by default — the empty strip on the right is kept |
| `freezeOn` | `false` | frozen columns |
| `headerWrap` | `false` | wrap header labels automatically |
| `placeholderMode` | `'all'` | `'all'` ǀ `'first'` ǀ `'none'` |
| `cbHeader` | `'check'` | the `_cb` header. `'check'` = select-all checkbox ǀ a string = that text ǀ `'none'`·`false` = empty header |
| `contextMenu` | `true` | right-click menu. `false` = off ǀ `{item:false}` = per item |

### Appearance

| Option | Default | Description |
|---|---|---|
| `theme` | `'light'` | one of 11 theme presets |
| `themeVars` | — | set CSS variables directly, `{ac:'#...'}` |
| `headerFont` `bodyFont` | — | `{size, family, weight, bold, italic}` |

### Selection and editing

| Option | Default | Description |
|---|---|---|
| `selMode` | `'row'` | `'row'` ǀ `'cell'` |
| `editMode` | `false` | edit mode (the master switch) |
| `canInsert` `canUpdate` `canDelete` | `true` | finer permissions within edit mode |
| `rowEditable` | — | `(row) => boolean`. **Per-row edit lock.** Returning `false` locks the entire row |
| `errorMsgDuration` | 3000 | auto-hide delay for the validation tooltip, in ms. Zero or below keeps it visible |
| `keyboardOnLoad` | `true` | keyboard control active right after load. `false` requires one click on the grid first |
| `dateFormat` | `'yyyy-mm-dd'` | date display format |
| `textCase` | — | force upper or lower case across all columns |
| `numericKeys` | `[]` | keys to be treated as numbers |
| `newRowDefaults` | `{}` | default values for new rows |
| `genId` | — | `(data) => id`, replaces the id generation rule |

### Sorting, search and paging

| Option | Default | Description |
|---|---|---|
| `multiSort` | `false` | multi-column sorting |
| `searchKeys` | automatic | keys to search. Derived from COLS when unset |
| `pageSize` | 100 | page size. **`0` = show everything** |

### Lists and autocomplete

| Option | Description |
|---|---|
| `acHints` | `{ colKey: [...] }`, a grid-wide list |
| `acSource` | `(colKey, q) => Promise<array>` |
| `acDebounce` | debounce for server lookups (ms, default 200) |

### Change tracking and server

| Option | Default | Description |
|---|---|---|
| `submitFields` | automatic | fields included in the diff. Derived from COLS when unset |
| `softDelete` | `true` | treat deletion as pending rather than immediate |
| `dataSource` | — | `(req) => Promise<{rows, total, agg}>` |
| `filterSource` | — | `(colKey, req) => Promise<string[]>` |

### Images

| Option | Default | Description |
|---|---|---|
| `imageMode` | `'none'` | transfer method. `'none'` ǀ `'upload'` ǀ `'multipart'` ǀ `'base64'` |
| `imageUpload` | — | `(file, row) => Promise<{id,url}>`. **Required in `'upload'` mode** |
| `imageMaxSize` | 0 | maximum bytes per image. `0` = unlimited |
| `imageLimit` | 5 | maximum images per row |

**The default, `'none'`, sends no images.** See chapter 8 of FEATURES.md for the payload of each mode.

### Miscellaneous

| Option | Description |
|---|---|
| `controls` | map of IDs for controls owned by the app |
| `i18n` | override the message dictionary (31 keys) |
| `on` | event handlers |

---

## Events

```javascript
options: {
  on: {
    dataChange:      e => {},
    cellEdit:        e => {},
    selectionChange: e => {},
    rowClick:        e => {},
    cellClick:       e => {},
    dataError:       e => {},
    dirtyChange:     e => {},
  }
}
```

| Event | Payload | Fired when |
|---|---|---|
| `dataChange` | `{type, ...}` | on any data change |
| `cellEdit` | `{id, key, value}` | a cell edit is committed |
| `selectionChange` | `{selected, checked}` | selection or checks change (arrays of ids) |
| `rowClick` | `{id, selected}` | a row is clicked |
| `cellClick` | `{id, key, target}` | a cell is clicked. `target` is the clicked element, so buttons drawn by `render` can be told apart. Fires after `rowClick` |
| `dataError` | `{error}` | a server fetch fails |
| `dirtyChange` | `{inserted, updated, deleted, total}` | only when the change counts differ |

`dataChange.type` — `load` `add` `insert` `update` `delete` `restore` `clear` `paste` `move` `cols` `undo` `redo`

---

## Data

### `setData(rows)`
Replaces the whole data set. Rows without an `id` are given one, duplicate ids are cleaned up.
The change-tracking baseline is reset and error marks are cleared.

### `addRow(row)`
Appends a row at the end. An `id` is assigned when missing.

### `insertAt(pos, rowFactory?)`
Inserts a new row at `pos`.

### `updateRow(id, updates)`
Updates some fields of a row.

### `deleteRows(idsSet)`
Deletes the ids given as a `Set`.
With `softDelete` on, rows are marked **pending deletion** rather than removed, and are removed once `submit()` succeeds.
New rows that never reached the server are removed immediately.

### `restoreRows(idsSet)`
Clears the pending-deletion mark.

### `deleteSelected()` / `editSelected()`
Deletes the selected rows / opens them in the edit modal.

---

## Reading state

| Method | Returns |
|---|---|
| `getSelected()` | **array of ids** of selected rows |
| `getChecked()` | **array of ids** of checked rows |
| `getFilteredData()` | array of rows with filtering and sorting applied |
| `getPendingDeletes()` | array of ids pending deletion |
| `getState()` | the internal state object (treat it as read-only) |

---

## Columns

### `addCol(col, at?)`
Adds a column. A numeric `at` is an index; a string inserts **before** that column. Omit it to append.
**Returns** `boolean`

```javascript
G.addCol({ key:'memo', label:'Memo', w:150 });
G.addCol({ key:'c1', label:'C1', w:60 }, 2);
G.addCol({ key:'c2', label:'C2', w:60 }, 'qty');
```

### `addCols(cols, at?)`
Adds several at once (a single re-render). **Returns** the number added

### `removeCol(key)`
Removes a column. Its sorting, filter, width and error marks are cleaned up with it.
**The corresponding field stays in the data.**

### `updateCol(key, patch)`
Changes column properties. Changing `key` is ignored, to protect the data mapping.

### `setCols(cols)` / `getCols()`
Replace everything / return a **copy** of the current definitions

### `moveCol(key, toIdx)` · `hideCol(key)` · `showCol(key)` · `toggleColHidden(key)` · `openColPanel()` · `autoFit(key)`

---

## Sorting, filtering and search

### `doSort(key, event)`
Cycles through three states: ascending → descending → off. On screen it is only reached by **clicking the sort icons**.

### `rmSort(index)` / `clearSorts()` / `toggleMultiSort()`

### `openCF(event, key)` / `applyCF()` / `clearCF()`
Open / apply / clear the column filter popup

### `toggleFilter(on?)`
Turns header filters on and off. Turning them off also clears any active column filters.

### `search(q)`
Global search. Coded columns match on both the code and the display name.

---

## Editing

### `startEdit(td, rowId, colKey, seed?)`
Opens a full editor (select · date · textarea).

### `startEditIME(rowId, colKey)`
Opens through the hidden-input path (text · number).

### `openPicker(rowId, colKey)` / `openDatePicker(rowId, colKey)`
Opens the dropdown / the calendar.

### `setCellDate(rowId, colKey, iso)`
Applies a date picked from the cell calendar without going through an editor.

### `clearCells()`
Clears the focused cell, or the selected range. One `snap`. **Returns** the number of cells cleared

### `pasteText(text)`
Pastes a TSV string. **Returns** `{cells, skipped}`

### `canInsert()` / `canUpdate()` / `canDelete()`
The current permission state, judging `editMode` together with the matching option.

---

## Change tracking and submitting

### `markClean()`
Takes the current state as the baseline. Called automatically by `setData` and by a server refetch.

### `getChanges()`

<!-- sync:ignore-code -->
```javascript
{
  inserted: [ {id, ...fields} ],
  updated:  [ {id, changes:{only the changed fields}} ],
  deleted:  [ id, ... ]
}
```

Values are reduced back to codes, so option objects never go out as they are.

### `getChangeCount()` → `{inserted, updated, deleted, total}`
### `isDirty()` → `boolean`
### `getDirtyIds()` → array of ids of changed rows

### `submit(url, opts?)`

```javascript
const out = await G.submit('submit.jsp', {
  method:    'POST',      // POST by default
  paramName: 'changes',   // parameter name when sent as a form
  json:      false,       // true sends an application/json body
  headers:   {},
  credentials: 'include',
  isOk:      res => res.ok,
  markClean: true,        // false keeps the baseline where it is
});
```

**Returns** the server response. With nothing to send, `{ok:true, skipped:true, count}`
**Throws** on an HTTP error, or when `isOk` returns false
On success, rows pending deletion are removed and the baseline moves forward.

### `toCode(value)` / `toCodeRow(row, keys?)`
Reduces option objects to their code string. Arrays, Dates and plain objects pass through untouched.

---

## Validation

### `getInvalidCells()` → `[{id, key, message}]`
### `isValid()` → `true` when there are no cells in error

When `validate` fails **the value is not reverted**; only the cell turns red. Check with these before saving.

---

## Modals

### `openDetail(id)`
Opens the row detail in a read-only modal.

### `openRowModal(mode, id?)`
`mode` — `'detail'` ǀ `'edit'` ǀ `'add'`
Fields are generated from the COLS definitions, and **only editable columns accept input**.
Without update permission, a request for `'edit'` opens the detail view instead.

### `closeRowModal()` / `saveRowModal()`

---

## Appearance

### `setTheme(name?, vars?)`

```javascript
G.setTheme('dark');
G.setTheme('ocean', { ac:'#ff6600' });   // preset plus variables
G.setTheme(undefined, { ROW:'30px' });   // keep the theme, variables only
G.setTheme(null);                        // back to light
```

Presets — `light` `dark` `midnight` `slate` `ocean` `forest` `sunset` `rose` `contrast` `compact` `compact-dark`
`data-theme` is set on the grid container, so each grid can carry a different theme.

### `getTheme()` / `getThemes()`

### `setFont(spec)`

```javascript
G.setFont({ header:{size:12, bold:true}, body:{size:14, family:'Pretendard'} });
G.setFont({ body:{size:13} });   // header left alone
G.setFont(14);                   // body size only
G.setFont(null);                 // reset
```

Properties — `size` (a number for px, or a CSS length) · `family` · `weight` · `bold` · `italic`
Partial specifications are fine, and passing `null` for an individual property returns just that one to its default.

### `getFont()` → `{header:{size,family,weight,style}, body:{...}}`

### `setPlaceholderMode(mode)`
`'all'` ǀ `'first'` ǀ `'none'`

---

## Display toggles

Omit the argument to flip the current state.

| Method | Affects |
|---|---|
| `toggleEditMode()` | edit mode |
| `toggleFreeze()` | frozen columns |
| `toggleRowNum()` `toggleStatusCol()` `toggleCheckbox()` | the left-hand system columns |
| `toggleStripe()` `toggleDirtyMark()` | striping · change background |
| `toggleFoot()` `toggleRowsInfo()` `togglePager()` `togglePageSize()` | the status bar |
| `toggleGroup()` `toggleTree()` `toggleVS()` | grouping · tree · virtual scrolling |

---

## Rows and selection

| Method | Description |
|---|---|
| `setSelMode(mode)` | `'row'` ǀ `'cell'` |
| `toggleRowSel(id, on?)` | toggle row selection (the highlight) |
| `toggleRowCheck(id, cb)` | toggle the checkbox |
| `toggleCheckAll(on)` | check or clear everything. Same as the `_cb` header checkbox (range = the rows currently rendered) |
| `moveRow(rowId, beforeId)` | reorder a row |
| `setRowHeight(rowId, px)` | set a row's height |

---

## Paging

### `goPage(p)` / `changePS(n)`
`changePS(0)` means **show everything**.

---

## Copy and export

| Method | Format |
|---|---|
| `copyRange()` | selected range as TSV |
| `ctxCopy()` | rows as JSON |
| `ctxCopyExcel()` | rows as TSV (for Excel) |
| `exportCSV(filename?)` | CSV (with a BOM) |

CSV and the Excel copy follow the same value rules — display values for coded columns, unformatted originals for numbers and currency.

---

## Layout and lifecycle

### `getLayout()` / `setLayout(layout)`

Both take and return a plain object that can be serialised to JSON.

Included — column order · hidden state · widths · sorting · filters · page size · selection mode ·
system column visibility · status bar visibility · filter visibility · striping · change background ·
placeholder mode · theme · fonts

Columns that no longer exist in COLS are skipped, so a changed definition is safe.

### `reload()`
Refetches in server mode, otherwise reapplies the filters.

### `undo()` / `redo()`
Snapshot-based undo. Fires `dataChange {type:'undo'|'redo'}`.

### `renderGrid()`
Forces a re-render.

### `destroy()`
Removes global listeners, empties the DOM and drops the registry entry.
