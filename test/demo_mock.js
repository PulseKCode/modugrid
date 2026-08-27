/* test/demo_mock.js — the simulated server used by the static demo
 *
 * GitHub Pages cannot run JSP, so tools/demo-mock.js intercepts fetch() and
 * answers submit.jsp / upload.jsp / list.jsp itself. If that mock drifts from
 * what the grid actually expects, every demo button breaks silently — hence
 * these checks run the real grid against the real mock.
 *
 * Skips quietly when the demo has not been built.
 */
const fs   = require('fs');
const path = require('path');
const H    = require('./lib/harness');
const { T, section, done } = H.reporter();

const MOCK = path.join(__dirname, '..', 'tools', 'demo-mock.js');
if (!fs.existsSync(MOCK)) {
  console.log('Skipped: tools/demo-mock.js not found.');
  process.exit(0);
}

const { window, document, ModuGrid, src } = H.boot();
const { tick } = H.makeClickers(window);

/* jsdom has no fetch/Response by default — provide just enough for the mock to wrap */
window.Response = class {
  constructor(body, init = {}) {
    this._body = body;
    this.status = init.status || 200;
    this.ok = this.status >= 200 && this.status < 300;
    const h = init.headers || {};
    this.headers = { get: k => h[Object.keys(h).find(x => x.toLowerCase() === k.toLowerCase())] };
  }
  async json() { return JSON.parse(this._body); }
  async text() { return this._body; }
};
let realFetchCalls = 0;
window.fetch = async () => { realFetchCalls++; return new window.Response('{}', { headers:{'Content-Type':'application/json'} }); };

window.eval(fs.readFileSync(MOCK, 'utf8'));

const COLS = [{ key:'name', label:'Name', w:150 }, { key:'memo', label:'Memo', w:200 }];

H.run(async () => {
  section('notice bar');

  T('a notice bar is added to the page', !!document.getElementById('mgDemoBar'));
  T('the notice says nothing is saved', /nothing is saved/i.test(
    (document.getElementById('mgDemoBar') || {}).textContent || ''));

  section('submit.jsp — the diff is counted and ids returned');

  const G = ModuGrid('#grid', { cols: COLS, options:{ editMode:true } });
  G.setData([{ id:1, name:'kim', memo:'a' }, { id:2, name:'lee', memo:'b' }]);

  G.updateRow(1, { memo:'edited' });
  G.addRow({ name:'new one', memo:'c' });
  G.deleteRows(new Set([2]));
  await tick();

  const before = G.getChangeCount();
  T('the grid reports one insert, one update, one delete',
    before.inserted === 1 && before.updated === 1 && before.deleted === 1,
    JSON.stringify(before));

  const out = await G.submit('submit.jsp');
  T('submit resolves without throwing', !!out, JSON.stringify(out));
  T('the response is marked ok', out && out.ok === true);
  T('counts come back matching the diff',
    out.inserted === 1 && out.updated === 1 && out.deleted === 1, JSON.stringify(out));
  T('an idMap entry is returned for the new row',
    out.idMap && Object.keys(out.idMap).length === 1, JSON.stringify(out.idMap));
  T('the response is flagged as coming from the demo', out.demo === true);

  await tick();
  T('the baseline moved forward, so the grid is clean again', G.isDirty() === false,
    JSON.stringify(G.getChangeCount()));

  section('submit with json:true');

  {
    G.updateRow(1, { memo:'again' });
    await tick();
    const o = await G.submit('submit.jsp', { json:true });
    T('a JSON body is parsed just as well', o && o.updated === 1, JSON.stringify(o));
  }

  section('upload.jsp — an image reference is returned');

  {
    const res = await window.fetch('upload.jsp', { method:'POST', body:new window.FormData() });
    const j = await res.json();
    T('upload responds ok', j.ok === true);
    T('it returns the { id, url } pair imageUpload expects',
      typeof j.id === 'string' && typeof j.url === 'string', JSON.stringify(j).slice(0, 80));
    T('the url is a usable image', /^data:image\//.test(j.url));
  }

  section('list.jsp — rows served from MODUGRID_DEMO_ROWS');

  {
    window.MODUGRID_DEMO_ROWS = [{ id:1, name:'r1' }, { id:2, name:'r2' }, { id:3, name:'r3' }];
    const j = await (await window.fetch('list.jsp?page=1&pageSize=2')).json();
    T('rows come from the sample-provided data', j.rows.length === 2, JSON.stringify(j.rows));
    T('total reflects the whole set', j.total === 3, `total=${j.total}`);

    const j2 = await (await window.fetch('list.jsp?page=2&pageSize=2')).json();
    T('paging is honoured', j2.rows.length === 1 && j2.rows[0].id === 3, JSON.stringify(j2.rows));

    delete window.MODUGRID_DEMO_ROWS;
    const j3 = await (await window.fetch('list.jsp')).json();
    T('without demo rows it answers with an empty, valid shape',
      Array.isArray(j3.rows) && j3.rows.length === 0 && j3.ok === true);
  }

  section('everything else is left alone');

  {
    const n = realFetchCalls;
    await window.fetch('https://example.com/data.json');
    T('a non-endpoint URL passes through to the real fetch', realFetchCalls === n + 1);
  }

  done(src);
});
