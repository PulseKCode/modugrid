**English** | [한국어](README.ko.md)

# ModuGrid

**v1.0.0** · A dependency-free vanilla JS data grid.

Two files — `modugrid.min.js` and `modugrid.min.css` — are all it takes. No build step, no framework, no third-party libraries.

---

## Highlights

- **Editing** — inline cell editing, validation, separate insert/update/delete permissions, per-row and per-cell edit locks
- **Change tracking** — new, modified and deleted rows tracked automatically, a diff built for the server, soft delete
- **Excel friendly** — TSV copy and paste, CSV export, double-click a column boundary to auto-fit
- **Coded values** — code and display name kept apart, display formatting, server-side autocomplete
- **Images** — four transfer modes (`none` · `upload` · `multipart` · `base64`)
- **Large data sets** — paging · virtual scrolling · frozen columns
- **Data presentation** — sorting · filtering · search · grouping · tree
- **Appearance** — 11 themes, header and body fonts controlled independently
- **Multiple instances** — several grids on one page, each with its own state and theme
- No global pollution · zero inline event handlers (CSP friendly) · i18n built in

---

## Getting started

```html
<link rel="stylesheet" href="modugrid.min.css">
<script src="modugrid.min.js"></script>

<div id="grid"></div>
```

```javascript
const G = ModuGrid('#grid', {
  cols: [
    { key:'_rn', label:'#', w:42, type:'rn', noSort:1, noResize:1, noFilter:1 },
    { key:'_st', label:'',  w:28, type:'st', noSort:1, noResize:1, noFilter:1 },
    { key:'_cb', label:'',  w:36, type:'cb', noSort:1, noResize:1, noFilter:1 },   // select-all checkbox in the header

    { key:'name',   label:'Name',   w:150, placeholder:'Enter a name' },
    { key:'status', label:'Status', w:120,
      options:[ {code:'A', name:'Active'}, {code:'P', name:'Pending'} ],
      optionFormat:'{code} - {name}' },
    { key:'score',  label:'Score',  w:90, type:'number',
      validate: v => (v>=0 && v<=100) || 'must be between 0 and 100' },
    { key:'joined', label:'Joined', w:120, type:'date' },
  ],
  options: {
    editMode: true,
    selMode: 'cell',
    dateFormat: 'yyyy-mm-dd',
  }
});

G.setData([
  { id:1, name:'John Doe', status:'A', score:88, joined:'2018-01-01' },
]);
```

`id` is a required key, but the grid fills it in for you when it is missing.

---

## Sending changes to the server

```javascript
if (!G.isValid()) { alert('Please fix the input errors first'); return; }

const out = await G.submit('submit.jsp');
if (out.skipped) alert('Nothing has changed');
else alert(`added ${out.inserted} · updated ${out.updated} · deleted ${out.deleted}`);
```

A diff is built against the `markClean()` baseline and sent as `{ inserted, updated, deleted }`;
on success the baseline moves forward. The default payload is `changes=<JSON>` as form data, so a
JSP can read it straight from `request.getParameter("changes")`.

Moving or removing a column does not mark rows as modified as long as the values are unchanged.

### Sending images

A `type:'images'` column picks its transfer method with `imageMode`. **The default, `none`, sends no images at all.**

| Mode | Uploaded | submit payload | Suits |
|---|---|---|---|
| `none` | never | images excluded | no images · preview only |
| `upload` | as soon as a file is picked | JSON (URL reference) | large or numerous files |
| `multipart` | at submit time | FormData (JSON + files) | saving everything in one go |
| `base64` | converted immediately, sent at submit | dataURL embedded in the JSON | small things like signatures or icons |

For the exact formats and a JSP receiver example, see chapter 8 of [FEATURES.md](docs/en/FEATURES.md).

---

## Common settings

```javascript
options: {
  // edit permissions (fine-grained control within editMode)
  editMode: true, canInsert: true, canUpdate: true, canDelete: true,

  // per-row and per-cell edit locks
  rowEditable: row => row.status !== 'CLOSED',    // lock a whole row

  // display
  showRN: true, showST: true, showCB: true,      // left-hand system columns
  showFoot: true, showFilter: true, striped: true,
  pageSize: 100,                                  // 0 = show everything
  cbHeader: 'check',                              // checkbox header: select all / a string / 'none'
  contextMenu: true,                              // right-click menu: false, or { delete:false }
  errorMsgDuration: 3000,                         // validation tooltip auto-hide (ms), 0 = keep it
  keyboardOnLoad: true,                           // keyboard active on load, false = active after a click

  // images
  imageMode: 'none',                              // none | upload | multipart | base64

  // appearance
  theme: 'light',                                 // 11 available
  headerFont: { size:12, bold:true },
  bodyFont:   { size:13 },

  // events
  on: {
    dirtyChange: e => submitBtn.disabled = (e.total === 0),
    cellEdit:    e => console.log(e.id, e.key, e.value),
  }
}
```

**Themes** — `light` `dark` `midnight` `slate` `ocean` `forest` `sunset` `rose` `contrast` `compact` `compact-dark`

```javascript
G.setTheme('dark');
G.setTheme('ocean', { ac:'#ff6600' });   // preset plus a few colour overrides
```

---

## Server-side mode

```javascript
options: {
  dataSource: async (req) => {
    const res = await fetch('list.jsp?' + new URLSearchParams(req));
    return res.json();          // { rows, total, agg }
  }
}
```

Sorting, filtering, search and paging state arrive in `req`, and responses that come back out of order are discarded automatically.

---

## Files

| File | Required | Role |
|---|---|---|
| `modugrid.min.js` | O | the entire grid engine |
| `modugrid.min.css` | O | styles and theme variables |
| `main.html` | | demo page |
| `submit.jsp` | | server receiver sample (JSP + Oracle) |
| `upload.jsp` | | image upload receiver sample (`imageMode:'upload'`) |

---

## Documentation

| Document | Contents |
|---|---|
| [FEATURES.md](docs/en/FEATURES.md) | full feature list · options · API summary |
| [API.md](docs/en/API.md) | API reference |

---

## Browsers

Latest Chrome, Edge, Firefox and Safari.
Uses `<input type="date">`, the Clipboard API and CSS custom properties.
Where the Clipboard API is blocked, it falls back to `execCommand` automatically.

---

## Licence

MIT · © 2026 BongJun Park

- **Author** — BongJun Park
- **Homepage** — <https://github.com/PulseKCode>
- **Version** — 1.0.0

Authorship is readable through `ModuGrid.about`. It is frozen and non-configurable, so it cannot be altered at runtime.

```javascript
ModuGrid.about.version;    // '1.0.0'
ModuGrid.about.author;     // 'BongJun Park'
ModuGrid.about.homepage;   // 'https://github.com/PulseKCode'
```
