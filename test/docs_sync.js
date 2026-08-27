/* test/docs_sync.js — keep the English and Korean documentation in step
 *
 * Layout checked here:
 *   README.md          English (what GitHub and npm display)
 *   README.ko.md       Korean
 *   docs/en/*.md       English reference
 *   docs/ko/*.md       Korean reference        (same file names as docs/en)
 *   CHANGELOG.md       English only — deliberately not paired
 *
 * The point is drift: six months from now an option gets added to the Korean
 * table and the English one is forgotten. Prose cannot be compared, but the
 * skeleton around it can, and that is where drift shows up first.
 *
 * What is compared:
 *   - the file sets match on both sides
 *   - heading structure matches (level sequence and count, not the text)
 *   - code-only headings match verbatim, e.g. ### `setData(rows)`
 *   - each table has the same number of rows
 *   - code blocks match once comments are stripped and string contents masked
 *     (labels and sample data are translated, so the text inside quotes differs
 *      legitimately; an added argument or renamed option does not)
 *   - both files carry the language switcher line
 *
 * Skips quietly when the documents are not present, so the rest of the suite
 * still runs on a checkout without docs/.
 */
const fs   = require('fs');
const path = require('path');
const { T, section, done } = require('./lib/harness').reporter();

const ROOT   = path.join(__dirname, '..');
const DOC_EN = path.join(ROOT, 'docs', 'en');
const DOC_KO = path.join(ROOT, 'docs', 'ko');

/* ── collect the pairs to compare ───────────────────────── */
const pairs = [];
const readmeEn = path.join(ROOT, 'README.md');
const readmeKo = path.join(ROOT, 'README.ko.md');
if (fs.existsSync(readmeEn) || fs.existsSync(readmeKo))
  pairs.push({ name: 'README.md', en: readmeEn, ko: readmeKo });

const listMd = dir =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort() : [];

const enFiles = listMd(DOC_EN);
const koFiles = listMd(DOC_KO);

if (!pairs.length && !enFiles.length && !koFiles.length) {
  console.log('Skipped: no documentation found (README.md / docs/en / docs/ko).');
  process.exit(0);
}

/* ── normalisers ────────────────────────────────────────── */

/** Heading lines -> a level sequence such as ['#','##','###'] (text is translated, so ignored) */
const headings = src => src.split('\n')
  .filter(l => /^#{1,6}\s/.test(l))
  .map(l => l.match(/^#{1,6}/)[0]);

/**
 * Headings that are an API signature and nothing else, so they must match verbatim.
 * A heading such as `### \`options\` entry formats` is a section title with translatable
 * prose attached, not a signature — once the code spans are removed, anything with
 * letters left over is treated as prose and skipped.
 */
function codeHeadings(src) {
  return src.split('\n')
    .map(l => l.match(/^#{1,6}\s+(`[^`]+`.*)$/))
    .filter(Boolean)
    .map(m => m[1].trim())
    .filter(text => {
      const residue = text.replace(/`[^`]*`/g, '');
      return !/[\p{L}]/u.test(residue);      // only punctuation or arrows may remain
    });
}

/** Table row counts, one entry per contiguous table block */
function tableSizes(src) {
  const sizes = [];
  let run = 0;
  for (const l of src.split('\n')) {
    if (l.trim().startsWith('|')) run++;
    else { if (run) sizes.push(run); run = 0; }
  }
  if (run) sizes.push(run);
  return sizes;
}

/**
 * Fenced code blocks as { lang, body, ignored }.
 *
 * Some blocks are pseudo-code whose placeholders are prose and are meant to be
 * translated — `changes:{only the changed fields}` against `changes:{바뀐 필드만}`.
 * Put `<!-- sync:ignore-code -->` on the line before such a fence, in BOTH language
 * versions, and the contents are skipped (the block still counts towards the total).
 */
function codeBlocks(src) {
  const out = [];
  const re = /^```([^\n`]*)\n([\s\S]*?)^```/gm;
  let m;
  while ((m = re.exec(src))) {
    const before = src.slice(Math.max(0, m.index - 120), m.index);
    out.push({
      lang: m[1].trim().toLowerCase(),
      body: m[2],
      ignored: /<!--\s*sync:ignore-code\s*-->\s*$/.test(before),
    });
  }
  return out;
}

/**
 * Reduce a code sample to its structure: comments removed, the contents of string
 * literals masked, whitespace collapsed. Translating `label: '이름'` to
 * `label: 'Name'` is expected and must not fail; adding an option is not.
 */
function normaliseCode(body) {
  let s = body;
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');          // HTML / markdown comments
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ');         // block comments
  s = s.replace(/(^|[^:\w])\/\/[^\n]*/g, '$1');    // line comments (leaves https:// alone)

  /* Template literals: mask the literal text but keep the ${...} expressions,
     since `added ${out.inserted}` vs `추가 ${out.inserted}` is a translation while
     a changed expression inside the braces is a real difference. */
  s = s.replace(/`(?:\\.|[^`\\])*`/g, m =>
    '`' + m.slice(1, -1)
            .split(/(\$\{[^}]*\})/)
            .map(part => (part.startsWith('${') ? part : (part ? 'S' : '')))
            .join('') + '`');

  s = s.replace(/(['"])(?:\\.|(?!\1)[^\\])*\1/g, '"S"');   // mask string contents
  return s.replace(/\s+/g, ' ').trim();
}

/** Read a file, or null when absent */
const read = p => (p && fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);

/** Compare two arrays and describe the first divergence */
function firstDiff(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    if (a[i] !== b[i]) return `index ${i}: en=${JSON.stringify(a[i])} ko=${JSON.stringify(b[i])}`;
  return '';
}

/* ── 1. file set parity ─────────────────────────────────── */
section('file sets');

T('README.md exists (English, shown by GitHub and npm)', fs.existsSync(readmeEn));
T('README.ko.md exists (Korean)', fs.existsSync(readmeKo));

{
  const onlyEn = enFiles.filter(f => !koFiles.includes(f));
  const onlyKo = koFiles.filter(f => !enFiles.includes(f));
  T('docs/en and docs/ko hold the same file names',
    onlyEn.length === 0 && onlyKo.length === 0,
    `en only: [${onlyEn}] · ko only: [${onlyKo}]`);
}

enFiles.filter(f => koFiles.includes(f)).forEach(f =>
  pairs.push({ name: `docs/*/${f}`, en: path.join(DOC_EN, f), ko: path.join(DOC_KO, f) }));

/* ── 2. per-pair structural checks ──────────────────────── */
for (const p of pairs) {
  section(p.name);

  const en = read(p.en), ko = read(p.ko);
  if (en === null || ko === null) {
    T(`${p.name}: both language versions are readable`, false,
      `${en === null ? 'missing ' + path.relative(ROOT, p.en) : ''} ${ko === null ? 'missing ' + path.relative(ROOT, p.ko) : ''}`.trim());
    continue;
  }

  /* Language switcher — a reader landing on either file must be able to reach the
     other. Links are relative (README.ko.md at the root, ../ko/API.md under docs/),
     so match the counterpart path rather than one fixed spelling. */
  T(`${p.name}: English file links to the Korean one`,
    /\.ko\.md|(^|[(/])ko\/[\w.-]+\.md/m.test(en));
  T(`${p.name}: Korean file links to the English one`,
    /(^|[(/])en\/[\w.-]+\.md|\]\(\.?\/?README\.md\)/m.test(ko));

  const hEn = headings(en), hKo = headings(ko);
  T(`${p.name}: same number of headings`, hEn.length === hKo.length, `en ${hEn.length} · ko ${hKo.length}`);
  T(`${p.name}: same heading hierarchy`, hEn.join(',') === hKo.join(','), firstDiff(hEn, hKo));

  const cEn = codeHeadings(en), cKo = codeHeadings(ko);
  T(`${p.name}: API signature headings match verbatim`,
    cEn.join('\n') === cKo.join('\n'), firstDiff(cEn, cKo));

  const tEn = tableSizes(en), tKo = tableSizes(ko);
  T(`${p.name}: same table row counts`, tEn.join(',') === tKo.join(','),
    `en [${tEn}] · ko [${tKo}]`);

  const bEn = codeBlocks(en), bKo = codeBlocks(ko);
  T(`${p.name}: same number of code blocks`, bEn.length === bKo.length,
    `en ${bEn.length} · ko ${bKo.length}`);

  if (bEn.length === bKo.length) {
    const mismatched = [];
    bEn.forEach((b, i) => {
      if (b.lang !== bKo[i].lang) { mismatched.push(`#${i + 1} language tag ${b.lang} vs ${bKo[i].lang}`); return; }
      if (b.ignored !== bKo[i].ignored) { mismatched.push(`#${i + 1} sync:ignore-code marked on one side only`); return; }
      if (b.ignored) return;                                  // pseudo-code, deliberately skipped
      if (normaliseCode(b.body) !== normaliseCode(bKo[i].body)) mismatched.push(`#${i + 1} (${b.lang || 'text'})`);
    });
    T(`${p.name}: code blocks match once comments and strings are set aside`,
      mismatched.length === 0, mismatched.join(', '));
  }
}

done('docs');
