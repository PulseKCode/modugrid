# ModuGrid — 113 feature samples

A working page for every feature in `FEATURES.md`, written for people who are going to
use the grid rather than for people testing it. Each page runs on its own and carries a
**View source** panel at the bottom with two tabs: the demo JS and the whole HTML file.

A Korean edition is in `../samples_ko/` and uses the same file numbers, so
`f063.html` is the same topic in both.

---

## Running it

```
samples/index.html   ← open this in a browser
```

The list of 113 topics is on the left and the sample runs on the right. Search by wording
or by section number (`8.1` finds the image transfer pages), and step through with
`← Prev` and `Next →`.

Individual files such as `f001.html` open on their own too. Everything works from
`file://`, so no server is needed.

---

## What is covered

`FEATURES.md` carries 146 check items. Twenty-three of them record internal guarantees
and regression checks — "no global namespace pollution", "no re-render while dragging",
"sticky offset measured from the real height" — which matter to whoever maintains the grid
but tell a user nothing. Five more were merged where the source document had split one idea
across a table. A further five described sensible behaviour rather than a feature you would
set out to use — that an error mark survives its tooltip, that separators are tidied along
with the entries they belonged to — and were dropped as well. What is left is the features
themselves.

| | |
|---|---|
| check items in the document | 146 |
| internal and regression items dropped | −23 |
| table rows merged (lock scope 5→1, delete prompt 2→1) | −5 |
| supporting behaviour rather than a feature | −5 |
| **pages here** | **113** |

Features whose entry happened to be phrased as a verification — frozen columns, group
headers — were kept and rewritten from the user's side instead.

---

## Numbering

The number on each page is **`section-position`**, taken straight from `FEATURES.md`, so
you can go from a sample back to the document without hunting.

```
5.2-2    →  5.2 Edit permissions, second item
8.1-7    →  8.1 Image transfer, seventh item
14-11    →  14. Other, eleventh item
```

File names (`f001.html` … `f113.html`) follow the generation order and never move. Keeping
the two apart means a link still works after items are added or removed.

---

## Contents

| Files | Numbers | Group | Pages |
|---|---|---|---|
| f001–f003 | `1-1` – `1-3` | 1. Basic structure | 3 |
| f004–f005 | `2.3-1` – `2.3-2` | 2.3 System columns | 2 |
| f006–f008 | `2.4-1` – `2.4-3` | 2.4 Manipulating columns | 3 |
| f009–f013 | `3.1-1` – `3.1-5` | 3.1 Sorting | 5 |
| f014–f020 | `3.2-1` – `3.2-7` | 3.2 Filtering | 7 |
| f021 | `3.3-1` | 3.3 Search | 1 |
| f022–f023 | `3.4-1` – `3.4-2` | 3.4 Grouping and tree | 2 |
| f024–f032 | `4-1` – `4-9` | 4. Selection | 9 |
| f033–f039 | `5.1-1` – `5.1-7` | 5.1 Entry points | 7 |
| f040–f042 | `5.2-1` – `5.2-3` | 5.2 Edit permissions | 3 |
| f043–f046 | `5.3-1` – `5.3-4` | 5.3 Input control | 4 |
| f047–f054 | `6-1` – `6-8` | 6. Coded values | 8 |
| f055–f058 | `7-1` – `7-4` | 7. Validation | 4 |
| f059–f068 | `8-1` – `8-10` | 8. Change tracking | 10 |
| f069–f079 | `8.1-1` – `8.1-11` | 8.1 Image transfer | 11 |
| f080–f082 | `9-1` – `9-3` | 9. Copy and export | 3 |
| f083–f092 | `10-1` – `10-10` | 10. Layout | 10 |
| f093–f096 | `11-1` – `11-4` | 11. Modals | 4 |
| f097 | `12.1-1` | 12.1 Themes | 1 |
| f098–f099 | `12.2-1` – `12.2-2` | 12.2 Fonts | 2 |
| f100–f101 | `12.3-1` – `12.3-2` | 12.3 Display options | 2 |
| f102–f104 | `13-1` – `13-3` | 13. Server integration | 3 |
| f105–f113 | `14-1` – `14-9` | 14. Other | 9 |
| | | **total** | **113** |

---

## Where to start

| If you want to | Look at |
|---|---|
| see what a save actually posts | `8-2` (f060) |
| send photos to a server | `8.1-1` – `8.1-11` (f069–f079) |
| lock particular rows or cells | `5.2-2` (f041) |
| know what a lock does and does not stop | `5.2-3` (f042) |
| store codes but show names | `6-1` – `6-3` (f047–f049) |
| add autocomplete | `6-6`, `6-7` (f052–f053) |
| add or remove columns at runtime | `2.4-1` (f006) |
| remember a user's layout | `10-10` (f092) |
| load a page at a time from a server | `13-1` (f102) |

---

## How a page is laid out

```
┌ group badge
├ number, title and a short explanation of what the feature is for
├ what to try, in order
├ demo toolbar
├ the grid itself
├ log panel   ← results appear here as you work
└ View source ← [Demo JS] [Whole HTML] with a copy button
```

Both tabs hold **the code that is actually running**, so anything you copy will work.

### How View source works

- The demo code sits in `<script type="text/plain" id="demo-src">`, stored verbatim and
  never executed by the browser. The first tab prints that text.
- The second tab is a snapshot of `document.documentElement.outerHTML` taken inside
  `boot()`. Because `boot()` is the last script in the file, the DOM at that instant still
  matches the original markup.
- Only once both tabs are captured does `boot()` inject and run the demo.

---

## Things worth knowing

- The **server integration** and **autocomplete** pages stand in for `dataSource`,
  `filterSource` and `acSource` with a local array and `setTimeout`. The delays are
  deliberately long so you can watch what happens.
- The **submit** pages intercept `window.fetch` rather than posting anywhere. In real use
  you pass the `submit.jsp` or `upload.jsp` URL instead.
- The **image** pages need you to pick a file from your own machine.
- Clipboard behaviour is more reliable over `https` or on `localhost`.

### The shape of a save payload

This is the part people most often get wrong.

```js
G.getChanges()
// {
//   inserted: [ { id, ...the whole row } ],        ← complete rows
//   updated:  [ { id, changes:{ only what moved } } ], ← nested under changes
//   deleted:  [ id, id, ... ]                      ← ids only
// }
```

---

## Verification

Every page was checked by script, not by eye.

1. demo JS parses — 113/113
2. runs under jsdom with no errors, creates the grid and renders rows — **113/113**
3. both source tabs built and captured — 113/113
4. no Korean text left anywhere — 113/113
