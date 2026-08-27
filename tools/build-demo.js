#!/usr/bin/env node
/* tools/build-demo.js — assemble the static demo site from the sample pages
 *
 *   node tools/build-demo.js [samplesDir]     default: samples
 *
 * Produces demo/, which is what GitHub Pages publishes:
 *
 *   demo/index.html          gallery (sidebar list + iframe preview)
 *   demo/lib/                modugrid.min.js · modugrid.min.css
 *   demo/_mock.js            simulated server (see tools/demo-mock.js)
 *   demo/samples/*.html      the samples, with their paths rewritten
 *
 * The samples are never modified in place — they are copied and rewritten on the
 * way out, so the originals keep working against a real JSP server.
 */
const fs   = require('fs');
const path = require('path');

const ROOT    = path.join(__dirname, '..');
const SRC     = path.join(ROOT, process.argv[2] || 'samples');
const OUT     = path.join(ROOT, 'demo');
const OUT_S   = path.join(OUT, 'samples');
const OUT_LIB = path.join(OUT, 'lib');

if (!fs.existsSync(SRC)) {
  console.error(`Samples folder not found: ${path.relative(ROOT, SRC)}\n` +
                `Usage: node tools/build-demo.js [samplesDir]`);
  process.exit(1);
}

const DIST_JS  = path.join(ROOT, 'dist', 'modugrid.min.js');
const DIST_CSS = path.join(ROOT, 'dist', 'modugrid.min.css');
for (const f of [DIST_JS, DIST_CSS]) {
  if (!fs.existsSync(f)) { console.error(`Missing ${path.relative(ROOT, f)} — run \`npm run build\` first.`); process.exit(1); }
}

/* ── clean output ───────────────────────────────── */
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT_S,   { recursive: true });
fs.mkdirSync(OUT_LIB, { recursive: true });

fs.copyFileSync(DIST_JS,  path.join(OUT_LIB, 'modugrid.min.js'));
fs.copyFileSync(DIST_CSS, path.join(OUT_LIB, 'modugrid.min.css'));
fs.copyFileSync(path.join(__dirname, 'demo-mock.js'), path.join(OUT, '_mock.js'));

/* ── rewrite each sample ────────────────────────── */
const htmlFiles = fs.readdirSync(SRC)
  .filter(f => /\.html?$/i.test(f) && f.toLowerCase() !== 'index.html')
  .sort();

if (!htmlFiles.length) { console.error(`No sample pages in ${path.relative(ROOT, SRC)}`); process.exit(1); }

/** Pull a readable title out of the page */
function titleOf(html, fallback) {
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (t && t[1].trim()) return t[1].trim().replace(/\s+/g, ' ');
  const h = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h) return h[1].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
  return fallback;
}

const entries = [];

for (const f of htmlFiles) {
  let html = fs.readFileSync(path.join(SRC, f), 'utf8');

  /* Point the library references at demo/lib, whatever path form they took.
     The quote characters are matched as a pair and re-emitted, so the closing
     quote is never swallowed. */
  html = html.replace(/(["'])[^"']*modugrid(?:\.min)?\.css(?:\?[^"']*)?\1/gi,
                      (m, q) => `${q}../lib/modugrid.min.css${q}`);
  html = html.replace(/(["'])[^"']*modugrid(?:\.min)?\.js(?:\?[^"']*)?\1/gi,
                      (m, q) => `${q}../lib/modugrid.min.js${q}`);

  /* the simulated server must load before any grid code runs */
  const mockTag = '<script src="../_mock.js"></script>';
  if (/<\/head>/i.test(html))      html = html.replace(/<\/head>/i, `  ${mockTag}\n</head>`);
  else if (/<body[^>]*>/i.test(html)) html = html.replace(/(<body[^>]*>)/i, `$1\n${mockTag}`);
  else html = mockTag + '\n' + html;

  /* leave room for the notice bar at the bottom */
  html = html.replace(/<\/body>/i, '<style>body{padding-bottom:26px}</style>\n</body>');

  fs.writeFileSync(path.join(OUT_S, f), html);

  const needsServer = /dataSource\s*:/.test(html);
  entries.push({ file: f, title: titleOf(html, f.replace(/\.html?$/i, '')), needsServer });
}

/* ── gallery ────────────────────────────────────── */
const version = (fs.readFileSync(path.join(ROOT, 'modugrid.js'), 'utf8')
                   .match(/ModuGrid v(\d+\.\d+\.\d+)/) || [])[1] || '';

const items = entries.map((e, i) => `      <li>
        <a href="#" data-src="samples/${e.file}"${i === 0 ? ' class="on"' : ''}>
          <span class="n">${String(i + 1).padStart(3, '0')}</span>
          <span class="t">${e.title.replace(/</g, '&lt;')}</span>${e.needsServer ? '<span class="sv" title="uses a server data source">server</span>' : ''}
        </a>
      </li>`).join('\n');

fs.writeFileSync(path.join(OUT, 'index.html'), `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ModuGrid ${version} — live examples</title>
<meta name="description" content="Live examples of ModuGrid, a dependency-free vanilla JavaScript data grid with inline editing, dirty tracking and IME-safe input.">
<style>
  *{box-sizing:border-box}
  body{margin:0;height:100vh;display:flex;flex-direction:column;
       font:14px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;color:#20242e;background:#f4f5f7}
  header{display:flex;align-items:baseline;gap:12px;padding:10px 16px;background:#1f2430;color:#fff;flex:none}
  header b{font-size:15px;letter-spacing:.3px}
  header span{font-size:12px;color:#9aa3b5}
  header a{margin-left:auto;color:#8fa9ff;text-decoration:none;font-size:13px}
  header a:hover{text-decoration:underline}
  main{flex:1;display:flex;min-height:0}
  nav{width:290px;flex:none;background:#fff;border-right:1px solid #dfe2ea;display:flex;flex-direction:column}
  .f{padding:8px;border-bottom:1px solid #eceef4}
  .f input{width:100%;padding:6px 9px;border:1px solid #d3d7e0;border-radius:5px;font:13px system-ui}
  ul{list-style:none;margin:0;padding:0;overflow:auto;flex:1}
  li a{display:flex;gap:8px;align-items:center;padding:6px 12px;text-decoration:none;color:#333;border-left:3px solid transparent}
  li a:hover{background:#f0f2f7}
  li a.on{background:#eef2ff;border-left-color:#4361ee;color:#1a34a8;font-weight:600}
  .n{color:#9aa1b0;font:11px ui-monospace,monospace;flex:none}
  .t{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .sv{font-size:10px;background:#ffeccc;color:#8a5a00;border-radius:3px;padding:1px 4px;flex:none}
  iframe{flex:1;border:0;background:#fff;min-width:0}
  @media (max-width:760px){ main{flex-direction:column} nav{width:auto;max-height:38vh} }
</style>
</head>
<body>
<header>
  <b>ModuGrid</b><span>v${version} · ${entries.length} examples · server calls are simulated</span>
  <a href="https://github.com/PulseKCode/modugrid" target="_blank" rel="noopener">GitHub</a>
</header>
<main>
  <nav>
    <div class="f"><input id="q" type="search" placeholder="Filter examples" autocomplete="off"></div>
    <ul id="list">
${items}
    </ul>
  </nav>
  <iframe id="fr" src="samples/${entries[0].file}" title="example"></iframe>
</main>
<script>
  var list = document.getElementById('list'), fr = document.getElementById('fr');
  list.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-src]'); if (!a) return;
    e.preventDefault();
    list.querySelectorAll('a.on').forEach(function (x) { x.classList.remove('on'); });
    a.classList.add('on');
    fr.src = a.dataset.src;
  });
  document.getElementById('q').addEventListener('input', function (e) {
    var q = e.target.value.toLowerCase();
    list.querySelectorAll('li').forEach(function (li) {
      li.style.display = li.textContent.toLowerCase().indexOf(q) < 0 ? 'none' : '';
    });
  });
</script>
</body>
</html>
`);

const kb = n => (n / 1024).toFixed(1) + ' KB';
console.log(`Demo built -> demo/`);
console.log(`  samples      ${entries.length}`);
console.log(`  server-mode  ${entries.filter(e => e.needsServer).length} (list responses come from MODUGRID_DEMO_ROWS when defined)`);
console.log(`  library      ${kb(fs.statSync(path.join(OUT_LIB, 'modugrid.min.js')).size)} + ${kb(fs.statSync(path.join(OUT_LIB, 'modugrid.min.css')).size)}`);
console.log(`\nPreview locally:  npx serve demo    (or any static server)`);
