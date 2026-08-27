/* test/dirty_on_edit.js — a cell edit must mark the row dirty in the same render
 *
 * Background: _diff() is cached on S._dataVer, and only _touchData() bumps that
 *   version. _touchData() was reached solely through _emit('dataChange'), which
 *   commitEdit / setCellDate / _imeCommitValue all fire *after* applyFilters().
 *   The re-render therefore painted the row from a stale diff (no jupd class,
 *   no ST marker) and _emitDirty() compared stale counts, so on.dirtyChange
 *   never fired for that edit.
 *
 *   Visible symptom: picking a value from a select (options) column with the
 *   mouse changed the cell but left the row's modified marker off, because the
 *   dropdown's mousedown handler calls commitEdit() and nothing re-renders
 *   afterwards. Text cells hid the bug — Enter/Tab run moveFocus(), which
 *   renders a second time and repaints with the by-then-fresh diff.
 *
 * Undo/redo and addRow/deleteRows already called _touchData() before rendering;
 * the cell-edit paths were the omission.
 */
const H = require('./lib/harness');
const { window, document, ModuGrid, src } = H.boot();
const { tick, mouse, td, clickCell } = H.makeClickers(window);
const { T, section, done } = H.reporter();

const STATUS = [
  { code:'ACT', name:'Active'  },
  { code:'PND', name:'Pending' },
  { code:'CLS', name:'Closed'  },
];

const COLS = [
  { key:'name',   label:'Name',   w:130 },
  { key:'status', label:'Status', w:96, options:STATUS },
  { key:'score',  label:'Score',  w:74, type:'number' },
];

let dirtyEvents = [];
const G = ModuGrid('#grid', {
  cols: COLS,
  options: {
    editMode: true, selMode: 'cell', pageSize: 0, showST: true,
    submitFields: ['id','name','status','score'],
    on: { dirtyChange: e => dirtyEvents.push(e) },
  },
});
G.setData([
  { id:1, name:'John Doe',   status:'ACT', score:92 },
  { id:2, name:'Jane Smith', status:'PND', score:64 },
]);

const wrap = document.querySelector('#grid');
const rows = id => [...wrap.querySelectorAll(`tr[data-id="${id}"]`)];
/** true when the row is painted as modified in the DOM as it stands right now */
const marked = id => rows(id).some(tr => /\bjupd\b/.test(tr.className));
const data   = id => G.getState().data.find(r => r.id === id);

H.run(async () => {
  section('baseline');
  T('starts clean', G.getChangeCount().total === 0,
    JSON.stringify(G.getChangeCount()));
  T('no row painted as modified', !marked(1) && !marked(2));

  section('select column — committed through the public API');
  G.updateRow(1, { status:'CLS' });
  await tick();
  T('value written', data(1).status === 'CLS', String(data(1).status));
  T('counted as updated', G.getChangeCount().updated === 1,
    JSON.stringify(G.getChangeCount()));
  T('row painted as modified', marked(1),
    rows(1).map(t => t.className).join(' | '));
  T('dirtyChange fired', dirtyEvents.length === 1,
    JSON.stringify(dirtyEvents));

  section('select column — committed from the dropdown by mouse');
  G.markClean();
  dirtyEvents = [];
  await tick();
  T('clean after markClean', G.getChangeCount().total === 0 && !marked(2));

  const cell = await clickCell(wrap, 'status', 2);
  mouse(cell, 'dblclick');
  await tick();
  const opts = [...document.querySelectorAll('.jsg-combo-opt')];
  const pick = opts.find(d => /Closed/i.test(d.textContent));
  T('dropdown opened with options', !!pick, `found ${opts.length}`);

  if (pick) {
    /* The dropdown commits on mousedown and nothing renders afterwards, so the
       state observed here is exactly what the user is left looking at. */
    mouse(pick, 'mousedown');
    await tick();
    T('value committed as code', data(2).status === 'CLS', String(data(2).status));
    T('counted as updated', G.getChangeCount().updated === 1,
      JSON.stringify(G.getChangeCount()));
    T('row painted as modified without a further render', marked(2),
      rows(2).map(t => t.className).join(' | '));
    T('dirtyChange fired', dirtyEvents.length === 1,
      JSON.stringify(dirtyEvents));
  }

  section('submit payload');
  const ch = G.getChanges();
  T('updated row present in payload',
    Array.isArray(ch.updated) && ch.updated.some(r => r.id === 2),
    JSON.stringify(ch.updated));

  section('no false positives');
  G.markClean();
  dirtyEvents = [];
  G.updateRow(1, { status:'CLS' });          // same value it already holds
  await tick();
  T('rewriting the same value is not a change', G.getChangeCount().total === 0,
    JSON.stringify(G.getChangeCount()));
  T('no dirtyChange for a no-op edit', dirtyEvents.length === 0,
    JSON.stringify(dirtyEvents));

  done(src);
});
