#!/usr/bin/env node
/* test-dist.js — run the test suite against the build output in dist/
 *
 *   node test-dist.js              check dist/modugrid.min.js (default)
 *   node test-dist.js dist/modugrid.js
 *
 * `MODUGRID=... node test/run.js` does the same thing, but that syntax does not work
 * in the Windows command prompt and so is awkward in an npm script. This sets the env
 * var here and reuses run.js as-is (run.js itself is not modified).
 */
const fs   = require('fs');
const path = require('path');

const target = process.argv[2] || 'dist/modugrid.min.js';
const abs    = path.resolve(__dirname, target);

if (!fs.existsSync(abs)) {
  console.error(`Build output not found: ${target}\nRun this first:  npm run build`);
  process.exit(1);
}

console.log(`Testing against: ${target}\n`);
process.env.MODUGRID = abs;      // read by test/lib/harness.js
require('./test/run.js');        // run.js exits with code 1 on failure
