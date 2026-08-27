/* test/lib/harness.js — shared jsdom bootstrap and helpers
 *
 * A test only needs to require this file:
 *   const H = require('./lib/harness');
 *   const { window, document, ModuGrid } = H.boot();
 *
 * run.js runs each test in its own process, so instances never bleed across files.
 * PASS/FAIL must start at the beginning of a line for run.js to tally them.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

/** Which modugrid.js to test — argument, then env var, then the repo root */
function targetPath() {
  return process.argv[2]
      || process.env.MODUGRID
      || path.join(__dirname, '..', '..', 'modugrid.js');
}

/**
 * Build a jsdom environment and load modugrid.js into it.
 * @param {string} bodyHTML  markup to place inside <body> (defaults to a single #grid)
 * @returns {{window, document, ModuGrid, src}}
 */
function boot(bodyHTML) {
  const src = targetPath();

  /* Report a missing target as a FAIL line. Without this the read throws, run.js
     sees no PASS/FAIL at all, and a missing file is reported as a clean 0-pass run. */
  if (!fs.existsSync(src)) {
    console.log(`FAIL  target not found: ${src}`);
    process.exit(1);
  }

  const html = bodyHTML || '<div id="grid" style="width:800px;height:400px"></div>';
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`,
    { runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;

  /* Shims for APIs jsdom does not implement. These are the places where the test
     environment diverges from a real browser, so note any additions here. */
  window.requestAnimationFrame = fn => fn(0);
  window.cancelAnimationFrame  = () => {};
  window.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
  window.matchMedia = () => ({ matches:false, addEventListener(){}, removeEventListener(){},
                               addListener(){}, removeListener(){} });
  window.Element.prototype.scrollIntoView = function(){};

  window.eval(fs.readFileSync(src, 'utf8'));
  const ModuGrid = window.ModuGrid;
  if (!ModuGrid) { console.log(`FAIL  ModuGrid failed to load from ${src}`); process.exit(1); }

  return { window, document: window.document, ModuGrid, src };
}

/* ── Event helpers ──────────────────────────────
   Note: jsdom does not implement the native blur/focus shift that a mousedown causes.
   For anything focus-dependent, call .focus() explicitly to set up the real state. */
const mk = window => ({
  /** Drain work the grid scheduled with setTimeout(0), e.g. _imeTrackDeferred */
  tick: (ms=5) => new Promise(r => setTimeout(r, ms)),

  mouse: (el, type, init={}) =>
    el.dispatchEvent(new window.MouseEvent(type, { bubbles:true, cancelable:true, button:0, ...init })),

  /** Key events fire on the focused element, or on body when nothing has focus —
      dispatch them the same way a real browser would. */
  press: (el, key, init={}) => {
    const ev = new window.KeyboardEvent('keydown', { key, bubbles:true, cancelable:true, ...init });
    el.dispatchEvent(ev);
    return ev;
  },

  td: (rootEl, colKey, rowId) =>
    rootEl.querySelector(`td[data-c="${colKey}"][data-id="${rowId}"]`),
});

/** Click a cell (mousedown -> mouseup -> click) and drain any deferred work */
function makeClickers(window) {
  const h = mk(window);
  return {
    ...h,
    clickCell: async (rootEl, colKey, rowId) => {
      const t = h.td(rootEl, colKey, rowId);
      if (!t) throw new Error(`no td for ${colKey}/${rowId}`);
      h.mouse(t,'mousedown'); h.mouse(t,'mouseup'); h.mouse(t,'click');
      await h.tick();
      return t;
    },
    clickEl: async (el) => {
      h.mouse(el,'mousedown'); h.mouse(el,'mouseup'); h.mouse(el,'click');
      await h.tick();
    },
  };
}

/* ── Assertions and tally ──────────────────────── */
function reporter() {
  let pass = 0, fail = 0;
  return {
    /** T(name, condition, detailShownOnFailure) */
    T(name, cond, detail='') {
      const ok = !!cond; ok ? pass++ : fail++;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? `  <- ${detail}` : ''}`);
    },
    /** Section divider (must not start with PASS/FAIL or run.js would count it) */
    section(t) { console.log(`\n-- ${t} --`); },
    /** Call last — also sets the exit code */
    done(src) {
      console.log(`\nResult: ${pass} PASS / ${fail} FAIL  (${src})`);
      process.exit(fail ? 1 : 0);
    },
  };
}

/** Wrap the test body so an exception is reported as a FAIL instead of a silent crash */
function run(fn) {
  Promise.resolve()
    .then(fn)
    .catch(e => { console.log(`FAIL  exception during test: ${e && e.message}`); console.error(e); process.exit(1); });
}

module.exports = { boot, makeClickers, reporter, run, targetPath };
