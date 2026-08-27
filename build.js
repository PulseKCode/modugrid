#!/usr/bin/env node
/* build.js — produce the distribution files
 *
 *   node build.js
 *
 * The sources (modugrid.js / modugrid.css) are never modified.
 * The following are written to dist/:
 *
 *   dist/modugrid.js       UMD (global, CommonJS, AMD) — readable
 *   dist/modugrid.min.js   minified UMD
 *   dist/modugrid.mjs      ESM (export default)
 *   dist/modugrid.css      copy of the source CSS
 *   dist/modugrid.min.css  minified CSS
 *
 * Note: at the top level the source contains only `function ModuGrid(...)` plus a few
 *       lines of initialisation, so it can be dropped whole into a factory function
 *       that returns ModuGrid. 'use strict' is deliberately not added — that would
 *       change the runtime semantics of the source.
 */
const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const SRC_JS  = path.join(ROOT, 'modugrid.js');
const SRC_CSS = path.join(ROOT, 'modugrid.css');

/* ── Preflight ────────────────────────── */
let Terser, CleanCSS;
try { Terser = require('terser'); CleanCSS = require('clean-css'); }
catch (e) {
  console.error('Build tools are missing. Run this first:  npm install');
  process.exit(1);
}

for (const f of [SRC_JS, SRC_CSS]) {
  if (!fs.existsSync(f)) { console.error(`Source not found: ${f}`); process.exit(1); }
}

const srcJs  = fs.readFileSync(SRC_JS, 'utf8');
const srcCss = fs.readFileSync(SRC_CSS, 'utf8');

/* The version is read from the source header — warn if package.json disagrees */
const mVer = srcJs.match(/ModuGrid v(\d+\.\d+\.\d+)/);
const version = mVer ? mVer[1] : require('./package.json').version;
if (mVer && require('./package.json').version !== version)
  console.warn(`Warning: source version (${version}) != package.json version (${require('./package.json').version})`);

const banner =
`/*! ModuGrid v${version} | (c) 2026 BongJun Park | MIT License | https://github.com/PulseKCode */`;

/* ── UMD / ESM wrappers ───────────────── */
const umd = `${banner}
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.ModuGrid = factory();
}(typeof self !== 'undefined' ? self : this, function () {

${srcJs}

return ModuGrid;
}));
`;

const esm = `${banner}

${srcJs}

export default ModuGrid;
export { ModuGrid };
`;

/* ── Output ───────────────────────────── */
fs.mkdirSync(DIST, { recursive: true });

const written = [];
const write = (name, text) => {
  const p = path.join(DIST, name);
  fs.writeFileSync(p, text);
  written.push([name, Buffer.byteLength(text)]);
};

write('modugrid.js',  umd);
write('modugrid.mjs', esm);
write('modugrid.css', srcCss);

(async () => {
  const min = await Terser.minify(umd, {
    format: { comments: /^!/ },     // keep the banner only
    compress: { passes: 2 },
    /* Never enable mangle.properties — data-act routing (_ACT), column definition
       keys and option keys are all matched as strings. */
    mangle: true,
  });
  if (min.error) { console.error('JS minification failed:', min.error); process.exit(1); }
  write('modugrid.min.js', min.code);

  const cssMin = new CleanCSS({ level: 2 }).minify(srcCss);
  if (cssMin.errors.length) { console.error('CSS minification failed:', cssMin.errors); process.exit(1); }
  write('modugrid.min.css', banner + '\n' + cssMin.styles);

  const kb = n => (n/1024).toFixed(1).padStart(7) + ' KB';
  console.log(`ModuGrid v${version} build complete -> dist/`);
  written.sort((a,b)=>a[0].localeCompare(b[0])).forEach(([n,s]) => console.log(`  ${n.padEnd(18)}${kb(s)}`));
  console.log('\nVerify with:  npm run test:dist   (runs the suite against the build output)');
})();
