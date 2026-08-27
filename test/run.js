#!/usr/bin/env node
/* ModuGrid test runner
     node test/run.js          run everything
     node test/run.js smoke    run one file only (extension optional)

   Each test loads modugrid.js on top of jsdom and prints PASS / FAIL to stdout. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DIR = __dirname;
const only = process.argv[2];

const files = fs.readdirSync(DIR)
  .filter(f => f.endsWith('.js') && f !== 'run.js')
  .filter(f => !only || f === only || f === only + '.js')
  .sort();

if (!files.length) { console.error('No tests to run.'); process.exit(1); }

let pass = 0, fail = 0;
const failed = [];

for (const f of files) {
  let out = '';
  try {
    out = execFileSync('node', [path.join(DIR, f)], {
      cwd: path.dirname(DIR), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || '');
  }
  const p = (out.match(/^PASS/gm) || []).length;
  const q = (out.match(/^FAIL/gm) || []).length;
  pass += p; fail += q;
  const mark = q ? '✖' : '✔';
  console.log(`${mark} ${f.padEnd(18)} ${p} pass${q ? `, ${q} fail` : ''}`);
  if (q) {
    failed.push(f);
    out.split('\n').filter(l => l.startsWith('FAIL')).forEach(l => console.log('   ' + l));
  }
}

console.log('─'.repeat(46));
console.log(`${files.length} file(s) · ${pass} pass${fail ? ` · ${fail} FAIL` : ''}`);
if (fail) { console.log('Failed:', failed.join(', ')); process.exit(1); }
