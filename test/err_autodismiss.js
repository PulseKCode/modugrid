/* test/err_autodismiss.js — options.errorMsgDuration (auto-dismissing error tooltip)
 *
 * Rule: only the tooltip (.jsg-errtip.vis) disappears; the cell's error *state*
 *   stays until the value is fixed. (Clearing the state too would break isValid(),
 *   getInvalidCells() and the submit guard.)
 *   Default 3000ms / zero or below means it never auto-hides.
 *
 * Note: updateRow is a programmatic API and does not run validate.
 *   Validation runs on the user editing path -> startEdit -> type -> click another
 *   cell (commitEdit).
 */
const H = require('./lib/harness');
const { window, document, ModuGrid, src } = H.boot(`
  <div id="gDef"  style="width:600px;height:300px"></div>
  <div id="gFast" style="width:600px;height:300px"></div>
  <div id="gOff"  style="width:600px;height:300px"></div>
`);
const { tick, td, clickCell } = H.makeClickers(window);
const { T, section, done } = H.reporter();

/* an age of 100 or more is an error */
const COLS = [
  { key:'name', label:'Name', w:120 },
  { key:'age',  label:'Age',  w:80, type:'number',
    validate: v => (+v < 100) || 'must be below 100' },
];
const DATA = () => ([{ id:1, name:'kim', age:30 }, { id:2, name:'lee', age:40 }]);

const tipVisible = r => { const t=r.querySelector('.jsg-errtip'); return !!t && t.classList.contains('vis'); };
/* Commit triggers a re-render, so an error cell is marked either edit-err (while
   editing) or cinvalid (after the re-render) */
const errCells  = r => r.querySelectorAll('td.cinvalid, td.edit-err').length;

/** Edit a cell, type a value, then click another cell to commit — walks the validate path */
async function editCell(G, rootEl, rowId, colKey, value, commitOn) {
  const cell = td(rootEl, colKey, rowId);
  G.startEdit(cell, rowId, colKey);
  await tick();
  const S = G.getState();
  if (!S.editCell || !S.editCell.inp) throw new Error(`failed to open the editor: ${colKey}/${rowId}`);
  S.editCell.inp.value = String(value);
  await clickCell(rootEl, commitOn.key, commitOn.id);      // click another cell -> commitEdit
  await tick();
}

H.run(async () => {
  section('default 3000ms');

  const D = ModuGrid('#gDef', { cols: COLS, options:{ editMode:true } });
  D.setData(DATA());
  T('unset errorMsgDuration: S.errMsgMs defaults to 3000', D.getState().errMsgMs === 3000,
    `errMsgMs=${D.getState().errMsgMs}`);

  section('errorMsgDuration:500 — only the tooltip disappears over time');

  const F = ModuGrid('#gFast', { cols: COLS, options:{ editMode:true, errorMsgDuration:500 } });
  F.setData(DATA());
  const wF = document.querySelector('#gFast');
  {
    T('errorMsgDuration:500 is reflected in S.errMsgMs', F.getState().errMsgMs === 500,
      `errMsgMs=${F.getState().errMsgMs}`);

    await editCell(F, wF, 1, 'age', 150, { key:'name', id:2 });
    T('right after a failed validate: tooltip shown', tipVisible(wF));
    T('right after a failed validate: cell marked as error', errCells(wF) > 0,
      `${errCells(wF)} error cell(s)`);
    T('right after a failed validate: isValid() is false', F.isValid() === false);
    T('the value is kept even though validate failed',
      F.getState().data.find(r=>r.id===1).age === 150,
      `age=${F.getState().data.find(r=>r.id===1).age}`);

    await tick(700);                             // let the auto-hide window pass (generous, to absorb render latency)
    T('after the duration: tooltip gone', !tipVisible(wF));
    T('after the duration: error state kept (isValid still false)', F.isValid() === false);
    T('after the duration: cell error mark kept', errCells(wF) > 0, `${errCells(wF)} error cell(s)`);
    T('after the duration: getInvalidCells() still reports it', F.getInvalidCells().length > 0,
      `${F.getInvalidCells().length} item(s)`);

    await editCell(F, wF, 1, 'age', 30, { key:'name', id:2 });
    T('fixing the value: isValid() returns to true', F.isValid() === true);
    T('fixing the value: cell error mark cleared', errCells(wF) === 0, `${errCells(wF)} error cell(s)`);
  }

  section('errorMsgDuration:0 — never auto-hides');

  const O = ModuGrid('#gOff', { cols: COLS, options:{ editMode:true, errorMsgDuration:0 } });
  O.setData(DATA());
  const wO = document.querySelector('#gOff');
  {
    T('errorMsgDuration:0 sets S.errMsgMs to 0', O.getState().errMsgMs === 0,
      `errMsgMs=${O.getState().errMsgMs}`);

    await editCell(O, wO, 1, 'age', 150, { key:'name', id:2 });
    T('0: tooltip shown', tipVisible(wO));
    T('0: no timer scheduled (_errTipTm null)', O.getState()._errTipTm === null,
      `_errTipTm=${O.getState()._errTipTm}`);

    await tick(700);
    T('0: tooltip stays after time passes', tipVisible(wO));
  }

  done(src);
});
