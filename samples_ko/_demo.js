/* ====================================================================
   ModuGrid Samples — 데모 공통 하네스 (_demo.js)

   역할
     1) 샘플 데이터 공급        MGDemo.rows(n) / MGDemo.tree()
     2) 로그 출력               MGDemo.log(...)
     3) '소스 보기' 패널 생성   탭① 데모 JS  /  탭② 이 페이지 HTML 전체
     4) 데모 스크립트 실행

   소스 보기 원리
     - 데모 코드는 <script type="text/plain" id="demo-src"> 안에 '실행되지 않은
       원문' 상태로 들어 있다. 탭①은 이 textContent 를 그대로 보여준다.
     - 탭②는 boot() 시점의 document.documentElement.outerHTML 을 캡처한 것이다.
       boot() 는 문서의 마지막 스크립트이므로, 이 시점의 DOM = 파일 원문과 같다.
       (그리드 DOM 이 주입되기 전이라 원본 마크업이 그대로 남아 있다)
     - 캡처가 끝난 뒤에야 소스 패널을 붙이고 데모 코드를 실행한다.
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

/* ══════════ 1. 샘플 데이터 ══════════ */

MGDemo.STATUS = [
  { code: 'A', name: '활성' },
  { code: 'P', name: '대기' },
  { code: 'I', name: '비활성' }
];
MGDemo.ROLES = ['Developer', 'Designer', 'Manager', 'Analyst', 'DevOps', 'QA'];

var NAMES = ['김민준','이서연','박도윤','최지우','정하준','강예은','조시우','윤채원',
             '장건우','임수아','한지호','오나윤','서준서','신유진','권태양','황보라',
             '안도현','송하린','전우진','홍가온'];

/* 결정적(seeded) 난수 — 새로고침해도 같은 데이터가 나오도록 */
function rnd(seed) {
  var s = seed;
  return function () { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

/**
 * MGDemo.rows(n, seed) — 샘플 행 n개
 *   { id, name, status(코드), role, score, progress, salary, joined, memo, images, parentId }
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
      salary: (Math.floor(r() * 60) + 30) * 100000,
      joined: '20' + (14 + Math.floor(r() * 11)) + '-' +
              String(Math.floor(r() * 12) + 1).padStart(2, '0') + '-' +
              String(Math.floor(r() * 28) + 1).padStart(2, '0'),
      memo: '메모 ' + (i + 1),
      images: [],
      parentId: 0
    });
  }
  return out;
};

/**
 * MGDemo.tree() — 트리 모드용 계층 데이터
 *   parentId 로 부모를 가리키고, 자식이 있는 행에는 _hc:true 를 준다.
 */
MGDemo.tree = function () {
  var base = [
    { id: 1,  parentId: 0, _hc: true,  name: '본사',       role: 'Manager',   score: 90 },
    { id: 2,  parentId: 1, _hc: true,  name: '개발본부',   role: 'Manager',   score: 88 },
    { id: 3,  parentId: 2, _hc: false, name: '프론트팀',   role: 'Developer', score: 84 },
    { id: 4,  parentId: 2, _hc: false, name: '백엔드팀',   role: 'Developer', score: 91 },
    { id: 5,  parentId: 2, _hc: false, name: 'DBA팀',      role: 'DevOps',    score: 79 },
    { id: 6,  parentId: 1, _hc: true,  name: '디자인본부', role: 'Manager',   score: 82 },
    { id: 7,  parentId: 6, _hc: false, name: 'UI팀',       role: 'Designer',  score: 86 },
    { id: 8,  parentId: 6, _hc: false, name: 'UX팀',       role: 'Designer',  score: 88 },
    { id: 9,  parentId: 0, _hc: true,  name: '부산지사',   role: 'Manager',   score: 77 },
    { id: 10, parentId: 9, _hc: false, name: '영업1팀',    role: 'Analyst',   score: 73 },
    { id: 11, parentId: 9, _hc: false, name: '영업2팀',    role: 'Analyst',   score: 81 }
  ];
  return base.map(function (b) {
    return {
      id: b.id, parentId: b.parentId, _hc: b._hc,
      name: b.name, role: b.role, score: b.score,
      status: 'A', progress: b.score, salary: 4000000,
      joined: '2020-01-01', memo: '', images: []
    };
  });
};

/* ══════════ 2. 로그 ══════════ */

function logEl() { return document.getElementById('log'); }

/**
 * MGDemo.log(text, cls) — 화면 로그 한 줄 추가 (cls: 'ok'|'wn'|'er')
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

/* ══════════ 3. 소스 하이라이팅 ══════════ */

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

var JS_KW = /\b(const|let|var|function|return|if|else|for|while|do|new|delete|of|in|typeof|instanceof|await|async|true|false|null|undefined|class|this|try|catch|finally|throw|switch|case|break|continue)\b/;

function hiJS(code) {
  var re = new RegExp(
    '(\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*)' +            // 1 주석
    '|(\'(?:\\\\.|[^\'\\\\])*\'|"(?:\\\\.|[^"\\\\])*"|`(?:\\\\.|[^`\\\\])*`)' + // 2 문자열
    '|' + JS_KW.source +                                   // 3 키워드
    '|(\\b\\d+(?:\\.\\d+)?\\b)', 'g');                     // 4 숫자
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

/* ══════════ 4. 소스 패널 ══════════ */

function buildPanel(jsCode, htmlCode) {
  var box = document.createElement('div');
  box.className = 'dm-src';
  box.innerHTML =
    '<div class="dm-srch">' +
      '<button class="dm-srct on" data-t="js">데모 JS</button>' +
      '<button class="dm-srct" data-t="html">HTML 전체</button>' +
      '<span class="dm-srcsp"></span>' +
      '<button class="dm-srcbt" data-a="copy">복사</button>' +
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
    b.textContent = '복사됨'; setTimeout(function () { b.textContent = o; }, 1200);
  };

  var host = document.getElementById('src') || document.body;
  host.appendChild(box);
}

/* ══════════ 5. boot ══════════ */

/**
 * MGDemo.boot() — 페이지 최하단에서 1회 호출.
 *   ① 현재 DOM(=파일 원문) 캡처 → ② 소스 패널 생성 → ③ 데모 코드 실행
 */
MGDemo.boot = function () {
  var srcEl = document.getElementById('demo-src');
  var jsCode = srcEl ? srcEl.textContent.replace(/^\n/, '').replace(/\s+$/, '') : '';

  // ① 캡처 — 반드시 그리드 생성 이전
  var htmlCode = '<!DOCTYPE html>\n' + document.documentElement.outerHTML + '\n';

  // ② 패널
  try { buildPanel(jsCode, htmlCode); } catch (e) { console.error('source panel:', e); }

  // ③ 실행 — 전역 스코프에서 돌도록 실제 <script> 로 주입
  if (jsCode) {
    var s = document.createElement('script');
    s.textContent = jsCode;
    document.body.appendChild(s);
  }
};

/* ══════════ 6. 부가 ══════════ */

/** 다크/라이트 전환 */
MGDemo.theme = function () {
  var d = document.documentElement;
  var on = d.getAttribute('data-theme') === 'dark';
  if (on) d.removeAttribute('data-theme'); else d.setAttribute('data-theme', 'dark');
  return !on;
};

/** 객체를 로그에 보기 좋게 */
MGDemo.dump = function (label, obj) {
  MGDemo.log(label + ' ' + JSON.stringify(obj));
};

})(window);
