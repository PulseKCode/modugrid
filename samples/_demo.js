/* ====================================================================
   ModuGrid Samples (English) — shared demo harness (_demo.js)

   What it does
     1) Supplies sample data      MGDemo.rows(n) / MGDemo.tree()
     2) Writes to the log panel   MGDemo.log(...)
     3) Builds the "View source" panel  tab 1 = demo JS / tab 2 = whole HTML
     4) Runs the demo script

   How "View source" works
     - The demo code sits inside <script type="text/plain" id="demo-src">, so it is
       stored verbatim and never executed by the browser. Tab 1 shows that text as is.
     - Tab 2 is a snapshot of document.documentElement.outerHTML taken inside boot().
       boot() is the last script in the file, so at that moment the DOM still matches
       the original markup (the grid has not injected anything yet).
     - Only after both tabs are captured does boot() inject and run the demo code.
==================================================================== */
(function (w) {
'use strict';

/* Theme handed down by the gallery.
   file:// blocks contentDocument between frames, so the parent also sends a
   message and puts ?theme= on the URL. Either route lands here. */
(function(){
  function setTheme(v){
    var d = document.documentElement;
    if (v && v !== 'light') d.setAttribute('data-theme', v);
    else d.removeAttribute('data-theme');
  }
  var m = /[?&]theme=([a-z]+)/i.exec(location.search);
  if (m) setTheme(m[1]);
  window.addEventListener('message', function(e){
    if (e.data && typeof e.data === 'object' && e.data.mgTheme !== undefined) setTheme(e.data.mgTheme);
  });
})();


var MGDemo = {};
w.MGDemo = MGDemo;

/* ══════════ 1. Sample data ══════════ */

MGDemo.STATUS = [
  { code: 'A', name: 'Active' },
  { code: 'P', name: 'Pending' },
  { code: 'I', name: 'Inactive' }
];
MGDemo.ROLES = ['Developer', 'Designer', 'Manager', 'Analyst', 'DevOps', 'QA'];

var NAMES = ['John Doe','Jane Smith','Michael Brown','Emily Davis','David Wilson',
             'Sarah Miller','James Taylor','Laura Anderson','Robert Thomas','Anna Moore',
             'Daniel Jackson','Olivia White','Thomas Harris','Sophia Martin','Peter Clark',
             'Grace Lewis','Henry Walker','Chloe Hall','Andrew Young','Mia Allen'];

/* Deterministic pseudo-random, so a refresh gives you the same rows */
function rnd(seed) {
  var s = seed;
  return function () { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

/**
 * MGDemo.rows(n, seed) — n sample rows
 *   { id, name, status(code), role, score, progress, salary, joined, memo, images, parentId }
 */
MGDemo.rows = function (n, seed) {
  var r = rnd(seed || 7);
  var out = [];
  for (var i = 0; i < (n || 20); i++) {
    var st = MGDemo.STATUS[Math.floor(r() * 3)].code;
    out.push({
      id: i + 1,
      name: NAMES[i % NAMES.length] + (i >= NAMES.length ? ' ' + (Math.floor(i / NAMES.length) + 1) : ''),
      status: st,
      role: MGDemo.ROLES[Math.floor(r() * MGDemo.ROLES.length)],
      score: Math.floor(r() * 61) + 40,
      progress: Math.floor(r() * 101),
      salary: (Math.floor(r() * 60) + 30) * 1000,
      joined: '20' + (14 + Math.floor(r() * 11)) + '-' +
              String(Math.floor(r() * 12) + 1).padStart(2, '0') + '-' +
              String(Math.floor(r() * 28) + 1).padStart(2, '0'),
      memo: 'Note ' + (i + 1),
      images: [],
      parentId: 0
    });
  }
  return out;
};

/**
 * MGDemo.tree() — hierarchical data for tree mode
 *   parentId points at the parent row; _hc:true marks a row that has children.
 */
MGDemo.tree = function () {
  var base = [
    { id: 1,  parentId: 0, _hc: true,  name: 'Head Office',      role: 'Manager',   score: 90 },
    { id: 2,  parentId: 1, _hc: true,  name: 'Engineering',      role: 'Manager',   score: 88 },
    { id: 3,  parentId: 2, _hc: false, name: 'Frontend Team',    role: 'Developer', score: 84 },
    { id: 4,  parentId: 2, _hc: false, name: 'Backend Team',     role: 'Developer', score: 91 },
    { id: 5,  parentId: 2, _hc: false, name: 'Database Team',    role: 'DevOps',    score: 79 },
    { id: 6,  parentId: 1, _hc: true,  name: 'Design',           role: 'Manager',   score: 82 },
    { id: 7,  parentId: 6, _hc: false, name: 'UI Team',          role: 'Designer',  score: 86 },
    { id: 8,  parentId: 6, _hc: false, name: 'UX Team',          role: 'Designer',  score: 88 },
    { id: 9,  parentId: 0, _hc: true,  name: 'Branch Office',    role: 'Manager',   score: 77 },
    { id: 10, parentId: 9, _hc: false, name: 'Sales Team A',     role: 'Analyst',   score: 73 },
    { id: 11, parentId: 9, _hc: false, name: 'Sales Team B',     role: 'Analyst',   score: 81 }
  ];
  return base.map(function (b) {
    return {
      id: b.id, parentId: b.parentId, _hc: b._hc,
      name: b.name, role: b.role, score: b.score,
      status: 'A', progress: b.score, salary: 4000,
      joined: '2020-01-01', memo: '', images: []
    };
  });
};

/* ══════════ 2. Log panel ══════════ */

function logEl() { return document.getElementById('log'); }

/**
 * MGDemo.log(text, cls) — append one line (cls: 'ok' | 'wn' | 'er')
 */
MGDemo.log = function (text, cls) {
  var el = logEl(); if (!el) return;
  var t = new Date().toTimeString().slice(0, 8);
  var d = document.createElement('div');
  d.innerHTML = '<span class="t">' + t + '</span>  ' +
                '<span class="' + (cls || '') + '"></span>';
  d.lastChild.textContent = String(text);
  el.appendChild(d);
  el.scrollTop = el.scrollHeight;
};
MGDemo.clearLog = function () { var el = logEl(); if (el) el.innerHTML = ''; };

/* ══════════ 3. Syntax highlighting ══════════ */

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

var JS_KW = /\b(const|let|var|function|return|if|else|for|while|do|new|delete|of|in|typeof|instanceof|await|async|true|false|null|undefined|class|this|try|catch|finally|throw|switch|case|break|continue)\b/;

function hiJS(code) {
  var re = new RegExp(
    '(\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*)' +
    '|(\'(?:\\\\.|[^\'\\\\])*\'|"(?:\\\\.|[^"\\\\])*"|`(?:\\\\.|[^`\\\\])*`)' +
    '|' + JS_KW.source +
    '|(\\b\\d+(?:\\.\\d+)?\\b)', 'g');
  return esc(code).replace(re, function (m, c, s, k, n) {
    if (c) return '<span class="c">' + c + '</span>';
    if (s) return '<span class="s">' + s + '</span>';
    if (k) return '<span class="k">' + k + '</span>';
    if (n) return '<span class="n">' + n + '</span>';
    return m;
  });
}

function hiHTML(code) {
  return esc(code)
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="c">$1</span>')
    .replace(/(&lt;\/?[A-Za-z][\w-]*)/g, '<span class="g">$1</span>')
    .replace(/("[^"\n]*")/g, '<span class="s">$1</span>');
}

/* ══════════ 4. Source panel ══════════ */

function buildPanel(jsCode, htmlCode) {
  var box = document.createElement('div');
  box.className = 'dm-src';
  box.innerHTML =
    '<div class="dm-srch">' +
      '<button type="button" class="dm-srct on" data-t="js">Demo JS</button>' +
      '<button type="button" class="dm-srct" data-t="html">Whole HTML</button>' +
      '<span class="dm-srcsp"></span>' +
      '<button type="button" class="dm-srcbt" data-a="copy">Copy</button>' +
    '</div>' +
    '<div class="dm-srcb on" data-b="js"><pre></pre></div>' +
    '<div class="dm-srcb" data-b="html"><pre></pre></div>';

  box.querySelector('[data-b="js"] pre').innerHTML   = hiJS(jsCode);
  box.querySelector('[data-b="html"] pre').innerHTML = hiHTML(htmlCode);

  var cur = 'js';
  box.querySelectorAll('.dm-srct').forEach(function (bt) {
    bt.onclick = function () {
      cur = bt.dataset.t;
      box.querySelectorAll('.dm-srct').forEach(function (b) { b.classList.toggle('on', b === bt); });
      box.querySelectorAll('.dm-srcb').forEach(function (b) { b.classList.toggle('on', b.dataset.b === cur); });
    };
  });
  box.querySelector('[data-a="copy"]').onclick = function (e) {
    var txt = (cur === 'js') ? jsCode : htmlCode;
    var ta = document.createElement('textarea');
    ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(ta);
    var b = e.target, o = b.textContent;
    b.textContent = 'Copied'; setTimeout(function () { b.textContent = o; }, 1200);
  };

  var host = document.getElementById('src') || document.body;
  host.appendChild(box);
}

/* ══════════ 5. boot ══════════ */

/**
 * MGDemo.boot() — called once at the very bottom of the page.
 *   1) snapshot the current DOM (= the original file)
 *   2) build the source panel
 *   3) inject and run the demo code
 */
MGDemo.boot = function () {
  var srcEl = document.getElementById('demo-src');
  var jsCode = srcEl ? srcEl.textContent.replace(/^\n/, '').replace(/\s+$/, '') : '';

  var htmlCode = '<!DOCTYPE html>\n' + document.documentElement.outerHTML + '\n';

  try { buildPanel(jsCode, htmlCode); } catch (e) { console.error('source panel:', e); }

  if (jsCode) {
    var s = document.createElement('script');
    s.textContent = jsCode;
    document.body.appendChild(s);
  }
};

})(window);
