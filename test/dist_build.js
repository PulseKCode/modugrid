/* test/dist_build.js — packaging checks for the build output (dist/)
 *
 * Verifies that what build.js produced is actually usable:
 *   - all three load paths: browser <script> (UMD global), CommonJS require, ESM import
 *   - ModuGrid.about survives minification intact
 *     (terser leaves string literals alone, so it should. Turning on
 *      mangle.properties breaks it right here — which is why build.js keeps it off.)
 *   - the MIT licence banner survives in the minified files
 *
 * Skips quietly when dist/ is absent, so `npm test` also works without a build.
 */
const fs   = require('fs');
const path = require('path');
const H    = require('./lib/harness');
const { T, section, done } = H.reporter();

const DIST = path.join(__dirname, '..', 'dist');
const files = {
  umd:    path.join(DIST, 'modugrid.js'),
  min:    path.join(DIST, 'modugrid.min.js'),
  esm:    path.join(DIST, 'modugrid.mjs'),
  css:    path.join(DIST, 'modugrid.css'),
  cssMin: path.join(DIST, 'modugrid.min.css'),
};

if (!fs.existsSync(files.min)) {
  console.log('Skipped: dist/ not found. Run `npm run build` first.');
  process.exit(0);
}

const SRC_VER = (fs.readFileSync(path.join(__dirname, '..', 'modugrid.js'), 'utf8')
                   .match(/ModuGrid v(\d+\.\d+\.\d+)/) || [])[1];

/** Load a file as a browser global (the <script> path) on jsdom */
function loadGlobal(file) {
  const { window } = H.boot();                 // empty document + shims
  delete window.ModuGrid;                      // drop the source build the harness loaded, swap in the dist file
  window.eval(fs.readFileSync(file, 'utf8'));
  return window.ModuGrid;
}

H.run(async () => {
  section('files produced');

  Object.entries(files).forEach(([k, f]) =>
    T(`dist/${path.basename(f)} exists`, fs.existsSync(f)));

  section('UMD — browser global (<script>)');

  {
    const MG = loadGlobal(files.umd);
    T('ModuGrid exposed as a global', typeof MG === 'function', `typeof=${typeof MG}`);
    T('about.author preserved', MG && MG.about.author === 'BongJun Park', `${MG && MG.about.author}`);
    T('version matches the source', MG && MG.version === SRC_VER, `${MG && MG.version} vs ${SRC_VER}`);
    T('about.license = MIT', MG && MG.about.license === 'MIT', `${MG && MG.about.license}`);
  }

  section('minified UMD — did minification break anything');

  {
    const MG = loadGlobal(files.min);
    T('minified build exposes the ModuGrid global', typeof MG === 'function', `typeof=${typeof MG}`);
    T('minified about intact (confirms mangle.properties is off)',
      MG && MG.about.author === 'BongJun Park' && MG.about.license === 'MIT',
      `${MG && MG.about.author} / ${MG && MG.about.license}`);
    T('minified version matches', MG && MG.version === SRC_VER, `${MG && MG.version} vs ${SRC_VER}`);
    T('minified about is frozen', MG && Object.isFrozen(MG.about));
  }

  section('CommonJS require / ESM import');

  {
    let cjs = null, err = '';
    try { cjs = require(files.umd); } catch (e) { err = e.message; }
    T('require(dist/modugrid.js) works (loads without a DOM)', typeof cjs === 'function', err);
    T('require result exposes about', cjs && cjs.about.name === 'ModuGrid');
  }

  {
    let esm = null, err = '';
    try { esm = await import('file://' + files.esm); } catch (e) { err = e.message; }
    T('import(dist/modugrid.mjs) works', esm && typeof esm.default === 'function', err);
    T('named export {ModuGrid} present', esm && typeof esm.ModuGrid === 'function');
  }

  section('licence notice and hygiene');

  {
    const minJs  = fs.readFileSync(files.min, 'utf8');
    const minCss = fs.readFileSync(files.cssMin, 'utf8');
    T('minified JS keeps the MIT banner on line 1', /^\/\*!.*MIT License/.test(minJs.split('\n')[0]),
      minJs.slice(0, 60));
    T('minified CSS keeps the MIT banner', /MIT License/.test(minCss.split('\n')[0]));
    T('minified JS is smaller than the readable build',
      minJs.length < fs.readFileSync(files.umd, 'utf8').length,
      `${(minJs.length/1024).toFixed(1)}KB`);
    T('no dangling sourceMappingURL reference', !/sourceMappingURL/.test(minJs));
  }

  done('dist/');
});
