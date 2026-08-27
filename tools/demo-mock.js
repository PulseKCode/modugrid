/* _mock.js — simulated server for the static demo
 *
 * GitHub Pages serves static files only: no JSP, no Node, no database.
 * The samples still call submit.jsp / upload.jsp / list.jsp, so this intercepts
 * fetch() and answers them, letting every button work with nothing saved.
 *
 * Loaded automatically by tools/build-demo.js, right after modugrid.js.
 *
 * Server-side samples (options.dataSource) have no rows to serve. Define
 *   window.MODUGRID_DEMO_ROWS = [ ...rows ];
 * anywhere before the grid is created and list responses will be built from it.
 */
(function () {
  'use strict';

  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  if (!realFetch) return;

  var NOTICE = 'Demo environment — server calls are simulated and nothing is saved.';

  /* ── the notice bar ─────────────────────────────── */
  function banner() {
    if (document.getElementById('mgDemoBar')) return;
    var bar = document.createElement('div');
    bar.id = 'mgDemoBar';
    bar.textContent = NOTICE;
    bar.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:99999;' +
      'background:#1f2430;color:#cfd4e0;font:12px/1.9 system-ui,sans-serif;' +
      'text-align:center;padding:2px 8px;letter-spacing:.2px';
    (document.body || document.documentElement).appendChild(bar);
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', banner);
  else banner();

  /* ── helpers ────────────────────────────────────── */
  function json(obj, status) {
    return new Response(JSON.stringify(obj), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json; charset=UTF-8' }
    });
  }

  /** Pull the change payload out of whichever body shape submit() used */
  async function readChanges(init) {
    var body = init && init.body;
    if (!body) return null;
    try {
      if (typeof FormData !== 'undefined' && body instanceof FormData) {
        for (var pair of body.entries())
          if (typeof pair[1] === 'string' && pair[1].indexOf('{') === 0) return JSON.parse(pair[1]);
        return null;
      }
      if (typeof body === 'string') {
        if (body.charAt(0) === '{') return JSON.parse(body);              // json:true
        var m = /(?:^|&)changes=([^&]*)/.exec(body);                       // form encoded
        if (m) return JSON.parse(decodeURIComponent(m[1]));
      }
    } catch (e) { /* fall through */ }
    return null;
  }

  var uploadSeq = 0;

  /* A 1x1 transparent PNG, so an uploaded image resolves to something real */
  var STUB_IMG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAY27m/MAAAAASUVORK5CYII=';

  /* ── the interceptor ────────────────────────────── */
  window.fetch = async function (input, init) {
    var url = (typeof input === 'string') ? input : (input && input.url) || '';
    var file = String(url).split('?')[0].split('/').pop().toLowerCase();

    /* Anything that is not one of the sample endpoints goes through untouched */
    if (!/\.(jsp|do|php)$/.test(file)) return realFetch(input, init);

    await new Promise(function (r) { setTimeout(r, 180); });   // a little latency, so spinners are visible

    /* submit — count the diff and hand back ids for the new rows */
    if (file.indexOf('submit') === 0 || file === 'save.jsp') {
      var ch = await readChanges(init) || {};
      var ins = (ch.inserted || []).length,
          upd = (ch.updated  || []).length,
          del = (ch.deleted  || []).length;
      var idMap = {};
      (ch.inserted || []).forEach(function (r, i) { idMap[String(r.id)] = 900000 + i; });
      return json({ ok: true, inserted: ins, updated: upd, deleted: del, idMap: idMap, demo: true });
    }

    /* image upload — return a reference shaped like the real handler's */
    if (file.indexOf('upload') === 0) {
      var name = 'demo-file';
      try {
        if (init && init.body && init.body.get) {
          var f = init.body.get('file');
          if (f && f.name) name = f.name;
        }
      } catch (e) { /* ignore */ }
      uploadSeq++;
      return json({ ok: true, id: 'DEMO' + uploadSeq, url: STUB_IMG, name: name, demo: true });
    }

    /* server-side list — built from MODUGRID_DEMO_ROWS when the sample provides it */
    var rows = window.MODUGRID_DEMO_ROWS;
    if (Array.isArray(rows)) {
      /* Parsed by hand rather than with new URL(): the base can be about:blank or a
         file:// path, where the URL constructor throws. */
      var qs = String(url).split('?')[1] || '';
      var q = {};
      qs.split('&').forEach(function (kv) {
        if (!kv) return;
        var i = kv.indexOf('=');
        q[decodeURIComponent(i < 0 ? kv : kv.slice(0, i))] =
          decodeURIComponent(i < 0 ? '' : kv.slice(i + 1));
      });
      var page = parseInt(q.page || '1', 10) || 1;
      var size = parseInt(q.pageSize || q.size || '100', 10) || 100;
      var slice = size > 0 ? rows.slice((page - 1) * size, page * size) : rows;
      return json({ ok: true, rows: slice, total: rows.length, demo: true });
    }

    /* filter and autocomplete lookups — an empty list is harmless */
    return json({ ok: true, rows: [], total: 0, list: [], demo: true });
  };

  console.info('%cModuGrid demo%c  ' + NOTICE,
    'font-weight:700;color:#4361ee', 'color:#5a5f7a');
})();
