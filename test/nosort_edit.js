/* test/nosort_edit.js — noSort only disables sorting, never editing
 *
 * Background: noSort had leaked into six editability checks (_colEditable,
 *   _clearableCell, startEdit, paste, the keyboard-navigation column list and the
 *   double-click check), so a column meant to merely hide its sort icon became
 *   entirely read-only.
 * Read-only is the job of col.editor:false or col.editable.
 */
const H = require('./lib/harness');
const { window, document, ModuGrid, src } = H.boot();
const { tick, mouse, td, clickCell, press } = H.makeClickers(window);
const { T, section, done } = H.reporter();

const COLS = [
  { key:'name',  label:'Name',  w:120 },                                   // control column
  { key:'grade', label:'Grade', w:100, noSort:1, editor:'select',
    options:[{code:'A',name:'Grade A'},{code:'B',name:'Grade B'}] },
  { key:'code',  label:'Code',  w:100, noSort:1 },                         // noSort + text
  { key:'ro',    label:'RO',    w:80,  noSort:1, editor:false },           // must stay read-only
];

const G = ModuGrid('#grid', { cols: COLS, options:{ editMode:true } });
G.setData([
  { id:1, name:'kim', grade:'A', code:'C100', ro:'X' },
  { id:2, name:'lee', grade:'B', code:'C200', ro:'Y' },
]);
const S = G.getState();
const wrap = document.querySelector('#grid');

H.run(async () => {
  section('a noSort column must still be editable');

  /* 1. double-click opens the select editor (startEdit + the double-click check) */
  {
    const t = td(wrap,'grade',1);
    mouse(t,'mousedown'); mouse(t,'mouseup'); mouse(t,'click'); mouse(t,'dblclick');
    await tick();
    T('noSort+select double-click opens the editor', S.editCell && S.editCell.colKey==='grade',
      `editCell=${S.editCell?S.editCell.colKey:'null'}`);

    /* Close the editor — in jsdom an Escape aimed at document never reaches the
       editor element's own handler. */
    const ed = wrap.querySelector('td select, td input.jsg-edit, td .edit-open select, td .edit-open input');
    if (ed) ed.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    await tick();
    if (S.editCell) S.editCell = null;          // jsdom workaround, not the behaviour under test
    await clickCell(wrap,'name',2); await clickCell(wrap,'name',2);
  }

  /* 2. a single click arms the hidden input (_imeTrackDeferred -> _colEditable) */
  {
    await clickCell(wrap,'code',1);
    T('noSort+text single click arms the IME cell', S._imeCell && S._imeCell.colKey==='code',
      `_imeCell=${S._imeCell?S._imeCell.colKey:'none'}`);
  }

  /* 3. Delete clears the value (_clearableCell) */
  {
    await clickCell(wrap,'code',2);
    press(document.body,'Delete');
    await tick();
    const row = S.data.find(r=>r.id===2);
    T('Delete clears a noSort cell', String(row.code??'')==='', `code=${JSON.stringify(row.code)}`);
  }

  /* 4. it takes part in keyboard navigation (moveFocus) */
  {
    await clickCell(wrap,'name',1);
    press(document.body,'ArrowRight');
    await tick();
    const fk = (COLS[S.focusCI]||{}).key;
    T('ArrowRight moves focus into the noSort column', fk==='grade', `focus=${fk}`);
  }

  section('regression: sort icons, read-only columns, ordinary columns');

  T('noSort column shows no sort icon', !wrap.querySelector('th[data-c="grade"] .tsi'));
  T('ordinary column still shows its sort icon', !!wrap.querySelector('th[data-c="name"] .tsi'));

  {
    const t = td(wrap,'ro',1);
    mouse(t,'mousedown'); mouse(t,'mouseup'); mouse(t,'click'); mouse(t,'dblclick');
    await tick();
    T('editor:false double-click does not open an editor', !S.editCell || S.editCell.colKey!=='ro',
      `editCell=${S.editCell?S.editCell.colKey:'null'}`);
    T('editor:false single click does not arm the IME cell', !S._imeCell || S._imeCell.colKey!=='ro',
      `_imeCell=${S._imeCell?S._imeCell.colKey:'none'}`);
  }

  {
    await clickCell(wrap,'name',1);
    T('ordinary column single click still arms the IME cell', S._imeCell && S._imeCell.colKey==='name',
      `_imeCell=${S._imeCell?S._imeCell.colKey:'none'}`);
  }

  done(src);
});
