/* test/kb_onload.js — options.keyboardOnLoad
 *
 * Default (unset/true): current behaviour — keyboard control is active right after
 *   creation, no click required.
 * false: the grid must be clicked once before it takes keyboard input, and it never
 *   steals the active slot from a grid that already holds it.
 */
const H = require('./lib/harness');
const { window, document, ModuGrid, src } = H.boot(`
  <div id="outdiv">plain div</div>
  <div id="gA" style="width:600px;height:300px"></div>
  <div id="gB" style="width:600px;height:300px"></div>
  <div id="gC" style="width:600px;height:300px"></div>
`);
const { tick, press, clickCell, clickEl } = H.makeClickers(window);
const { T, section, done } = H.reporter();

const COLS = [{ key:'name', label:'Name', w:120 }, { key:'memo', label:'Memo', w:160 }];
const DATA = () => ([{id:1,name:'kim',memo:'m1'},{id:2,name:'lee',memo:'m2'},{id:3,name:'park',memo:'m3'}]);
const OPT  = { editMode:false, selMode:'cell' };

H.run(async () => {
  section('default: unchanged behaviour (active immediately on creation)');

  const A  = ModuGrid('#gA', { cols: COLS, options: { ...OPT } });
  A.setData(DATA());
  const SA = A.getState(), wA = document.querySelector('#gA');
  {
    const before = SA.focusRI;
    const ev = press(document.body,'ArrowDown');
    await tick();
    T('unset: ArrowDown works without a click (unchanged behaviour)',
      SA.focusRI !== before || ev.defaultPrevented,
      `focusRI ${before} -> ${SA.focusRI}, prevented=${ev.defaultPrevented}`);
    T('unset: S.kbOnLoad defaults to true', SA.kbOnLoad === true, `kbOnLoad=${SA.kbOnLoad}`);
  }

  section('keyboardOnLoad:false');

  const B  = ModuGrid('#gB', { cols: COLS, options: { ...OPT, keyboardOnLoad:false } });
  B.setData(DATA());
  const SB = B.getState(), wB = document.querySelector('#gB');
  {
    T('false: S.kbOnLoad is false', SB.kbOnLoad === false, `kbOnLoad=${SB.kbOnLoad}`);

    const before = SB.focusRI;
    press(document.body,'ArrowDown');
    await tick();
    T('false: ArrowDown is ignored before any click', SB.focusRI === before,
      `focusRI ${before} -> ${SB.focusRI}`);
    T('false: does not steal the active slot from an earlier grid', ModuGrid._active !== null,
      `_active=${ModuGrid._active}`);
  }

  {
    await clickCell(wB,'name',1);
    const before = SB.focusRI;
    const ev = press(document.body,'ArrowDown');
    await tick();
    T('false: ArrowDown works after a click', SB.focusRI === before+1,
      `focusRI ${before} -> ${SB.focusRI}`);
    T('false: preventDefaulted after a click', ev.defaultPrevented);
  }

  /* Interplay with the global-key fix (_onDocMousedown) — clicking outside steps it down again */
  {
    await clickEl(document.querySelector('#outdiv'));
    const before = SB.focusRI;
    const ev = press(document.body,'ArrowDown');
    await tick();
    T('clicking outside deactivates it again (ties into the global-key fix)',
      SB.focusRI === before && !ev.defaultPrevented,
      `focusRI ${before} -> ${SB.focusRI}, prevented=${ev.defaultPrevented}`);
  }

  section('multiple grids: the active slot is never stolen');

  {
    await clickCell(wA,'name',1);
    const activeBefore = ModuGrid._active;
    const C = ModuGrid('#gC', { cols: COLS, options: { ...OPT, keyboardOnLoad:false } });
    C.setData(DATA());
    T('creating a new keyboardOnLoad:false grid leaves _active unchanged',
      ModuGrid._active === activeBefore, `${activeBefore} -> ${ModuGrid._active}`);

    const before = SA.focusRI;
    press(document.body,'ArrowDown');
    await tick();
    T('the previously active grid keeps its keyboard control', SA.focusRI === before+1,
      `focusRI ${before} -> ${SA.focusRI}`);
  }

  done(src);
});
