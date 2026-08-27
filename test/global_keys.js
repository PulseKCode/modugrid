/* test/global_keys.js — key events outside the grid are never intercepted
 *
 * Background: _onKeydown/_onPaste are registered globally on document, and
 *   ModuGrid._active was never released, so after one click inside a grid it kept
 *   swallowing arrow keys, Delete and Ctrl+Z from anywhere on the page.
 * Fix: (1) a document mousedown handler acquires/releases the active instance
 *      (2) yield when focus sits on an element outside the grid
 *          (body/html = nothing focused, which remains the grid's business)
 */
const H = require('./lib/harness');
const { window, document, ModuGrid, src } = H.boot(`
  <input id="outinp">
  <button id="outbtn">outside</button>
  <div id="outdiv">plain div (not focusable)</div>
  <div id="grid"  style="width:800px;height:400px"></div>
  <div id="grid2" style="width:400px;height:200px"></div>
`);
const { tick, press, clickCell, clickEl } = H.makeClickers(window);
const { T, section, done } = H.reporter();

const COLS = [{ key:'name', label:'Name', w:120 }, { key:'memo', label:'Memo', w:160 }];
const DATA = () => ([{id:1,name:'kim',memo:'m1'},{id:2,name:'lee',memo:'m2'},{id:3,name:'park',memo:'m3'}]);

/* G: editMode ON / G2: cell selection mode with editMode OFF
   (the path where nothing inside the grid can hold focus) */
const G  = ModuGrid('#grid',  { cols: COLS, options:{ editMode:true } });                    G.setData(DATA());
const G2 = ModuGrid('#grid2', { cols: COLS, options:{ editMode:false, selMode:'cell' } });   G2.setData(DATA());
const S = G.getState(), S2 = G2.getState();
const wrap = document.querySelector('#grid'), wrap2 = document.querySelector('#grid2');
const outdiv = document.querySelector('#outdiv');

H.run(async () => {
  section('keys pressed outside the grid are left alone');

  /* Clicking a plain, non-focusable div must release the active instance */
  {
    await clickCell(wrap,'name',1);
    const before = S.focusRI;
    await clickEl(outdiv);
    const ev = press(document.body,'ArrowDown');   // nothing focused -> target = body
    await tick();
    T('ArrowDown after clicking outside does not move grid focus', S.focusRI===before,
      `focusRI ${before} -> ${S.focusRI}`);
    T('ArrowDown after clicking outside is not preventDefaulted (page scroll preserved)', !ev.defaultPrevented);
  }

  {
    await clickCell(wrap,'memo',2);
    await clickEl(outdiv);
    press(document.body,'Delete');
    await tick();
    T('Delete outside the grid leaves cell values alone', S.data.find(x=>x.id===2).memo==='m2',
      `memo=${JSON.stringify(S.data.find(x=>x.id===2).memo)}`);
  }

  {
    await clickCell(wrap,'name',1);
    await clickEl(outdiv);
    const ev = press(document.body,'z',{ctrlKey:true});
    await tick();
    T('Ctrl+Z outside the grid does not trigger undo', !ev.defaultPrevented);
  }

  /* Focus moved to an outside button via Tab (a path with no mouse click) */
  {
    await clickCell(wrap,'name',1);
    const btn = document.querySelector('#outbtn');
    btn.focus();
    const before = S.focusRI;
    const ev = press(btn,'ArrowDown');
    await tick();
    T('ArrowDown with an outside button focused does not move grid focus', S.focusRI===before,
      `focusRI ${before} -> ${S.focusRI}`);
    T('ArrowDown with an outside button focused is not preventDefaulted', !ev.defaultPrevented);
    btn.blur();
  }

  {
    await clickCell(wrap,'name',1);
    const inp = document.querySelector('#outinp');
    inp.focus();
    const ev = press(inp,'c',{ctrlKey:true});
    await tick();
    T('Ctrl+C in an outside input is not intercepted', !ev.defaultPrevented);
    inp.blur();
  }

  section('regression: behaviour inside the grid is unchanged');

  {
    await clickEl(outdiv);
    await clickCell(wrap,'name',1);
    const before = S.focusRI;
    const ev = press(document.activeElement || document.body,'ArrowDown');
    await tick();
    T('ArrowDown after re-clicking the grid moves focus', S.focusRI===before+1,
      `focusRI ${before} -> ${S.focusRI}`);
    T('ArrowDown inside the grid is preventDefaulted', ev.defaultPrevented);
  }

  /* editMode OFF + cell mode: nothing inside the grid holds focus, so the key target
     is body. Blocking that path would kill keyboard navigation entirely — it must stay alive. */
  {
    await clickCell(wrap2,'name',1);
    const before = S2.focusRI;
    const ev = press(document.body,'ArrowDown');
    await tick();
    T('cell mode (editMode off): ArrowDown moves focus', S2.focusRI===before+1,
      `focusRI ${before} -> ${S2.focusRI}`);
    T('cell mode (editMode off): ArrowDown is preventDefaulted', ev.defaultPrevented);
  }

  /* isolation between multiple grids */
  {
    await clickCell(wrap,'name',1);
    await clickCell(wrap2,'name',2);
    const b1 = S.focusRI, b2 = S2.focusRI;
    press(document.body,'ArrowDown');
    await tick();
    T('after clicking G2, ArrowDown moves G2 only', S2.focusRI===b2+1, `G2 ${b2} -> ${S2.focusRI}`);
    T('after clicking G2, G stays put', S.focusRI===b1, `G ${b1} -> ${S.focusRI}`);
  }

  {
    await clickCell(wrap,'memo',3);
    press(document.activeElement || document.body,'Delete');
    await tick();
    T('Delete inside the grid still clears the cell', String(S.data.find(x=>x.id===3).memo??'')==='',
      `memo=${JSON.stringify(S.data.find(x=>x.id===3).memo)}`);
  }

  /* no listeners left behind after destroy */
  {
    const G3 = ModuGrid('#grid2', { cols: COLS, options:{ editMode:true } });
    G3.setData(DATA());
    G3.destroy();
    const ev = press(document.body,'ArrowDown');
    await tick();
    T('after destroy, key events are no longer intercepted', !ev.defaultPrevented);
  }

  done(src);
});
