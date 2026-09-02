/*! ModuGrid v1.1.0 | (c) 2026 BongJun Park | MIT License | https://github.com/PulseKCode */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.ModuGrid = factory();
}(typeof self !== 'undefined' ? self : this, function () {

/* ====================================================================
   ModuGrid v1.1.0 — Generic Grid Engine · Multi-Instance
   Author    : BongJun Park
   License   : MIT
   Copyright : © 2026 BongJun Park
   Homepage  : https://github.com/PulseKCode
   ────────────────────────────────────────────────────────────────────
   제작자 정보는 ModuGrid.about 으로 조회할 수 있으며 변경할 수 없다.

   Usage:
     const G1 = ModuGrid('#grid1', { cols: COLS_DEF, options: {...} });
     const G2 = ModuGrid('#grid2', { cols: OTHER_COLS });
     G1.setData(rows);

   - 그리드가 컨테이너 안에 자신의 DOM(테이블/푸터/팝업)을 직접 생성
   - 인스턴스 레지스트리: 생성된 HTML의 핸들러는 ModuGrid.get(id).fn() 호출
   - window 전역 오염 없음 (window.G 등록은 앱이 직접: window.G = ModuGrid(...))
   - 앱 소유 컨트롤(툴바 버튼/상태바)은 options.controls 로 ID 매핑 (기본값 유지)
==================================================================== */

function ModuGrid(container, config) {
'use strict';

/* ══════════ 내부 전용 유틸 (외부 파일 의존 제거) ══════════
   이전에는 util.js의 전역 $ 와 CacheAPI.js의 전역 CacheAPI 를 참조했다.
   전역 오염과 로드 순서 의존을 없애기 위해 ModuGrid 클로저 안으로 옮겼다.
   → CacheAPI.js / util.js 를 <script>로 걸 필요가 없다. */

/** document.getElementById 축약 (내부 전용) */
const _$ = id => document.getElementById(id);

/** LRU 캐시 — group + name 2단 키. 그룹별로 maxSize를 넘으면 가장 오래된 항목 제거 */
function _CacheAPI(maxSize = 1000){
  const cache = new Map();   // group → Map(name → value)
  const order = new Map();   // group → name[] (삽입 순서 = LRU 기준)

  function get(group, name){
    const grp = cache.get(group);
    return (grp && grp.has(name)) ? grp.get(name) : null;
  }
  function set(group, name, value){
    if(!cache.has(group)){ cache.set(group, new Map()); order.set(group, []); }
    const gc = cache.get(group), go = order.get(group);
    if(gc.has(name)){ gc.set(name, value); return; }   // 갱신은 순서 유지
    if(go.length >= maxSize) gc.delete(go.shift());    // 초과분 축출
    gc.set(name, value); go.push(name);
  }
  async function fetchOrGet(group, name, fetchFn){
    const hit = get(group, name);
    if(hit !== null) return hit;
    const v = await fetchFn(group, name);
    set(group, name, v);
    return v;
  }
  function clearGroup(group){ cache.delete(group); order.delete(group); }
  function clear(){ cache.clear(); order.clear(); }
  function stats(){ const r={}; cache.forEach((g,k)=>{ r[k]=g.size; }); return r; }

  return { get, set, fetchOrGet, clearGroup, clear, stats };
}

/* ══════════ i18n 메시지 사전 ══════════
   기본은 영어. options.i18n으로 일부/전체 키를 덮어쓸 수 있다(누락 키는 영어 폴백).
   동적 값이 필요한 메시지는 함수로 정의: MSG.imgLimit(5) → "Max 5 images per cell". */
const I18N_EN = {
  copied:        'Copied!',
  copyFailed:    'Copy failed',
  copiedRowJSON: 'Copied row JSON',
  nothingUndo:   'Nothing to undo',
  nothingRedo:   'Nothing to redo',
  autoFit:       key => `Auto-fit: ${key}`,
  imgLimit:      n => `Max ${n} images per cell`,
  imgLimitHit:   n => `Already at max ${n}`,
  loadingData:   'Loading…',
  loadingList:   'Loading list…',
  colVisible:    'Columns',
  editOn:        'EditMode ON — double-click to edit',
  editOff:       'EditMode OFF — read only',
  invalidValue:  'Invalid value',
  searchPh:      'Search…',
  del:           'Delete',
  noMatch:       'No match',
  selectAll:     'Select all',
  sortTip:       'Sort',
  mDetail:       'Row Detail',
  mEdit:         'Edit Row',
  mAdd:          'Add Row',
  save:          'Save',
  cancel:        'Cancel',
  close:         'Close',
  noPermInsert:  'Insert not allowed',
  noPermDelete:  'Delete not allowed',
  imgTooBig:     kb => `Max ${kb}KB per image`,
  imgUpFail:     n  => `Upload failed: ${n}`,
  pageAll:       'All',
  stNew:         'New',
  stUpd:         'Modified',
  stDel:         'Pending delete',
};
/* 그리드 인스턴스별 메시지: 기본 사전 + 사용자 오버라이드 병합 (함수/문자열 모두 허용) */
let MSG = { ...I18N_EN };
function _initI18n(over){ MSG = { ...I18N_EN, ...(over && typeof over==='object' ? over : {}) }; }
/* 문자열/함수 겸용 조회 — msg('copied') 또는 msg('autoFit', key) */
function msg(k, ...args){
  const v = MSG[k];
  return typeof v==='function' ? v(...args) : (v ?? I18N_EN[k] ?? '');
}



/* ══════════════════════════════════════════════════
   ⓪ 인스턴스 등록 + 컨테이너 해석 + DOM 생성
══════════════════════════════════════════════════ */
ModuGrid._nextId = (ModuGrid._nextId || 0) + 1;
ModuGrid._reg    = ModuGrid._reg    || {};
const GID  = ModuGrid._nextId;

const root = typeof container === 'string'
  ? document.querySelector(container)
  : container;
if (!root) throw new Error(`ModuGrid: container not found: ${container}`);

root.classList.add('jsg-root');
try {
  root.setAttribute('data-modugrid', ModuGrid.about.version);
  root.setAttribute('data-author',   ModuGrid.about.author);
} catch(e){}
root.innerHTML = `
  <!-- Sort bar -->
  <div class="msb jsg-msb">
    <span style="font-weight:700;text-transform:uppercase;letter-spacing:.5px;font-size:10px">Sort:</span>
    <div class="jsg-mschips" style="display:flex;gap:4px;flex-wrap:wrap"></div>
    <button type="button" class="tb" data-act="clearsorts" style="font-size:9px;padding:1px 6px">Clear</button>
  </div>
  <!-- Split-pane table -->
  <div class="gsc-wrap striped jsg-wrap">
    <div class="gsc-left jsg-left">
      <div class="jsg-left-hdr">
        <table class="gt jsg-gt-lh"><thead class="jsg-ghead-left"></thead></table>
      </div>
      <div class="jsg-left-body">
        <table class="gt jsg-gt-lb"><tbody class="jsg-gbody-left"></tbody><tfoot class="jsg-gfoot-left"></tfoot></table>
      </div>
    </div>
    <div class="jsg-gsc">
      <table class="gt jsg-gt">
        <thead class="jsg-ghead"></thead>
        <tbody class="jsg-gbody"></tbody><tfoot class="jsg-gfoot"></tfoot>
      </table>
    </div>
    <!-- 항상 focus되는 숨은 입력기 (IME 조합 대상) — div 0x0, input z-index -4000 -->
    <div class="jsg-ime-holder"><input type="text" class="jsg-ime-input" autocomplete="off"></div>
  </div>
  <!-- Footer -->
  <div class="jfoot jsg-jfoot">
    <div class="fi">
      <span>Rows <strong class="jsg-pf">1</strong>&ndash;<strong class="jsg-pt">10</strong> of <strong class="jsg-ptotal">0</strong></span>
      <span class="jsg-selinfo" style="display:none">&middot; <strong class="jsg-selcnt">0</strong> selected</span>
      <span class="jsg-chkinfo" style="display:none;margin-left:4px">&middot; <strong class="jsg-chkcnt">0</strong> checked</span>
    </div>
    <!-- 페이지 번호 → Per page 순서 (좌: Rows 정보 / 중: 페이지 / 우: Per page) -->
    <div class="pgn jsg-pgn"></div>
    <div class="fps">
      Per page:
      <select class="jsg-psz" data-act="pagesize">
        <option value="10">10</option><option value="25">25</option>
        <option value="50">50</option><option value="100" selected>100</option>
        <option value="0">${msg('pageAll')}</option>
      </select>
    </div>
  </div>
  <!-- 행 모달 (상세 / 편집 / 추가) -->
  <div class="jsg-mov">
    <div class="jsg-mbox" role="dialog" aria-modal="true">
      <div class="jsg-mhd"><strong class="jsg-mtitle"></strong>
        <span class="jsg-mx" data-act="mclose">&times;</span></div>
      <div class="jsg-mbd"></div>
      <div class="jsg-mft">
        <button type="button" class="jsg-mbtn" data-act="mclose"></button>
        <button type="button" class="jsg-mbtn ok" data-act="msave"></button>
      </div>
    </div>
  </div>
  <!-- 알림 토스트 (그리드 중앙) -->
  <div class="jsg-toast"></div>
  <!-- Context menu -->
  <div class="ctx jsg-ctx">
    <div class="ctxi" data-act="ctxdetail">&#128269; Row Detail</div>
    <div class="ctxi" data-act="ctxmodal">&#128221; Edit Modal</div>
    <div class="ctxi" data-act="ctxcopy">&#128203; Copy Row(Json)</div>
    <div class="ctxi" data-act="ctxcopyxl">&#128202; Copy Row(Excel)</div>
    <div class="ctxsep"></div>
    <div class="ctxi" data-act="ctxinsa">&#11014; Insert Above</div>
    <div class="ctxi" data-act="ctxinsb">&#11015; Insert Below</div>
    <div class="ctxsep"></div>
    <div class="ctxi jsg-ctx-tree" style="display:none" data-act="ctxtree">&#9654; Expand/Collapse</div>
    <div class="ctxi dr" data-act="ctxdel">&#128465; Delete</div>
  </div>
  <!-- Column filter popup -->
  <div class="cfp jsg-cfp">
    <div class="cfpt jsg-cfpt">Filter</div>
    <div class="jsg-cfpb"></div>
    <div class="cfpft">
      <button type="button" class="cfpbt" data-act="cfclear">Clear</button>
      <button type="button" class="cfpbt ok" data-act="cfapply">Apply</button>
    </div>
  </div>
  <!-- Autocomplete dropdown -->
  <div class="acdrop jsg-acdrop"></div>
  <!-- Image preview -->
  <div class="imgprev jsg-imgprev"><img class="jsg-imgprevimg" src="" alt=""/></div>
  <!-- Validation error tip -->
  <div class="errtip jsg-errtip"></div>
  <!-- Column drag ghost / drop indicator -->
  <div class="colghost jsg-colghost"></div>
  <div class="dropind jsg-dropind"></div>
  <!-- Column show/hide panel -->
  <div class="colpanel jsg-colpanel"></div>
  <!-- Server loading -->
  <div class="loading jsg-loading">⏳ ${msg('loadingData')}</div>
`;

const _q = sel => root.querySelector(sel);
const EL = {
  wrap:      _q('.jsg-wrap'),
  left:      _q('.jsg-left'),
  leftHdr:   _q('.jsg-left-hdr'),
  leftBody:  _q('.jsg-left-body'),
  gsc:       _q('.jsg-gsc'),
  gtLh:      _q('.jsg-gt-lh'),
  gtLb:      _q('.jsg-gt-lb'),
  gt:        _q('.jsg-gt'),
  gheadLeft: _q('.jsg-ghead-left'),
  gbodyLeft: _q('.jsg-gbody-left'),
  ghead:     _q('.jsg-ghead'),
  gbody:     _q('.jsg-gbody'),
  reEditor:  null,   // 재사용 단일 에디터(text/number) — IME 안정성 위해 파괴 안 함
  reArea:    null,   // 재사용 단일 textarea
  imeHolder: _q('.jsg-ime-holder'),   // 항상 focus되는 숨은 입력기 div
  imeInput:  _q('.jsg-ime-input'),    // 그 안의 input (IME 조합 대상)
  msb:       _q('.jsg-msb'),
  mschips:   _q('.jsg-mschips'),
  pf:        _q('.jsg-pf'),
  pt:        _q('.jsg-pt'),
  ptotal:    _q('.jsg-ptotal'),
  selinfo:   _q('.jsg-selinfo'),
  selcnt:    _q('.jsg-selcnt'),
  chkinfo:   _q('.jsg-chkinfo'),
  chkcnt:    _q('.jsg-chkcnt'),
  psz:       _q('.jsg-psz'),
  toast:     _q('.jsg-toast'),
  mov:       _q('.jsg-mov'), mbox: _q('.jsg-mbox'),
  mtitle:    _q('.jsg-mtitle'), mbd: _q('.jsg-mbd'), mft: _q('.jsg-mft'),
  jfoot:     _q('.jsg-jfoot'),   // 하단 상태바 전체
  fi:        _q('.jfoot .fi'),   // Rows 정보
  fps:       _q('.jfoot .fps'),  // Per page
  pgn:       _q('.jsg-pgn'),     // 페이지 목록
  pgn:       _q('.jsg-pgn'),
  ctx:       _q('.jsg-ctx'),
  ctxTree:   _q('.jsg-ctx-tree'),
  cfp:       _q('.jsg-cfp'),
  cfpt:      _q('.jsg-cfpt'),
  cfpb:      _q('.jsg-cfpb'),
  acdrop:    _q('.jsg-acdrop'),
  imgprev:   _q('.jsg-imgprev'),
  imgprevimg:_q('.jsg-imgprevimg'),
  errtip:    _q('.jsg-errtip'),
  colghost:  _q('.jsg-colghost'),
  dropind:   _q('.jsg-dropind'),
  colpanel:  _q('.jsg-colpanel'),
  loading:   _q('.jsg-loading'),
  gfoot:     _q('.jsg-gfoot'),
  gfootLeft: _q('.jsg-gfoot-left'),
};

/* ── 앱 소유 컨트롤 매핑 (options.controls 로 재정의) ── */
let _ctlUser = {};   // 앱이 options.controls 로 직접 지정한 키 (기본값과 구분)
let _controls = {
  btnDirty:  'btn-dirty', btnFoot:'btn-foot', btnFilter:'btn-filter',
  btnRn:'btn-rn', btnCb:'btn-cb', btnStripe:'btn-stripe', btnFreeze:'btn-freeze',
  btnVs:'btn-vs', btnGrp:'btn-grp', btnTree:'btn-tree', btnEdit:'btn-edit',
  btnMs:'btn-ms', btnSelRow:'btn-sel-row', btnSelCell:'btn-sel-cell',
  btnUndo:'btn-undo', btnRedo:'btn-redo', udZ:'ud-z', udY:'ud-y',
  stSrt:'stSrt', stSrch:'stSrch', stFlt:'stFlt', stGrp:'stGrp',
  stTree:'stTree', stEdit:'stEdit', stCell:'stCell', selModeInfo:'selModeInfo',
  toast:'toast', moverlay:'moverlay', mtitle:'mtitle',
};
function _ctl(key){
  const id = _controls[key];
  return id ? document.getElementById(id) : null;
}
/* 널 안전 setter — 앱이 해당 컨트롤을 두지 않아도 크래시 없음 */
function _ctlTxt(key, text){ const e=_ctl(key); if(e) e.textContent=text; }
function _ctlCls(key, cls, on){ const e=_ctl(key); if(e) e.classList.toggle(cls, on); }

/* ══════════════════════════════════════════════════
   ① 내부 유틸리티 (private — 클로저 전용)
══════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);

let _toastTm = null;
/* 알림 토스트 — 그리드 중앙에 표시한다(브라우저 하단이 아니라).
   여러 그리드가 있어도 각자 자기 영역에 뜬다.
   options.controls.toast 로 앱 요소를 명시하면 그쪽을 쓴다(하위 호환). */
function toast(msg, d = 1800) {
  const el = _toastEl(); if (!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(_toastTm);
  _toastTm = setTimeout(() => el.classList.remove('show'), d);
}
function _toastEl(){
  if (_ctlUser.toast) { const e = _ctl('toast'); if (e) return e; }   // 앱이 지정한 요소
  return EL.toast;                                                   // 그리드 내장
}

const ini = n => {
  const p = (n || '').trim().split(/\s+/);
  return (p.length >= 2 ? p[0][0] + p[1][0] : (n||'').slice(0, 2)).toUpperCase();
};
const fmtSal = v => '₩' + (+v).toLocaleString('ko-KR');
const pgCellFlat = v =>
  `<div class="cpg"><div class="pgtr"><div class="pgfl-flat" style="width:${v}%"></div></div><span class="pglb">${v}%</span></div>`;

/* ══════════════════════════════════════════════════
   ② 내부 컬럼/너비 상태 (initGrid에서 설정)
══════════════════════════════════════════════════ */
let COLS = [];
const CW  = {};

/* ── State ── */
const S = {
  data: [], filtered: [],
  // validate 실패 셀: 'rowId\u0000colKey' → 오류 메시지.
  //   값은 되돌리지 않고 그대로 두되 셀을 붉게 표시한다.
  invalid: new Map(),
  _idSeq: 0,            // id 자동 채번 시퀀스 (단조 증가, 재사용 없음)
  search: '', sorts: [], multiSort: false,
  cfilters: {},
  page: 1, ps: 100,
  // Selection
  selMode: 'row',       // 'row' | 'cell'
  rowSel: new Set(),    // row ids (클릭 선택 — 하이라이트)
  rowCheck: new Set(),  // row ids (체크박스 — 별도 상태)
  focusRI: -1, focusCI: -1,  // cell mode focus (filtered row index, col index)
  rangeR1:-1,rangeC1:-1,rangeR2:-1,rangeC2:-1,
  ranging: false,
  rowAnchor: -1, rowRanging: false,   // Excel식 행 범위 선택 (앵커/드래그중)
  hiddenCols: new Set(),              // 임의 숨김 컬럼 키
  _supSort: false,                    // 컬럼 드래그 직후 클릭 정렬 억제
  _dropBefore: null,                  // 드래그 드롭 대상(이 키 앞에 삽입, null=맨 뒤)
  serverMode: false, svrTotal: 0,     // 서버사이드 데이터 모드 (dataSource 옵션)
  _ds: null,                          // dataSource 콜백 보관
  _fltSrc: null, _cfSeq: 0,           // 서버 필터 목록(filterSource) 콜백 / 레이스 시퀀스
  svrAgg: null,                       // 서버 응답 집계값 {colKey: value}
  _kbRange: false,                    // Shift+화살표 키보드 범위 확장 중
  _rowDropBefore: null,               // 행 드래그 드롭 대상 id (null=맨 뒤)
  _lastQuery: '', _reqSeq: 0, _fetchTm: null, _acDebTm: null,
  _imeRearmPending: null,   // row 모드 클릭: mouseup 후 숨은 입력기 재장착 예약
  rowEditable: null,        // options.rowEditable(row) — 행 단위 편집 잠금
  ctxMenu: true,            // options.contextMenu — 우클릭 메뉴 표시 설정
  kbOnLoad: true,           // options.keyboardOnLoad — 로드 직후(클릭 전) 키보드 활성 여부
  errMsgMs: 3000,           // options.errorMsgDuration — 오류 말풍선 자동 소멸(ms)
  _errTipTm: null,          // 그 타이머 핸들
  // Features
  showRN: true, showCB: true, showST: true, striped: true,
  cbHeader: 'check',    // _cb 헤더: 'check'=전체선택 체크박스 / 'none'=빈칸 / 그 외 문자열=수기 라벨
  headerWrap: false,    // 헤더 라벨 자동 줄바꿈
  textCase: null,       // 'upper' | 'lower' — 전 컬럼 기본값
  placeholderMode: 'all',   // 'all' | 'first' | 'none'
  showFilter: true,         // 헤더 필터 아이콘 표시 (컬럼별로는 col.noFilter)
  // 편집모드 안에서의 세부 권한 (editMode 가 켜져 있어야 의미가 있다)
  canInsert: true, canUpdate: true, canDelete: true,
  /* 이미지 전송 방식 — 'none'(기본) | 'upload' | 'multipart' | 'base64' */
  imageMode: 'none', imageMaxSize: 0, imageLimit: 5,
  theme: 'light', _themeVars: [],
  font: { header:{}, body:{} },   // 폰트 설정 (빈 값이면 CSS 기본값)
  // 하단 상태바 표시 (showFoot=false 면 통째로 숨김)
  showFoot: true, showRows: true, showPager: true, showPageSize: true,
  softDelete: true,     // 삭제 시 행을 지우지 않고 '삭제 예정'으로 표시
  groupBy: null, groupColl: new Set(),
  freezeOn: false,
  vs: false,
  treeOn: false, treeExp: new Set(),
  editMode: false,
  editCell: null,         // {rowId, colKey, td}
  detailRows: new Set(),
  rowH: {},               // B. {rowId: px}
  defH: 25,
  modalMode:'add', modalRowId:null,
  _flatData: [],   // setData 시 원본 flat 데이터 보관
  _treeData: null, // 트리 모드 데이터 캐시
};

/* ── Undo / Redo (private — S에 직접 접근) ── */
const H = { stack: [], pos: -1, max: 80 };

function snap(lbl='') {
  const s = JSON.stringify(S.data);
  if (H.pos < H.stack.length-1) H.stack.splice(H.pos+1);
  H.stack.push({s, lbl});
  if (H.stack.length > H.max) H.stack.shift();
  H.pos = H.stack.length-1;
  updUD();
}
function undo() {
  if (H.pos <= 0) { toast(msg('nothingUndo')); return; }
  H.pos--;
  S.data = JSON.parse(H.stack[H.pos].s);
  S.rowSel.clear(); S.rowCheck.clear(); S.page=1;
  _touchData();            // 렌더 전에 diff 캐시 무효화 (변경표시가 즉시 반영되도록)
  applyFilters();
  _emit('dataChange', { type:'undo', label: H.stack[H.pos+1]?.lbl ?? '' });
  toast('↩ ' + (H.stack[H.pos+1]?.lbl ?? ''));
  updUD();
}
function redo() {
  if (H.pos >= H.stack.length-1) { toast(msg('nothingRedo')); return; }
  H.pos++;
  S.data = JSON.parse(H.stack[H.pos].s);
  S.rowSel.clear(); S.rowCheck.clear(); S.page=1;
  _touchData();
  applyFilters();
  _emit('dataChange', { type:'redo', label: H.stack[H.pos].lbl ?? '' });
  toast('↪ ' + (H.stack[H.pos].lbl ?? ''));
  updUD();
}
function updUD() {
  const z=H.pos, y=H.stack.length-1-H.pos;
  const uz=_ctl('udZ'), uy=_ctl('udY'), bu=_ctl('btnUndo'), br=_ctl('btnRedo');
  if(uz){ uz.textContent=`↩ ${z}`; uz.className='ud'+(z>0?' has':''); }
  if(uy){ uy.textContent=`↪ ${y}`; uy.className='ud'+(y>0?' has':''); }
  if(bu) bu.style.opacity=z>0?'1':'.4';
  if(br) br.style.opacity=y>0?'1':'.4';
}

/* ── Helpers ──
   _$ · ini · fmtSal · pgCellFlat · toast · _CacheAPI 는 모두 이 클로저 안에 있다.
   (util.js / CacheAPI.js 외부 의존 없음) */
function getH(rowId){return S.rowH[rowId]||S.defH;}

/* ── Freeze: compute left offsets ──
   BOTH th and td must use same left values.
   Frozen cols: _cb, _rn, and name (if freezeOn) ── */
/* 고정(좌측 패널) 판정 — 시스템 컬럼은 항상, col.freeze 컬럼은 Freeze ON일 때
   여러 컬럼에 freeze:1 지정 가능 (COLS 순서대로 좌측 패널에 배치) */
/* HTML 이스케이프 — 데이터 값을 innerHTML에 넣기 전 특수문자 무력화 (XSS/속성 파손 방지).
   & 를 가장 먼저 치환(이중 인코딩 방지). col.render/커스텀 agg 반환값은 의도적 HTML이라 미적용. */
function esc(v){
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function isFz(key){
  if(_isSysCol(key)) return true;
  if(!S.freezeOn) return false;
  const c=COLS.find(x=>x.key===key);
  return !!(c&&c.freeze);
}
function fzLefts(){
  const L={};
  let pos=0;
  COLS.forEach(c=>{
    if(isFz(c.key)) L[c.key]=pos;
    const w=_sysHidden(c)?0:CW[c.key];
    pos+=w;
  });
  return L;
}
// Last frozen col index (gets shadow)
function lastFzKey(){
  const fkeys=COLS.filter(c=>isFz(c.key)).map(c=>c.key);
  return fkeys[fkeys.length-1];
}

/* ── Column Resize (Step 3) ── */
function initCR(e,key){
  e.stopPropagation();e.preventDefault();
  const sx=e.clientX, sw=CW[key];
  e.target.classList.add('rdr');
  document.body.style.cursor='col-resize';document.body.style.userSelect='none';
  let _rafPend=false;
  const mv=ev=>{
    CW[key]=Math.max(44,sw+(ev.clientX-sx));
    EL.wrap.querySelectorAll(`[data-c="${key}"]`).forEach(el=>el.style.width=CW[key]+'px');
    /* 폭이 바뀌면 헤더 라벨 줄바꿈(hdr-wrap)이 달라져 우측 헤더 높이가 변한다.
       좌측 freeze 헤더는 그대로라 그룹 헤더(2행)에서 좌우 높이가 어긋난다.
       드래그 중에도 맞춰준다 — rAF 로 묶어 mousemove 마다 리플로우하지 않게 한다. */
    if(!_rafPend){ _rafPend=true; requestAnimationFrame(()=>{ _rafPend=false; _syncHeaderHeights(); }); }
  };
  const up=()=>{
    document.body.style.cursor='';document.body.style.userSelect='';
    e.target.classList.remove('rdr');
    document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);
    // 폭이 실제로 바뀐 경우에만 재동기화.
    //   무조건 renderHeader()를 부르면 mousedown~mouseup 사이에 핸들 DOM이 교체되어
    //   경계 더블클릭(autoFit)이 성립하지 않는다.
    if(CW[key]!==sw){
      renderHeader();      // 헤더 innerHTML 교체 → inline height 가 전부 날아간다
      syncRowHeights();    // 그래서 좌우 높이를 다시 맞춘다 (이게 빠져 있었다)
    }
  };
  document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up);
}
/* 컬럼 폭 자동 맞춤 — 헤더 라벨과 각 셀의 '표시값' 길이 중 최대치 기준.
   Math.max(...arr)는 수만 건에서 스택을 넘기므로 순회로 계산한다. */
function autoFit(key){
  const col=COLS.find(c=>c.key===key);
  let mx=String((col&&col.label)||key).length+2;
  for(const r of S.filtered){
    const t=String(_optDisp(col,r[key],r)??'');   // 코드가 아니라 화면에 보이는 값 기준
    if(t.length>mx) mx=t.length;
  }
  CW[key]=Math.min(320,Math.max(50,mx*7+20));
  renderGrid();toast(msg('autoFit', key));
}

/* ── Row Resize (B) ── */
function initRR(e,rowId){
  e.stopPropagation();e.preventDefault();
  const sy=e.clientY,sh=getH(rowId);
  document.body.style.cursor='row-resize';document.body.style.userSelect='none';
  const mv=ev=>{
    const nh=Math.max(24,sh+(ev.clientY-sy));
    S.rowH[rowId]=nh;
    // 분리 패널 양쪽 테이블의 tr 모두 업데이트
    EL.wrap.querySelectorAll(`tr[data-id="${rowId}"]`).forEach(tr=>{
      tr.style.height=nh+'px';
      tr.querySelectorAll('td').forEach(td=>td.style.height=nh+'px');
    });
  };
  const up=()=>{document.body.style.cursor='';document.body.style.userSelect='';document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);};
  document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up);
}

/* ── Sort (Step 5) ── */
/* 헤더 클릭 정렬 — 3단계 순환: 오름차순 → 내림차순 → 정렬 해제
   멀티정렬에서도 동일하며, 3번째 클릭에서 해당 컬럼만 목록에서 빠진다. */
function doSort(key,e){
  if(S._supSort){ S._supSort=false; return; }   // 컬럼 드래그 직후 클릭은 정렬 아님
  const col=COLS.find(c=>c.key===key);if(!col||col.noSort) return;
  if(S.multiSort){
    const i=S.sorts.findIndex(s=>s.col===key);
    if(i<0)                       S.sorts.push({col:key,dir:'asc'});   // 없음 → 오름
    else if(S.sorts[i].dir==='asc') S.sorts[i].dir='desc';             // 오름 → 내림
    else                            S.sorts.splice(i,1);               // 내림 → 해제
  } else {
    const cur=(S.sorts.length===1&&S.sorts[0].col===key)?S.sorts[0]:null;
    if(!cur)                    S.sorts=[{col:key,dir:'asc'}];
    else if(cur.dir==='asc')    S.sorts=[{col:key,dir:'desc'}];
    else                        S.sorts=[];                            // 내림 → 해제
  }
  applyFilters(); renderSortBar();
  _ctlTxt('stSrt', 'Sort: '+(S.sorts.map(s=>s.col+(s.dir==='asc'?'↑':'↓')).join(', ')||'none'));
}
function toggleMultiSort(){S.multiSort=!S.multiSort;_ctlCls('btnMs', 'a', S.multiSort);if(!S.multiSort&&S.sorts.length>1){S.sorts=S.sorts.slice(0,1);applyFilters();}renderSortBar();}
function renderSortBar(){const b=EL.msb;if(!S.multiSort||!S.sorts.length){b.classList.remove('vis');return;}b.classList.add('vis');EL.mschips.innerHTML=S.sorts.map((s,i)=>`<div class="msc"><span class="msbdg">${i+1}</span>${s.col} ${s.dir==='asc'?'↑':'↓'}<span class="msx" data-act="rmsort" data-c="${i}">✕</span></div>`).join('');}
function rmSort(i){S.sorts.splice(i,1);applyFilters();renderSortBar();}
function clearSorts(){S.sorts=[];applyFilters();renderSortBar();_ctlTxt('stSrt', 'Sort: none');}

/* ── Column Filter (Step 6) ── */
let cfpCol=null;
function openCF(e,key){
  e.stopPropagation();
  if(!S.showFilter) return;
  const col=COLS.find(c=>c.key===key);if(!col||col.noFilter) return;
  cfpCol=key;EL.cfpt.textContent=`Filter: ${col.label}`;
  const isNum=['number','currency','progress'].includes(col.type);
  const ex=S.cfilters[key];
  if(isNum){const v=S.data.map(r=>+r[key]);const mn=Math.min(...v),mx=Math.max(...v);EL.cfpb.innerHTML=`<div class="cfprng"><input id="cfmn" type="number" value="${ex?.min??mn}"/><span>–</span><input id="cfmx" type="number" value="${ex?.max??mx}"/></div><div style="font-size:9px;color:var(--tx2)">Range: ${mn}–${mx}</div>`;}
  else{
    const mkList=vals=>{
      const ck=ex?.values??new Set(vals);
      // 체크박스 value = 코드(필터 조건), 라벨 = 표시명. 정렬도 표시명 기준.
      const lb=v=>String(_optLabel(col,_valCode(v))??v);
      const sorted=[...vals].sort((a,b)=>lb(a).localeCompare(lb(b)));
      const allOn=sorted.length>0 && sorted.every(v=>ck.has(v));
      const someOn=!allOn && sorted.some(v=>ck.has(v));
      return `<input class="cfpin" id="cfsr" placeholder="${msg('searchPh')}" data-act="cfsearch"/>`
        + `<label class="cfpci cfpall"><input type="checkbox" id="cfall" data-act="cfall"`
        + ` ${allOn?'checked':''} ${someOn?'data-indet="1"':''}/>`
        + `<b>${esc(msg('selectAll'))}</b><span class="cfpcnt" id="cfcnt"></span></label>`
        + `<div class="cfpcl" id="cflist">${sorted.map(v=>`<label class="cfpci" data-val="${esc(lb(v)+' '+v)}"><input type="checkbox" value="${esc(v)}" ${ck.has(v)?'checked':''}/>${esc(lb(v))}</label>`).join('')}</div>`;
    };
    const pageVals=[...new Set(S.data.map(r=>String(_valCode(r[key])??'')))].sort();
    /* 서버 모드 + filterSource: 현재 페이지 값 대신 서버 distinct 목록
       — 로딩 표시 → 교체, 실패 시 페이지 값 폴백, 늦게 온 응답은 폐기 */
    if(S.serverMode && typeof S._fltSrc==='function'){
      const seq=++S._cfSeq;
      /* 캐시 히트 → 서버 왕복 없이 즉시 표시 (Oracle distinct 반복 호출 방지).
         키에 검색/타 필터 조건을 포함해 연쇄 필터(cascading) 결과도 정확히 구분 */
      const req=_buildReq();
      const ck=JSON.stringify({f:req.filters, s:req.search});
      const hit=_fltCache.get('flt:'+key, ck);
      if(hit){ EL.cfpb.innerHTML=mkList(hit); }
      else {
      EL.cfpb.innerHTML=`<div class="cf-loading">⏳ ${msg('loadingList')}</div>`;
      Promise.resolve(S._fltSrc(key, req)).then(list=>{
        if(seq!==S._cfSeq||cfpCol!==key) return;
        const vals=Array.isArray(list)?[...new Set(list.map(v=>String(v??'')))].sort():pageVals;
        _fltCache.set('flt:'+key, ck, vals);
        EL.cfpb.innerHTML=mkList(vals);
      }).catch(err=>{
        if(seq!==S._cfSeq||cfpCol!==key) return;
        console.error('ModuGrid: filterSource failed.', err);
        EL.cfpb.innerHTML=mkList(pageVals);
      });
      }
    } else {
      EL.cfpb.innerHTML=mkList(pageVals);
    }
  }
  const rect=e.target.closest('th').getBoundingClientRect();
  EL.cfp.style.left=Math.min(rect.left,window.innerWidth-215)+'px';EL.cfp.style.top=(rect.bottom+3)+'px';EL.cfp.classList.add('vis');
  _cfSyncAll();   // 전체선택 상태(전체/부분/해제) + 개수 초기 반영 — indeterminate는 속성으로 못 준다
}
/* 팝업 내 검색 — 전체선택 줄(.cfpall)은 항상 보이게 두고 목록 항목만 필터 */
function filterCFL(q){
  const s=String(q||'').toLowerCase();
  EL.cfpb.querySelectorAll('#cflist .cfpci').forEach(el=>{
    el.style.display=el.dataset.val.toLowerCase().includes(s)?'':'none';
  });
  _cfSyncAll();
}

/* 현재 '보이는' 항목만 대상으로 한다 (검색 중이면 검색 결과에만 적용) */
function _cfVisible(){
  return [...EL.cfpb.querySelectorAll('#cflist .cfpci')].filter(el=>el.style.display!=='none');
}
/* 전체 선택 체크박스 상태(전체/부분/해제) + 개수 표시 갱신 */
function _cfSyncAll(){
  const all=EL.cfpb.querySelector('#cfall'); if(!all) return;
  const vis=_cfVisible();
  const on=vis.filter(el=>el.querySelector('input').checked).length;
  all.checked      = vis.length>0 && on===vis.length;
  all.indeterminate= on>0 && on<vis.length;
  const cnt=EL.cfpb.querySelector('#cfcnt');
  if(cnt) cnt.textContent = `${on} / ${vis.length}`;
}
/* 전체 선택 토글 — 보이는 항목 전체를 체크박스 상태에 맞춘다 */
function toggleCFAll(on){
  _cfVisible().forEach(el=>{ el.querySelector('input').checked=!!on; });
  _cfSyncAll();
}
function applyCF(){const col=COLS.find(c=>c.key===cfpCol);const isNum=['number','currency','progress'].includes(col.type);if(isNum)S.cfilters[cfpCol]={type:'range',min:+EL.cfpb.querySelector('#cfmn').value,max:+EL.cfpb.querySelector('#cfmx').value};else{const ck=new Set([...EL.cfpb.querySelectorAll('.cfpci input:checked')].map(i=>i.value));S.cfilters[cfpCol]={type:'list',values:ck};}EL.cfp.classList.remove('vis');S.page=1;applyFilters();_ctlTxt('stFlt', 'Filter: '+Object.keys(S.cfilters).join(', '));}
function clearCF(){delete S.cfilters[cfpCol];EL.cfp.classList.remove('vis');S.page=1;applyFilters();_ctlTxt('stFlt', Object.keys(S.cfilters).length?'Filter: '+Object.keys(S.cfilters).join(', '):'Filter: none');}

/* ── Group (Step 7) ── */
function toggleGroup(){S.groupBy=S.groupBy?null:'role';S.groupColl.clear();_ctlCls('btnGrp', 'on', !!S.groupBy);_ctlTxt('stGrp', S.groupBy?`Group: ${S.groupBy}`:'Group: off');S.page=1;applyFilters();}
function togGrp(k){if(S.groupColl.has(k))S.groupColl.delete(k);else S.groupColl.add(k);renderGrid();}

/* ── Virtual Scroll (Step 8) ── */
function toggleVS(){
  S.vs=!S.vs;
  if(_ctl('btnVs')) _ctlCls('btnVs', 'on', S.vs);
  if(S.vs){
    // VS ON: 실제 첫 행 높이 측정 → defH 보정 (spacer 정확도 향상)
    S.ps=PS_ALL;             // 전체 보기 (VS는 페이징을 쓰지 않는다)
    const psEl=EL.psz; if(psEl) psEl.disabled=true;
    S.page=1; applyFilters(); syncScroll();
    requestAnimationFrame(()=>{
      const firstTr=EL.gbody.querySelector(':scope > tr[data-id]');
      if(firstTr && firstTr.offsetHeight>0) S.defH=firstTr.offsetHeight;
    });
  } else {
    // VS OFF: 페이지네이션 복원
    const psEl=EL.psz;
    S.ps=psEl ? (+psEl.value||PS_ALL) : 100;
    if(psEl) psEl.disabled=false;
    S.page=1; applyFilters(); syncScroll();
  }
}
function vsRender(){
  const sc=EL.gsc,dh=S.defH,v=sc.clientHeight,tot=S.filtered.length,st=sc.scrollTop;
  const si=Math.max(0,Math.floor(st/dh)-6),ei=Math.min(tot,si+Math.ceil(v/dh)+16);
  const tp=si*dh,bp=Math.max(0,(tot-ei)*dh);
  const fzC=getFzCols(),scC=getScCols();
  const spacerFz=n=>`<tr style="height:${n}px"><td colspan="${fzC.length}" style="padding:0;border:none"></td></tr>`;
  const spacerSc=n=>`<tr style="height:${n}px"><td colspan="${scC.length}" style="padding:0;border:none"></td></tr>`;
  let lh=spacerFz(tp),rh=spacerSc(tp);
  for(let i=si;i<ei;i++){
    const{left,right}=buildRowSplit(S.filtered[i],i+1);
    lh+=left; rh+=right;
  }
  lh+=spacerFz(bp); rh+=spacerSc(bp);
  EL.gbodyLeft.innerHTML=lh;
  EL.gbody.innerHTML=rh;
  EL.pf.textContent=si+1;EL.pt.textContent=ei;EL.ptotal.textContent=tot;
  // VS 모드에서 syncRowHeights 생략:
  // spacer 높이가 si×defH 기반이므로 행 높이가 균일해야 함
  _syncVSHeader();  // 헤더 높이만 맞춤 (바디 행 높이는 건드리지 않음)
  renderAgg();
}

/* ── Tree (Step 12) ── */
function toggleTree(){
  S.treeOn=!S.treeOn;
  if(_ctl('btnTree'))_ctlCls('btnTree', 'on', S.treeOn);
  _ctlTxt('stTree', S.treeOn?'Tree: ON':'Tree: off');
  if(S.treeOn){
    // 외부 buildTree() 함수가 있으면 사용, 없으면 내장 빌더 사용
    if(!S._treeData){
      S._treeData = typeof buildTree==='function' ? buildTree() : _buildTreeDefault(S._flatData);
    }
    S.data=S._treeData; S.treeExp=new Set();
  } else {
    S.data=[...S._flatData];  // BASE 대신 _flatData 사용
  }
  S.rowSel.clear();S.groupBy=null;S.page=1;applyFilters();
}

/** 내장 기본 트리 빌더 (parentId 기반) — buildTree()가 없을 때 사용 */
function _buildTreeDefault(flatData){
  return flatData.map((r,i)=>({...r, _d: r._d||0, _hc: !!r._hc}));
}
function togTree(id){if(S.treeExp.has(id))S.treeExp.delete(id);else S.treeExp.add(id);renderGrid();}

/* ── Filter + Sort Pipeline ── */
/* ══════════ 서버사이드 데이터 모드 ══════════
   options.dataSource(req) => Promise<{rows, total}>
   req = { page, pageSize, sorts:[{col,dir}], filters:{k:{type,...}}, search }
   filters의 list values는 배열로 직렬화되어 전달됨 */
/* ══════════ Ctrl+V 붙여넣기 (Excel TSV 호환) ══════════
   포커스 셀(또는 cell 모드 범위의 좌상단)부터 오른쪽·아래로 채움.
   - 숫자 에디터 컬럼은 숫자 변환 (숫자가 아니면 원문 유지 → validate로 걸러짐)
   - validate 실패 / editor:false / images / 시스템 컬럼 / 범위 초과 → 해당 셀 skip
   - snap 1회 → Ctrl+Z 한 번으로 전체 되돌림
   - 편집기 열림/외부 입력란 포커스 시엔 네이티브 붙여넣기에 양보 */
function _onPaste(e){
  if (ModuGrid._active !== GID) return;
  if (!S.editMode || S.editCell) return;
  const ae = document.activeElement;
  // 숨은 입력기는 셀에 '포커스만' 걸린 상태이므로 그리드 붙여넣기 대상이다.
  //   (포커스=편집 모델이라 셀을 클릭하면 항상 이 input이 활성 요소가 된다)
  //   실제로 글자를 치는 중(_imeEditing)일 때만 네이티브 붙여넣기에 양보한다.
  if (ae && ae === EL.imeInput){
    if (S._imeEditing) return;
  } else if (ae && (ae.tagName==='INPUT'||ae.tagName==='TEXTAREA'||ae.tagName==='SELECT')) {
    return;                                  // 검색창 등 그리드 밖 입력란
  }
  const cd = e.clipboardData || window.clipboardData;
  const text = cd && cd.getData ? cd.getData('text') : '';
  if (!text) return;
  // 붙여넣기 대상이 그리드 밖이면(다른 입력란 등) 기본 동작에 양보
  if (e.target && EL.wrap && !EL.wrap.contains(e.target) && e.target !== EL.imeInput) return;
  e.preventDefault();
  pasteText(text);
  _imeRearm();     // applyFilters의 재렌더로 홀더가 떨어져 나가므로 다시 장착
}

/** pasteText(text) → {cells, skipped} — 프로그래매틱 붙여넣기도 가능 */
function pasteText(text){
  if(!canUpdate()) return {cells:0, skipped:0};
  const lines = String(text).replace(/\r/g,'').split('\n');
  if (lines.length && lines[lines.length-1]==='') lines.pop();   // Excel 끝 개행 제거
  if (!lines.length) return {cells:0, skipped:0};
  let block = lines.map(l=>l.split('\t'));

  const visCols = [...getFzCols(), ...getScCols()];   // 렌더 순서 = focusCI/rangeC 인덱스와 동일
  let r0=-1, c0=-1;
  if (S.selMode==='cell' && S.rangeR1>=0 && S.rangeR2>=0){
    r0=Math.min(S.rangeR1,S.rangeR2);
    c0=Math.min(S.rangeC1,S.rangeC2);
    // 단일 값 → 선택 범위 전체 채우기 (Excel)
    if (block.length===1 && block[0].length===1){
      const rN=Math.abs(S.rangeR2-S.rangeR1)+1, cN=Math.abs(S.rangeC2-S.rangeC1)+1;
      block=Array.from({length:rN},()=>Array.from({length:cN},()=>block[0][0]));
    }
  } else if (S.focusRI>=0 && S.focusCI>=0){
    r0=S.focusRI; c0=S.focusCI;
  }
  if (r0<0 || c0<0) return {cells:0, skipped:0};

  // 1차: 유효 쓰기 수집 (실패만 있으면 스냅샷 안 찍음 → undo 오염 방지)
  const writes=[]; let skipped=0;
  block.forEach((line,ri)=>{
    const row=S.filtered[r0+ri];
    if(!row){ skipped+=line.length; return; }               // 마지막 행 초과 클립
    line.forEach((val,ci)=>{
      const col=visCols[c0+ci];
      if(!col){ skipped++; return; }                        // 마지막 컬럼 초과 클립
      if(col.key.startsWith('_')||col.editor===false||col.type==='images'){ skipped++; return; }
      if(_lockedCell(col,row)){ skipped++; return; }   // rowEditable / col.editable
      let v=_applyCase(col, val);
      if(getEditType(col)==='number'){ const n=+val; if(val!==''&&!isNaN(n)) v=n; }
      if(typeof col.validate==='function'){
        let vr; try{ vr=col.validate(v,row); }catch(_){ vr=false; }
        if(vr===false||(typeof vr==='string'&&vr)){ skipped++; return; }
      }
      writes.push({row, key:col.key, v});
    });
  });
  if(!writes.length) return {cells:0, skipped};

  // 2차: 일괄 적용 후 스냅샷 1회 (변경 후 상태를 저장해야 redo 정상)
  writes.forEach(w=>{ w.row[w.key]=w.v; });
  snap('Paste');
  applyFilters();
  _emit('dataChange',{type:'paste', cells:writes.length, skipped});
  _ctlTxt('stCell', `Paste: ${writes.length} cells${skipped?` · ${skipped} skipped`:''}`);
  return {cells:writes.length, skipped};
}

function _totalRows(){ return S.serverMode ? S.svrTotal : S.filtered.length; }

function _buildReq(){
  const filters={};
  Object.entries(S.cfilters).forEach(([k,f])=>{
    filters[k]=f.type==='list'
      ? {type:'list', values:[...f.values]}
      : {type:'range', min:f.min, max:f.max};
  });
  return { page:S.page, pageSize:_pageSize(),
           sorts:S.sorts.map(s=>({col:s.col, dir:s.dir})),
           filters, search:S.search||'' };
}

function _fetchServer(force){
  clearTimeout(S._fetchTm);
  const run=()=>{
    const req=_buildReq();
    S._lastQuery=JSON.stringify(req);
    const seq=++S._reqSeq;                       // 응답 순서 역전(레이스) 가드
    if(EL.loading) EL.loading.classList.add('vis');
    Promise.resolve(S._ds(req)).then(res=>{
      if(seq!==S._reqSeq) return;                // 더 새 요청이 나감 → 이 응답 폐기
      if(EL.loading) EL.loading.classList.remove('vis');
      const rows=(res&&Array.isArray(res.rows))?res.rows:[];
      _ensureIds(rows);                  // 서버 응답에 id가 없어도 동작하도록
      S.data=rows;
      S.svrTotal=(res&&isFinite(+res.total))?Math.max(0,+res.total):rows.length;
      S.svrAgg=(res&&res.agg&&typeof res.agg==='object')?res.agg:null;
      _fltCache.clear();   // 데이터 갱신 → 필터 목록 캐시 무효화
      S.filtered=[...rows];
      _markCleanQuiet();                 // 서버 재조회 = 변경 기준점 재설정
      renderGrid();
      _emit('dataChange',{type:'load'});
    }).catch(err=>{
      if(seq!==S._reqSeq) return;
      if(EL.loading) EL.loading.classList.remove('vis');
      console.error('ModuGrid: dataSource failed.', err);
      _emit('dataError', err);                   // 기존 데이터는 유지
    });
  };
  if(force) run();
  else S._fetchTm=setTimeout(run,150);           // 연타(검색 타이핑 등) 디바운스
}

function applyFilters(){
  if(S.serverMode){
    /* 쿼리 조건(페이지/정렬/필터/검색/페이지크기)이 바뀐 경우에만 서버 재조회.
       셀 편집·undo 등 로컬 데이터 변경으로 불린 경우엔 재렌더만 → 편집 내용 보존 */
    if(JSON.stringify(_buildReq())!==S._lastQuery) _fetchServer();
    else { S.filtered=[...S.data]; renderGrid(); }
    return;
  }
  let data=[...S.data];
  if(!S.treeOn){
    if(S.search){
      const keys = _searchKeys.length ? _searchKeys
        : COLS.filter(c=>!c.key.startsWith('_')&&c.type!=='images').map(c=>c.key);
      // 리스트 옵션 컬럼은 코드뿐 아니라 표시명으로도 검색된다
      const kc = new Map(keys.map(k=>[k, COLS.find(c=>c.key===k)]));
      data=data.filter(r=>keys.some(k=>{
        if(String(_valCode(r[k])??'').toLowerCase().includes(S.search)) return true;
        const col=kc.get(k);
        const lb=_optLabel(col,r[k],r);
        return lb!==r[k] && String(lb??'').toLowerCase().includes(S.search);
      }));
    }
    Object.entries(S.cfilters).forEach(([col,f])=>{
      if(f.type==='list') data=data.filter(r=>f.values.has(String(_valCode(r[col])??'')));
      if(f.type==='range') data=data.filter(r=>+r[col]>=f.min&&+r[col]<=f.max);
    });
    if(S.sorts.length) data.sort((a,b)=>{for(const{col,dir}of S.sorts){const d=dir==='asc'?1:-1;if(a[col]<b[col])return-d;if(a[col]>b[col])return d;}return 0;});
  }
  S.filtered=data;
  renderGrid();
}

/* ─────────────────────────────────
   RENDER ENGINE
───────────────────────────────── */
/* ── Split-pane helpers ── */
function getFzCols(){return COLS.filter(c=>isFz(c.key)&&!S.hiddenCols.has(c.key));}
function getScCols(){return COLS.filter(c=>!isFz(c.key)&&!S.hiddenCols.has(c.key));}
function getFzWidth(){return getFzCols().reduce((s,c)=>s+(_sysHidden(c)?0:CW[c.key]),0);}

function renderHeader(){
  const fzC=getFzCols(), scC=getScCols();
  // 컬럼 그룹 헤더: COLS에 group 속성이 하나라도 있으면 2행 헤더로 렌더
  const hasGroups = COLS.some(c=>c.group);

  /* 숨김 컬럼(RowNum/Checkbox off)은 폭 0 — 폭은 colgroup이 단일 관리
     (table-layout:fixed에서 그룹 행(colspan)이 1행이 되면 th 폭이 무시되므로 colgroup 필수) */
  const colW = c => _sysHidden(c) ? 0 : CW[c.key];

  function setColgroup(tbl, cols){
    if(!tbl) return;
    let cg = tbl.querySelector(':scope > colgroup');
    if(!cg){
      cg = document.createElement('colgroup');
      if(typeof tbl.insertBefore==='function') tbl.insertBefore(cg, tbl.firstChild||null);
      else tbl.appendChild(cg);
    }
    cg.innerHTML = cols.map(c=>`<col data-c="${c.key}" style="width:${colW(c)}px">`).join('');
  }

  function mkTh(c, rs){
    const sort=S.sorts.find(s=>s.col===c.key), si=S.sorts.indexOf(sort);
    const hasF=!!S.cfilters[c.key];
    let cls='jth';
    if(c.key==='_cb') cls+=' ccb';
    if(c.key==='_rn') cls+=' crn';
    if(c.key==='_st') cls+=' cst';
    const sa=sort?`data-s="${sort.dir}"`:'';
    const msB=S.multiSort&&si>=0?`<span class="sbdg">${si+1}</span>`:'';
    const sicons=!c.noSort?`<span class="tsi" data-act="sort" data-c="${esc(c.key)}" title="${esc(msg('sortTip'))}"><svg class="au" width="7" height="4" viewBox="0 0 8 5" fill="currentColor"><path d="M4 0L8 5H0Z"/></svg><svg class="ad" width="7" height="4" viewBox="0 0 8 5" fill="currentColor"><path d="M4 5L0 0H8Z"/></svg></span>`:'';
    const fiI=(S.showFilter && !c.noFilter)?`<svg class="fi-ico" data-act="colfilter" data-c="${esc(c.key)}" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="cursor:pointer;opacity:${hasF?1:.3};color:${hasF?'var(--wn)':'currentColor'};flex-shrink:0"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`:'';
    const fdot=hasF?`<span class="fdot"></span>`:'';
    const rHandle=!c.noResize?`<div class="rh"></div>`:'';
    
    const rnHide=_sysHidden(c)
      ?'padding:0;overflow:hidden;border:none;':'';
    /* _cb 헤더 — 전체선택 체크박스(기본) 또는 수기 입력 글자.
       정렬/필터/멀티정렬 배지는 붙이지 않는다. 컬럼이 꺼져 있으면(showCB=false)
       아래 일반 경로로 떨어져 폭 0으로 접힌다. */
    if(c.key==='_cb' && !_sysHidden(c))
      return`<th class="${cls}" data-c="${esc(c.key)}" ${rs?`rowspan="${rs}" `:''}style="${rnHide}"><div class="thi">${_cbHdrHTML()}</div>${rHandle}</th>`;
    return`<th class="${cls}" data-c="${esc(c.key)}" ${rs?`rowspan="${rs}" `:''}${sa} style="${rnHide}"><div class="thi"><span class="thl">${_thLabel(c)}</span>${sicons}${msB}${fiI}</div>${fdot}${rHandle}</th>`;
  }

  /* 헤더 행 구성:
     - 그룹 없음: 기존 1행
     - 그룹 있음: 1행=[그룹셀(colspan, 인접 동일 그룹 병합) | 미그룹 컬럼 th(rowspan=2)]
                 2행=[그룹에 속한 컬럼 th]  — 정렬/필터/리사이즈는 항상 컬럼 th에 위치 */
  function headerHTML(cols){
    if(!hasGroups) return `<tr>${cols.map(c=>mkTh(c)).join('')}</tr>`;
    let r1='', r2='', i=0;
    while(i<cols.length){
      const g=cols[i].group;
      if(g){
        let j=i; while(j<cols.length && cols[j].group===g) j++;
        r1+=`<th class="jgh" colspan="${j-i}"><div class="jgh-l">${esc(g)}</div></th>`;
        for(let k=i;k<j;k++) r2+=mkTh(cols[k]);
        i=j;
      } else {
        r1+=mkTh(cols[i], 2);   // 두 행 관통
        i++;
      }
    }
    return `<tr>${r1}</tr><tr>${r2}</tr>`;
  }

  root.classList.toggle('hdr-wrap', !!S.headerWrap);
  EL.gheadLeft.innerHTML=headerHTML(fzC);
  EL.ghead.innerHTML=headerHTML(scC);
  setColgroup(EL.gtLh, fzC);
  setColgroup(EL.gtLb, fzC);
  setColgroup(EL.gt,  scC);

  // 각 테이블 너비 설정
  const fzW=getFzWidth();
  let   scW=scC.reduce((s,c)=>s+colW(c),0);
  [EL.gtLh,EL.gtLb].forEach(el=>{
    if(!el)return;
    el.style.width=fzW+'px'; el.style.minWidth=fzW+'px';
  });

  /* fitLast — 컬럼 폭 합이 그리드보다 좁으면 오른쪽에 표가 없는 빈 띠가 남는다.
     켜 두면 마지막 데이터 컬럼이 그 남는 폭을 흡수한다. 기본은 꺼짐(빈 공간 유지)이라
     기존 화면의 컬럼 폭은 그대로다.

     colgroup 의 <col> 만 늘린다 — CW 를 건드리면 사용자가 지정한 폭이 덮여
     리사이즈하거나 컬럼을 껐다 켤 때 원래 값으로 못 돌아간다. */
  if(S.fitLast && EL.gsc){
    const avail=EL.gsc.clientWidth;
    const last=[...scC].reverse().find(c=>colW(c)>0);
    if(last && avail>scW){
      const col=EL.gt.querySelector(`:scope > colgroup > col[data-c="${last.key}"]`);
      if(col){ col.style.width=(colW(last)+(avail-scW))+'px'; scW=avail; }
    }
  }

  EL.gt.style.width=Math.max(scW,80)+'px';
  EL.gt.style.minWidth=Math.max(scW,80)+'px';
  // 왼쪽 패널 너비 동기화
  EL.left.style.width=fzW+'px';
  EL.left.style.minWidth=fzW+'px';
  _syncCbHdr();   // 전체선택 체크박스의 checked/indeterminate 반영 (속성으로는 못 넣는다)
}
/* 트리 토글이 붙는 컬럼 = 첫 번째 데이터 컬럼(시스템 _ 제외) */
function _treeColKey(){ const c=COLS.find(c=>!c.key.startsWith('_')); return c?c.key:null; }

/* ── Build cells (공통 cell 생성 — cols 배열 + 전역 ci 오프셋) ── */
function buildCells(row, num, depth, theCols, ciOff){
  /* 화면(페이지) 기준 첫 행 판정 — num 은 1부터 시작하는 표시용 행번호 */
  const localRi = (typeof num==='number' && isFinite(num)) ? (num - ((S.page-1)*_pageSize()) - 1) : -1;
  const depth2=depth??row._d??0;
  const hasChild=!!row._hc;
  const isExp=S.treeExp.has(row.id);
  const isRowSel=S.rowSel.has(row.id);
  const rh=getH(row.id);
  const ri=S.filtered.indexOf(row);

  return theCols.map((c,localCi)=>{
    const ci=localCi+(ciOff||0);
    const w=_sysHidden(c)?0:CW[c.key];
    const inRange=S.selMode==='cell'&&S.rangeR1>=0&&S.rangeR2>=0&&S.rangeC2>=0&&
      ri>=Math.min(S.rangeR1,S.rangeR2)&&ri<=Math.max(S.rangeR1,S.rangeR2)&&
      ci>=Math.min(S.rangeC1,S.rangeC2)&&ci<=Math.max(S.rangeC1,S.rangeC2);
    const isFocus=(S.selMode==='cell'||S.editMode)&&S.focusRI===ri&&S.focusCI===ci;

    const canEdit=_colEditable(c,row);
    const etCell=canEdit?getEditType(c):'';
    // 드롭다운(select) 컬럼: 편집모드일 때만 셀 우측에 ▼ 표시
    const isSelCell=etCell==='select';
    // 날짜(date) 컬럼: 편집모드일 때만 셀 우측에 📅 표시
    const isDateCell=etCell==='date';
    // text/number: 더블클릭도 F2와 같은 숨은 입력기 경로로 편집
    const isImeCell=(etCell==='text'||etCell==='number');

    let cls='jtd';
    if(c.key==='_cb') cls+=' ccb';
    if(c.key==='_rn') cls+=' crn';
    if(c.key==='_st') cls+=' cst';
    if(inRange) cls+=' cin-range';
    if(isFocus) cls+=' cfocus';
    if(isSelCell) cls+=' csel';
    if(isDateCell) cls+=' cdate';
    // validate 실패 셀 — 값은 그대로 두고 붉게 표시
    const ivMsg=S.invalid.get(_ivk(row.id,c.key));
    if(ivMsg) cls+=' cinvalid';
    /* 편집 가능 표시(cursor:text + hover 강조)는 위에서 구한 canEdit 을 그대로 쓴다.
       예전에는 '컬럼이 편집형인가'만 봐서 canUpdate:false·editor:false·삭제예정 행,
       그리고 rowEditable/col.editable 로 잠근 셀에도 붙었다 — 못 고치는 셀이
       고칠 수 있는 것처럼 보였다. */
    if(canEdit) cls+=' editable';

    /* ── 셀 콘텐츠: col.render(커스텀) → 내장 type 렌더러 순 ──
       render:(value,row,ctx)=>HTML문자열 — 반환값을 그대로 삽입(이스케이프는 호출자 책임)

       ctx 는 세 번째 인자로 나중에 붙었다. 그전에는 (value,row) 뿐이라 함수가
       자기가 어느 컬럼을 그리는지 몰라서, 여러 컬럼에 공용 포매터를 돌려 쓰지 못하고
       컬럼마다 클로저를 따로 만들어야 했다. 인자를 뒤에 더한 것이라 두 인자만 받던
       기존 render 는 그대로 동작한다. */
    let content='';
    if(c.key==='_cb'){
      content=`<input type="checkbox" class="jcb" ${S.rowCheck.has(row.id)?'checked':''}/>`;
    } else if(c.key==='_st'){
      content=S.showST?_stMark(row):'';
    } else if(c.key==='_rn'){
      content=S.showRN?String(num):'';
    } else {
      const v=_valCode(row[c.key]);   // 값이 옵션 객체여도 코드로 환원
      // 리스트 옵션 컬럼: optionFormat이 있으면 그 포맷, 없으면 표시명 (저장값은 코드 유지)
      const vd=_optDisp(c,row[c.key],row);   // 목록 없으면 내부에서 원본 반환
      if(_showPh(c,row,localRi)){
        content=`<span class="cph">${esc(_phOf(c))}</span>`;   // 빈 셀 안내 문구
      } else if(typeof c.render==='function'){
        content=c.render(v,row,{col:c,key:c.key,rowIndex:ri})??'';
      } else switch(c.type){
        case 'avatar':
          content=`<div class="cav"><div class="av">${esc(ini(vd))}</div><a class="clnk">${esc(vd)}</a></div>`;break;
        case 'progress': content=pgCellFlat(v);break;
        case 'currency': content=`<span class="cnum">${fmtSal(v)}</span>`;break;
        case 'number':   content=`<span class="cnum">${esc(vd)}</span>`;break;
        case 'images':   content=buildImgCell(row);break;
        case 'date':     content=esc(_dateToDisplay(v));break;
        default:         content=`<span class="ctxt">${esc(vd)}</span>`;
      }
      // 트리 토글: '첫 번째 데이터 컬럼'에 자동 부착 (커스텀 render에도 동일 적용)
      if(S.treeOn && c.key===_treeColKey()){
        const indent=depth2*16;
        const tog=hasChild?`<span class="treetog" data-act="treetog" data-id="${row.id}">${isExp?'▾':'▸'}</span>`:`<span class="treedot"></span>`;
        content=`<div style="display:flex;align-items:center;gap:4px;padding-left:${indent}px">${tog}<div style="flex:1;min-width:0">${content}</div></div>`;
      }
    }

    // ▼ / 📅 — 셀 우측 아이콘
    //   date는 span 안에 네이티브 <input type=date>를 우측 정렬로 깔고 22px만 노출한다.
    //   브라우저 자체 달력 버튼을 사용자가 '직접' 누르는 형태라 첫 클릭에 바로 열리고,
    //   편집기를 열지 않으므로 잔상도 생기지 않는다.
    //   mousedown/click은 stopPropagation만 — preventDefault를 하면 네이티브 동작이 막힌다.
    const selArw=isSelCell
      ?`<span class="jsg-selarw">▼</span>`
      :(isDateCell
        ?`<span class="jsg-datearw"><input type="date" class="jsg-cell-pick" tabindex="-1" data-act="datepick" value="${esc(_dateToISO(row[c.key])||'')}"/></span>`
        :'');


    // Row resize handle: _rn 헤드열에만 표시
    const rrh=c.key==='_rn'?`<div class="rrh"></div>`:'';
    const rnHide=_sysHidden(c)
      ?'width:0;min-width:0;padding:0;overflow:hidden;border:none;':'';

    return`<td class="${cls}" data-c="${esc(c.key)}" data-id="${row.id}" data-ri="${ri}" data-ci="${ci}"${ivMsg?` title="${esc(ivMsg)}"`:''}${rnHide?` style="${rnHide}"`:``}>${content}${selArw}${rrh}</td>`;
  }).join('');
}

/* _st 컬럼 마커 — 신규 + / 수정 * / 삭제 - */
function _stMark(row){
  if(!S._baseline) return '';
  if(row._del) return `<span class="jst jst-d" title="${esc(msg('stDel'))}">-</span>`;
  const d=_diff();
  if(d.ins.has(row.id)) return `<span class="jst jst-i" title="${esc(msg('stNew'))}">+</span>`;
  if(d.upd.has(row.id)) return `<span class="jst jst-u" title="${esc(msg('stUpd'))}">*</span>`;
  return '';
}

/* 변경 표시 클래스 — 신규 행 jnew, 수정 행 jupd, 삭제예정 jdel */
/* 행 변경 표시 클래스.
   dirtyMark=false 면 '배경색'만 끈다.
   삭제 예정 행의 취소선·편집차단은 상태 정보이므로 유지한다(배경만 빠짐). */
function _dirtyCls(rowId){
  if(!S._baseline) return '';
  const d=_diff();                          // 캐시된 diff 1회 계산 — 행별 find() 없음
  if(d.delSet.has(rowId)) return S.dirtyMark ? ' jdel jdelbg' : ' jdel';
  if(!S.dirtyMark) return '';
  if(d.ins.has(rowId)) return ' jnew';
  if(d.upd.has(rowId)) return ' jupd';
  return '';
}

/* buildRowSplit — 분리 패널용: {left, right} 반환 */
function buildRowSplit(row, num, depth){
  const fzC=getFzCols(), scC=getScCols();
  const isRowSel=S.rowSel.has(row.id);
  const ta=`class="jtr${isRowSel?' rsel':''}${_dirtyCls(row.id)}" data-id="${row.id}" style="height:${getH(row.id)}px"`;
  return{
    left:`<tr ${ta}>${buildCells(row,num,depth,fzC,0)}</tr>`,
    right:`<tr ${ta}>${buildCells(row,num,depth,scC,fzC.length)}</tr>`
  };
}

/* detail row — 오른쪽 패널 (전체 컬럼 span) */
/* ── C. Image cell content (v1.4.0 redesign) ── */
const IMG_LIMIT = 5;   // 기본값 (options.imageLimit 로 변경)

function buildImgCell(row){
  const imgs = row.images || [];
  const id = row.id;
  if(S.editMode){
    // EditMode: dotted D&D box with file list
    const listHTML = imgs.map((f,i) =>
      `<div class="img-dnd-item${f._up?' up-'+f._up:''}">` +
      `<span class="img-dnd-name" data-url="${esc(f.url)}" title="${esc(f.name)}">${esc(f.name)}</span>` +
      (f._up==='pending' ? `<span class="img-up">⋯</span>`
       : f._up==='error' ? `<span class="img-up err" title="${esc(msg('imgUpFail',f.name))}">!</span>` : '') +
      `<button type="button" class="img-dnd-del" data-act="imgdel" data-id="${id}" data-i="${i}" title="${msg('del')}">✕</button>` +
      `</div>`
    ).join('');
    const canAdd = imgs.length < _imgLimit();
    const hint = imgs.length === 0 ? `<div class="img-dnd-hint">📎 Drop or click ＋</div>` : '';
    const addBtn = canAdd
      ? `<div class="img-dnd-add" data-act="imgadd" data-id="${id}">＋ Add (${imgs.length}/${_imgLimit()})</div>`
      : `<div class="img-dnd-add" style="color:var(--tx2);cursor:default">${_imgLimit()}/${_imgLimit()} (max)</div>`;
    return `<div class="img-dnd-wrap" data-imgid="${id}">` +
      `${hint}` +
      `<div class="img-dnd-list">${listHTML}</div>` +
      `${addBtn}` +
      `<input type="file" id="ifi-${GID}-${id}" accept="image/*" multiple style="display:none" data-imgid="${id}"/>` +
      `</div>`;
  } else {
    // ReadMode: compact thumbnail strip
    if(!imgs.length) return `<span style="font-size:10px;color:var(--tx2)">—</span>`;
    const thumbs = imgs.slice(0,3).map(f =>
      `<img class="img-cell-thumb" src="${f.url}" title="${f.name}"
        data-url="${esc(f.url)}"/>`
    ).join('');
    const more = imgs.length > 3 ? `<span class="img-cell-count">+${imgs.length-3}</span>` : '';
    return `<div class="img-cell-read">${thumbs}${more}</div>`;
  }
}

/* Image D&D events */
function trigImgInput(rowId){const el=_$(`ifi-${GID}-${rowId}`);if(el)el.click();}
function imgFromInput(rowId,inp){
  const files=[...inp.files];inp.value='';
  addImgToRow(rowId,files);
}
function imgDragOver(e,rowId){
  e.preventDefault();e.stopPropagation();
  e.currentTarget.classList.add('dov');
}
function imgDragLeave(e){
  e.currentTarget.classList.remove('dov');
}
function imgDrop(e,rowId){
  e.preventDefault();e.stopPropagation();
  e.currentTarget.classList.remove('dov');
  const files=[...e.dataTransfer.files].filter(f=>f.type.startsWith('image/'));
  addImgToRow(rowId,files);
}
function delImg(rowId,idx){
  const row=S.data.find(r=>r.id===rowId);if(!row||!row.images||!row.images[idx])return;
  // Revoke object URL to free memory
  if(row.images[idx]?.url?.startsWith('blob:')) URL.revokeObjectURL(row.images[idx].url);
  row.images.splice(idx,1);
  snap('Delete image');
  applyFilters();
  _emit('dataChange',{type:'update', id:rowId, field:'images'});
}
function _imgLimit(){ return S.imageLimit || IMG_LIMIT; }

/* File → dataURL (base64 모드) */
function _fileToDataURL(f){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(r.result);
    r.onerror=()=>rej(new Error('read failed'));
    r.readAsDataURL(f);
  });
}

/* 이미지 항목을 전송/비교용으로 직렬화.
   File 객체(_file)와 blob: URL 은 서버에서 의미가 없으므로 제외한다.
   - upload    : {id, url, name, size}
   - multipart : {name, size, ref}      ref = FormData 파트 이름
   - base64    : {name, size, data}     data = dataURL
   - none      : {name, size}           (submit 대상 자체가 아님) */
function _imgSer(list, rowId, colKey){
  if(!Array.isArray(list)) return list;
  return list.map((x,i)=>{
    const o={ name:x.name, size:x.size };
    if(x.id!=null) o.id=x.id;
    if(x.url && !String(x.url).startsWith('blob:')) o.url=x.url;
    if(x.data) o.data=x.data;
    if(S.imageMode==='multipart' && x._file) o.ref=`img_${rowId}_${colKey}_${i}`;
    return o;
  });
}

/* 행에 이미지 추가. 모드에 따라 보관 형태가 달라진다. */
async function addImgToRow(rowId,files){
  const row=S.data.find(r=>r.id===rowId);if(!row)return;
  if(!row.images)row.images=[];
  const LIM=_imgLimit();
  const rem=LIM-row.images.length;
  if(rem<=0){toast(msg('imgLimitHit', LIM));return;}
  let add=files.slice(0,rem);
  if(S.imageMaxSize){                                   // 용량 제한
    const over=add.filter(f=>f.size>S.imageMaxSize);
    if(over.length) toast(msg('imgTooBig', Math.round(S.imageMaxSize/1024)));
    add=add.filter(f=>f.size<=S.imageMaxSize);
  }
  if(!add.length)return;

  const items=[];
  for(const f of add){
    const item={ name:f.name, size:f.size, url:URL.createObjectURL(f) };
    if(S.imageMode==='multipart') item._file=f;         // submit 때 함께 보낼 원본
    if(S.imageMode==='base64'){
      try{ item.data=await _fileToDataURL(f); item.url=item.data; }
      catch(e){ console.error('ModuGrid: base64 conversion failed.', e); continue; }
    }
    if(S.imageMode==='upload') item._up='pending';      // 업로드 진행 표시
    items.push(item);
    row.images.push(item);
  }
  if(files.length>rem) toast(msg('imgLimit', LIM));
  snap('Add image');
  applyFilters();
  _emit('dataChange',{type:'update', id:rowId, field:'images'});

  /* upload 모드 — 선택 즉시 서버로 개별 업로드.
     성공하면 서버가 준 id/url 로 교체하고, 실패하면 표시만 남긴다. */
  if(S.imageMode==='upload' && S._imgUpload){
    for(let i=0;i<items.length;i++){
      const item=items[i], f=add[i];
      try{
        const r=await S._imgUpload(f,row);
        if(r && typeof r==='object'){
          if(r.id!=null) item.id=r.id;
          if(r.url) { try{URL.revokeObjectURL(item.url);}catch(_){} item.url=r.url; }
          if(r.name) item.name=r.name;
        }
        item._up='done';
      }catch(err){
        item._up='error';
        console.error('ModuGrid: imageUpload failed.', err);
        toast(msg('imgUpFail', item.name));
      }
      renderGrid();
    }
    _touchData();
    _emit('dataChange',{type:'update', id:rowId, field:'images'});
  }
}
function showPrev(e,url){
  if(!url)return;
  const p=EL.imgprev;
  EL.imgprevimg.src=url;
  p.style.left=(e.clientX+14)+'px';
  p.style.top=(e.clientY-10)+'px';
  p.classList.add('vis');
}
function hidePrev(){EL.imgprev.classList.remove('vis');}

/* ── Row Detail ── */
/* ══════════ 행 모달 (상세 / 편집 / 추가) ══════════
   COLS 정의에서 필드를 자동 생성한다(앱 HTML 의존 없음).
   - detail : 전부 읽기 전용
   - edit   : 편집 가능한 컬럼만 입력 가능, 나머지는 읽기 전용으로 함께 보여준다
   - add    : 신규 행. 편집 가능한 컬럼만 입력 가능
   편집 가능 판정은 셀 편집과 동일 규칙(_colEditable) — 권한·컬럼 정의·행 상태를 모두 본다. */
let _mMode=null, _mRowId=null;

function _mFields(){
  return COLS.filter(c=>!_isSysCol(c.key) && !c.key.startsWith('_') && c.type!=='images');
}
function _mInput(col,row,editable){
  const key=col.key, id=`mgf-${GID}-${key}`;
  const raw=_valCode(row?row[key]:'');
  const et=getEditType(col);
  const ro=editable?'':'readonly disabled';
  const ph=esc(_phOf(col)||'');
  if(!editable){
    // 읽기 전용은 화면에 보이는 값(표시명·포맷·날짜형식) 그대로
    const disp = (col.type==='date') ? _dateToDisplay(row?row[key]:'') : _optDisp(col,row?row[key]:'',row);
    return `<div class="jsg-mval" id="${id}" data-k="${esc(key)}">${esc(disp??'')}</div>`;
  }
  if(et==='select'){
    const ps=_optPairs(col,row);
    const cur=String(raw??'');
    const opts=ps.map(p=>`<option value="${esc(p.v)}" ${p.v===cur?'selected':''}>${esc(_optText(col,p,row))}</option>`).join('');
    const extra=(cur && !ps.some(p=>p.v===cur)) ? `<option value="${esc(cur)}" selected>${esc(cur)}</option>` : '';
    return `<select class="jsg-mi" id="${id}" data-k="${esc(key)}"><option value=""></option>${extra}${opts}</select>`;
  }
  if(et==='textarea')
    return `<textarea class="jsg-mi" id="${id}" data-k="${esc(key)}" rows="3" placeholder="${ph}">${esc(raw??'')}</textarea>`;
  if(et==='date')
    return `<input type="date" class="jsg-mi" id="${id}" data-k="${esc(key)}" value="${esc(_dateToISO(row?row[key]:'')||'')}"/>`;
  const type=(et==='number')?'number':'text';
  return `<input type="${type}" class="jsg-mi" id="${id}" data-k="${esc(key)}" value="${esc(raw??'')}" placeholder="${ph}" ${ro}/>`;
}
function _openRowModal(mode, id){
  const row = (mode==='add') ? { ..._newRowDefaults } : S.data.find(r=>r.id===id);
  if(mode!=='add' && !row) return;
  if(mode==='add'  && !canInsert()) { toast(msg('noPermInsert')); return; }
  if(mode==='edit' && !canUpdate()) { mode='detail'; }        // 수정 권한 없으면 상세로

  _mMode=mode; _mRowId=(mode==='add')?null:id;
  const editing=(mode==='edit'||mode==='add');
  const fields=_mFields().map(c=>{
    const ed = editing && _colEditable(c,row);
    return `<label class="jsg-mfld"><span class="jsg-mlbl">${_thLabel(c)}</span>${_mInput(c,row,ed)}</label>`;
  }).join('');

  EL.mtitle.textContent = mode==='add' ? msg('mAdd') : (mode==='edit' ? msg('mEdit') : msg('mDetail'));
  EL.mbd.innerHTML = `<div class="jsg-mgrid">${fields}</div>`;
  const btns=EL.mft.querySelectorAll('.jsg-mbtn');
  btns[0].textContent = editing ? msg('cancel') : msg('close');
  btns[1].textContent = msg('save');
  btns[1].style.display = editing ? '' : 'none';
  EL.mov.classList.add('vis');
  const first=EL.mbd.querySelector('.jsg-mi:not([readonly])');
  if(first) try{ first.focus(); }catch(_){}
}
function closeRowModal(){ EL.mov.classList.remove('vis'); _mMode=null; _mRowId=null; }

/* 모달 저장 — 편집 가능했던 필드만 수집한다(읽기 전용 필드는 .jsg-mval 이라 잡히지 않음) */
function saveRowModal(){
  if(!_mMode || _mMode==='detail') return closeRowModal();
  const upd={};
  EL.mbd.querySelectorAll('.jsg-mi').forEach(el=>{
    const key=el.dataset.k; if(!key) return;
    const col=COLS.find(c=>c.key===key); if(!col) return;
    const et=getEditType(col);
    let v=el.value;
    if(et==='number'||_numericKeys.includes(key)) v = (v==='')?null:+v;
    else v=_applyCase(col,v);
    upd[key]=v;
  });
  // validate — 실패해도 값은 반영하고 셀을 붉게(그리드 정책과 동일)
  const target = (_mMode==='add') ? { id:_genId(), ..._newRowDefaults, ...upd } : S.data.find(r=>r.id===_mRowId);
  if(!target) return closeRowModal();
  if(_mMode==='add'){
    addRow(target);
    Object.keys(upd).forEach(k=>_applyValidate(target,k,target[k],null));
  } else {
    updateRow(_mRowId, upd);
    Object.keys(upd).forEach(k=>{
      const td=EL.wrap.querySelector(`td[data-c="${k}"][data-id="${_mRowId}"]`);
      _applyValidate(target,k,target[k],td);
    });
  }
  closeRowModal();
}

/** openDetail(id) — 행 상세를 모달로 (이전의 인라인 확장 행 방식에서 변경) */
function openDetail(id){ _openRowModal('detail', id); }
function closeDetail(id){ S.detailRows.delete(id); closeRowModal(); }

/* ── renderGrid — 분리 패널 버전 ── */
function renderGrid(){
  // ★ tbody 재생성 전에, td 안에 들어가 있을 수 있는 숨은 입력기(holder)를 wrap으로 대피.
  //   (td 안에 두면 innerHTML 재작성 시 파괴됨 — 대피 후 _imeTrack이 새 td에 다시 넣음)
  if(EL.imeHolder && EL.imeHolder.parentNode && EL.imeHolder.parentNode !== EL.wrap){
    EL.wrap.appendChild(EL.imeHolder);
  }
  renderHeader();
  const lb=EL.gbodyLeft, rb=EL.gbody;
  if(S.vs){vsRender();return;}
  const fzC=getFzCols(), scC=getScCols();

  if(!S.filtered.length){
    /* 결과 없음 —
       ① 왼쪽(Freeze) 바디를 비워두면 두 패널의 <table> 높이가 달라져
          고정열 배경·세로 경계선이 본문과 어긋난다.
          같은 마크업을 visibility:hidden으로 넣어 높이를 정확히 일치시킨다.
       ② syncRowHeights()를 건너뛰면 헤더(그룹 헤더는 2행)의 좌우 높이가
          동기화되지 않아 헤더부터 어긋난다. → 반드시 호출. */
    const eIn=`<div class="ei">&#128269;</div><div class="et">No results</div><div class="es">Adjust filters</div>`;
    lb.innerHTML = fzC.length
      ? `<tr class="jsg-emptyr"><td colspan="${fzC.length}"><div class="empty empty-ph">${eIn}</div></td></tr>`
      : '';
    rb.innerHTML = `<tr class="jsg-emptyr"><td colspan="${scC.length}"><div class="empty">${eIn}</div></td></tr>`;
    updFoot();renderPgn();syncRowHeights();_emitDirty();return;
  }

  // Tree mode
  if(S.treeOn){
    const cm={};
    S.filtered.forEach(r=>{if(r.parentId){if(!cm[r.parentId])cm[r.parentId]=[];cm[r.parentId].push(r);}});
    const roots=S.filtered.filter(r=>!r.parentId||r.parentId===0);
    let lh='',rh='',n=0;
    function rn(row,d){
      n++;
      const {left,right}=buildRowSplit(row,n,d);
      lh+=left; rh+=right;
      
      if(S.treeExp.has(row.id)&&cm[row.id])cm[row.id].forEach(c=>rn(c,d+1));
    }
    roots.forEach(r=>rn(r,0));
    lb.innerHTML=lh; rb.innerHTML=rh;
    updFoot(); syncRowHeights(); return;
  }

  // Group mode
  if(S.groupBy){
    const groups={};
    S.filtered.forEach(r=>{const k=r[S.groupBy]||'—';if(!groups[k])groups[k]=[];groups[k].push(r);});
    let lh='',rh='',n=0;
    Object.entries(groups).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([key,rows])=>{
      const coll=S.groupColl.has(key);
      const avg=(rows.reduce((s,r)=>s+r.score,0)/rows.length).toFixed(1);
      const ts=rows.reduce((s,r)=>s+r.salary,0);
      // 왼쪽: 그룹 row (토글만)
      lh+=`<tr class="grpr${coll?' coll':''}"><td colspan="${fzC.length}" data-act="grptog" data-k="${esc(key)}"><span class="gtog">▾</span>${esc(key)}</td></tr>`;
      // 오른쪽: 그룹 row (집계)
      rh+=`<tr class="grpr${coll?' coll':''}"><td colspan="${scC.length}" data-act="grptog" data-k="${esc(key)}"><span class="gagg">Count:${rows.length} · Avg:${avg} · Salary:${fmtSal(ts)}</span></td></tr>`;
      if(!coll){rows.forEach(r=>{n++;const{left,right}=buildRowSplit(r,n);lh+=left;rh+=right;});}
    });
    lb.innerHTML=lh; rb.innerHTML=rh;
    updFoot();renderPgn();syncRowHeights();_emitDirty();return;
  }

  // Normal paged
  const st=(S.page-1)*_pageSize();
  let lh='',rh='';
  // 서버 모드: S.filtered = 이미 현재 페이지 데이터 (행번호 st+i+1은 전역 기준 유지)
  (S.serverMode?S.filtered:S.filtered.slice(st,st+_pageSize())).forEach((r,i)=>{
    const{left,right}=buildRowSplit(r,st+i+1);
    lh+=left; rh+=right;
    
  });
  lb.innerHTML=lh; rb.innerHTML=rh;
  updFoot();renderPgn();
  syncRowHeights();
  _emitDirty();   // 변경 건수 바뀌면 on.dirtyChange 발화
}
/* ══════════ 집계 푸터 행 ══════════
   col.agg: 'sum'|'avg'|'count'|'min'|'max' | (rows)=>표시값
   - 집계 대상: 필터 적용된 전체(S.filtered) — 현재 페이지와 무관
   - 서버 모드: dataSource 응답의 agg[key]가 있으면 그 값을 우선 표시(서버 집계),
     없으면 로드된 페이지 기준으로 계산 (전체 집계는 서버에 위임 권장)
   - 값 포맷: currency 타입은 통화 포맷, 소수는 1자리 */
const _AGG_LABEL={sum:'Σ',avg:'AVG',count:'CNT',min:'MIN',max:'MAX'};
function _calcAgg(col, rows){
  const a=col.agg;
  if(typeof a==='function'){
    try{ return a(rows); }catch(e){ console.error('ModuGrid: column agg failed.', e); return '—'; }
  }
  if(a==='count') return rows.length;
  const nums=rows.map(r=>+r[col.key]).filter(n=>!isNaN(n));
  if(!nums.length) return '—';
  if(a==='sum') return nums.reduce((s,n)=>s+n,0);
  if(a==='avg') return nums.reduce((s,n)=>s+n,0)/nums.length;
  if(a==='min') return Math.min(...nums);
  if(a==='max') return Math.max(...nums);
  return '—';
}
function _fmtAgg(col, v){
  if(typeof v!=='number') return v==null?'':String(v);
  if(col.type==='currency') return fmtSal(v);
  return Number.isInteger(v)?String(v):v.toFixed(1);
}
function renderAgg(){
  const fEl=EL.gfoot, lEl=EL.gfootLeft;
  if(!fEl&&!lEl) return;
  if(!COLS.some(c=>c.agg)){
    if(fEl)fEl.innerHTML=''; if(lEl)lEl.innerHTML='';
    return;
  }
  const rows=S.filtered;
  const mk=cols=>'<tr>'+cols.map(c=>{
    const rnHide=_sysHidden(c)
      ?' style="padding:0;overflow:hidden;border:none"':'';
    if(!c.agg) return `<td class="jaf" data-c="${c.key}"${rnHide}></td>`;
    let v;
    if(S.serverMode&&S.svrAgg&&(c.key in S.svrAgg)) v=S.svrAgg[c.key];
    else v=_calcAgg(c,rows);
    const lbl=(typeof c.agg==='string'&&_AGG_LABEL[c.agg])
      ?`<span class="jaf-l">${_AGG_LABEL[c.agg]}</span>`:'';
    // 내장 집계값은 esc, 커스텀 agg 함수 반환값은 의도적 HTML로 간주해 그대로 삽입
    const cell=(typeof c.agg==='function')?_fmtAgg(c,v):esc(_fmtAgg(c,v));
    return `<td class="jaf" data-c="${c.key}"${rnHide}>${lbl}${cell}</td>`;
  }).join('')+'</tr>';
  if(lEl) lEl.innerHTML=mk(getFzCols());
  if(fEl) fEl.innerHTML=mk(getScCols());
}

/* ── Footer & Pagination ── */
function updFoot(){
  const ps=_pageSize(), tot=_totalRows(), st=(S.page-1)*ps+1, en=Math.min(st+ps-1,tot);
  EL.pf.textContent=tot?st:0;EL.pt.textContent=tot?en:0;EL.ptotal.textContent=tot;
  const sel=S.rowSel.size, chk=S.rowCheck.size;
  // 선택(클릭)과 체크(checkbox)를 각각 표시
  const si=EL.selinfo;
  if(si){
    si.style.display=(sel||chk)?'':'none';
    EL.selcnt.textContent=sel;
    const ci=EL.chkcnt;
    if(ci) ci.textContent=chk;
    const cki=EL.chkinfo;
    if(cki) cki.style.display=chk?'':'none';
  }
  renderAgg();
}
function renderPgn(){
  if(S.vs||S.groupBy||S.treeOn){EL.pgn.innerHTML='';return;}
  const tot=Math.ceil(_totalRows()/_pageSize())||1;
  if(S.page>tot)S.page=tot;
  let h=`<button type="button" class="pb" ${S.page<=1?'disabled':''} data-act="gopage" data-p="${S.page-1}">‹</button>`;
  for(let i=1;i<=tot;i++){
    if(tot>7&&i!==1&&i!==tot&&Math.abs(i-S.page)>1){if(i===2||i===tot-1)h+=`<button type="button" class="pb" disabled>…</button>`;continue;}
    h+=`<button type="button" class="pb${i===S.page?' act':''}" data-act="gopage" data-p="${i}">${i}</button>`;
  }
  h+=`<button type="button" class="pb" ${S.page>=tot?'disabled':''} data-act="gopage" data-p="${S.page+1}">›</button>`;
  EL.pgn.innerHTML=h;
}
function goPage(p){const tot=Math.ceil(_totalRows()/_pageSize())||1;if(p<1||p>tot)return;S.page=p;if(S.serverMode){applyFilters();return;}renderGrid();}
/* 페이지 크기 — 0 은 '전체 보기'를 뜻한다.
   내부 계산에는 매우 큰 수 대신 전체 행 수를 쓴다(_pageSize 참조). */
const PS_ALL = 0;
/* 실제 페이지 크기 — 전체 보기면 현재 행 수(최소 1) */
function _pageSize(){
  if(S.ps===PS_ALL) return Math.max(1, _totalRows());
  return S.ps;
}
function changePS(n){
  S.ps = (+n===PS_ALL) ? PS_ALL : +n;
  S.page=1;
  if(EL.psz) EL.psz.value=String(S.ps);
  if(S.serverMode){applyFilters();return;}
  renderGrid();
}

/* ─────────────────────────────────
   SELECTION MODE (1. Row / 2. Cell)
───────────────────────────────── */
function setSelMode(mode){
  S.selMode=mode;
  // Reset
  S.rowSel.clear(); S.rowCheck.clear(); S.focusRI=-1; S.focusCI=-1;
  S.rangeR1=-1;S.rangeC1=-1;S.rangeR2=-1;S.rangeC2=-1;
  _ctlCls('btnSelRow', 'on', mode==='row');
  _ctlCls('btnSelCell', 'on', mode==='cell');
  _ctlTxt('selModeInfo', mode==='row'?'Mode: Row Select':'Mode: Cell Select');
  renderGrid();
}

/* 체크박스 전용 — rowCheck (하이라이트와 무관) */
function toggleRowCheck(id, cb) {
  if (cb.checked) S.rowCheck.add(id); else S.rowCheck.delete(id);
  updFoot();
  _syncCbHdr();   // 개별 체크 → 헤더 전체선택 상태(전체/일부/없음) 갱신
  _emit('selectionChange', { selected: [...S.rowSel], checked: [...S.rowCheck] });
}
/* 행 선택(하이라이트) 토글 — rowSel.
   on 을 생략하면 반전. (이전에는 이름과 달리 rowCheck 를 건드렸다) */
function toggleRowSel(id, on) {
  const want = (on===undefined) ? !S.rowSel.has(id)
             : (typeof on==='object' && on!==null) ? !!on.checked   // 구 시그니처(체크박스 요소)
             : !!on;
  if (want) S.rowSel.add(id); else S.rowSel.delete(id);
  updFoot();
  renderGrid();
  _emit('selectionChange', { selected: [...S.rowSel], checked: [...S.rowCheck] });
}

/* Cell mousedown — start range or focus */
function cellMD(e,ri,ci,rowId,colKey){
  if(e.button!==0) return;
  ModuGrid._active = GID;   // 키보드 포커스를 이 인스턴스로
  // 편집기(select/input/textarea) 내부 클릭은 그대로 통과 — preventDefault 하면
  // 네이티브 select 드롭다운이 열리지 않음 (리스트박스 버그의 원인)
  const t=e.target;
  if(t.tagName==='INPUT'||t.tagName==='SELECT'||t.tagName==='OPTION'||t.tagName==='TEXTAREA'
     ||t.closest('.edit-open')||t.closest('.treetog')||t.closest('.rrh')||t.closest('.img-dnd-wrap')) return;
  // 열린 편집기 '밖'을 클릭 → 즉시 커밋하고 목록/자동완성 닫기
  // (아래 preventDefault가 포커스 이동을 막아 blur 커밋 경로가 동작하지 않으므로 명시 처리)
  // 검증 실패 시 클릭 동작 자체를 중단 — 셀을 고치거나 Esc로 취소해야 진행 가능
  if(S.editCell && !commitEdit()) return;
  // 행번호(#) 셀 = 행 순서 드래그 핸들 (정렬/트리/그룹/서버 모드에선 기존 선택 동작)
  if(colKey==='_rn' && rowMD(e, ri, rowId)) return;
  if(S.selMode==='row'){
    /* ── Excel식 행 선택 ──
       클릭        : 해당 행만 선택 (이전 선택 해제)
       드래그      : 누른 행부터 지나는 행까지 연속 범위 선택
       Ctrl+클릭   : 기존 선택 유지한 채 개별 추가/해제
       Shift+클릭  : 앵커 행부터 클릭 행까지 범위 선택
       (체크박스 rowCheck는 독립 상태 — 영향 없음)                    */
    e.preventDefault();   // 드래그 중 텍스트 선택 방지
    const _applyRowSel = () => {
      EL.wrap.querySelectorAll('tr[data-id]').forEach(tr=>
        tr.classList.toggle('rsel', S.rowSel.has(+tr.dataset.id)));
      updFoot();
    };
    if(e.ctrlKey || e.metaKey){
      // 개별 토글 (기존 선택 유지)
      if(S.rowSel.has(rowId)) S.rowSel.delete(rowId); else S.rowSel.add(rowId);
      S.rowAnchor = ri;
      _applyRowSel();
      _emit('rowClick', { id: rowId, selected: S.rowSel.has(rowId) });
    } else if(e.shiftKey && S.rowAnchor >= 0){
      // 앵커 → 클릭 행 범위 선택 (교체)
      const a=Math.min(S.rowAnchor,ri), b=Math.max(S.rowAnchor,ri);
      S.rowSel = new Set(S.filtered.slice(a,b+1).map(r=>r.id));
      _applyRowSel();
      _emit('rowClick', { id: rowId, selected: true });
    } else {
      // 단일 선택(교체) + 드래그 범위 시작
      S.rowAnchor = ri;
      S.rowRanging = true;
      S.rowSel = new Set([rowId]);
      _applyRowSel();
      _emit('rowClick', { id: rowId, selected: true });
    }
    _emit('selectionChange', { selected: [...S.rowSel], checked: [...S.rowCheck] });
    // EditMode: 클릭한 셀을 키보드 탐색 시작점으로
    // 주의: full renderGrid()는 열린 에디터를 파괴하므로 클래스만 서지컬 이동
    if(S.editMode){
      S.focusRI=ri; S.focusCI=ci;
      _ctlTxt('stCell', `Focus: row${ri+1} ${colKey}`);
      EL.wrap.querySelectorAll('.cfocus').forEach(el=>el.classList.remove('cfocus'));
      const td=EL.wrap.querySelector(`td[data-c="${colKey}"][data-id="${rowId}"]`)||(e.target.closest&&e.target.closest('td'));
      if(td) td.classList.add('cfocus');
      /* 클릭한 셀에 숨은 입력기를 장착 → 곧바로 키인하면 값이 입력된다.
         (예전에는 row 모드에서 이 장착을 아예 하지 않아 F2/더블클릭 없이는 입력이 불가능했다)
         mousedown 시점 장착만으로는 부족하다 — 버튼을 누르고 있는 동안(클래스 갱신·드래그)
         포커스를 잃으면 되돌릴 곳이 없다. mouseup 후에 한 번 더 장착하도록 예약해 둔다. */
      _imeTrackDeferred(rowId, colKey);
      S._imeRearmPending = { rowId, colKey };
    }
    return;
  }
  // Cell mode: 텍스트 선택은 .jtd의 CSS user-select:none으로 방지됨.
  //   여기서 e.preventDefault()를 부르면 뒤따르는 click/dblclick이 취소되어
  //   더블클릭 편집이 안 되므로 호출하지 않는다.
  S.focusRI=ri; S.focusCI=ci;
  // 단일 클릭은 range 완전 해제(키보드 이동과 동일하게 cfocus만).
  //   드래그 시작(cellMV 첫 이동) 시 앵커를 focus로 설정해 range를 만든다.
  S.rangeR1=-1; S.rangeC1=-1;
  S.rangeR2=-1; S.rangeC2=-1;
  S._dragAnchorRi=ri; S._dragAnchorCi=ci;   // 드래그 앵커 후보
  S.ranging=true;
  _ctlTxt('stCell', `Focus: row${ri+1} ${colKey}`);
  // ★ renderGrid()로 tbody 전체를 재생성하면 mousedown~mouseup 사이 td가 파괴되어
  //   click/dblclick 이벤트가 발생하지 않는다(더블클릭 편집 불가). 따라서 전체 재렌더 대신
  //   선택 표시(cfocus/cin-range)만 클래스로 갱신한다.
  EL.wrap.querySelectorAll('.jtd.cfocus').forEach(el=>el.classList.remove('cfocus'));
  EL.wrap.querySelectorAll('.jtd.cin-range').forEach(el=>el.classList.remove('cin-range'));
  const _focusTd=EL.wrap.querySelector(`td[data-c="${colKey}"][data-id="${rowId}"]`);
  if(_focusTd) _focusTd.classList.add('cfocus');
  // 클릭한 셀에 숨은 입력기 추적(0 크기 유지) + focus → IME 준비
  if(S.editMode) _imeTrackDeferred(rowId, colKey);
}

function cellMV(e,ri,ci){
  if(S.editCell) return;   // 편집 중 재렌더 방지
  // Row 모드: 누른 상태로 이동 → 앵커부터 현재 행까지 연속 선택
  if(S.selMode==='row'&&S.rowRanging&&e.buttons===1){
    const a=Math.min(S.rowAnchor,ri), b=Math.max(S.rowAnchor,ri);
    const ids=S.filtered.slice(a,b+1).map(r=>r.id);
    if(ids.length!==S.rowSel.size || !ids.every(id=>S.rowSel.has(id))){
      S.rowSel=new Set(ids);
      EL.wrap.querySelectorAll('tr[data-id]').forEach(tr=>
        tr.classList.toggle('rsel', S.rowSel.has(+tr.dataset.id)));
      updFoot();
    }
    return;
  }
  if(S.selMode==='cell'&&S.ranging&&e.buttons===1){
    /* 같은 셀 안에서의 미세한 움직임은 범위 선택이 아니다.
       (길게 눌렀다 떼면 1px 흔들림만으로도 1×1 범위가 생겨
        셀 배경이 진해지고 재렌더로 숨은 입력기 포커스가 날아갔다) */
    if(ri===S._dragAnchorRi && ci===S._dragAnchorCi){
      if(S.rangeR1>=0){                       // 범위 밖으로 나갔다 돌아온 경우 해제
        S.rangeR1=S.rangeC1=S.rangeR2=S.rangeC2=-1;
        _paintRange();
      }
      return;
    }
    // 드래그 시작: 앵커(rangeR1)가 아직 없으면 클릭 위치로 설정
    if(S.rangeR1<0 && S._dragAnchorRi!=null){
      S.rangeR1=S._dragAnchorRi; S.rangeC1=S._dragAnchorCi;
    }
    if(S.rangeR2===ri&&S.rangeC2===ci) return; // no change
    S.rangeR2=ri; S.rangeC2=ci;
    /* renderGrid()는 DOM을 전부 새로 만들어 숨은 입력기(holder)가 td에서 떨어져
       포커스를 잃는다 → 드래그 후 키 입력이 안 먹힌다.
       범위 표시는 클래스만 갱신하는 것으로 충분하다. */
    _paintRange();
  }
}

/* 범위 선택 표시를 클래스로만 갱신 (재렌더 없음).
   td 의 data-ri/data-ci 는 S.filtered 인덱스·표시 컬럼 인덱스와 같은 좌표계다. */
function _paintRange(){
  const has = S.rangeR1>=0 && S.rangeC1>=0 && S.rangeR2>=0 && S.rangeC2>=0;
  const r1=Math.min(S.rangeR1,S.rangeR2), r2=Math.max(S.rangeR1,S.rangeR2);
  const c1=Math.min(S.rangeC1,S.rangeC2), c2=Math.max(S.rangeC1,S.rangeC2);
  EL.wrap.querySelectorAll('td[data-ri]').forEach(td=>{
    const ri=+td.dataset.ri, ci=+td.dataset.ci;
    const on = has && ri>=r1 && ri<=r2 && ci>=c1 && ci<=c2;
    td.classList.toggle('cin-range', on);
  });
}

const _onDocMouseup=()=>{
  if(S.ranging){
    S.ranging=false;
    /* 1×1 범위(= 사실상 단일 클릭)는 해제한다.
       남겨두면 셀 배경이 진한 채로 유지되고, Delete/복사가 '범위' 로 동작한다. */
    if(S.rangeR1>=0 && S.rangeR1===S.rangeR2 && S.rangeC1===S.rangeC2){
      S.rangeR1=S.rangeC1=S.rangeR2=S.rangeC2=-1;
      _paintRange();
    }
    _imeRearm();   // 드래그 중 포커스를 잃었을 수 있으니 숨은 입력기 재장착
  }
  if(S.rowRanging){
    S.rowRanging=false;
    _emit('selectionChange', { selected: [...S.rowSel], checked: [...S.rowCheck] });
  }
  /* row 모드 클릭 마무리 — mousedown~mouseup 사이에 포커스를 잃었을 수 있으므로
     클릭 시퀀스가 끝난 뒤 숨은 입력기를 다시 장착한다.
     (holder 를 다른 td 로 옮기면 브라우저가 포커스를 떨어뜨린다. 이 동작은
      jsdom 에서는 재현되지 않아 실브라우저에서만 드러난다) */
  if(S._imeRearmPending){
    const { rowId, colKey } = S._imeRearmPending;
    S._imeRearmPending = null;
    if(!S.editCell) _imeTrackDeferred(rowId, colKey);   // 같은 셀 편집 중인지는 안에서 판단
  }
};
document.addEventListener('mouseup', _onDocMouseup);

/* ── 키보드 활성 인스턴스 갱신 ──
   _active 는 생성/셀클릭 때 세팅되지만 해제되는 곳이 없어서, 한 번 그리드를 클릭하면
   페이지 어디를 클릭해도 방향키·Delete·Ctrl+Z 가 계속 그리드로 흘러갔다.
   그리드 DOM(root: 본체+모달·컨텍스트메뉴·컬럼패널 등) 밖을 누르면 활성에서 내려온다.
   다중 그리드: 다른 그리드가 이미 활성을 가져갔으면(_active!==GID) 건드리지 않는다. */
const _onDocMousedown = e => {
  const inMine = !!(root && e.target && root.contains(e.target));
  if (inMine) ModuGrid._active = GID;
  else if (ModuGrid._active === GID) ModuGrid._active = null;
};
document.addEventListener('mousedown', _onDocMousedown);

/* ─────────────────────────────────
   A. EDIT MODE
   BUG FIX: dblclick only in editMode
   Cells show edit input ONLY when editMode=ON
───────────────────────────────── */
function toggleEditMode(){
  S.editMode=!S.editMode;
  _ctlCls('btnEdit', 'on', S.editMode);
  root.classList.toggle('editmode',S.editMode);
  _ctlTxt('stEdit', S.editMode?'EditMode: ON':'EditMode: off');
  if(!S.editMode&&S.editCell)cancelEdit();
  // Re-render so image cells show proper UI
  renderGrid();
  toast(S.editMode?msg('editOn'):msg('editOff'));
}

function toggleFreeze(){S.freezeOn=!S.freezeOn;_ctlCls('btnFreeze', 'on', S.freezeOn);renderGrid();}
function toggleRowNum(){S.showRN=!S.showRN;if(_ctl('btnRn'))_ctlCls('btnRn', 'on', S.showRN);renderGrid();}
function toggleCheckbox(){S.showCB=!S.showCB;if(_ctl('btnCb'))_ctlCls('btnCb', 'on', S.showCB);renderGrid();}
function toggleStatusCol(){S.showST=!S.showST;if(_ctl('btnSt'))_ctlCls('btnSt', 'on', S.showST);renderGrid();}
/* ══════════ 폰트 (헤더 / 본문 독립) ══════════
   크기·서체·굵기·기울임을 통으로 조절한다.

     G.setFont({ header:{size:12, bold:true},
                 body:{size:14, family:'Pretendard, sans-serif', italic:true} })
     G.setFont({ body:{size:13} })          // 헤더는 그대로
     G.setFont(14)                          // 숫자 하나 = 본문 크기
     G.setFont(null)                        // 둘 다 CSS 기본값으로

   속성
     size   : 12 | '12px' | '0.9rem'
     family : 'Pretendard, sans-serif'  (CSS font-family 값 그대로)
     weight : 400 | 700 | 'bold' | 'normal'
     bold   : true/false   (weight 미지정 시 700/400 으로 해석)
     italic : true/false
   각 속성에 null 을 주면 그 항목만 기본값으로 되돌린다. */
function _fsNorm(v){
  if(v==null||v==='') return null;
  if(typeof v==='number') return isFinite(v)&&v>0 ? v+'px' : null;
  const s=String(v).trim();
  if(/^[0-9.]+$/.test(s)) return (+s>0) ? s+'px' : null;
  return /^[0-9.]+(px|pt|em|rem|%)$/.test(s) ? s : null;
}
function _fwNorm(spec){
  if(spec.weight!=null&&spec.weight!==''){
    const w=spec.weight;
    if(typeof w==='number') return (w>=1&&w<=1000) ? String(Math.round(w)) : null;
    const t=String(w).trim().toLowerCase();
    if(/^\d+$/.test(t)) return t;
    return ['normal','bold','lighter','bolder'].includes(t) ? t : null;
  }
  if('bold' in spec) return spec.bold ? '700' : (spec.bold===false ? '400' : null);
  return undefined;                       // 미지정 = 손대지 않음
}
function _ffNorm(v){
  if(v==null||v==='') return null;
  const s=String(v).trim();
  return s.length>200 ? null : s;         // 지나치게 긴 값은 무시
}

const _FONT_VARS = {
  header:{ size:'--fs-hd', family:'--ff-hd', weight:'--fw-hd', style:'--fst-hd' },
  body:  { size:'--fs-bd', family:'--ff-bd', weight:'--fw-bd', style:'--fst-bd' }
};
function _applyFontPart(part, spec){
  const V=_FONT_VARS[part]; if(!V) return;
  const cur = S.font[part] || (S.font[part]={});
  const set=(k,val)=>{
    cur[k]=val;
    if(val) root.style.setProperty(V[k], val);
    else    root.style.removeProperty(V[k]);
  };
  if(spec===null){ ['size','family','weight','style'].forEach(k=>set(k,null)); return; }
  if(typeof spec==='number'||typeof spec==='string'){ set('size', _fsNorm(spec)); return; }
  if(typeof spec!=='object') return;
  if('size'   in spec) set('size',   _fsNorm(spec.size));
  if('family' in spec) set('family', _ffNorm(spec.family));
  const w=_fwNorm(spec);
  if(w!==undefined)    set('weight', w);
  if('italic' in spec) set('style',  spec.italic ? 'italic' : (spec.italic===false ? 'normal' : null));
  // getFont() 결과를 그대로 다시 넣을 수 있도록 style 도 직접 받는다 (레이아웃 복원 경로)
  if('style'  in spec) set('style',  ['italic','normal','oblique'].includes(spec.style) ? spec.style : null);
}
/** setFont(spec) — spec: {header, body} | 숫자·문자열(본문 크기) | null(초기화) */
function setFont(spec){
  if(spec===null||spec===undefined){ _applyFontPart('header',null); _applyFontPart('body',null); }
  else if(typeof spec==='number'||typeof spec==='string'){ _applyFontPart('body', spec); }
  else if(typeof spec==='object'){
    if('header' in spec) _applyFontPart('header', spec.header);
    if('body'   in spec) _applyFontPart('body',   spec.body);
    // {size:..} 처럼 part 없이 주면 본문으로 본다
    if(!('header' in spec) && !('body' in spec)) _applyFontPart('body', spec);
  }
  syncRowHeights();   // 글자가 바뀌면 좌우 행 높이를 다시 맞춰야 한다
  return getFont();
}
/** getFont() → {header:{size,family,weight,style}, body:{...}} (null = CSS 기본값) */
function getFont(){
  const cp=o=>({ size:o.size||null, family:o.family||null, weight:o.weight||null, style:o.style||null });
  return { header:cp(S.font.header||{}), body:cp(S.font.body||{}) };
}

/* 헤더 필터 표시 on/off.
   끄면 아이콘이 사라지고 팝업도 열리지 않는다.
   숨겨진 채 필터가 걸려 있으면 혼란스러우므로, 끌 때 적용 중인 컬럼 필터를 해제한다.
   (특정 컬럼만 끄려면 컬럼 정의에 noFilter:1) */
function toggleFilter(on){
  const next = (on===undefined) ? !S.showFilter : !!on;
  if(next===S.showFilter) return S.showFilter;
  S.showFilter=next;
  if(_ctl('btnFilter')) _ctlCls('btnFilter','on',S.showFilter);
  if(!S.showFilter && Object.keys(S.cfilters).length){
    S.cfilters={};
    S.page=1;
    applyFilters();          // 내부에서 renderGrid
  } else {
    renderGrid();
  }
  if(EL.cfp) EL.cfp.classList.remove('vis');   // 열려 있던 팝업 닫기
  return S.showFilter;
}

/* ══════════ 테마 ══════════
   CSS 변수만 갈아끼우는 방식이라 구조·동작에는 영향이 없다.
   그리드 컨테이너에 data-theme 을 걸므로 한 화면에서 그리드마다 다른 테마도 된다.

     G.setTheme('dark')                    내장 프리셋
     G.setTheme('light')                   기본값으로 복귀
     G.setTheme('dark', {ac:'#0ea770'})    프리셋 + 변수 일부 덮어쓰기
     G.setTheme(null, {ROW:'30px'})        변수만 직접 지정
     G.getTheme()                          현재 테마명
     G.getThemes()                         사용 가능한 프리셋 목록 */
const THEMES = ['light','dark','midnight','slate','ocean','forest','sunset','rose','contrast','compact','compact-dark'];

/* vars: {ac:'#...', ROW:'30px'} → --ac, --ROW 로 주입. null 이면 그 변수 해제 */
function _applyThemeVars(vars){
  if(vars===null){ (S._themeVars||[]).forEach(k=>root.style.removeProperty(k)); S._themeVars=[]; return; }
  if(!vars || typeof vars!=='object') return;
  const applied = S._themeVars || [];
  for(const k in vars){
    const name = k.startsWith('--') ? k : '--'+k;
    const v = vars[k];
    if(v===null || v===undefined || v===''){ root.style.removeProperty(name); }
    else { root.style.setProperty(name, String(v)); if(!applied.includes(name)) applied.push(name); }
  }
  S._themeVars = applied;
}
function setTheme(name, vars){
  if(name!==undefined && name!==false){
    const t = (name===null || name==='light') ? null : String(name);
    if(t && !THEMES.includes(t)) console.warn('ModuGrid.setTheme: unknown theme —', t);
    S.theme = t || 'light';
    if(t) root.setAttribute('data-theme', t);
    else  root.removeAttribute('data-theme');
    _applyThemeVars(null);            // 프리셋 전환 시 이전 커스텀 변수 정리
  }
  if(vars!==undefined) _applyThemeVars(vars);
  syncRowHeights();                    // 행 높이 변수가 바뀔 수 있다
  return S.theme;
}
function getTheme(){ return S.theme || 'light'; }
function getThemes(){ return [...THEMES]; }

/** setPlaceholderMode('all'|'first'|'none') */
function setPlaceholderMode(mode){
  if(!['all','first','none'].includes(mode)) return false;
  S.placeholderMode=mode;
  renderGrid();
  return true;
}


/* 하단 상태바 표시 반영.
   showFoot=false 면 상태바 전체를 감춘다(개별 설정은 그대로 보존).
   항목이 전부 꺼져 있으면 빈 막대만 남으므로 상태바도 함께 감춘다. */
function _applyFootVis(){
  const anyOn = S.showRows || S.showPager || S.showPageSize;
  /* 상태바 전체는 display 로 완전히 제거한다(공간까지 회수). */
  if(EL.jfoot) EL.jfoot.style.display = (S.showFoot && anyOn) ? '' : 'none';
  /* 개별 항목은 visibility 로 감춘다.
     .jfoot 는 justify-content:space-between 이라 display:none 으로 지우면
     남은 항목들이 재배치되어 위치가 바뀐다 → 자리는 유지하고 보이지만 않게 한다. */
  const vis=(el,on)=>{ if(!el) return; el.style.display=''; el.style.visibility = on ? '' : 'hidden'; };
  vis(EL.fi,  S.showRows);
  vis(EL.pgn, S.showPager);
  vis(EL.fps, S.showPageSize);
}
/* 하단 상태바 표시 토글 — 인자 생략 시 반전 */
function toggleFoot(on){
  S.showFoot = (on===undefined) ? !S.showFoot : !!on;
  if(_ctl('btnFoot')) _ctlCls('btnFoot','on',S.showFoot);
  _applyFootVis();
}
function toggleRowsInfo(on){ S.showRows     = (on===undefined)?!S.showRows    :!!on; _applyFootVis(); }
function togglePager(on)   { S.showPager    = (on===undefined)?!S.showPager   :!!on; _applyFootVis(); }
function togglePageSize(on){ S.showPageSize = (on===undefined)?!S.showPageSize:!!on; _applyFootVis(); }

/* 변경상태 배경색 on/off */
function toggleDirtyMark(){
  S.dirtyMark=!S.dirtyMark;
  if(_ctl('btnDirty')) _ctlCls('btnDirty','on',S.dirtyMark);
  renderGrid();
}
function toggleStripe(){
  S.striped=!S.striped;
  if(_ctl('btnStripe'))_ctlCls('btnStripe', 'on', S.striped);
  [EL.gt,EL.gtLb].forEach(el=>{if(el)el.style.setProperty('--bg-alt',S.striped?'':'var(--bg)');});
}

/* 자동완성 결과 캐시 */
const _acCache = _CacheAPI(500);
/* 서버 필터 목록(distinct) 캐시 — 컬럼별 1건, reload()/데이터 로드 시 무효화 */
const _fltCache = _CacheAPI(100);

// Autocomplete 로컬 힌트 — initGrid(config.acHints)로 확장 가능
let AC_LOCAL = {
  status: ['active','inactive','pending'],
  role:   ['Developer','Designer','Manager','Analyst','DevOps','QA'],
};
/** initGrid에서 추가 AC 힌트 주입 */
function setACHints(hints){ Object.assign(AC_LOCAL, hints||{}); }

/* 자동완성 후보를 '리스트 옵션'과 동일한 pair 체계로 정규화한다.
   자동완성도 결국 하나의 목록이고, 어디서 가져오는지만 다르다.
   → acHints / acSource 모두 문자열 · {code,name} · {value,label} 등을 그대로 쓸 수 있다.
   반환: [{v:코드, t:표시명, d:표시문자열(optionFormat 적용), raw}] */
function _acPairs(colKey, list){
  const col = COLS.find(c => c.key === colKey);
  const pairs = (list || []).map(o => {
    const p = _optPair(o);
    return { ...p, d: _optText(col, p, null) };
  });
  _rememberPairs(colKey, pairs);   // 선택 후 셀에서 표시명을 되찾을 수 있도록 보관
  return pairs;
}
/* 컬럼의 로컬 자동완성 후보 (col.acHints → 그리드 acHints) */
function _acLocalPairs(colKey, row){
  const col = COLS.find(c => c.key === colKey);
  if(!_acEnabled(col)) return [];
  return _acPairs(colKey, _selOptions(col, row || null));
}
/* 질의어 매칭 — 표시문자열 · 표시명 · 코드 세 가지 모두에 건다 (콤보 필터와 동일 규칙) */
function _acMatch(pairs, q){
  const s = String(q || '').toLowerCase();
  if (!s) return pairs;
  return pairs.filter(p =>
    p.d.toLowerCase().includes(s) ||
    p.t.toLowerCase().includes(s) ||
    p.v.toLowerCase().includes(s));
}

async function fetchAC(colKey, q) {
  const col = COLS.find(c => c.key === colKey);
  if (!_acEnabled(col)) return { items: [], src: 'local' };
  const lim = _acLimit(col);
  const grp = 'ac';
  const key = `${colKey}::${q}`;
  const cached = _acCache.get(grp, key);
  if (cached) return { items: cached, src: 'cache' };

  let res = [], src = 'local';
  const srcFn = _acSrcOf(col);          // 컬럼 전용 acSource 우선
  if (srcFn) {
    try {
      const r = await srcFn(colKey, q, col);
      // 서버 응답도 문자열/객체 혼용 허용 — pair로 정규화
      if (Array.isArray(r) && r.length) { res = _acPairs(colKey, r).slice(0, lim); src = 'web'; }
    } catch (err) {
      console.error('ModuGrid: acSource("' + colKey + '", "' + q + '") failed — falling back to local hints.', err);
    }
  }
  if (!res.length) {
    res = _acMatch(_acLocalPairs(colKey), q).slice(0, lim);
  }
  _acCache.set(grp, key, res);
  return { items: res, src };
}

let acSel=-1, acList=[], acCb=null, acSig='';
/* items = _acPairs 결과({v,t,d}) 배열.
   화면에는 d(=optionFormat 적용 표시문자열)를, 커밋에는 v(코드)를 쓴다.
   코드와 표시명이 다르면 코드도 옅게 병기해 어떤 값이 저장되는지 보이게 한다. */
function showAC(items,src,onPick){
  const d=EL.acdrop;
  if(!items.length){d.classList.remove('vis');acSig='';return;}
  acCb=onPick;
  /* ★ 같은 목록을 다시 그리지 않는다.
     innerHTML 을 새로 만들면 선택 하이라이트(.aca)가 지워지고 acSel 이 -1 로 돌아가,
     사용자가 ↓ 로 골라둔 항목이 취소된다.
     한글 조합이 끝나는 순간(compositionend 직후 브라우저가 input 이벤트를 한 번 더 보낸다)
     같은 질의로 이 함수가 다시 불리는 것이 대표적인 경우다 — ↓ 를 한 번 눌렀는데
     목록이 새로고침되며 선택이 풀리고, 두 번째 ↓ 부터 정상 동작하던 원인.
     서명에는 항목만 넣고 src 는 뺀다. acSource(서버) 컬럼은 fetchAC 가 결과를 캐시해
     같은 질의라도 재조회 시 src 가 'web'→'cache' 로 바뀌는데, 이걸 서명에 넣으면
     항목이 같은데도 다시 그려져 선택이 또 풀린다. 출처 배지는 제자리에서 갱신한다. */
  const sig = items.map(p=>p.v+'\u0001'+p.d).join('\u0002');
  if(acSig===sig && d.classList.contains('vis')){ acList=items; _acSetSrcBadge(src); return; }
  acSig=sig;
  acList=items;acSel=-1;
  d.innerHTML=items.map((p,i)=>{
    const code = (p.v!==p.d) ? `<span class="accode">${esc(p.v)}</span>` : '';
    return `<div class="acitem" data-act="acpick" data-i="${i}" title="${esc(p.v)}">${esc(p.d)}${code}`
         + `<span class="acsrc ${_acSrcCls(src)}">${esc(src)}</span></div>`;
  }).join('');
  d.classList.add('vis');
}
function _acSrcCls(src){ return src==='web'?'acweb':src==='cache'?'acche':'acloc'; }
/* 목록은 그대로 두고 출처 배지(local/web/cache)만 제자리 갱신 — 선택 상태 보존 */
function _acSetSrcBadge(src){
  const cls=_acSrcCls(src);
  EL.acdrop.querySelectorAll('.acsrc').forEach(el=>{ el.className='acsrc '+cls; el.textContent=src; });
}
function hideAC(){EL.acdrop.classList.remove('vis');acSel=-1;acList=[];acSig='';}
function acPick(i){
  const p=acList[i];
  if(acCb && p!==undefined){ acCb(p.v, p); hideAC(); }   // 커밋값 = 코드
}
function acNav(dir){
  const els=EL.acdrop.querySelectorAll('.acitem');if(!els.length)return false;
  els[acSel>=0?acSel:0]?.classList.remove('aca');
  acSel=Math.max(0,Math.min(els.length-1,acSel+dir));
  els[acSel]?.classList.add('aca');
  els[acSel]?.scrollIntoView({block:'nearest'});
  return true;
}

/* 에디터 타입 결정 — 우선순위: col.editor(함수='custom'|문자열) → col.type 매핑 → options 있으면 select → text
   col.editor=false 는 startEdit/canEdit에서 편집 자체를 차단 */
/* ── 시스템 컬럼(_rn 행번호 / _st 상태 / _cb 체크박스) ── */
const SYS_COLS = ['_rn','_st','_cb'];
function _isSysCol(key){ return SYS_COLS.includes(key); }
/* 옵션으로 꺼진 시스템 컬럼 — 폭 0으로 접는다 */
function _sysHidden(c){
  return (c.key==='_rn' && !S.showRN)
      || (c.key==='_cb' && !S.showCB)
      || (c.key==='_st' && !S.showST);
}
/* 삭제 예정 행 */
function _isDel(row){ return !!(row && row._del); }

/* ── 편집모드 세부 권한 ──
   editMode 가 마스터 스위치이고, 그 안에서 추가/수정/삭제를 따로 끌 수 있다.
   options.canInsert / canUpdate / canDelete (기본 모두 true) */
function canInsert(){ return S.editMode && S.canInsert; }
function canUpdate(){ return S.editMode && S.canUpdate; }
function canDelete(){ return S.editMode && S.canDelete; }

/* ══════════ 행/셀 단위 편집 잠금 ══════════
   컬럼 전체를 막는 col.editor:false 와 달리, '어떤 행이냐'에 따라 달라지는 잠금이다.

     options.rowEditable : function(row){ return true|false }   → 그 행 전체 잠금
     col.editable        : function(row, col){ return true|false } → 그 셀만 잠금

   두 콜백은 편집 진입(더블클릭·F2·클릭 후 키인), Delete 키 지우기, 붙여넣기,
   행 모달까지 모든 쓰기 경로에서 동일하게 적용된다.
   콜백이 예외를 던지면 '잠금'으로 처리한다(권한성 기능이라 안전한 쪽으로).
   프로그램 호출인 updateRow()/setData() 는 대상이 아니다 — 화면 조작만 막는다. */
function _lockedCell(col,row){
  if(!col || !row) return false;
  if(typeof S.rowEditable==='function'){
    try{ if(!S.rowEditable(row)) return true; }
    catch(e){ console.error('ModuGrid: rowEditable threw — treating the row as locked.', e); return true; }
  }
  if(typeof col.editable==='function'){
    try{ if(!col.editable(row,col)) return true; }
    catch(e){ console.error(`ModuGrid: col.editable("${col.key}") threw — treating the cell as locked.`, e); return true; }
  }
  return false;
}

/* 컬럼이 값 수정 대상인지 (권한 + 컬럼 정의 + 행 상태) */
function _colEditable(col,row){
  if(!canUpdate() || !col) return false;
  if(_isSysCol(col.key) || col.key.startsWith('_')) return false;
  if(col.editor===false || col.type==='images') return false;
  if(_lockedCell(col,row)) return false;      // rowEditable / col.editable
  return !_isDel(row);
}

/* ══════════ placeholder ══════════
   빈 셀에 안내 문구를 흐리게 표시한다(실제 값은 아니다).
     col.placeholder : '이름 입력'
     options.placeholderMode : 'all'(기본) | 'first' | 'none'
        all   — 값이 빈 모든 셀
        first — 화면 첫 행에만 (입력 예시용, 나머지 행은 깔끔하게)
        none  — 표시 안 함
   편집기에 진입하면 input 의 placeholder 로도 그대로 쓰인다. */
function _phOf(col){
  const t = col && col.placeholder;
  return (t==null || t==='') ? null : String(t);
}
function _isEmptyVal(v){
  return v===null || v===undefined || v==='' ||
         (Array.isArray(v) && v.length===0);
}
/* ri = 현재 화면(페이지) 기준 행 인덱스 */
function _showPh(col, row, ri){
  if(S.placeholderMode==='none') return false;
  if(!_phOf(col)) return false;
  if(_isSysCol(col.key) || col.type==='images') return false;
  if(!_isEmptyVal(row[col.key])) return false;
  if(S.placeholderMode==='first') return ri===0;
  return true;
}

/* ══════════ 대문자/소문자 강제 입력 ══════════
     col.textCase : 'upper' | 'lower'   (컬럼 단위)
     options.textCase                    (그리드 기본값)
   문자열 값에만 적용된다. 숫자·날짜·null 은 건드리지 않는다.
   한글은 대소문자가 없어 변환해도 그대로다(조합 중에는 아예 건드리지 않는다). */
function _caseOf(col){
  const c=(col && (col.textCase||col.case)) || S.textCase;
  return (c==='upper'||c==='lower') ? c : null;
}
function _applyCase(col,v){
  const c=_caseOf(col);
  if(!c || typeof v!=='string' || !v) return v;
  return c==='upper' ? v.toUpperCase() : v.toLowerCase();
}
/* 입력 중 변환 — 커서 위치를 유지한다. 조합(IME) 중에는 호출하지 않는다. */
function _caseFixInput(inp,col){
  if(!inp || !_caseOf(col)) return;
  const v=inp.value, nv=_applyCase(col,v);
  if(nv===v) return;
  let p=null;
  try{ p=inp.selectionStart; }catch(_){}
  inp.value=nv;
  if(p!=null){ try{ inp.setSelectionRange(p,p); }catch(_){} }
}

/* 헤더 라벨 — 이스케이프 후 줄바꿈 문자만 <br>로 바꾼다.
   label:'주문\n일자' 처럼 쓰면 그 위치에서만 줄이 바뀐다(수동 줄바꿈).
   options.headerWrap=true 면 폭에 맞춰 자동 줄바꿈도 함께 동작한다. */
function _thLabel(col){
  return esc(col.label ?? col.key).replace(/\r?\n/g,'<br>');
}

/* ══════════ _cb 헤더 (전체선택) ══════════
   options.cbHeader
     미지정 · 'check' · true → 전체선택 체크박스 (기본)
     'none' · false          → 빈 헤더
     그 외 문자열            → 그 문자열을 헤더 글자로 (수기 입력)
   전체선택 범위는 지금 화면에 그려지는 행 = 페이징 모드면 현재 페이지. */

/* 수기 라벨 문자열을 반환. null 이면 '체크박스 모드'라는 뜻. */
function _cbHdrText(){
  const v=S.cbHeader;
  if(v===false || v==='none') return '';
  if(v===true || v==='check' || v==null) return null;
  return String(v);
}
/* 전체선택 대상 행 — renderGrid 의 분기와 같은 기준으로 뽑는다.
   vs/tree/group/server 모드는 페이지 슬라이스가 없다(renderPgn 도 이 조건으로 페이저를 감춘다). */
function _cbScopeRows(){
  if(S.vs || S.treeOn || S.groupBy || S.serverMode) return S.filtered;
  const st=(S.page-1)*_pageSize();
  return S.filtered.slice(st, st+_pageSize());
}
/* 범위 안 체크 상태 → 'all' | 'some' | 'none' */
function _cbHdrState(){
  const rows=_cbScopeRows();
  if(!rows.length) return 'none';
  let n=0;
  for(const r of rows) if(S.rowCheck.has(r.id)) n++;
  return n===0 ? 'none' : (n===rows.length ? 'all' : 'some');
}
/* _cb 헤더 안쪽 HTML */
function _cbHdrHTML(){
  const txt=_cbHdrText();
  if(txt!==null) return `<span class="thl">${esc(txt).replace(/\r?\n/g,'<br>')}</span>`;
  // jcb 를 함께 붙여 기존 체크박스 스타일·mousedown 전파차단을 그대로 재사용한다
  return `<input type="checkbox" class="jcb jcbh"${_cbHdrState()==='all'?' checked':''} title="${esc(msg('selectAll'))}"/>`;
}
/* indeterminate 는 HTML 속성이 없어 innerHTML 로는 못 넣는다 → 렌더 직후 DOM 에 직접 세팅 */
function _syncCbHdr(){
  if(_cbHdrText()!==null) return;             // 수기 라벨 모드면 할 일 없음
  const st=_cbHdrState();
  [EL.gheadLeft, EL.ghead].forEach(h=>{
    const el = h && h.querySelector('.jcbh');
    if(!el) return;
    el.checked       = (st==='all');
    el.indeterminate = (st==='some');
  });
}
/* 헤더 전체선택 토글 — 범위 안 행을 모두 체크/해제 */
function toggleCheckAll(on){
  const rows=_cbScopeRows();
  if(on) rows.forEach(r=>S.rowCheck.add(r.id));
  else   rows.forEach(r=>S.rowCheck.delete(r.id));
  updFoot();
  renderGrid();
  _emit('selectionChange',{ selected:[...S.rowSel], checked:[...S.rowCheck] });
}

function getEditType(col){
  if(typeof col.editor==='function') return 'custom';
  if(typeof col.editor==='string')   return col.editor;
  switch(col.type){
    case 'number': case 'currency': case 'progress': return 'number';
    case 'date':     return 'date';
    case 'textarea': return 'textarea';
    case 'select':   return 'select';
    case 'images':   return 'images';
  }
  if(col.options) return 'select';
  return 'text';
}

/* 컬럼의 목록 원본 — 우선순위: col.options → col.acHints → options.acHints[key]
   드롭다운이든 자동완성이든 '목록'은 하나의 개념이라 같은 해석기를 쓴다. */
function _rawList(col){
  if(!col) return null;
  if(col.options!=null) return col.options;
  if(col.acHints!=null) return col.acHints;   // 컬럼 단위 자동완성 목록
  const h=AC_LOCAL[col.key];
  return (h && h.length) ? h : null;
}
/* 배열 | (row)=>배열 둘 다 허용 */
function _selOptions(col,row){
  const o=_rawList(col);
  if(typeof o==='function') return o(row)||[];
  if(Array.isArray(o)) return o;
  return [];
}

/* ══════════ 리스트 옵션: 코드 / 표시명 분리 ══════════
   col.options 항목은 아래를 모두 허용한다.
     'active'                  → 코드 = 표시명 = 'active'   (기존 방식, 그대로 동작)
     {value:'A', label:'활성'}  → 코드 'A', 표시명 '활성'
     {code:'A',  name:'활성'}   → 위와 동일 (Oracle 공통코드 스타일)
   데이터(row[key])에 저장되는 값은 항상 '코드'이고, 화면에는 '표시명'이 보인다.
   적용 범위: 셀 표시 · 드롭다운 목록 · 필터 팝업 · 검색 · CSV */
function _optPair(o){
  if(o==null) return {v:'',t:'',raw:null};
  if(typeof o==='object'){
    let v,t;
    if(o.code!==undefined){
      /* code가 명시된 형태 → code가 코드, 나머지 중 하나가 표시명.
         {code,name} {code,label} {code,value} {code,text} 전부 지원 */
      v=o.code;
      t=o.name !==undefined?o.name
       :o.label!==undefined?o.label
       :o.value!==undefined?o.value
       :o.text !==undefined?o.text : v;
    }else{
      /* code가 없으면 value/v/id가 코드, label/name/text/t가 표시명 */
      v=o.value!==undefined?o.value
       :o.v    !==undefined?o.v
       :o.id   !==undefined?o.id : '';
      t=o.label!==undefined?o.label
       :o.name !==undefined?o.name
       :o.text !==undefined?o.text
       :o.t    !==undefined?o.t : v;
    }
    // raw: optionFormat에서 code/name 외의 필드도 쓸 수 있도록 원본 보존
    return {v:String(v??''), t:String(t??v??''), raw:o};
  }
  return {v:String(o), t:String(o), raw:o};
}

/* 값이 '옵션 객체'인지 판별.
   배열·Date·인식 가능한 키가 하나도 없는 일반 객체는 건드리지 않는다
   (images 배열 등 다른 타입의 값이 코드로 뭉개지는 것을 막는다) */
function _isOptObj(o){
  return !!o && typeof o==='object' && !Array.isArray(o) && !(o instanceof Date) &&
    (o.code !==undefined || o.value!==undefined || o.v   !==undefined || o.id  !==undefined ||
     o.name !==undefined || o.label!==undefined || o.text!==undefined || o.t   !==undefined);
}

/* 셀 값 정규화 — 데이터에 옵션 객체가 그대로 들어있어도 코드 문자열로 환원한다.
   ([object Object] 표시 방지: 셀/필터/검색/CSV/정렬/서버전송이 모두 이 값을 쓴다) */
function _valCode(v){
  return _isOptObj(v) ? _optPair(v).v : v;
}
function _optPairs(col,row){ return _selOptions(col,row).map(_optPair); }

function _hasList(col){ return _rawList(col)!=null; }

/* ── 런타임 라벨 사전 ──
   서버 자동완성(acSource)이나 함수형 목록처럼 '정적 목록에 없는' 후보의 표시명을 기억한다.
   이게 없으면 목록에는 포맷이 보이는데 선택 후 셀에는 코드만 남는다
   (셀 렌더는 col.options/col.acHints 에서만 코드→표시명을 찾기 때문). */
const _LBL = new Map();          // colKey → Map(code → pair)
const _LBL_MAX = 500;            // 컬럼당 상한 (오래된 항목부터 제거)
function _rememberPairs(colKey, pairs){
  if(!colKey || !pairs || !pairs.length) return;
  let m=_LBL.get(colKey);
  if(!m){ m=new Map(); _LBL.set(colKey,m); }
  for(const p of pairs){
    if(!p || p.v==='') continue;
    if(m.has(p.v)) m.delete(p.v);            // 재삽입으로 최신화
    else if(m.size>=_LBL_MAX) m.delete(m.keys().next().value);
    m.set(p.v,p);
  }
}
function _recallPair(colKey, code){
  const m=_LBL.get(colKey);
  return m ? m.get(String(code??'')) : undefined;
}

/* 컬럼별 자동완성 설정
     col.ac       : false 면 해당 컬럼 자동완성 끔
     col.acHints  : 배열 | (row)=>배열 — 그 컬럼 전용 목록
     col.acSource : (colKey,q,col)=>Promise<배열> — 그 컬럼 전용 서버 조회
     col.acLimit  : 표시 개수 (기본 8)
   미지정 시 그리드 옵션(acHints / acSource)으로 폴백한다. */
function _acEnabled(col){ return !!col && col.ac!==false; }
function _acSrcOf(col){
  if(col && typeof col.acSource==='function') return col.acSource;
  return (typeof S._acSrc==='function') ? S._acSrc : null;
}
function _acLimit(col){
  const n = col && +col.acLimit;
  return (Number.isFinite(n) && n>0) ? n : 8;
}

/* 배열 options는 코드→표시명 Map을 컬럼에 캐싱 (셀마다 재조립 방지).
   options 배열이 통째로 교체되면 참조가 달라지므로 자동으로 다시 만든다. */
function _optMap(col){
  const src=_rawList(col);
  if(!Array.isArray(src)) return null;
  if(col._optMapSrc!==src){
    col._optMapSrc=src;
    const m=new Map();
    src.forEach(o=>{ const p=_optPair(o); m.set(p.v,p.t); });
    col._optMap=m;
  }
  return col._optMap;
}

/* 코드 → 표시명. 목록에 없는 코드는 그대로 돌려준다. */
function _optLabel(col,val,row){
  // 값 자체가 옵션 객체면 그 안의 표시명을 바로 쓴다
  if(_isOptObj(val)){
    const p=_optPair(val); return p.t||p.v;
  }
  if(!col) return val;
  const s=String(val??'');
  if(_hasList(col)){
    const m=_optMap(col);
    if(m && m.has(s)) return m.get(s);
    if(!m){                                        // 함수형 목록
      const hit=_optPairs(col,row).find(p=>p.v===s);
      if(hit) return hit.t;
    }
  }
  const rc=_recallPair(col.key,s);                 // 서버 응답 등에서 본 적 있는 코드
  if(rc) return rc.t;
  return val;
}

/* 표시명(또는 코드) → 코드. 어느 쪽으로도 못 찾으면 입력값을 코드로 본다. */
function _optCode(col,text,row){
  const q=String(_valCode(text)??'').trim();
  if(!col || !_hasList(col)) return q;
  const ps=_optPairs(col,row);
  const byLabel=ps.find(p=>p.t.toLowerCase()===q.toLowerCase());
  if(byLabel) return byLabel.v;
  const byCode=ps.find(p=>p.v.toLowerCase()===q.toLowerCase());
  if(byCode) return byCode.v;
  return q;
}

/* ── col.optionFormat — 드롭다운 목록 한 줄의 표시 포맷 ──
   미지정이면 표시명(t)만 나온다. 셀·필터 팝업은 이 포맷을 쓰지 않는다.

     optionFormat: '{code} - {name}'            // 템플릿 문자열
     optionFormat: (o,row)=>`[${o.code}] ${o.name}`   // 함수 (o = 원본 옵션 객체)

   템플릿 자리표시자
     {code} {value}            → 코드
     {name} {label} {text}     → 표시명
     그 외 {키}                 → 원본 옵션 객체의 해당 필드 (없으면 빈 문자열)
   함수가 예외를 던지거나 null을 반환하면 표시명으로 폴백한다. */
function _optText(col,p,row){
  const f=col&&col.optionFormat;
  if(typeof f==='function'){
    try{
      const src=(p.raw!=null&&typeof p.raw==='object')?p.raw:{code:p.v,name:p.t};
      const s=f(src,row);
      return s==null?p.t:String(s);
    }catch(err){ console.error('ModuGrid: optionFormat failed.', err); return p.t; }
  }
  if(typeof f==='string'){
    const raw=(p.raw&&typeof p.raw==='object')?p.raw:{};
    return f.replace(/\{(\w+)\}/g,(m,k)=>{
      if(k==='code'||k==='value') return p.v;
      if(k==='name'||k==='label'||k==='text') return p.t;
      const rv=raw[k];
      return rv==null?'':String(rv);
    });
  }
  return p.t;
}

/* optionFormat 적용 결과를 코드→문자열 Map으로 캐싱.
   함수형 optionFormat은 row에 따라 결과가 달라질 수 있어 캐싱하지 않는다. */
function _optFmtMap(col){
  const src=_rawList(col);
  if(!Array.isArray(src)) return null;
  if(typeof col.optionFormat==='function') return null;
  if(col._optFmtSrc!==src || col._optFmtSpec!==col.optionFormat){
    col._optFmtSrc=src; col._optFmtSpec=col.optionFormat;
    const m=new Map();
    src.forEach(o=>{ const p=_optPair(o); m.set(p.v,_optText(col,p,null)); });
    col._optFmtMap=m;
  }
  return col._optFmtMap;
}

/* 셀에 그릴 문자열 — optionFormat이 있으면 그 포맷, 없으면 표시명.
   목록에 없는 코드는 코드를 그대로 노출한다. */
function _optDisp(col,val,row){
  if(!col) return _valCode(val);
  if(_isOptObj(val)) return _optText(col,_optPair(val),row);
  const s=String(_valCode(val)??'');
  if(_hasList(col)){
    const m=_optFmtMap(col);
    if(m && m.has(s)) return m.get(s);
    if(!m){                                        // 함수형 목록/포맷
      const hit=_optPairs(col,row).find(p=>p.v===s);
      if(hit) return _optText(col,hit,row);
    }
  }
  const rc=_recallPair(col.key,s);                 // 서버 응답 등에서 본 적 있는 코드
  if(rc) return _optText(col,rc,row);
  return _valCode(val);
}

/* ══════════ 드롭다운(select) 편집기 — 콤보박스형 ══════════
   구조: 셀 안 [input + ▼] / 그 바로 아래에 목록 레이어.
   - 목록은 position:fixed 라 스크롤 컨테이너(.jsg-gsc)에 잘리지 않는다.
   - 타이핑하면 입력 문자로 목록이 필터링된다(부분 일치, 대소문자 무시).
   - 목록에 없는 값을 입력해도 저장된다. 단 col.options 자체는 변하지 않는다.
   반환: wrap(div). commitEdit이 inp.value를 읽으므로 wrap.value 접근자를 정의한다. */
function _buildCombo(col,row,colKey){
  const wrap=document.createElement('div');
  wrap.className='jsg-combo';

  const txt=document.createElement('input');
  txt.type='text'; txt.className='jsg-combo-txt'; txt.autocomplete='off';

  const arw=document.createElement('span');
  arw.className='jsg-combo-arw'; arw.textContent='▼';

  const list=document.createElement('div');
  list.className='jsg-combo-list';

  // d = 목록에 그릴 문자열 (optionFormat 적용). 입력칸·셀에는 표시명(t)만 쓴다.
  const ALL=_optPairs(col,row).map(p=>({...p, d:_optText(col,p,row)}));
  _rememberPairs(colKey, ALL);   // 선택 후 셀에서 표시명 복원용
  let view=ALL.slice();           // 현재 필터링된 목록
  let sel=-1;                     // 하이라이트 인덱스 (-1 = 없음)
  let open=false;

  // 입력칸에는 표시명, 실제 커밋값은 코드
  let curCode=String(_valCode(row[colKey])??'');
  txt.value=(ALL.find(p=>p.v===curCode)||{t:curCode}).t;

  const _pos=()=>{
    const r=wrap.getBoundingClientRect();
    list.style.left=r.left+'px';
    list.style.top=r.bottom+'px';
    list.style.minWidth=r.width+'px';
  };
  const _draw=()=>{
    list.innerHTML='';
    if(!view.length){
      const e=document.createElement('div');
      e.className='jsg-combo-empty'; e.textContent=msg('noMatch');
      list.appendChild(e); return;
    }
    view.forEach((p,i)=>{
      const d=document.createElement('div');
      d.className='jsg-combo-opt'+(i===sel?' sel':'');
      d.textContent=p.d;
      if(p.d!==p.v) d.title=p.v;      // 코드가 화면에 안 드러나면 툴팁으로 노출
      // mousedown + preventDefault: input의 blur(=커밋)보다 먼저 잡고 포커스 유지
      d.onmousedown=e=>{ e.preventDefault(); e.stopPropagation();
        curCode=p.v; txt.value=p.t; _close(); commitEdit(); };
      list.appendChild(d);
    });
  };
  const _scrollSel=()=>{
    if(sel<0) return;
    const el=list.children[sel];
    if(el&&el.scrollIntoView) el.scrollIntoView({block:'nearest'});
  };
  const _openList=()=>{ open=true; list.classList.add('vis'); _pos(); _draw(); _scrollSel(); };
  const _close=()=>{ open=false; list.classList.remove('vis'); };
  // 필터는 화면에 보이는 포맷 문자열·표시명·코드 모두에 걸린다
  const _filter=()=>{
    const q=txt.value.trim().toLowerCase();
    view = q ? ALL.filter(p=>p.d.toLowerCase().includes(q)
                           ||p.t.toLowerCase().includes(q)
                           ||p.v.toLowerCase().includes(q)) : ALL.slice();
    sel=-1; curCode=null;         // 타이핑 직후엔 미확정 → 커밋 때 _resolve로 확정
    if(!open) _openList(); else _draw();
  };
  const _move=d=>{
    if(!open){ _openList(); }
    if(!view.length) return;
    sel = (sel<0) ? (d>0?0:view.length-1) : (sel+d+view.length)%view.length;
    _draw(); _scrollSel();
  };
  /* 커밋 직전 값 확정.
     하이라이트가 있으면 그 항목, 없으면 입력 텍스트를 표시명→코드→원문 순으로 해석한다.
     목록에 없는 값은 입력값 그대로 코드로 저장된다(목록 자체는 변하지 않음). */
  const _resolve=()=>{
    if(sel>=0 && view[sel]){ curCode=view[sel].v; txt.value=view[sel].t; return; }
    const q=txt.value.trim();
    // 목록에 보이는 포맷 문자열을 그대로 입력/붙여넣기 한 경우도 코드로 해석
    const byFmt=ALL.find(p=>p.d.toLowerCase()===q.toLowerCase());
    if(byFmt){ curCode=byFmt.v; txt.value=byFmt.t; return; }
    const code=_optCode(col,txt.value,row);
    curCode=code;
    const hit=ALL.find(p=>p.v===code);
    if(hit) txt.value=hit.t;
  };

  txt.oninput=e=>{ e.stopPropagation(); _filter(); };
  txt.onkeydown=e=>{
    if(e.key==='ArrowDown'){e.preventDefault();e.stopPropagation();_move(1);return;}
    if(e.key==='ArrowUp'){e.preventDefault();e.stopPropagation();_move(-1);return;}
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();_close();cancelEdit();return;}
    if(e.key==='Enter'){e.preventDefault();e.stopPropagation();_resolve();_close();commitEdit();return;}
    if(e.key==='Tab'){e.preventDefault();e.stopPropagation();_resolve();_close();if(commitEdit())moveFocus((e.shiftKey||e.ctrlKey)?-1:1,0);return;}
    e.stopPropagation();   // 문자/방향키는 편집기에서 처리(grid로 전달 안 함)
  };
  // 편집기 안의 ▼: 목록 토글
  arw.onmousedown=e=>{ e.preventDefault(); e.stopPropagation(); open?_close():_openList(); txt.focus(); };
  // blur 커밋 — 편집기 내부(목록/▼) 클릭은 preventDefault로 포커스가 유지되므로 여기 안 옴
  txt.addEventListener('blur',()=>setTimeout(()=>{
    const c=S.editCell; if(!c||c.inp!==wrap) return;
    if(document.activeElement===txt) return;
    _resolve(); _close(); commitEdit();
  },160));

  wrap.appendChild(txt);
  wrap.appendChild(arw);
  wrap.appendChild(list);

  // commitEdit이 inp.value를 읽는다 → 표시명이 아니라 '코드'를 넘긴다
  Object.defineProperty(wrap,'value',{
    get:()=>(curCode!=null?curCode:_optCode(col,txt.value,row)),
    set:v=>{ curCode=String(v??''); txt.value=(ALL.find(p=>p.v===curCode)||{t:curCode}).t; },
    configurable:true});
  wrap._comboTxt=txt;
  wrap._comboPos=_pos;
  wrap._comboOpen=_openList;
  wrap._comboSeed=s=>{ txt.value=s; _filter(); try{txt.setSelectionRange(s.length,s.length);}catch(_){} };
  return wrap;
}

/* 스크롤 시 열린 드롭다운 목록을 셀 위치에 맞춰 재배치 (목록은 fixed) */
function _comboReposition(){
  const c=S.editCell;
  if(!c||c.et!=='select'||!c.inp||typeof c.inp._comboPos!=='function') return;
  if(!c.inp.isConnected) return;
  c.inp._comboPos();
}

/* 셀 달력(네이티브)에서 날짜를 고르면 편집기를 거치지 않고 바로 반영한다.
   commitEdit과 동일하게 ISO(yyyy-mm-dd) 문자열로 저장하고, validate·snap·이벤트를 그대로 태운다. */
function setCellDate(rowId,colKey,iso){
  if(!canUpdate()) return;
  // 다른 셀이 편집 중이면 먼저 커밋한다.
  //   안 하면 아래 applyFilters()의 재렌더가 열린 편집기를 지워 잔상·편집 유실이 생긴다.
  if(S.editCell && !commitEdit()) return;
  const row=S.data.find(r=>r.id===rowId); if(!row) return;
  const col=COLS.find(c=>c.key===colKey); if(!col||col.editor===false) return;
  const val=iso||'';                                  // 달력에서 지우면 공백
  if(String(row[colKey]??'')===String(val)) return;   // 변화 없으면 무시
  const td=EL.wrap.querySelector(`td[data-c="${colKey}"][data-id="${rowId}"]`);
  _applyValidate(row, colKey, val, td);   // 실패해도 값은 반영, 셀만 붉게
  row[colKey]=val;
  snap(`Edit ${colKey}`);
  _touchData();                     // 렌더 전 diff 캐시 무효화 (commitEdit과 동일)
  applyFilters();
  _emit('cellEdit',   { id:rowId, key:colKey, value:val });
  _emit('dataChange', { type:'update', id:rowId, field:colKey, value:val });
}

/* ══════════ Delete 키 — 셀 내용 지우기 ══════════
   대상: 편집모드에서 포커스된 셀, 범위 선택이 있으면 그 범위 전체(엑셀과 동일).
   제외: 시스템 컬럼(_rn/_st/_cb) · images · editor:false · 삭제예정 행.
   숫자 계열은 빈 문자열 대신 null 로 지운다(0 과 구분).
   validate 는 그대로 태우고(빈 값이 허용되지 않으면 붉게 표시), snap 1회 → Ctrl+Z 한 번에 복구. */
function _clearableCell(col,row){
  if(!col||!row) return false;
  if(_isSysCol(col.key)||col.key.startsWith('_')) return false;
  if(col.editor===false||col.type==='images') return false;
  if(_isDel(row)) return false;
  if(_lockedCell(col,row)) return false;        // rowEditable / col.editable
  return true;
}
/** clearCells() → 지운 셀 수. 범위 선택이 있으면 범위 전체, 없으면 포커스 셀 하나. */
function clearCells(){
  if(!canUpdate()) return 0;
  const vis=[...getFzCols(), ...getScCols()];   // 렌더 순서 = focusCI/rangeC 좌표계
  let r1,r2,c1,c2;
  if(S.rangeR1>=0&&S.rangeC1>=0&&S.rangeR2>=0&&S.rangeC2>=0){
    r1=Math.min(S.rangeR1,S.rangeR2); r2=Math.max(S.rangeR1,S.rangeR2);
    c1=Math.min(S.rangeC1,S.rangeC2); c2=Math.max(S.rangeC1,S.rangeC2);
  } else {
    if(S.focusRI<0||S.focusCI<0) return 0;
    r1=r2=S.focusRI;
    const fk=COLS[S.focusCI]&&COLS[S.focusCI].key;
    const ci=vis.findIndex(c=>c.key===fk);
    if(ci<0) return 0;
    c1=c2=ci;
  }
  const writes=[];
  for(let ri=r1;ri<=r2;ri++){
    const row=S.filtered[ri]; if(!row) continue;
    for(let ci=c1;ci<=c2;ci++){
      const col=vis[ci]; if(!_clearableCell(col,row)) continue;
      const et=getEditType(col);
      const blank=(et==='number'||_numericKeys.includes(col.key))?null:'';
      if(row[col.key]===blank) continue;      // 이미 비어 있음
      writes.push({row,col,blank});
    }
  }
  if(!writes.length) return 0;
  writes.forEach(w=>{
    w.row[w.col.key]=w.blank;
    const td=EL.wrap.querySelector(`td[data-c="${w.col.key}"][data-id="${w.row.id}"]`);
    _applyValidate(w.row, w.col.key, w.blank, td);   // 실패해도 값은 반영(붉게 표시)
  });
  snap('Clear');
  applyFilters();
  writes.forEach(w=>_emit('cellEdit',{id:w.row.id,key:w.col.key,value:w.blank}));
  _emit('dataChange',{type:'clear', cells:writes.length});
  _ctlTxt('stCell', `Clear: ${writes.length} cell(s)`);
  _imeRearm();     // 재렌더로 홀더가 떨어져 나가므로 재장착
  return writes.length;
}

/* ══════════ 컬럼 동적 조작 ══════════
   COLS 는 클로저 내부 배열이라 외부에서 직접 못 건드린다.
   아래 API를 통해서만 추가/삭제/수정한다(폭 등록·캐시 무효화·재렌더 포함). */

/* 컬럼 정의 변경 시 정리해야 하는 것들 */
function _colCleanup(key){
  delete CW[key];
  S.hiddenCols.delete(key);
  delete S.cfilters[key];                         // 해당 컬럼 필터 해제
  S.sorts = S.sorts.filter(x=>x.col!==key);       // 정렬 조건 제거
  if(_fltCache) _fltCache.clear();                // 필터 목록 캐시 무효화
  for(const k of [...S.invalid.keys()])           // 오류 표시 제거
    if(k.slice(k.indexOf('\u0000')+1)===key) S.invalid.delete(k);
}
/* 컬럼이 삭제되면 diff 대상 키 집합이 줄어든다. baseline 스냅샷은 삭제 전
   키 집합으로 저장돼 있어서 그대로 두면 다음 diff 비교에서 키 집합 불일치로
   실제로는 안 바뀐 행까지 전부 "수정됨"으로 오판된다. 그래서 baseline 쪽에서도
   해당 key를 지워 키 집합을 맞춰준다(값 비교는 그대로 유지되므로 진짜 변경만 잡힌다). */
function _baselineDropKey(key){
  if(!S._baseline) return;
  let touched=false;
  for(const [id,snap] of S._baseline){
    if(snap.indexOf('"'+key+'"')<0) continue;      // 빠른 스킵(그 key를 안 갖고 있으면 패스)
    let o; try{ o=JSON.parse(snap); }catch(e){ continue; }
    if(!(key in o)) continue;
    delete o[key];
    S._baseline.set(id, JSON.stringify(o));
    touched=true;
  }
  if(touched){ S._diff=null; S._diffVer=-1; }       // diff 캐시 무효화 → 다음 조회 때 재계산
}
/* 편집 중이면 먼저 커밋 — 재렌더로 편집기가 떨어져 나가는 것 방지 */
function _colPre(){
  if(S.editCell) commitEdit();
  _imeCollapse && _imeCollapse();
  S._imeCell=null; S._imeEditing=false;
}
function _colPost(){
  S.focusRI=-1; S.focusCI=-1;                     // 좌표계가 바뀌므로 포커스 해제
  S.rangeR1=S.rangeC1=S.rangeR2=S.rangeC2=-1;
  renderGrid();
  _emit('dataChange',{type:'cols', cols:COLS.map(c=>c.key)});
}

/**
 * addCol(col, at) — 컬럼 추가
 *   col : {key, label, w, ...} — 컬럼 정의(기존 cols 항목과 동일 형식)
 *   at  : 삽입 위치. 생략 시 맨 뒤.
 *         숫자 = 인덱스, 문자열 = 그 key '앞'에 삽입
 *   반환: 성공 여부
 */
function addCol(col, at){
  if(!col || !col.key){ console.warn('ModuGrid.addCol: col.key is required.'); return false; }
  if(COLS.some(c=>c.key===col.key)){ console.warn('ModuGrid.addCol: duplicate key —', col.key); return false; }
  _colPre();
  const def={...col};
  let idx = COLS.length;
  if(typeof at==='number') idx=Math.max(0,Math.min(COLS.length,at));
  else if(typeof at==='string'){ const i=COLS.findIndex(c=>c.key===at); if(i>=0) idx=i; }
  COLS.splice(idx,0,def);
  CW[def.key] = (+def.w>0) ? +def.w : 120;        // 폭 미지정 시 기본값
  _colPost();
  return true;
}

/** addCols(cols, at) — 여러 개를 한 번에 (재렌더 1회) */
function addCols(cols, at){
  if(!Array.isArray(cols)||!cols.length) return 0;
  _colPre();
  let idx = (typeof at==='number') ? Math.max(0,Math.min(COLS.length,at))
          : (typeof at==='string') ? (COLS.findIndex(c=>c.key===at)>=0?COLS.findIndex(c=>c.key===at):COLS.length)
          : COLS.length;
  let n=0;
  for(const col of cols){
    if(!col||!col.key||COLS.some(c=>c.key===col.key)) continue;
    const def={...col};
    COLS.splice(idx++,0,def);
    CW[def.key]=(+def.w>0)?+def.w:120;
    n++;
  }
  if(n) _colPost();
  return n;
}

/** removeCol(key) — 컬럼 삭제 (데이터의 해당 필드는 그대로 둔다) */
function removeCol(key){
  const i=COLS.findIndex(c=>c.key===key);
  if(i<0) return false;
  _colPre();
  COLS.splice(i,1);
  _colCleanup(key);
  _baselineDropKey(key);                           // baseline 스냅샷에서도 제거(오탐 dirty 방지)
  applyFilters();                                  // 필터/정렬이 빠졌으므로 재적용
  _colPost();
  return true;
}

/** updateCol(key, patch) — 컬럼 속성 일부 변경 (label·w·options·validate 등) */
function updateCol(key, patch){
  const col=COLS.find(c=>c.key===key);
  if(!col||!patch) return false;
  _colPre();
  for(const k in patch){
    if(k==='key') continue;                        // key 변경은 금지(데이터 매핑이 깨진다)
    col[k]=patch[k];
  }
  if(+patch.w>0) CW[key]=+patch.w;
  col._optMapSrc=null; col._optFmtSrc=null;        // 목록 캐시 무효화
  if(_fltCache) _fltCache.clear();
  applyFilters();
  _colPost();
  return true;
}

/** setCols(cols) — 컬럼 정의 전체 교체 (폭·숨김·정렬·필터 초기화) */
function setCols(cols){
  if(!Array.isArray(cols)) return false;
  _colPre();
  COLS.forEach(c=>_colCleanup(c.key));
  COLS.length=0;
  cols.forEach(c=>{ if(c&&c.key){ COLS.push({...c}); CW[c.key]=(+c.w>0)?+c.w:120; } });
  S.sorts=[]; S.cfilters={};
  applyFilters();
  _colPost();
  return true;
}

/** getCols() → 현재 컬럼 정의 사본 (직접 수정해도 그리드에 영향 없음) */
function getCols(){ return COLS.map(c=>({...c})); }

/* ▼ 클릭 진입점 — 셀 포커스를 옮긴 뒤 드롭다운 편집기를 연다 */
function openPicker(rowId,colKey){
  if(!canUpdate()) return;
  // td를 잡기 '전에' 이전 편집을 커밋한다.
  //   commitEdit()은 renderGrid()를 부르므로, 먼저 잡아둔 td는 떨어져 나간 노드가 된다.
  if(S.editCell && !commitEdit()) return;
  const td=EL.wrap.querySelector(`td[data-c="${colKey}"][data-id="${rowId}"]`);
  if(!td) return;
  const ri=S.filtered.findIndex(r=>r.id===rowId);
  const ci=COLS.findIndex(c=>c.key===colKey);
  if(ri>=0&&ci>=0){ S.focusRI=ri; S.focusCI=ci; }
  startEdit(td,rowId,colKey);
}

/* 📅 클릭·더블클릭 진입점 — date 편집기를 열고 브라우저 기본 달력까지 띄운다.
   showPicker()는 사용자 제스처가 있어야 하므로 같은 이벤트 처리 안에서 호출한다. */
function openDatePicker(rowId,colKey){
  if(!canUpdate()) return;
  if(S.editCell && !commitEdit()) return;   // 위와 동일 — 재렌더 후에 td를 잡는다
  const td=EL.wrap.querySelector(`td[data-c="${colKey}"][data-id="${rowId}"]`);
  if(!td) return;
  const ri=S.filtered.findIndex(r=>r.id===rowId);
  const ci=COLS.findIndex(c=>c.key===colKey);
  if(ri>=0&&ci>=0){ S.focusRI=ri; S.focusCI=ci; }
  startEdit(td,rowId,colKey);
  const c=S.editCell;
  if(c && c.et==='date' && c.inp && typeof c.inp._dateShow==='function') c.inp._dateShow();
}

/* text/number 더블클릭 진입점 — F2와 완전히 동일한 경로(숨은 입력기 확장)로 편집한다.
   startEdit()의 재사용 에디터(.jsg-cell-input)와 겉모습·IME 동작이 갈리지 않도록 통일.
   숨은 입력기를 못 쓰는 상황에서만 기존 편집기로 폴백한다. */
function startEditIME(rowId,colKey){
  if(!canUpdate()) return;
  const td=EL.wrap.querySelector(`td[data-c="${colKey}"][data-id="${rowId}"]`);
  if(!td) return;
  const col=COLS.find(c=>c.key===colKey);
  if(!col || col.editor===false) return;
  if(_isDel(S.data.find(r=>r.id===rowId))) return;
  if(_lockedCell(col,S.data.find(r=>r.id===rowId))) return;   // rowEditable / col.editable
  const et=getEditType(col);
  // 숨은 입력기 대상이 아니면 기존 편집기 사용
  if(!EL.imeHolder || !EL.imeInput || (et!=='text' && et!=='number')){
    startEdit(td,rowId,colKey); return;
  }
  if(S.editCell && !commitEdit()) return;   // 이전 셀 검증 실패 → 진입 차단
  const ri=S.filtered.findIndex(r=>r.id===rowId);
  const ci=COLS.findIndex(c=>c.key===colKey);
  if(ri>=0&&ci>=0){ S.focusRI=ri; S.focusCI=ci; }
  // 숨은 입력기를 이 셀에 붙여 _imeCell·_baseVal을 세팅한 뒤 F2와 동일하게 확장
  if(!S._imeCell || S._imeCell.rowId!==rowId || S._imeCell.colKey!==colKey){
    _imeTrack(td,rowId,colKey);
  }
  _imeEditFromF2();
}

/* 재사용 단일 에디터 — text/number/textarea는 요소를 파괴하지 않고 재사용한다.
   DOM을 새로 만들어 focus하면 IME 엔진이 새 요소를 조합 대상으로 인식하기 전에
   첫 키가 들어와 한글 조합이 깨진다(첫 글자가 영문 g로 새는 문제). 요소를 상주시켜
   해결한다. select/date/custom은 IME와 무관하고 드롭다운 특성상 매번 생성한다. */
function _getReEditor(kind){
  // kind: 'text' | 'number' | 'textarea'
  if(kind==='textarea'){
    if(!EL.reArea){
      const a=document.createElement('textarea');
      a.className='jsg-cell-input'; a.rows=2;
      _wireEditor(a);
      EL.reArea=a;
    }
    return EL.reArea;
  }
  if(!EL.reEditor){
    const inp=document.createElement('input');
    inp.className='jsg-cell-input';
    _wireEditor(inp);
    EL.reEditor=inp;
  }
  EL.reEditor.type = (kind==='number') ? 'number' : 'text';
  return EL.reEditor;
}

/* 재사용 에디터에 영구 이벤트 배선 (한 번만) — 현재 편집 셀은 S.editCell로 참조 */
function _wireEditor(inp){
  inp.addEventListener('compositionend',function(){
    if(S.editCell) _caseFixInput(this, COLS.find(c=>c.key===S.editCell.colKey));
  });
  inp.oninput=async function(e){
    if(!S.editCell) return;
    const colKey=S.editCell.colKey, et=S.editCell.et;
    // 대/소문자 강제 — 조합 중 제외 (자동완성보다 먼저, textarea에도 적용)
    if(!(e && e.isComposing)) _caseFixInput(this, COLS.find(c=>c.key===colKey));
    if(et!=='text') return;                 // 자동완성은 text 계열만
    const q=this.value; if(q.length<1){hideAC();return;}
    const _c=COLS.find(c=>c.key===colKey);
    if(!_acEnabled(_c)){ hideAC(); return; }
    const loc=_acMatch(_acLocalPairs(colKey), q).slice(0,_acLimit(_c));
    const {items,src}=loc.length?{items:loc,src:'local'}:await fetchAC(colKey,q);
    if(!items.length){hideAC();return;}
    const rect=inp.getBoundingClientRect();
    const d=EL.acdrop;d.style.left=rect.left+'px';d.style.top=(rect.bottom+2)+'px';d.style.minWidth=rect.width+'px';
    showAC(items,src,code=>{inp.value=code;hideAC();commitEdit();});
  };
  inp.onblur=()=>setTimeout(()=>{
    if(!S.editCell || S.editCell.inp!==inp) return;
    const ae=document.activeElement;
    if(ae && ae.closest && ae.closest('.acdrop')) return;
    if(ae===inp) return;
    commitEdit();
  },160);
  inp.onkeydown=e=>{
    const et=S.editCell?S.editCell.et:'text';
    if(EL.acdrop.classList.contains('vis')){
      if(e.key==='ArrowDown'){e.preventDefault();e.stopPropagation();acNav(1);return;}
      if(e.key==='ArrowUp'){e.preventDefault();e.stopPropagation();acNav(-1);return;}
      if(e.key==='Enter'&&acSel>=0){e.preventDefault();e.stopPropagation();acPick(acSel);return;}
    }
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancelEdit();return;}
    if(e.key==='Tab'){e.preventDefault();e.stopPropagation();if(commitEdit())moveFocus((e.shiftKey||e.ctrlKey)?-1:1,0);return;}
    if(e.key==='Enter'){
      // textarea: Shift+Enter 또는 Alt+Enter는 줄바꿈(커밋 안 함)
      if(et==='textarea' && (e.shiftKey || e.altKey)){
        if(e.altKey){
          // Alt+Enter는 기본 줄바꿈이 아니므로 수동 삽입
          e.preventDefault();
          const t=e.target, st=t.selectionStart, en=t.selectionEnd;
          t.value = t.value.slice(0,st) + '\n' + t.value.slice(en);
          t.selectionStart = t.selectionEnd = st+1;
          if(t.oninput) t.oninput({target:t});
        }
        e.stopPropagation();
        return;
      }
      e.preventDefault();e.stopPropagation();commitEdit();return;
    }
    if(e.key==='ArrowUp'||e.key==='ArrowDown'||e.key==='ArrowLeft'||e.key==='ArrowRight'){
      // Ctrl/Meta+화살표 = 셀 점프(끝으로) → 편집 커밋 후 그리드가 처리하도록 통과.
      //   일반 화살표는 편집 중 캐럿 이동이므로 여기서 소비(stopPropagation).
      if(e.ctrlKey||e.metaKey){ if(!commitEdit()){e.preventDefault();e.stopPropagation();return;} return; }
      e.stopPropagation();return;
    }
    e.stopPropagation();
  };
}

function startEdit(td,rowId,colKey,seed=null){
  if(!canUpdate()) return;
  if(_isDel(S.data.find(r=>r.id===rowId))) return;   // 삭제 예정 행은 편집 불가
  if(!S.editMode) return;
  if(S.editCell && S.editCell.rowId===rowId && S.editCell.colKey===colKey) return;
  if(S.editCell && !commitEdit()) return;   // 이전 셀 검증 실패 → 새 편집 진입 차단
  const col=COLS.find(c=>c.key===colKey);
  if(!col||_isSysCol(col.key)||col.type==='images') return;
  if(col.editor===false) return;   // 읽기 전용 컬럼
  if(_lockedCell(col,S.data.find(r=>r.id===rowId))) return;   // rowEditable / col.editable
  const row=S.data.find(r=>r.id===rowId);if(!row)return;
  const et=getEditType(col);

  let inp, reused=false;
  if(et==='text' || et==='number' || et==='textarea'){
    // ── 재사용 에디터: 요소를 파괴하지 않아 IME 조합이 끊기지 않는다 ──
    inp = _getReEditor(et);
    inp.value = row[colKey] ?? '';
    reused = true;
  } else if(et==='custom'){
    inp=col.editor(row,col);
    if(!inp||typeof inp.focus!=='function'){
      inp=document.createElement('input');inp.type='text';inp.value=row[colKey]??'';
    }
    _wireOnceEditor(inp, et);   // custom도 그리드 수명주기 배선
  } else if(et==='select'){
    inp=_buildCombo(col,row,colKey);   // 셀 안 input + 아래 목록
  } else if(et==='date'){
    // 래퍼: 텍스트 입력칸 + 달력 아이콘. 네이티브 date는 아이콘 클릭 시에만 showPicker.
    const wrap=document.createElement('div');
    wrap.className='jsg-date-edit';
    const txt=document.createElement('input');
    txt.type='text';
    txt.className='jsg-date-txt';
    txt.value=_dateToDisplay(row[colKey]??'');
    txt.placeholder=(S.dateFormat||'yyyy-mm-dd');
    txt.autocomplete='off';
    // 달력 아이콘 버튼 (클릭 시에만 네이티브 date 피커 표시)
    const calBtn=document.createElement('button');
    calBtn.type='button';
    calBtn.className='jsg-date-cal';
    calBtn.tabIndex=-1;
    calBtn.innerHTML='📅';
    // 네이티브 date input (달력 UI 제공) — 화면 밖으로 숨김, 아이콘 클릭으로만 호출
    const pick=document.createElement('input');
    pick.type='date';
    pick.className='jsg-date-pick';
    pick.value=(_dateToISO(txt.value)||'');
    // 달력에서 날짜 선택/삭제 → 텍스트칸 반영 (삭제 시 공백)
    pick.onchange=e=>{
      e.stopPropagation();
      txt.value = pick.value ? _dateToDisplay(pick.value) : '';   // clear면 공백
      _dateValidate(txt);
      txt.focus();
    };
    pick.oninput=e=>{ e.stopPropagation(); };
    // 달력 아이콘 클릭 → 네이티브 피커 열기 (그때만)
    //   편집기가 DOM에 막 붙은 직후에는 아직 레이아웃 전이라 showPicker()가
    //   "not being rendered"로 실패한다. offsetWidth로 레이아웃을 강제하고,
    //   그래도 실패하면 다음 프레임에 한 번 더, 마지막엔 click()으로 폴백한다.
    const _tryPicker=()=>{
      try{
        if(!pick.isConnected) return false;
        void pick.offsetWidth;                       // 레이아웃 강제
        try{ pick.focus({preventScroll:true}); }catch(_){}  // Firefox는 포커스 상태를 요구
        if(typeof pick.showPicker==='function'){ pick.showPicker(); return true; }
        return false;                                // click()은 피커를 열지 못한다
      }catch(_){ return false; }
    };
    const _showPicker=()=>{
      if(_tryPicker()) return;
      requestAnimationFrame(()=>{
        if(_tryPicker()) return;
        // showPicker를 못 쓰는 브라우저 → 사용자가 달력 아이콘을 직접 누르도록 둔다
        try{ txt.focus(); }catch(_){}
      });
    };
    // 아이콘은 이제 네이티브 input이 직접 받는다(pointer-events:none). 방어적으로만 남김.
    calBtn.onclick=e=>{ e.preventDefault(); e.stopPropagation(); _showPicker(); };
    // 텍스트 타이핑 → 실시간 형식 검증(붉게 표시만) + pick 값 동기화
    txt.oninput=e=>{
      e.stopPropagation();
      _dateValidate(txt);
      const iso=_dateToISO(txt.value);
      pick.value = iso || '';
    };
    // 텍스트칸 키보드: Enter=커밋, Esc=취소, Tab=커밋+이동. 나머지는 타이핑 그대로.
    txt.onkeydown=e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancelEdit();return;}
      if(e.key==='Enter'){e.preventDefault();e.stopPropagation();commitEdit();return;}
      if(e.key==='Tab'){e.preventDefault();e.stopPropagation();if(commitEdit())moveFocus((e.shiftKey||e.ctrlKey)?-1:1,0);return;}
      e.stopPropagation();   // 문자/방향키 등은 텍스트칸에서 처리(grid로 안 감)
    };
    wrap.appendChild(txt);
    wrap.appendChild(calBtn);
    wrap.appendChild(pick);
    inp=wrap;               // editCell.inp = 래퍼 (commitEdit이 _dateTxt로 값 읽음)
    inp._dateTxt=txt;
    inp._dateShow=_showPicker;   // 외부(셀 📅 클릭·더블클릭·F2/Enter)에서 달력 열기
    // blur 커밋: 편집기 내부(txt/calBtn/pick) 간 이동은 커밋 안 함
    const _dateBlur=()=>setTimeout(()=>{
      const c=S.editCell; if(!c||c.inp!==inp) return;
      const ae=document.activeElement;
      if(ae===txt || ae===pick || ae===calBtn) return;   // 편집기 내부 → 유지
      commitEdit();
    },160);
    txt.addEventListener('blur',_dateBlur);
    pick.addEventListener('blur',_dateBlur);
  }

  S.editCell={rowId,colKey,td,et,inp};   // inp 참조 저장 (commitEdit/blur가 사용)
  td.classList.add('edit-open');
  if(et==='date'){
    // date 편집기(wrap): 숨은입력기와 동일 — 사방 1px 안쪽, 폭/높이 2px 작게
    inp.style.boxSizing='border-box';
    inp.style.position='absolute';
    inp.style.left='1px';
    inp.style.top='1px';
    inp.style.width='calc(100% - 2px)';
    inp.style.height='calc(100% - 2px)';
    inp.style.margin='0';
  } else if(et!=='select'&&et!=='custom'){
    inp.style.height=getH(rowId)+'px';
  }
  try{ if('placeholder' in inp) inp.placeholder=_phOf(col)||''; }catch(_){}

  // 셀에 에디터 부착: 재사용 요소는 '이동'(다른 셀에서 옮겨옴), 나머지는 새로 부착
  td.innerHTML='';
  td.appendChild(inp);
  // date/select는 래퍼(div)라 내부 텍스트칸에 focus (div는 focus 안 됨)
  const _focusEl = inp._dateTxt || inp._comboTxt;
  if(_focusEl){ _focusEl.focus(); }
  else { inp.focus(); }

  if(seed && seed.length){
    if(et==='select'){
      if(typeof inp._comboSeed==='function') inp._comboSeed(seed);
    } else if(et!=='date'&&et!=='custom'){
      inp.value=seed;
      try{inp.setSelectionRange(seed.length,seed.length);}catch(_){}
      if(inp.oninput) inp.oninput.call(inp);
    }
  } else {
    if(et==='select'){
      if(inp._comboTxt) inp._comboTxt.select();
      if(typeof inp._comboOpen==='function') inp._comboOpen();   // 편집 진입 = 목록 표시
    }
    else if(inp.select)inp.select();
  }
}

/* 비재사용 에디터(select/date/custom)에 그리드 수명주기 배선 — 매 생성 시 1회 */
function _wireOnceEditor(inp, et){
  const myGetCell=()=>S.editCell;
  inp.onblur=()=>setTimeout(()=>{
    const c=myGetCell();
    if(!c || c.inp!==inp) return;
    const ae=document.activeElement;
    if(ae && ae.closest && ae.closest('.acdrop')) return;
    if(ae===inp) return;
    commitEdit();
  },160);
  inp.onkeydown=e=>{
    if(EL.acdrop.classList.contains('vis')){
      if(e.key==='ArrowDown'){e.preventDefault();e.stopPropagation();acNav(1);return;}
      if(e.key==='ArrowUp'){e.preventDefault();e.stopPropagation();acNav(-1);return;}
      if(e.key==='Enter'&&acSel>=0){e.preventDefault();e.stopPropagation();acPick(acSel);return;}
    }
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancelEdit();return;}
    if(e.key==='Tab'){e.preventDefault();e.stopPropagation();if(commitEdit())moveFocus((e.shiftKey||e.ctrlKey)?-1:1,0);return;}
    if(e.key==='Enter'){
      // textarea: Shift+Enter 또는 Alt+Enter는 줄바꿈(커밋 안 함)
      if(et==='textarea' && (e.shiftKey || e.altKey)){
        if(e.altKey){
          // Alt+Enter는 기본 줄바꿈이 아니므로 수동 삽입
          e.preventDefault();
          const t=e.target, st=t.selectionStart, en=t.selectionEnd;
          t.value = t.value.slice(0,st) + '\n' + t.value.slice(en);
          t.selectionStart = t.selectionEnd = st+1;
          if(t.oninput) t.oninput({target:t});
        }
        e.stopPropagation();
        return;
      }
      e.preventDefault();e.stopPropagation();commitEdit();return;
    }
    if(e.key==='ArrowUp'||e.key==='ArrowDown'||e.key==='ArrowLeft'||e.key==='ArrowRight'){
      // Ctrl/Meta+화살표 = 셀 점프(끝으로) → 편집 커밋 후 그리드가 처리하도록 통과.
      //   일반 화살표는 편집 중 캐럿 이동이므로 여기서 소비(stopPropagation).
      if(e.ctrlKey||e.metaKey){ if(!commitEdit()){e.preventDefault();e.stopPropagation();return;} return; }
      e.stopPropagation();return;
    }
    e.stopPropagation();
  };
}

/* ── 셀 검증 에러 표시/해제 ── */
const _ivk=(id,key)=>id+'\u0000'+key;

/* validate 실행 + 결과 반영.
   실패해도 '값은 되돌리지 않는다' — 방금 입력한 내용을 잃지 않게 하고,
   대신 셀을 오류 상태(S.invalid)로 등록해 붉은 배경으로 표시한다.
   반환값은 통과 여부이며, 호출부는 이 값과 무관하게 값을 반영한다. */
function _applyValidate(row,colKey,val,td){
  const col=COLS.find(c=>c.key===colKey);
  let vr=true;
  if(col && typeof col.validate==='function'){
    try{ vr=col.validate(val,row); }
    catch(err){ vr=(err&&err.message)||'validate error'; console.error('ModuGrid: validate threw.', err); }
  }
  const bad = (vr===false) || (typeof vr==='string' && vr);
  const k=_ivk(row.id,colKey);
  if(bad){
    const m = typeof vr==='string' ? vr : msg('invalidValue');
    S.invalid.set(k,m);
    _showCellErr(td,m);
  } else {
    S.invalid.delete(k);
    _clearCellErr(td);
  }
  return !bad;
}

/* 오류 말풍선만 감춘다 — 셀의 오류 상태(edit-err 테두리 · cinvalid 배경 · S.invalid)는
   값이 고쳐질 때까지 그대로 남는다. 메시지는 읽고 나면 사라져도 되지만,
   오류 상태까지 지우면 isValid()·getInvalidCells()·submit 차단이 깨지기 때문이다. */
function _hideErrTip(){
  clearTimeout(S._errTipTm); S._errTipTm=null;
  if(EL.errtip) EL.errtip.classList.remove('vis');
}
function _showCellErr(td,msg){
  if(!td) return;                      // 화면에 없는 셀(필터/페이지 밖)이면 표시 생략
  td.classList.add('edit-err');
  const t=EL.errtip; if(!t) return;
  const r=td.getBoundingClientRect();
  t.textContent='⚠ '+msg;
  t.style.left=r.left+'px'; t.style.top=(r.bottom+3)+'px';
  t.classList.add('vis');
  /* 일정 시간 뒤 말풍선 자동 소멸. options.errorMsgDuration (ms, 기본 3000).
     0 이하로 주면 자동으로 사라지지 않고 계속 떠 있는다(기존 동작). */
  clearTimeout(S._errTipTm); S._errTipTm=null;
  if(S.errMsgMs>0) S._errTipTm=setTimeout(_hideErrTip, S.errMsgMs);
}
function _clearCellErr(td){
  if(td) td.classList.remove('edit-err');
  _hideErrTip();
}

/**
 * commitEdit → true: 커밋 완료(또는 편집 중 아님) / false: 검증 실패로 편집 유지
 * col.validate(value,row): true·undefined·null·'' = 통과, false = 실패(기본 메시지), 문자열 = 실패(해당 메시지)
 * value는 타입 변환 후(숫자 에디터면 number) 전달. 검증 통과 후에만 snap → 실패가 undo 스택을 오염시키지 않음
 */
function commitEdit(){
  if(!S.editCell) return true;
  hideAC();   // 자동완성 목록 잔존 방지
  const{rowId,colKey,td,et,inp}=S.editCell;
  const row=S.data.find(r=>r.id===rowId);
  let newVal;
  if(row){
    if(inp){
      if(et==='date'){
        // date 래퍼: 텍스트칸 값 → ISO 변환. 형식 오류면 붉게 표시하되 원본 문자열 저장.
        const raw=(inp._dateTxt?inp._dateTxt.value:'').trim();
        const iso=_dateToISO(raw);
        newVal = (iso!==null) ? iso : raw;   // 유효하면 ISO, 아니면 입력 그대로
      } else if(et==='number' || _numericKeys.includes(colKey)){
        newVal = +inp.value;
      } else {
        newVal = _applyCase(COLS.find(c=>c.key===colKey), inp.value);
      }
      // validate 실패해도 값은 반영한다(되돌리지 않음). 셀만 오류 상태로 표시.
      _applyValidate(row, colKey, newVal, td);
      row[colKey] = newVal;
      snap(`Edit ${colKey}`);        // 값 반영 후 스냅샷 (redo 정상)
      _touchData();                  // 아래 applyFilters()의 렌더가 최신 diff로 그려지도록 캐시 무효화
                                     //  (안 하면 ST 컬럼 수정표시·dirtyChange가 한 박자 늦는다)
    }
  }
  S.editCell=null;applyFilters();
  if(newVal!==undefined){
    _emit('cellEdit', { id: rowId, key: colKey, value: newVal });
    // 다른 데이터 변경과 동일하게 dataChange도 발화 (dataChange만 구독해도 셀 편집 감지)
    _emit('dataChange', { type:'update', id: rowId, field: colKey, value: newVal });
  }
  return true;
}
function cancelEdit(){if(!S.editCell)return;hideAC();_clearCellErr(S.editCell.td);S.editCell=null;renderGrid();}

/* ── Keyboard Navigation ── */
function moveFocus(dci,dri,autoEdit=false){
  const editableCols=COLS.filter(c=>!_isSysCol(c.key)&&!S.hiddenCols.has(c.key));
  if(!editableCols.length)return;
  let ri=S.focusRI<0?0:S.focusRI;
  let curKey=COLS[S.focusCI]?.key;
  let eci=editableCols.findIndex(c=>c.key===curKey);
  if(eci<0)eci=0;
  eci=Math.max(0,Math.min(editableCols.length-1,eci+dci));
  ri=Math.max(0,Math.min(S.filtered.length-1,ri+dri));
  const newKey=editableCols[eci].key;
  const newCI=COLS.findIndex(c=>c.key===newKey);
  S.focusRI=ri;S.focusCI=newCI;
  _ctlTxt('stCell', `Focus: row${ri+1} ${newKey}`);
  // 페이지 경계: 대상 행이 현재 페이지 밖이면 해당 페이지로 점프
  if(!S.vs && !S.groupBy && !S.treeOn){
    const p=Math.floor(ri/_pageSize())+1;
    if(p!==S.page) S.page=p;
  }
  renderGrid();
  const row=S.filtered[ri];if(!row)return;
  let td=EL.wrap.querySelector(`td[data-c="${newKey}"][data-id="${row.id}"]`);
  // VS: 가상창 밖이면 스크롤 보정 후 재조회
  if(!td && S.vs){
    EL.gsc.scrollTop = ri*S.defH;
    vsRender();
    td=EL.wrap.querySelector(`td[data-c="${newKey}"][data-id="${row.id}"]`);
  }
  if(td && td.scrollIntoView) td.scrollIntoView({block:'nearest',inline:'nearest'});
  if(autoEdit&&S.editMode&&td){ startEdit(td,row.id,newKey); return; }
  // 숨은 입력기를 이 셀 위치로 이동(0 크기 유지) + 항상 focus → IME 준비
  if(S.editMode && td) _imeTrack(td, row.id, newKey);   // selMode 무관 (row 모드도 키인 가능)
}

/* ── 숨은 입력기(IME holder) 관리 ──────────────────────────────────
   div는 항상 0x0, input은 z-index -4000으로 숨어 focus만 유지.
   문자 입력이 시작되면 _imeExpand로 셀 위치·크기로 확장(편집 전환). */

/* 클릭 직후의 숨은 입력기 장착은 '지연' 실행한다.
   mousedown 중에 holder를 td 안으로 넣으면 mousedown~click 사이 DOM이 바뀌어
   click/dblclick이 발생하지 않는다(더블클릭 편집 불가). setTimeout으로 시퀀스 뒤로 미룬다.
   selMode 와 무관하게 동작한다 — row 모드에서도 셀 클릭 후 바로 키인할 수 있어야 한다. */
function _imeTrackDeferred(rowId, colKey){
  setTimeout(()=>{
    if(!S.editMode) return;
    if(S.editCell) return;        // 그새 정식 편집기(select/date/textarea)가 열렸으면 스킵
    /* '같은 셀'을 이미 편집 중일 때만 스킵한다 — 더블클릭/F2로 연 편집을
       뒤늦게 도착한 이 타이머가 되돌려 버리는 것을 막기 위한 가드다.
       ★ 다른 셀을 편집 중일 때는 절대 스킵하면 안 된다. 예전에는 _imeEditing 이면
         무조건 return 했는데, 그러면 한 번 글자를 치기 시작한 뒤로는 어느 셀을
         클릭해도 숨은 입력기가 따라오지 않아 입력이 이전 셀에 계속 누적됐다.
         (row 모드에서 "되었다가 안 되었다가" 하던 실제 원인)
         _imeTrack 은 내부에서 이전 셀 값을 먼저 커밋하므로 그대로 넘겨도 안전하다. */
    if(S._imeEditing && S._imeCell &&
       S._imeCell.rowId===rowId && S._imeCell.colKey===colKey) return;
    const td=EL.wrap.querySelector(`td[data-c="${colKey}"][data-id="${rowId}"]`);
    if(!td) return;
    // 여전히 이 셀이 포커스일 때만 (그새 다른 셀로 옮겨갔으면 무시)
    if(S.focusRI==null || !S.filtered[S.focusRI] || S.filtered[S.focusRI].id!==rowId) return;
    _imeTrack(td, rowId, colKey);
  }, 0);
}

// 포커스 셀 추적: holder를 그 셀 위로 옮기고(0 크기) input을 그 셀 값으로 세팅 + focus
function _imeTrack(td, rowId, colKey){
  const holder=EL.imeHolder, inp=EL.imeInput;
  clearTimeout(S._acDebTm);   // 이전 셀에서 예약된 자동완성 서버 조회 취소
  hideAC();   // 이전 셀에서 열려 있던 자동완성 목록 잔존 방지
  if(!holder||!inp) return;
  // 새 셀로 이동하기 전에, 편집 중이던 이전 셀이 있으면 먼저 커밋(값 유실 방지)
  if(S._imeEditing && S._imeCell && (S._imeCell.rowId!==rowId || S._imeCell.colKey!==colKey)){
    _imeCommitValue();   // 값만 저장(재렌더 없이) — 아래에서 새 셀 세팅 이어짐
  }
  const col=COLS.find(c=>c.key===colKey);
  const et=col?getEditType(col):'text';
  const row=S.data.find(r=>r.id===rowId);
  /* 편집 가능한 셀만 추적한다.
     시스템 컬럼(_rn/_st/_cb)·editor:false·삭제예정 행은 _colEditable이 걸러낸다.
     (row 모드에서도 추적하게 되면서 행번호 칸에 글자가 들어가는 것을 막는 안전장치)
     images/custom은 별도 편집기라 숨은 입력기를 쓰지 않는다. */
  if(!col || !_colEditable(col,row) || et==='images' || et==='custom'){
    _imeCollapse(); S._imeCell=null; return;
  }
  S._imeCell={rowId, colKey, et};
  S._imeEditing=false;                           // 새 셀 추적 = 편집 아님
  holder.classList.remove('editing');
  // ★ 포커스 시점(조합 시작 전)에 holder를 선택 td 안에 미리 넣는다(0 크기, 안 보임).
  //   조합 대상 input이 '입력 시작 전'에 이미 제자리에 있어야 IME 조합이 안 깨진다.
  //   (입력 시작 시 _imeExpand는 이동 없이 크기만 확장 → "ㅎ하나" 이중입력 방지)
  if(holder.parentNode !== td){ td.appendChild(holder); }
  holder.style.left='1px';
  holder.style.top='1px';
  holder.style.width='0px';                      // 0 크기(안 보임, 하지만 td 안에 위치)
  holder.style.height='0px';
  S._imeHostTd=td;
  // 숨은 input은 text/number만 (IME 받는 용도). textarea는 text로 받고 편집 시 전환.
  inp.type=(et==='number')?'number':'text';
  const curVal = row?(row[colKey]??''):'';
  inp._baseVal = curVal;                         // 편집 전 값 기억(F2/취소용)
  inp.value = '';                                // 비워둠 → 바로 키인 시 '처음부터' 작성
  try{ inp.focus(); }catch(_){}
}

// wrap 기준 셀의 상대 위치·크기
function _cellRectInWrap(td){
  const wrapR=EL.wrap.getBoundingClientRect();
  const r=td.getBoundingClientRect();
  return {left:r.left-wrapR.left, top:r.top-wrapR.top, width:r.width, height:r.height};
}

// 문자 입력 시작 → holder를 셀 크기로 확장(편집 전환)
function _imeExpand(){
  const holder=EL.imeHolder, inp=EL.imeInput;
  if(!holder||!inp||!S._imeCell) return false;
  const {rowId,colKey,et}=S._imeCell;
  const td=EL.wrap.querySelector(`td[data-c="${colKey}"][data-id="${rowId}"]`);
  if(!td) return false;
  // select/date/textarea는 정식 편집기 필요 → startEdit로 전환
  if(et==='select' || et==='date' || et==='textarea'){
    const seed = inp.value;          // 숨은 input에 입력된 문자(키인 시)
    inp.value='';
    _imeCollapse();
    startEdit(td, rowId, colKey, (et==='textarea' && seed) ? seed : null);   // textarea는 seed 전달
    return true;
  }
  // text/number → holder는 이미 _imeTrack에서 td 안에 들어가 있음(조합 전 배치).
  //   여기서는 '이동 없이' 크기만 확장 → IME 조합이 끊기지 않음("ㅎ하나" 방지).
  if(holder.parentNode !== td){ td.appendChild(holder); }   // 안전장치(보통 이미 td 안)
  holder.style.left='1px';             // outline(1px)만큼 안으로
  holder.style.top='1px';
  holder.style.width='calc(100% - 2px)';   // outline 2배(2px) 작게
  holder.style.height='calc(100% - 2px)';
  holder.classList.add('editing');
  try{ inp.placeholder=_phOf(COLS.find(c=>c.key===colKey))||''; }catch(_){}
  S._imeEditing=true;
  S._imeHostTd=td;
  try{ inp.focus(); }catch(_){}
  return true;
}

/* 편집 중 스크롤 시 입력박스를 셀의 현재 위치로 재배치 (셀이 화면 밖이면 숨김) */
function _imeReposition(){
  const holder=EL.imeHolder;
  if(!holder||!S._imeCell||!S._imeEditing) return;
  const {rowId,colKey}=S._imeCell;
  const td=EL.wrap.querySelector(`td[data-c="${colKey}"][data-id="${rowId}"]`);
  if(!td){ holder.style.display='none'; return; }   // 가상스크롤로 셀이 없어짐
  holder.style.display='';
  const rect=_cellRectInWrap(td);
  holder.style.left=(rect.left+1)+'px';
  holder.style.top=(rect.top+1)+'px';
  holder.style.width=Math.max(0,rect.width-2)+'px';
  holder.style.height=Math.max(0,rect.height-2)+'px';
}

// 편집 종료 → holder 0 크기로 축소
function _imeCollapse(){
  const holder=EL.imeHolder;
  clearTimeout(S._acDebTm);   // 예약된 자동완성 서버 조회가 있었다면 취소
  hideAC();   // 자동완성 목록이 열려 있었다면 함께 닫는다
  if(!holder) return;
  holder.classList.remove('editing');
  // td 안에 넣었던 holder를 wrap으로 되돌림 (tbody 재생성 시 소실 방지)
  if(holder.parentNode !== EL.wrap){
    EL.wrap.appendChild(holder);
  }
  holder.style.left='0';
  holder.style.top='0';
  holder.style.width='0px';
  holder.style.height='0px';
  S._imeEditing=false;
  S._imeHostTd=null;
}

/* 숨은 입력기 경로의 자동완성 — text 컬럼 전용.
   목록 우선순위: col.acHints → options.acHints[key], 서버는 col.acSource → options.acSource.
   재사용 에디터(_wireEditor)의 자동완성과 조회·캐시 로직은 동일하되,
   값 커밋은 이 경로 전용인 _imeCommit()을 통해 이뤄진다.
   로컬 매치는 즉시 표시하고, 서버(fetchAC→acSource) 조회만 디바운스한다. */
function _imeAutocomplete(colKey, q){
  clearTimeout(S._acDebTm);
  if(!q || q.length<1){ hideAC(); return; }
  const _c=COLS.find(c=>c.key===colKey);
  if(!_acEnabled(_c)){ hideAC(); return; }
  const loc=_acMatch(_acLocalPairs(colKey), q).slice(0,_acLimit(_c));
  if(loc.length){ _showAcList(colKey, loc, 'local'); return; }
  // 로컬에 매치가 없는 경우(= acSource 전용 컬럼 등) — 디바운스 후 서버/캐시 조회
  S._acDebTm = setTimeout(async ()=>{
    const {items,src} = await fetchAC(colKey, q);
    // 대기 중 셀/컬럼이 바뀌었거나 편집이 끝났으면 결과 폐기(엉뚱한 셀에 표시 방지)
    if(!S._imeCell || S._imeCell.colKey!==colKey || !S._imeEditing) return;
    if(!items.length){ hideAC(); return; }
    _showAcList(colKey, items, src);
  }, S._acDebounceMs);
}

function _showAcList(colKey, items, src){
  if(!S._imeCell || S._imeCell.colKey!==colKey) return;
  const inp=EL.imeInput;
  const rect=inp.getBoundingClientRect();
  const d=EL.acdrop; d.style.left=rect.left+'px'; d.style.top=(rect.bottom+2)+'px'; d.style.minWidth=rect.width+'px';
  showAC(items,src,code=>{ inp.value=code; hideAC(); _imeCommit(); });
}

// 숨은 input 이벤트 배선 (초기화 시 1회)
function _wireImeInput(){
  const inp=EL.imeInput;
  if(!inp) return;

  // 문자 입력(한글 포함) → 편집 전환(holder 확장) + 자동완성
  inp.oninput=function(e){
    if(!S._imeCell) return;
    const cell=S._imeCell;
    if(!S._imeEditing){ _imeExpand(); }   // 첫 입력 → 확장(첫 글자 이미 input에 있음)
    // 대/소문자 강제 — IME 조합 중에는 건드리지 않는다(조합이 끊긴다)
    if(!(e && e.isComposing)) _caseFixInput(this, COLS.find(c=>c.key===cell.colKey));
    // 값을 셀 데이터에 실시간 반영 (표시용) — 커밋은 이동/Enter/blur 시
    // 자동완성 — text 컬럼 전용 (select/date/textarea는 위 _imeExpand에서 정식 편집기로 전환됨)
    if(cell.et==='text' && S._imeEditing) _imeAutocomplete(cell.colKey, this.value);
  };

  // 조합 시작 시에도 확장 (한글 첫 글자)
  inp.oncompositionstart=function(){
    if(S._imeCell && !S._imeEditing) _imeExpand();
  };
  // 조합이 끝난 뒤 한 번 정규화 (조합 중에는 건너뛰었으므로)
  inp.oncompositionend=function(){
    if(S._imeCell) _caseFixInput(this, COLS.find(c=>c.key===S._imeCell.colKey));
  };

  inp.onkeydown=function(e){
    const editing=S._imeEditing;
    // ── 편집 중이 아님(포커스만): 화살표/Tab = 그리드 셀 이동 ──
    //   ※ stopPropagation 필수 — document의 _onKeydown이 또 이동시키는 이중 처리 방지
    if(!editing && !e.isComposing){
      const et=S._imeCell?S._imeCell.et:'text';
      const isSelect=(et==='select');   // 목록형(select만)
      const isDate=(et==='date');       // 날짜형(직접 입력 + 아이콘 달력)
      // 화살표: _arrowNav로 처리(Shift=범위선택, Ctrl=끝점프 지원 — 마우스 드래그와 동일 결과)
      if(e.key==='ArrowUp'){e.preventDefault();e.stopPropagation();_arrowNav(0,-1,e.shiftKey,e.ctrlKey||e.metaKey);return;}
      if(e.key==='ArrowDown'){e.preventDefault();e.stopPropagation();_arrowNav(0,1,e.shiftKey,e.ctrlKey||e.metaKey);return;}
      if(e.key==='ArrowLeft'){e.preventDefault();e.stopPropagation();_arrowNav(-1,0,e.shiftKey,e.ctrlKey||e.metaKey);return;}
      if(e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();_arrowNav(1,0,e.shiftKey,e.ctrlKey||e.metaKey);return;}
      if(e.key==='Tab'){e.preventDefault();e.stopPropagation();moveFocus((e.shiftKey||e.ctrlKey)?-1:1,0);return;}
      const isTextarea=(et==='textarea');
      // Enter: select=목록, date=편집기, textarea=여러줄편집기, 그 외 아래 행 이동
      if(e.key==='Enter'){
        e.preventDefault();e.stopPropagation();
        if(isSelect){ _imeOpenPicker(); }
        else if(isDate){ _dateOpenEdit(null); }
        else if(isTextarea){ _imeOpenTextarea(null); }
        else { moveFocus(0,e.shiftKey?-1:1); }
        return;
      }
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();return;}
      // Delete: 편집 중이 아니면 셀 내용 지우기 (편집 중이면 input의 기본 동작)
      if(e.key==='Delete'&&S.editMode){e.preventDefault();e.stopPropagation();clearCells();return;}
      // F2: text/number=기존값+전체선택, select=목록, date/textarea=정식편집기(기존값)
      if(e.key==='F2'){
        e.preventDefault();e.stopPropagation();
        if(isSelect){ _imeOpenPicker(); }
        else if(isDate){ _dateOpenEdit(null); }
        else if(isTextarea){ _imeOpenTextarea(null); }
        else { _imeEditFromF2(); }
        return;
      }
      // select: 문자 키로 목록 열기 (입력한 문자로 필터 시작)
      if(isSelect && e.key.length===1 && !e.ctrlKey && !e.metaKey && !e.altKey){
        e.preventDefault();e.stopPropagation();_imeOpenPicker(e.key);return;
      }
      // date: 문자 키로 편집 열고 그 문자부터 입력(처음부터 새로 작성)
      if(isDate && e.key.length===1 && !e.ctrlKey && !e.metaKey && !e.altKey){
        e.preventDefault();e.stopPropagation();_dateOpenEdit(e.key);return;
      }
      // textarea: 문자 키로 편집 열고 그 문자부터 (처음부터 새로 작성)
      if(isTextarea && e.key.length===1 && !e.ctrlKey && !e.metaKey && !e.altKey){
        e.preventDefault();e.stopPropagation();_imeOpenTextarea(e.key);return;
      }
      // Ctrl/Meta 조합(Ctrl+C 복사, Ctrl+V 붙여넣기 등)은 grid가 처리하도록 통과
      if(e.ctrlKey || e.metaKey){ return; }   // stopPropagation 안 함 → grid _onKeydown으로
      // text/number/textarea: 일반 문자 키는 oninput/compositionstart가 편집 전환
      e.stopPropagation();
      return;
    }
    // ── 편집 중: 화살표는 input 캐럿 이동(기본 동작), Enter/Tab/Esc는 커밋/이동 ──
    // 자동완성 목록이 열려 있으면 ↑↓/Enter를 목록 탐색·선택으로 우선 처리
    if(EL.acdrop.classList.contains('vis')){
      if(e.key==='ArrowDown'){e.preventDefault();e.stopPropagation();acNav(1);return;}
      if(e.key==='ArrowUp'){e.preventDefault();e.stopPropagation();acNav(-1);return;}
      if(e.key==='Enter'&&acSel>=0){e.preventDefault();e.stopPropagation();acPick(acSel);return;}
    }
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();_imeCancel();return;}
    if(e.key==='Enter'){
      e.preventDefault();e.stopPropagation();
      if(_imeCommit(true)) moveFocus(0, e.shiftKey?-1:1);   // 이동이 재장전 담당
      return;
    }
    if(e.key==='Tab'){
      e.preventDefault();e.stopPropagation();
      if(_imeCommit(true)) moveFocus((e.shiftKey||e.ctrlKey)?-1:1, 0);
      return;
    }
    // 화살표 등은 input 안에서 기본 처리(캐럿 이동). grid로는 안 보냄.
    e.stopPropagation();
  };

  // 포커스 잃으면 커밋 (편집 중일 때만)
  inp.onblur=function(){
    // blur 시점의 편집 상태·값을 즉시 포착(비동기 지연 없이 값 읽기)
    const wasEditing=S._imeEditing;
    setTimeout(function(){
      // 편집 중이었는데 focus가 이 input을 떠났으면 커밋
      //   (재장전으로 곧바로 다시 focus 잡았으면 activeElement===inp라 스킵)
      if(wasEditing && S._imeEditing && document.activeElement!==inp){
        _imeCommit();
      }
    },100);
  };
}

// 숨은 input 값 → 셀 데이터 커밋
// 값만 저장(재렌더 없이) — 셀 전환 시 이전 값 보존용
function _imeCommitValue(){
  if(!S._imeCell) return true;
  const {rowId,colKey,et}=S._imeCell;
  const inp=EL.imeInput;
  const row=S.data.find(r=>r.id===rowId);
  if(row && inp){
    const col0=COLS.find(c=>c.key===colKey);
    let v = (et==='number'||_numericKeys.includes(colKey)) ? +inp.value : _applyCase(col0, inp.value);
    const td=EL.wrap.querySelector(`td[data-c="${colKey}"][data-id="${rowId}"]`);
    _applyValidate(row, colKey, v, td);   // 실패해도 값은 반영, 셀만 붉게
    if(row[colKey]!==v){
      row[colKey]=v;
      snap();
      _touchData();                 // 렌더 전 diff 캐시 무효화 (commitEdit과 동일)
      applyFilters();
      _emit('cellEdit',{id:rowId,key:colKey,value:v});
      _emit('dataChange',{type:'update',id:rowId});
    }
  }
  return true;
}

function _imeCommit(skipRearm){
  if(!S._imeCell) return true;
  if(_imeCommitValue()===false) return false;   // 값 저장(검증 실패 시 중단)
  _imeCollapse();
  renderGrid();
  // 커밋 후 현재 포커스 셀로 숨은 input 재장전 (다음 입력 대비 — focus 복구)
  // 단, 이동이 뒤따르는 경우(Enter/Tab) moveFocus가 _imeTrack을 부르므로 스킵
  if(!skipRearm) _imeRearm();
  return true;
}

/* ── 날짜 형식 헬퍼 ────────────────────────────────
   내부 저장은 항상 ISO(yyyy-mm-dd). 표시·입력은 S.dateFormat 형식. */

// 구분자 추출 ('yyyy-mm-dd'→'-', 'yyyy.mm.dd'→'.')
function _dateSep(){
  const f=S.dateFormat||'yyyy-mm-dd';
  const m=f.match(/[^ymd]/);
  return m?m[0]:'-';
}

// ISO(yyyy-mm-dd) → 표시 형식. 빈 값/미완성은 그대로.
function _dateToDisplay(iso){
  if(!iso) return '';
  const m=String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return iso;   // ISO 아니면 원본(입력 중 등)
  const sep=_dateSep();
  return m[1]+sep+m[2]+sep+m[3];
}

// 표시/입력 형식 → ISO. 파싱 실패 시 null.
function _dateToISO(str){
  if(!str) return '';
  const s=String(str).trim();
  // yyyy(구분자)mm(구분자)dd 형태 파싱 (구분자는 - . / 허용)
  const m=s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if(!m) return null;
  const y=+m[1], mo=+m[2], d=+m[3];
  if(mo<1||mo>12||d<1||d>31) return null;
  // 실제 유효 날짜인지 검증 (2월 30일 등 차단)
  const dt=new Date(y, mo-1, d);
  if(dt.getFullYear()!==y || dt.getMonth()!==mo-1 || dt.getDate()!==d) return null;
  const pad=n=>String(n).padStart(2,'0');
  return y+'-'+pad(mo)+'-'+pad(d);
}

// 날짜 텍스트칸 실시간 검증 — 형식 틀리면 붉게(클래스만), 막지는 않음
function _dateValidate(txt){
  if(!txt) return;
  const ok=_isValidDateInput(txt.value);
  txt.classList.toggle('jsg-date-invalid', !ok);
}

// 클립보드에 텍스트 복사 (navigator.clipboard 우선, 실패 시 execCommand fallback)
function _copyToClipboard(text){
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text)
      .then(()=>toast(msg('copied')))
      .catch(()=>_copyFallback(text));
  } else {
    _copyFallback(text);
  }
}
// file:// 등에서 동작하는 fallback (임시 textarea + execCommand)
function _copyFallback(text){
  try{
    const ta=document.createElement('textarea');
    ta.value=text;
    ta.style.position='fixed'; ta.style.left='-9999px'; ta.style.top='0';
    ta.setAttribute('readonly','');
    document.body.appendChild(ta);
    ta.select(); ta.setSelectionRange(0, text.length);
    const ok=document.execCommand('copy');
    document.body.removeChild(ta);
    toast(ok ? msg('copied') : msg('copyFailed'));
  }catch(err){
    console.error('ModuGrid: copy to clipboard failed.', err);
    toast(msg('copyFailed'));
  }
}

// 문자열이 유효한 날짜 형식인지 (validation용)
function _isValidDateInput(str){
  if(!str) return true;   // 빈 값은 허용(선택)
  return _dateToISO(str)!==null;
}

/* F2: 숨은 입력기에 기존값을 채우고 편집 확장 + 전체선택 (Excel F2 동작) */
function _imeEditFromF2(){
  const inp=EL.imeInput;
  if(!inp || !S._imeCell) { _openEditor(null); return; }   // 숨은입력기 없으면 기존 편집기
  inp.value = inp._baseVal ?? '';   // 기존값 채움
  _imeExpand();                     // 셀 크기로 확장(편집 상태)
  try{ inp.focus(); if(inp.select) inp.select(); }catch(_){}   // 전체 선택
}

/* date 셀 편집 열기. seed 문자가 있으면 그 문자부터 입력(새로 작성), 없으면 기존값 유지 */
function _dateOpenEdit(seed){
  if(!S._imeCell) return;
  const {rowId,colKey}=S._imeCell;
  const td=EL.wrap.querySelector(`td[data-c="${colKey}"][data-id="${rowId}"]`);
  if(!td) return;
  const inp=EL.imeInput;
  if(inp) inp.value='';           // 숨은 input 비움
  _imeCollapse();
  S._imeCell=null; S._imeEditing=false;   // 숨은 입력기 관여 중단
  startEdit(td, rowId, colKey);   // date 편집기 열림
  // 편집기의 텍스트칸에 seed 반영 (문자 키로 진입 시 그 글자부터)
  const c=S.editCell;
  if(c && c.et==='date' && c.inp && c.inp._dateTxt){
    const t=c.inp._dateTxt;
    if(seed && seed.length===1){ t.value=seed; if(t.oninput)t.oninput({target:t,stopPropagation:function(){}}); }
    try{ t.focus(); if(seed){ const n=t.value.length; t.setSelectionRange&&t.setSelectionRange(n,n); } else { t.select&&t.select(); } }catch(_){}
    // 문자 키인이 아닌 진입(F2/Enter)은 드롭다운과 동일하게 달력까지 바로 표시.
    //   문자 키인은 타이핑이 목적이므로 달력을 열지 않는다.
    if(!seed && typeof c.inp._dateShow==='function') c.inp._dateShow();
  }
}

/* textarea 셀을 정식 편집기(여러 줄)로 연다. seed 있으면 그 문자부터 */
function _imeOpenTextarea(seed){
  if(!S._imeCell) return;
  const {rowId,colKey}=S._imeCell;
  const td=EL.wrap.querySelector(`td[data-c="${colKey}"][data-id="${rowId}"]`);
  if(!td) return;
  const inp=EL.imeInput;
  if(inp) inp.value='';
  _imeCollapse();
  S._imeCell=null; S._imeEditing=false;
  startEdit(td, rowId, colKey, (seed&&seed.length===1)?seed:null);
  // seed 없으면(F2/Enter) 기존값 전체선택
  const c=S.editCell;
  if(c && c.et==='textarea' && c.inp){
    try{ c.inp.focus(); if(!seed && c.inp.select) c.inp.select(); }catch(_){}
  }
}

/* select 셀을 정식 편집기(드롭다운)로 연다. seed = 키인으로 시작한 문자(있으면 필터 시작) */
function _imeOpenPicker(seed){
  if(!S._imeCell) return;
  const {rowId,colKey}=S._imeCell;
  const td=EL.wrap.querySelector(`td[data-c="${colKey}"][data-id="${rowId}"]`);
  if(!td) return;
  const inp=EL.imeInput;
  if(inp) inp.value='';           // 숨은 input 비움
  _imeCollapse();
  S._imeCell=null;                // 숨은 입력기 관여 중단(편집기 focus 충돌 방지)
  S._imeEditing=false;
  startEdit(td, rowId, colKey, seed||null);
}

/* 현재 포커스 셀로 숨은 입력기를 재장전 (커밋/취소 후 focus 복구용) */
function _imeRearm(){
  if(!S.editMode) return;               // selMode 무관 (row 모드도 키인 가능해야 한다)
  if(S.focusRI<0 || S.focusCI<0) return;
  const row=S.filtered[S.focusRI], col=COLS[S.focusCI];
  if(!row||!col) return;
  const td=EL.wrap.querySelector(`td[data-c="${col.key}"][data-id="${row.id}"]`);
  if(td) _imeTrack(td, row.id, col.key);
}

// 편집 취소 (값 되돌림)
function _imeCancel(){
  const inp=EL.imeInput;
  if(S._imeCell){                       // 남아있던 검증 오류 표시 해제
    const {rowId,colKey}=S._imeCell;
    _clearCellErr(EL.wrap.querySelector(`td[data-c="${colKey}"][data-id="${rowId}"]`));
  }
  if(inp && inp._baseVal!==undefined) inp.value=inp._baseVal;
  _imeCollapse();
  renderGrid();
  _imeRearm();   // 취소 후에도 focus 재장전
}

/* ── CRUD ── */

// App-specific functions → main.html


/* ── Scroll sync: right panel scroll → left body 동기화 ── */
function syncScroll(){
  const right=EL.gsc;
  if(!right) return;
  right.onscroll=function(){
    const sc=this, lb=EL.leftBody;
    if(S.vs){
      vsRender();                          // 1) 콘텐츠(spacer+rows) 먼저 재구성
      if(lb) lb.scrollTop=sc.scrollTop;   // 2) 그다음 왼쪽 패널 동기화
    } else {
      if(lb) lb.scrollTop=sc.scrollTop;   // 일반 모드: 즉시 동기화
    }
    // (holder가 td 안에 있어 스크롤 시 자동으로 따라감 — 재배치 불필요)
    _comboReposition();   // 드롭다운 목록은 fixed라 직접 재배치
  };
}

/* ── VS 헤더 전용 높이 동기화 ── */
function _syncVSHeader(){
  requestAnimationFrame(()=>{
    const lts=[...EL.gheadLeft.querySelectorAll('tr')];
    const rts=[...EL.ghead.querySelectorAll('tr')];
    const hh=[];
    for(let i=0;i<Math.min(lts.length,rts.length);i++){
      const mh=Math.ceil(Math.max(lts[i].getBoundingClientRect().height,
                                  rts[i].getBoundingClientRect().height));
      lts[i].style.height=mh+'px'; rts[i].style.height=mh+'px';
      hh.push(mh);
    }
    /* 그룹 헤더(2행)의 sticky offset — 1행 높이를 실측해서 지정한다.
       CSS 고정값(top:22px)은 라벨이 줄바꿈되면 어긋난다. */
    if(hh.length>1){
      const off=hh[0]+'px';
      [lts[1],rts[1]].forEach(tr=>{ if(tr) tr.querySelectorAll('.jth').forEach(th=>{ th.style.top=off; }); });
    }
  });
}

/* ── Row 높이 동기화: 왼쪽-오른쪽 row height를 MAX 기준으로 맞춤 ── */
/* 헤더 좌우 높이 동기화 (그룹 헤더 = 2행 → 행별 pairwise).
   ★ 측정 전에 이전에 강제해 둔 inline height 를 반드시 지운다.
     tr 의 height 는 '최소 높이'로 동작하기 때문에, 지우지 않고 다시 재면 높이가
     커지기만 하고 줄어들지 않는다 — 컬럼을 넓혀서 라벨 줄바꿈이 풀려도 헤더가
     계속 두 줄 높이로 남는다.
   renderHeader() 는 헤더 innerHTML 을 통째로 갈아끼우므로 그 뒤에는 반드시
   이 함수를 다시 불러야 좌우 높이가 맞는다(컬럼 폭 조정이 그 경로다). */
function _syncHeaderHeights(){
  if(!EL.gheadLeft || !EL.ghead) return;
  const lts=[...EL.gheadLeft.querySelectorAll('tr')];
  const rts=[...EL.ghead.querySelectorAll('tr')];
  const n=Math.min(lts.length, rts.length);
  if(!n) return;
  for(let i=0;i<n;i++){ lts[i].style.height=''; rts[i].style.height=''; }   // 축소도 되게 초기화
  const hh=[];
  for(let i=0;i<n;i++){
    const mh=Math.ceil(Math.max(lts[i].getBoundingClientRect().height,
                                rts[i].getBoundingClientRect().height));
    lts[i].style.height=mh+'px'; rts[i].style.height=mh+'px';
    hh.push(mh);
  }
  /* 그룹 헤더(2행)의 sticky offset — 1행 높이를 실측해서 지정한다.
     CSS 고정값(top:22px)은 라벨이 줄바꿈되면 어긋난다. */
  if(hh.length>1){
    const off=hh[0]+'px';
    [lts[1],rts[1]].forEach(tr=>{ if(tr) tr.querySelectorAll('.jth').forEach(th=>{ th.style.top=off; }); });
  }
}

function syncRowHeights(){
  requestAnimationFrame(()=>{
    _syncHeaderHeights();
    /* 바디 행 좌우 높이 동기화 — 고정/본문이 별도 <table>이라 tr height만으론
       내용(아바타 등)이 밀어올려 어긋난다. 실측 max로 좌우를 맞춘다.
       (box-sizing:border-box + line-height:1 정리로 편차 없이 안정적) */
    /* ※ tr[data-id]로 한정하면 안 된다.
         - 그룹 행(.grpr)   : 좌측은 그룹명, 우측은 집계 문자열 → 글자 크기가 다르면 높이가 갈린다
         - 상세 행(.rd-row) : 좌측은 height:0 자리표시, 우측은 실제 상세 내용
         둘 다 data-id가 없어 동기화에서 빠지면 그 아래 행이 전부 밀린다.
       좌우 바디는 항상 같은 순서·같은 개수로 조립되므로 인덱스 짝짓기가 성립한다.
       (가상스크롤 모드는 이 함수를 쓰지 않고 _syncVSHeader만 호출한다) */
    const lbr=[...EL.gbodyLeft.querySelectorAll(':scope > tr')];
    const rbr=[...EL.gbody.querySelectorAll(':scope > tr')];
    for(let i=0;i<Math.min(lbr.length,rbr.length);i++){
      // 정수 픽셀로 강제 통일 — 소수점 높이(예 41.2px)를 좌우 테이블이 각자 반올림하면
      // 0.x px씩 어긋나 누적된다(100행에서 ~20px). Math.ceil로 좌우 동일 정수 강제.
      const mh=Math.ceil(Math.max(lbr[i].getBoundingClientRect().height,
                                  rbr[i].getBoundingClientRect().height));
      lbr[i].style.height=mh+'px';
      rbr[i].style.height=mh+'px';
    }
    /* 집계 tfoot 행 좌우 정렬 */
    if(EL.gfootLeft&&EL.gfoot){
      const lf=[...EL.gfootLeft.querySelectorAll(':scope > tr')];
      const rf=[...EL.gfoot.querySelectorAll(':scope > tr')];
      for(let i=0;i<Math.min(lf.length,rf.length);i++){
        const mh=Math.max(lf[i].offsetHeight,rf[i].offsetHeight);
        lf[i].style.height=mh+'px'; rf[i].style.height=mh+'px';
      }
    }
  });
}


/* ══════════════════════════════════════════════════════════
   MODAL / CRUD UI  (그리드 내장 기능)
══════════════════════════════════════════════════════════ */

/* ══════════ id 자동 채번 ══════════
   id는 그리드의 필수 키다(행 식별·선택·편집·변경추적·DOM data-id 전부 이 값을 쓴다).
   앱이 넣지 않은 행에는 그리드가 자동으로 부여한다.

   기존 구현의 문제 두 가지를 함께 고쳤다.
     1) Math.max(...arr) 는 수만 건에서 RangeError(스택 초과)를 낸다 → 순회로 계산
     2) 삭제 후 재추가 시 이전 id를 재사용해 baseline/undo와 충돌 → 단조 증가 시퀀스 사용 */
function _seedIdSeq(rows){
  let mx = S._idSeq || 0;
  for (const r of (rows || [])) {
    const n = r ? +r.id : NaN;
    if (Number.isFinite(n) && n > mx) mx = n;
  }
  S._idSeq = mx;
}
/** 다음 고유 ID 생성 (재사용 없음) */
function _genId() {
  if (typeof S._genId === 'function') {          // options.genId 로 규칙 교체 가능
    const v = S._genId(S.data);
    const n = +v;
    if (Number.isFinite(n)) S._idSeq = Math.max(S._idSeq || 0, n);
    return v;
  }
  S._idSeq = (S._idSeq || 0) + 1;
  return S._idSeq;
}
/* id 누락 행에 자동 채번 + 중복 검출.
   행 객체를 그대로 쓰므로(그리드는 편집 시 원본을 수정한다) 참조는 유지된다. */
function _ensureIds(rows){
  _seedIdSeq(rows);
  const seen = new Set();
  let filled = 0, dup = 0;
  for (const r of (rows || [])) {
    if (!r || typeof r !== 'object') continue;
    if (r.id === undefined || r.id === null || r.id === '') { r.id = _genId(); filled++; }
    if (seen.has(r.id)) { r.id = _genId(); dup++; }   // 중복도 새 id로 분리
    seen.add(r.id);
  }
  if (dup) console.warn(`ModuGrid: replaced ${dup} duplicate id(s) with newly generated ones.`);
  return { filled, dup };
}

function openAdd() {
  if(_ctl('mtitle')) _ctlTxt('mtitle', 'Add Row');
  // _modalMap 기반: 각 입력 필드에 _newRowDefaults 값 채움
  Object.entries(_modalMap).forEach(([elId, key]) => {
    const el = _$(elId);
    if (el) el.value = _newRowDefaults[key] ?? '';
  });
  const ov = _ctl('moverlay');
  if(ov){ ov.classList.add('vis'); ov.dataset.mode='add'; ov.dataset.id=''; }
}

function openEdit(row) {
  if(_ctl('mtitle')) _ctlTxt('mtitle', 'Edit Row');
  Object.entries(_modalMap).forEach(([elId, key]) => {
    const el = _$(elId);
    if (el) el.value = row[key] ?? '';
  });
  const ov = _ctl('moverlay');
  if(ov){ ov.classList.add('vis'); ov.dataset.mode='edit'; ov.dataset.id=row.id; }
}

function closeModal() {
  const ov=_ctl('moverlay'); if(ov) ov.classList.remove('vis');
}

function saveModal() {
  const ov=_ctl('moverlay'); if(!ov) return;
  // _modalMap 기반으로 모든 필드 수집
  const updates = {};
  for (const [elId, key] of Object.entries(_modalMap)) {
    const el = _$(elId); if (!el) continue;
    const v = el.value;
    updates[key] = _numericKeys.includes(key) ? +(v || 0) : v;
  }
  // name 필드(첫 번째 매핑)는 필수 검증
  const firstKey = Object.values(_modalMap)[0];
  if (typeof updates[firstKey] === 'string' && !updates[firstKey].trim()) {
    return alert(`${firstKey} required`);
  }
  const mode = ov.dataset.mode;
  if(mode === 'add') {
    addRow({ ..._newRowDefaults, ...updates, id: _genId() });
  } else {
    updateRow(+ov.dataset.id, updates);
  }
  closeModal();
}


/* ══════════════════════════════════════════════════
   ⑧ 컨텍스트 메뉴 (Context Menu)
══════════════════════════════════════════════════ */
let _ctxId = null;

/* ══════════ 우클릭 메뉴 표시 설정 ══════════
     options.contextMenu
       미지정 · true        → 전부 표시 (기본)
       false                → 그리드 메뉴를 아예 띄우지 않는다
                              (preventDefault 를 하지 않으므로 브라우저 기본 메뉴가 뜬다)
       { 항목명: false, … } → 지정한 항목만 감춘다. 안 적은 항목은 표시.

     항목명: detail · edit · copy · copyExcel · insertAbove · insertBelow · tree · delete

   권한(canUpdate/canInsert/canDelete)과 트리 모드 조건은 그대로 함께 적용된다.
   즉 옵션으로 켜 두어도 권한이 없으면 여전히 안 보인다(옵션은 '추가 제한'이다). */
const CTX_ITEMS = {
  detail:'ctxdetail', edit:'ctxmodal', copy:'ctxcopy', copyExcel:'ctxcopyxl',
  insertAbove:'ctxinsa', insertBelow:'ctxinsb', tree:'ctxtree', delete:'ctxdel',
};
/* 메뉴 자체를 쓰는가 */
function _ctxOn(){ return S.ctxMenu !== false; }
/* 개별 항목 표시 여부 — 객체로 준 경우에만 판단, 안 적은 항목은 표시 */
function _ctxItem(name){
  const c = S.ctxMenu;
  if (c === false) return false;
  if (c && typeof c === 'object') return c[name] !== false;
  return true;
}
/* 구분선 정리 — 항목을 감추면 구분선만 덩그러니 남거나 두 줄이 붙는다.
   앞쪽·뒤쪽·연속 구분선을 한 번의 순회로 모두 정리한다. */
function _ctxTrimSeps(m){
  const kids=[...m.children];
  const shown=el=>el.style.display!=='none';
  let prevSep=true;                       // 시작을 구분선으로 간주 → 맨 앞 구분선은 숨김
  kids.forEach(el=>{
    if(el.classList.contains('ctxsep')){
      if(prevSep) el.style.display='none';
      else { el.style.display=''; prevSep=true; }
    } else if(shown(el)) prevSep=false;
  });
  for(let i=kids.length-1;i>=0;i--){       // 뒤에 남은 구분선 제거
    const el=kids[i];
    if(el.classList.contains('ctxsep')) el.style.display='none';
    else if(shown(el)) break;
  }
}

function showCtx(e, id) {
  if (!_ctxOn()) return;                   // 메뉴 끔 → preventDefault 안 함(브라우저 기본 메뉴)
  const m = EL.ctx; if (!m) return;

  /* 표시 여부 = 옵션 && 권한/모드 조건 */
  const vis = {
    ctxdetail: _ctxItem('detail'),
    ctxmodal:  _ctxItem('edit')        && canUpdate(),
    ctxcopy:   _ctxItem('copy'),
    ctxcopyxl: _ctxItem('copyExcel'),
    ctxinsa:   _ctxItem('insertAbove') && canInsert(),
    ctxinsb:   _ctxItem('insertBelow') && canInsert(),
    ctxtree:   _ctxItem('tree')        && !!S.treeOn,
    ctxdel:    _ctxItem('delete')      && canDelete(),
  };
  let any=false;
  Object.entries(vis).forEach(([act,on])=>{
    const el=m.querySelector(`[data-act="${act}"]`);
    if(el){ el.style.display = on ? '' : 'none'; if(on) any=true; }
  });
  if (!any) return;                        // 남는 항목이 없으면 빈 메뉴를 띄우지 않는다
  _ctxTrimSeps(m);

  e.preventDefault();
  ModuGrid._active = GID;
  _ctxId = id;
  m.style.left = Math.min(e.clientX, window.innerWidth - 180) + 'px';
  m.style.top  = Math.min(e.clientY, window.innerHeight - 200) + 'px';
  m.classList.add('vis');
  document.addEventListener('click', () => m.classList.remove('vis'), { once: true });
}
function ctxDetail()  { openDetail(_ctxId); }
function ctxModal()   { _openRowModal(canUpdate() ? 'edit' : 'detail', _ctxId); }
/* [별칭] 예전 'Edit Cell' 메뉴가 쓰던 이름 — ctxModal 과 동일 동작 */
function ctxEdit()    { ctxModal(); }
function ctxCopy()    {
  const r = S.data.find(r => r.id === _ctxId); if (!r) return;
  navigator.clipboard?.writeText(JSON.stringify(r, null, 2)).catch(() => {});
  toast(msg('copiedRowJSON'));
}

/* 우클릭 메뉴 — 엑셀용 TSV 복사.
   이스케이프 규칙은 Ctrl+C 범위복사(copyRange)와 동일: 값에 탭·개행·따옴표가 있으면
   큰따옴표로 감싸고 내부 따옴표를 중복(""). 행 구분은 LF.
   대상 행 : 선택/체크된 행에 우클릭한 행이 포함되면 그 행들 전부, 아니면 우클릭한 행 하나.
   컬럼    : 화면에 보이는 순서(고정+스크롤). 체크박스·행번호·이미지 컬럼 제외.
   값      : 숫자/통화/진행률은 원본 숫자(엑셀이 수치로 인식해야 하므로 콤마 서식 제외),
             날짜는 표시 형식, 리스트 옵션은 셀에 보이는 표시값. */
function ctxCopyExcel(){
  const cols=[...getFzCols(),...getScCols()]
    .filter(c=>!_isSysCol(c.key) && c.type!=='images');
  if(!cols.length) return;
  const sel=new Set([...S.rowSel, ...S.rowCheck]);
  const ids=(_ctxId && sel.has(_ctxId)) ? sel : new Set(_ctxId?[_ctxId]:[]);
  if(!ids.size) return;
  // 화면 순서를 그대로 따르되, 필터로 가려진 행이 대상이면 원본에서 보충
  let targets=S.filtered.filter(r=>ids.has(r.id));
  if(!targets.length) targets=S.data.filter(r=>ids.has(r.id));
  if(!targets.length) return;

  const q=v=>{ const s=String(v??''); return /[\t\n\r"]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; };
  const cellText=(r,c)=>{
    if(c.type==='date') return _dateToDisplay(r[c.key]);
    // 숫자/통화/진행률은 서식 없는 원본 값 — 엑셀이 수치로 인식해야 하므로
    if(c.type==='currency'||c.type==='number'||c.type==='progress') return _valCode(r[c.key]);
    return _optDisp(c, r[c.key], r);
  };
  const tsv=targets.map(r=>cols.map(c=>q(cellText(r,c))).join('\t')).join('\n');
  _copyToClipboard(tsv);   // 토스트는 이 안에서 처리
  _ctlTxt('stCell', `Copy: ${targets.length} row(s) × ${cols.length} cols`);
}
/* 삭제 확인창은 '되돌릴 수 없을 때'만 띄운다.
   softDelete(기본 on)는 행을 지우지 않고 _del 표시만 붙이며 restoreRows()·Ctrl+Z 로
   되돌릴 수 있으므로 확인을 받지 않는다. softDelete:false 는 S.data 에서 즉시 제거되므로
   기존대로 확인을 받는다. */
function _needDelConfirm(){ return !S.softDelete; }

function ctxDel()     { if (!_ctxId) return; if (_needDelConfirm() && !confirm('Delete this row?')) return; deleteRows(new Set([_ctxId])); }
function _ctxInsertGuard(){ if(!canInsert()){ toast(msg('noPermInsert')); return false; } return true; }
function ctxInsert(pos) { if (_ctxId) insertAt(pos); }
function ctxTreeTog() { if (_ctxId) togTree(_ctxId); }

/* ══════════════════════════════════════════════════
   ⑨ 툴바 액션 (Toolbar Actions)
══════════════════════════════════════════════════ */
/** 선택/체크된 행 삭제 */
function deleteSelected() {
  const ids = new Set([...S.rowSel, ...S.rowCheck]);
  if (!ids.size) { alert('No rows selected/checked.'); return; }
  if (_needDelConfirm() && !confirm(`Delete ${ids.size} row(s)?`)) return;
  deleteRows(ids);
}

/** 선택된 첫 행 편집 모달 */
function editSelected() {
  const id = [...S.rowSel][0] || [...S.rowCheck][0];
  if (!id) { alert('Select one row to edit.'); return; }
  const row = S.data.find(r => r.id === id);
  if (row) openEdit(row);
}

/** 선택 기준 위/아래 행 삽입
 *  @param {'above'|'below'} pos
 *  @param {Function} [rowFactory]  (id)=>rowObject  — 없으면 기본 빈 행
 */
function insertAt(pos, rowFactory) {
  const refId = [...S.rowSel][0] || [...S.rowCheck][0];
  const newRow = typeof rowFactory === 'function'
    ? rowFactory(_genId())
    : { ..._newRowDefaults, id: _genId() };
  if (!refId) { addRow(newRow); return; }
  const idx = S.data.findIndex(r => r.id === refId);
  S.data.splice(pos === 'above' ? idx : idx + 1, 0, newRow);
  snap('Insert');
  applyFilters();
  _emit('dataChange', { type:'insert', row:newRow });
}

/** 검색어 설정 + 필터 적용 */
function search(q) {
  S.search = (q || '').toLowerCase().trim();
  S.page = 1;
  applyFilters();
  const el = _ctl('stSrch'); if (el) el.textContent = 'Search: ' + (S.search || '\u2014');
}

/* ═══════════════════════════════════════════════════
   PUBLIC API  (main.html에서 호출)
═══════════════════════════════════════════════════ */

/**
 * initGrid(config) — 그리드 초기화
 * @param {Object} config
 *   cols     : COLS_DEF 배열 (필수)
 *   options  : {
 *     showRN, showCB, striped, selMode,
 *     editMode, freezeOn, pageSize, rowHeight,
 *     multiSort
 *   }
 */
/* ── 이벤트 콜백 저장소 ── */
/* 데이터가 바뀌었음을 표시 — 변경추적(diff) 캐시 무효화용.
   렌더보다 먼저 호출해야 그 렌더가 최신 diff로 그려진다. */
function _touchData(){ S._dataVer = (S._dataVer || 0) + 1; }

const _cb = { dataChange:null, selectionChange:null, cellEdit:null, rowClick:null, cellClick:null, dataError:null, dirtyChange:null };
function _emit(ev, payload) {
  if (ev === 'dataChange') _touchData();
  if (typeof _cb[ev] === 'function') {
    try { _cb[ev](payload); } catch(e) { console.error(`ModuGrid on.${ev} error:`, e); }
  }
}

/* ══════════════════════════════════════════════════════════
   변경 추적 (Submit)
   markClean() 시점의 스냅샷과 현재 S.data를 비교해
   {inserted, updated, deleted}를 만든다.
   인라인 편집·모달·삽입·삭제·Undo/Redo가 모두 S.data에 반영되므로
   이벤트를 따로 부기할 필요가 없다.
   값은 _valCode로 코드 환원되어 옵션 객체가 그대로 나가지 않는다.
══════════════════════════════════════════════════════════ */
/* diff 대상 필드 — options.submitFields 우선, 없으면 COLS에서 자동 파생 */
function _submitKeys(){
  if(Array.isArray(S._submitFields) && S._submitFields.length) return S._submitFields;
  // imageMode 가 켜져 있으면 images 컬럼도 전송 대상에 포함한다
  const withImg = S.imageMode && S.imageMode!=='none';
  return COLS.filter(c=>!c.key.startsWith('_') && (withImg || c.type!=='images')).map(c=>c.key);
}
/* 컬럼 타입이 images 인 키 목록 */
function _imgKeys(){ return COLS.filter(c=>c.type==='images').map(c=>c.key); }
function _snapVals(r,keys){
  const o={};
  const imgKeys=_imgKeys();
  for(const k of keys){
    o[k] = imgKeys.includes(k) ? _imgSer(r[k], r.id, k) : _valCode(r[k]);
  }
  return o;
}
/* 비교 전용 직렬화(정규형) —
   ★ JSON.stringify 는 키의 '순서'까지 문자열에 반영한다.
     _snapVals 는 keys(=COLS 순서) 대로 객체를 만들기 때문에, 컬럼 위치를 바꾸면
     값이 하나도 안 변해도 문자열이 달라진다.
       이동 전 : {"empno":"E100","name":"홍길동","dept":"개발"}
       이동 후 : {"dept":"개발","empno":"E100","name":"홍길동"}
     → 전 행이 '수정됨'으로 잡혔다(바뀐 필드는 0개인데 updated 로 분류).
     _diff 가 _dataVer 로 캐싱되는 탓에 이동 직후엔 멀쩡하다가, 이후 아무 편집이나
     하는 순간 한꺼번에 뒤집혀 원인을 찾기 어려웠다.
   키를 정렬해 순서와 무관한 문자열로 만든다. 값 비교 자체는 그대로다.
   (전송 payload 는 _snapVals 를 그대로 쓰므로 컬럼 순서가 유지된다) */
function _snapKey(r, keys){
  return JSON.stringify(_snapVals(r, [...keys].sort()));
}

/* 렌더 때마다 전수 비교하지 않도록 dataChange 버전으로 캐싱 */
function _diff(){
  if(S._diffVer===S._dataVer && S._diff) return S._diff;
  const keys=_submitKeys();
  const ins=new Set(), upd=new Set(), del=[], seen=new Set();
  if(S._baseline){
    for(const r of S.data){
      seen.add(r.id);
      if(r._del){ del.push(r.id); continue; }        // 삭제 예정 → deleted로 분류
      const base=S._baseline.get(r.id);
      if(base===undefined) ins.add(r.id);
      else if(base!==_snapKey(r,keys)) upd.add(r.id);   // 키 순서 무관 비교
    }
    // baseline에는 있는데 S.data에서 사라진 행 (softDelete=false일 때)
    for(const id of S._baseline.keys()) if(!seen.has(id)) del.push(id);
  }
  S._diff={ins,upd,del,delSet:new Set(del),keys}; S._diffVer=S._dataVer;
  return S._diff;
}
/* 변경 건수가 달라졌을 때만 dirtyChange 발화 */
function _emitDirty(){
  const d=_diff();
  const total=d.ins.size+d.upd.size+d.del.length;
  if(total===S._dirtyTotal) return;
  S._dirtyTotal=total;
  _emit('dirtyChange',{inserted:d.ins.size, updated:d.upd.size, deleted:d.del.length, total});
}
/* 기준점 재설정 (렌더 없음) — setData/서버 로드 내부용 */
function _markCleanQuiet(){
  const keys=_submitKeys();
  S._baseline=new Map(S.data.map(r=>[r.id, _snapKey(r,keys)]));   // 키 순서 무관 정규형
  S._diff=null; S._diffVer=-1; S._dirtyTotal=0;
}
function markClean(){ _markCleanQuiet(); _emitDirty(); renderGrid(); }

function getChanges(){
  const d=_diff(), keys=d.keys;
  const byId=new Map(S.data.map(r=>[r.id,r]));
  const inserted=[...d.ins].map(id=>({ id, ..._snapVals(byId.get(id),keys) }));
  const updated=[...d.upd].map(id=>{
    const now=_snapVals(byId.get(id),keys);
    const before=JSON.parse(S._baseline.get(id));
    const changes={};
    keys.forEach(k=>{ if(String(before[k]??'')!==String(now[k]??'')) changes[k]=now[k]; });
    return { id, changes };
  });
  return { inserted, updated, deleted:[...d.del] };
}
function getChangeCount(){
  const d=_diff();
  const c={inserted:d.ins.size, updated:d.upd.size, deleted:d.del.length};
  c.total=c.inserted+c.updated+c.deleted;
  return c;
}
function isDirty(){ return getChangeCount().total>0; }
function getDirtyIds(){ const d=_diff(); return [...d.ins, ...d.upd]; }

/**
 * submit(url, opts) — 변경분을 서버로 전송한다.
 *   기본 전송: POST application/x-www-form-urlencoded, changes=<JSON>
 *              (구형 JSP에서 request.getParameter("changes")로 바로 수신)
 *   opts.json=true 로 하면 application/json 본문으로 보낸다.
 *
 *   opts = { method='POST', paramName='changes', json=false,
 *            headers={}, credentials, isOk=(res)=>bool, markClean=true }
 *
 *   반환: 서버 응답(JSON이면 파싱된 객체). 변경이 없으면 {ok:true, skipped:true, count}.
 *   실패(HTTP 오류 / isOk false)면 throw — 호출 측에서 try/catch.
 *   성공 시 markClean()이 자동 호출되어 기준점이 갱신된다.
 */
async function submit(url, opts){
  opts = opts || {};
  const count = getChangeCount();
  if(!count.total) return { ok:true, skipped:true, count };

  const payload = JSON.stringify(getChanges());
  const init = { method: opts.method || 'POST' };

  /* imageMode:'multipart' — changes(JSON) + 이미지 원본을 FormData 로 함께 보낸다.
     각 이미지 항목의 ref 값이 파트 이름이므로 서버는 그 이름으로 파일을 찾으면 된다.
     Content-Type 은 브라우저가 boundary 와 함께 자동 설정하므로 지정하지 않는다. */
  if(S.imageMode === 'multipart'){
    const fd = new FormData();
    fd.append(opts.paramName || 'changes', payload);
    const imgKeys = _imgKeys();
    for(const r of S.data){
      for(const k of imgKeys){
        (r[k]||[]).forEach((x,i)=>{
          if(x && x._file) fd.append(`img_${r.id}_${k}_${i}`, x._file, x.name);
        });
      }
    }
    init.body = fd;
    if(opts.headers) init.headers = { ...opts.headers };   // Content-Type 은 넣지 않는다
  } else {
    init.headers = Object.assign(
      { 'Content-Type': opts.json ? 'application/json; charset=UTF-8'
                                  : 'application/x-www-form-urlencoded; charset=UTF-8' },
      opts.headers || {});
    init.body = opts.json ? payload : (opts.paramName || 'changes') + '=' + encodeURIComponent(payload);
  }
  if(opts.credentials) init.credentials = opts.credentials;

  const res = await fetch(url, init);
  if(!res.ok) throw new Error('HTTP ' + res.status);
  const ct = res.headers.get('content-type') || '';
  const out = ct.includes('json') ? await res.json() : await res.text();

  const ok = typeof opts.isOk === 'function' ? !!opts.isOk(out)
           : (out && typeof out === 'object' ? out.ok !== false : true);
  if(!ok) throw new Error((out && out.message) || 'Server rejected the request');

  if(opts.markClean !== false){
    _purgeDeleted();   // 서버 반영 완료 → 삭제 예정 행을 화면에서도 제거
    if(S.imageMode === 'multipart'){        // 전송된 원본 참조 해제
      _imgKeys().forEach(k => S.data.forEach(r => (r[k]||[]).forEach(x => { delete x._file; })));
    }
    markClean();
  }
  return out;
}

/* ── Modal 필드 매핑 / 새 행 기본값 (옵션으로 재정의 가능) ── */
let _modalMap = { mN:'name', mSt:'status', mRo:'role', mSc:'score',
                  mPr:'progress', mSa:'salary', mJo:'joined', mMe:'memo' };
let _newRowDefaults = { name:'New Row', status:'active', role:'Developer',
                        score:80, progress:70, salary:5000000, joined:'',
                        images:[], memo:'', parentId:0 };
let _numericKeys = ['score','progress','salary'];
let _searchKeys  = [];   // 비어있으면 COLS에서 자동 파생

/* ── 그리드 높이 (options.height / options.maxHeight) ──
   CSS 기본값은 .gsc-wrap { max-height:420px } 하나뿐이라, 옵션을 주지 않으면
   데이터가 적을 때 내용 높이만큼 줄어든다. 아래 두 옵션으로 이를 제어한다.

     height    : 데이터 양과 무관하게 이 높이로 고정. 'fill' 이면 창 하단까지 확장
     maxHeight : 이 높이까지만 커지고 넘으면 스크롤 ('fill' 과 함께 쓰면 상한 역할)

   주의 — height 만 준 경우 스타일시트의 max-height:420px 가 그대로 살아 있어
   height:600 을 줘도 420 에서 잘린다(max-height 가 height 를 clamp 한다).
   그래서 maxHeight 가 없으면 max-height:none 을 함께 걸어 상한을 해제한다. */
function _hNorm(v){
  if(v==null||v==='') return null;
  if(typeof v==='number') return (isFinite(v)&&v>0) ? v+'px' : null;
  const s=String(v).trim();
  if(/^[0-9.]+$/.test(s)) return (+s>0) ? s+'px' : null;
  return /^[0-9.]+(px|pt|em|rem|vh|vw|%)$/.test(s) ? s : null;
}

/* fill — 그리드 하단이 브라우저 창 바닥에 닿도록 표 영역을 늘린다.

   height 는 표(.gsc-wrap)에만 걸리고 정렬바·푸터는 그 바깥에 따로 쌓이므로,
   height:'100vh' 로는 푸터 40px 만큼 창을 넘긴다. 그래서 루트를 세로 flex 로 바꾸고
   표에 flex:1 을 줘서 남는 공간을 표가 흡수하게 한다. 정렬바가 켜지거나 푸터를
   숨겨도 배분이 알아서 맞는다.

   루트 높이는 "그리드 상단부터 창 바닥까지"로 잡는다. 스크롤 위치에 따라 값이
   흔들리지 않도록 rect.top 에 scrollY 를 더해 문서 기준 위치로 환산한다. */
const FILL_MIN = 120;                    // 이 밑으로는 줄이지 않는다 (헤더도 안 보이는 높이)
const DEF_H    = '420px';                // 옵션 미지정 시 기본 높이 — CSS 의 max-height 와 같은 값
function _fillMeasure(){
  if(!S._fill || !root.isConnected) return;
  const de  = document.documentElement;
  /* innerHeight 가 아니라 clientHeight — 가로 스크롤바가 있으면 innerHeight 에는
     그 두께가 포함돼 있어서 그만큼 넘친다. */
  const vh  = de.clientHeight || window.innerHeight;
  const top = root.getBoundingClientRect().top + (window.scrollY || 0);
  let h = Math.max(FILL_MIN, vh - top);
  root.style.height = h + 'px';
  /* 그리드 바닥을 창 바닥에 정확히 맞춰도, 조상 요소의 아래쪽 padding·margin 이나
     그리드 뒤에 오는 요소가 있으면 그만큼 문서가 넘쳐 페이지 스크롤바가 하나 더 생긴다.
     남는 양을 직접 재서 빼는 편이 조상을 일일이 뒤지는 것보다 정확하다.

     보정은 한 번만 한다 — 넘치는 원인이 그리드가 아니라 페이지의 다른 요소일 수 있고,
     그 경우 반복하면 그리드만 근거 없이 계속 줄어든다. */
  const over = de.scrollHeight - de.clientHeight;
  if(over>0) root.style.height = Math.max(FILL_MIN, h - over) + 'px';
}
function _fillOn(maxH){
  S._fill = true;
  root.style.display       = 'flex';
  root.style.flexDirection = 'column';
  EL.wrap.style.flex      = '1 1 auto';
  EL.wrap.style.minHeight = '0px';       // flex 아이템 기본 min-height:auto 는 축소를 거부한다
  EL.wrap.style.maxHeight = maxH || 'none';
  _fillMeasure();
  window.addEventListener('resize', _fillMeasure);
}
function _fillOff(){
  if(!S._fill) return;
  S._fill = false;
  window.removeEventListener('resize', _fillMeasure);
}
/* fitLast 는 그리드의 실제 폭을 재서 마지막 컬럼에 남는 폭을 넘긴다. 창이 넓어지거나
   좁아지면 그 값이 어긋나므로 다시 그려야 한다. 렌더는 비싸니 짧게 debounce 한다. */
let _fitTmr = 0;
function _fitOnResize(){
  clearTimeout(_fitTmr);
  _fitTmr = setTimeout(()=>{ if(S.fitLast) renderGrid(); }, 100);
}
function _fitLastOn(){
  if(S._fitBound) return;
  S._fitBound = true;
  window.addEventListener('resize', _fitOnResize);
}
function _fitLastOff(){
  if(!S._fitBound) return;
  S._fitBound = false;
  clearTimeout(_fitTmr);
  window.removeEventListener('resize', _fitOnResize);
}
function _applyGridHeight(height, maxHeight){
  if(!EL.wrap) return;
  const mh = _hNorm(maxHeight);
  if(typeof height === 'string' && height.trim().toLowerCase() === 'fill'){
    _fillOn(mh);
    return;
  }
  /* 기본값은 고정. 아무것도 안 주면 행 수와 무관하게 420px 을 유지한다.
     maxHeight 만 준 경우는 "이 높이까지 자라라"는 뜻이므로 고정을 걸지 않는다
     — 여기에 기본 높이까지 얹으면 maxHeight 가 아무 일도 못 하게 된다.
     내용 높이만큼만 쓰던 예전 동작이 필요하면 maxHeight 로 상한만 주면 된다. */
  const h = _hNorm(height) || (mh ? null : DEF_H);
  if(h){
    EL.wrap.style.height    = h;
    EL.wrap.style.maxHeight = mh || 'none';   // 상한 해제 — 없으면 CSS 의 420px 에 잘린다
  }else{
    EL.wrap.style.maxHeight = mh;
  }
}
function initGrid(config) {
  if (!config || !config.cols) throw new Error('initGrid: options.cols is required');
  // 컬럼 설정
  COLS.length = 0;
  config.cols.forEach(c => { COLS.push({...c}); CW[c.key] = c.w; });
  // 옵션 적용
  const o = config.options || {};
  _initI18n(o.i18n);   // 메시지 사전 (기본 영어 + 오버라이드) — 첫 렌더 전 초기화
  S.showRN   = o.showRN   !== false;
  S.showCB   = o.showCB   !== false;
  S.showST   = o.showST   !== false;
  /* _cb(체크박스 컬럼) 헤더 —
       미지정 · 'check' · true → 전체선택 체크박스 (기본)
       'none' · false          → 빈 헤더
       그 외 문자열            → 그 문자열을 헤더 글자로 (수기 입력) */
  S.cbHeader = (o.cbHeader === undefined) ? 'check' : o.cbHeader;
  S.headerWrap = !!o.headerWrap;   // 헤더 라벨 자동 줄바꿈
  S.textCase   = (o.textCase==='upper'||o.textCase==='lower') ? o.textCase : null;
  S.placeholderMode = ['all','first','none'].includes(o.placeholderMode) ? o.placeholderMode : 'all';
  S.showFilter = o.showFilter !== false;   // 전체 필터 on/off (컬럼별은 col.noFilter)
  /* 편집모드 세부 권한 — 각각 끄면 해당 조작 자체가 막힌다 */
  S.canInsert = o.canInsert !== false;
  S.canUpdate = o.canUpdate !== false;
  S.canDelete = o.canDelete !== false;
  if(o.theme || o.themeVars) setTheme(o.theme, o.themeVars);

  /* ── 이미지 전송 방식 ──
       none      : 미리보기만. 서버로 보내지 않는다(기존 동작)
       upload    : 파일 선택 즉시 imageUpload()로 개별 업로드 → 서버가 준 id/url만 보관
       multipart : File 객체를 들고 있다가 submit() 때 FormData 로 함께 전송
       base64    : dataURL 로 변환해 보관 → submit JSON 에 동봉 (작은 이미지 전용) */
  S.imageMode = ['none','upload','multipart','base64'].includes(o.imageMode) ? o.imageMode : 'none';
  S._imgUpload = (typeof o.imageUpload === 'function') ? o.imageUpload : null;
  S.imageMaxSize = +o.imageMaxSize || 0;         // bytes, 0 = 무제한
  S.imageLimit   = (+o.imageLimit > 0) ? +o.imageLimit : 5;
  if(S.imageMode === 'upload' && !S._imgUpload)
    console.warn("ModuGrid: imageMode:'upload' requires an options.imageUpload function.");
  /* 폰트 — 헤더/본문 독립. 미지정이면 CSS 기본값 */
  if(o.headerFont || o.bodyFont) setFont({ header:o.headerFont, body:o.bodyFont });
  /* 하단 상태바 — 통째로(showFoot) 또는 항목별로 숨길 수 있다 */
  S.showFoot     = o.showFoot     !== false;
  S.showRows     = o.showRows     !== false;   // Rows 1–10 of 35
  S.showPager    = o.showPager    !== false;   // ‹ 1 2 3 ›
  S.showPageSize = o.showPageSize !== false;   // Per page
  _applyFootVis();
  S.softDelete = o.softDelete !== false;
  /* 행 단위 편집 잠금 — rowEditable(row) 가 false 면 그 행 전체를 수정할 수 없다.
     셀 단위는 컬럼 정의의 col.editable(row,col) 로 건다. */
  S.rowEditable = (typeof o.rowEditable === 'function') ? o.rowEditable : null;
  /* 우클릭 메뉴 — false(전체 끄기) / true·미지정(전부 표시) / {항목:false} (항목별) */
  S.ctxMenu = (o.contextMenu === undefined) ? true : o.contextMenu;
  /* 로드 직후(클릭 전) 키보드 조작을 이 그리드가 받을지. 기본 true(현행 유지).
     false 면 그리드를 한 번 클릭해야 방향키·Ctrl+C·Ctrl+Z 등이 동작한다.
     ※ 실제 적용은 인스턴스 등록 시점(아래 ModuGrid._active) — initGrid 가 그보다 뒤에
       호출되므로 거기서는 config 를 직접 읽는다. 여기 값은 상태 확인(getState)용이다. */
  S.kbOnLoad = o.keyboardOnLoad !== false;
  /* validate 오류 말풍선이 저절로 사라지기까지의 시간(ms). 0 이하면 계속 표시. */
  S.errMsgMs = Number.isFinite(+o.errorMsgDuration) ? +o.errorMsgDuration : 3000;
  // id 채번 규칙 교체: (data)=>id  — 예) 임시행을 음수로: () => -(++n)
  S._genId = (typeof o.genId === 'function') ? o.genId : null;
  S.striped  = o.striped  !== false;
  S.selMode  = o.selMode  || 'row';
  S.editMode = !!o.editMode;
  S.freezeOn = !!o.freezeOn;
  S.dateFormat = o.dateFormat || 'yyyy-mm-dd';   // 날짜 입력/표시 형식 (기본 yyyy-mm-dd)
  // 변경추적(Submit): diff 대상 필드 / 변경 행 시각 표시
  S._submitFields = Array.isArray(o.submitFields) ? [...o.submitFields] : null;
  S.dirtyMark = (o.dirtyMark !== false);
  /* 앱 소유 컨트롤 ID 매핑 (문서화돼 있었으나 실제 파싱이 빠져 있었다) */
  if (o.controls && typeof o.controls === 'object') {
    for (const k in o.controls) {
      if (o.controls[k]) { _controls[k] = o.controls[k]; _ctlUser[k] = true; }
    }
  }
  S.ps       = (o.pageSize===0 || o.pageSize==='0') ? PS_ALL : (+o.pageSize || 100);
  S.defH     = o.rowHeight || 25;
  /* 그리드 전체 높이 — 미지정이면 CSS 기본값(max-height:420px)을 그대로 쓴다 */
  _applyGridHeight(o.height, o.maxHeight);
  S.fitLast  = !!o.fitLast;   // 마지막 컬럼으로 남는 폭 흡수 (기본 꺼짐 = 빈 공간 유지)
  if (S.fitLast) _fitLastOn();
  S.multiSort= !!o.multiSort;
  // 서버사이드 데이터 모드: dataSource(req) => Promise<{rows,total}>
  S._ds = o.dataSource;
  S._fltSrc = o.filterSource;   // (colKey, req) => Promise<string[]> — 서버 distinct 목록
  S.serverMode = typeof S._ds === 'function';
  if (S.serverMode) setTimeout(()=>_fetchServer(true), 0);   // 초기 자동 조회
  // AC 힌트 주입 (옵션)
  if (o.acHints) setACHints(o.acHints);
  // 자동완성 서버 소스(옵션): acSource(colKey, q) => Promise<string[]>
  //   컬럼에 col.acSource가 있으면 그쪽이 우선한다.
  //   실패하거나 빈 배열이면 로컬 힌트(col.acHints → acHints[key])로 폴백한다.
  S._acSrc = typeof o.acSource === 'function' ? o.acSource : null;
  S._acDebounceMs = Number.isFinite(+o.acDebounce) ? +o.acDebounce : 200;
  // Modal 필드 매핑 / 새 행 기본값 재정의 (옵션)
  if (o.modalMap)       _modalMap = { ..._modalMap, ...o.modalMap };
  if (o.newRowDefaults) _newRowDefaults = { ..._newRowDefaults, ...o.newRowDefaults };
  if (o.numericKeys)    _numericKeys = [...o.numericKeys];
  if (o.searchKeys)     _searchKeys  = [...o.searchKeys];
  // 이벤트 콜백 등록: options.on = { dataChange, selectionChange, cellEdit, rowClick, cellClick, ... }
  if (o.on) Object.keys(_cb).forEach(k => { if (typeof o.on[k]==='function') _cb[k]=o.on[k]; });
  // 페이지 크기 select UI 동기화
  if (EL.psz) EL.psz.value = String(S.ps);
  // stripe 초기 적용
  if (!S.striped) {
    [EL.gt,EL.gtLb].forEach(el=>{if(el)el.style.setProperty('--bg-alt','var(--bg)');});
  }
}

/**
 * setData(rows) — 데이터 로드 및 렌더링
 * @param {Array} rows
 */
function setData(rows) {
  _ensureIds(rows);             // id 없는 행 자동 채번 (+중복 정리)
  S.data = [...rows];
  S.filtered = [...rows];
  S._flatData = [...rows];   // 원본 flat 데이터 보관 (트리 OFF 복귀용)
  S._treeData = null;        // 트리 캐시 초기화
  S.page = 1;
  S.rowSel.clear(); S.rowCheck.clear();
  S.invalid.clear();            // 새 데이터 → 이전 오류 표시 폐기
  snap('Load');
  _markCleanQuiet();            // 새 데이터 로드 = 변경 기준점 재설정
  applyFilters();
  updUD();
  syncScroll();
  _emit('dataChange', { type:'load', count: rows.length });
}

/** 단일 행 추가 */
function addRow(row) {
  if (row && (row.id === undefined || row.id === null || row.id === '')) row.id = _genId();
  S.data.push(row);
  snap('Add');
  _touchData();                                     // ★ 렌더 전 diff 캐시 무효화.
  /* _diff() 는 _dataVer 로 캐싱되는데 그 값을 올려 주는 곳은 아래 _emit('dataChange') 뿐이다.
     여기서 미리 올리지 않으면 바로 이어지는 applyFilters() 의 렌더가 '추가 전' 캐시를 읽어,
     방금 넣은 행이 ins 에 없는 상태로 그려진다 — _st 의 '+' 표시가 그 행에만 빠지고,
     다음 추가 때 렌더가 다시 돌면서 한 박자 늦게 나타난다(N 번 추가에 N-1 개). */
  applyFilters();                                   // S.filtered 갱신 (내부에서 renderGrid)
  /* ★ 페이지 계산은 반드시 applyFilters() '뒤에' 한다.
     예전에는 앞에서 ceil(S.data.length / _pageSize()) 로 계산했는데,
     'All'(Per page=All) 모드의 _pageSize() 는 아직 갱신되지 않은 S.filtered.length
     (= 추가하기 전 행 수)를 돌려준다. 8행에서 1행을 더하면 ceil(9/8)=2 가 되어
     2페이지로 넘어가는데, All 모드는 페이지가 1개뿐이라 2페이지는 언제나 비어 있다.
     → 새 행만 안 보이는 게 아니라 그리드 전체가 빈 화면이 됐다. */
  const p = _pageOfRow(row);                        // 추가한 행이 실제로 보이는 페이지
  if (p !== S.page) { S.page = p; renderGrid(); }
  _emit('dataChange', { type:'add', row });
}

/* 그 행이 보이는 페이지 번호를 돌려준다.
   필터에 걸려 목록에 없으면 현재 페이지를 유효 범위로 클램프(빈 페이지 방지). */
function _pageOfRow(row) {
  if (S.serverMode) return S.page;                  // 서버 페이징은 서버가 정한다
  const ps = _pageSize();
  const pages = Math.max(1, Math.ceil(_totalRows() / ps));
  const idx = row ? S.filtered.findIndex(r => r.id === row.id) : -1;
  return idx < 0 ? Math.min(S.page, pages) : Math.floor(idx / ps) + 1;
}

/** id Set으로 행 삭제.
    softDelete(기본 on): 행을 지우지 않고 _del 플래그를 세워 '삭제 예정'으로 표시한다.
      - 아직 서버에 없는 신규 행(baseline에 없음)은 표시 대상이 아니므로 바로 제거
      - 실제 제거는 submit() 성공 후 _purgeDeleted()에서 수행
      - _del은 행 객체에 저장되므로 undo/redo(스냅샷 직렬화)로 그대로 복원된다 */
function deleteRows(idsSet) {
  if(S.editMode && !S.canDelete) { toast(msg('noPermDelete')); return; }
  const targets = S.data.filter(r => idsSet.has(r.id));
  if (!targets.length) return;
  const removed = [], marked = [];
  if (S.softDelete) {
    targets.forEach(r => {
      if (S._baseline && !S._baseline.has(r.id)) removed.push(r.id);   // 신규 행 → 즉시 제거
      else if (!r._del) { r._del = true; marked.push(r.id); }
    });
    if (removed.length) { const rm=new Set(removed); S.data = S.data.filter(r => !rm.has(r.id)); }
  } else {
    targets.forEach(r => removed.push(r.id));
    S.data = S.data.filter(r => !idsSet.has(r.id));
  }
  if (!removed.length && !marked.length) return;
  _dropInvalid(removed);
  S.rowSel.clear(); S.rowCheck.clear();
  snap('Delete');
  _touchData();
  applyFilters();
  _emit('dataChange', { type:'delete', ids:[...marked, ...removed], pending:marked, removed });
  _emit('selectionChange', { selected: [], checked: [] });
}

/** 삭제 예정(_del) 표시 해제 */
function restoreRows(idsSet) {
  const back = S.data.filter(r => idsSet.has(r.id) && r._del);
  if (!back.length) return;
  back.forEach(r => { delete r._del; });
  snap('Restore');
  _touchData();
  applyFilters();
  _emit('dataChange', { type:'restore', ids: back.map(r => r.id) });
}

/** 삭제 예정 행을 실제로 제거 (submit 성공 후) */
function _purgeDeleted() {
  const gone = S.data.filter(r => r._del).map(r => r.id);
  if (!gone.length) return gone;
  S.data = S.data.filter(r => !r._del);
  _dropInvalid(gone);
  _touchData();
  return gone;
}

/** 특정 행들의 validate 오류 표시 제거 */
function _dropInvalid(ids) {
  if (!ids || !ids.length) return;
  const set = new Set(ids.map(String));
  for (const k of [...S.invalid.keys()]) {
    if (set.has(k.slice(0, k.indexOf('\u0000')))) S.invalid.delete(k);
  }
}

/** 단일 행 업데이트 */
function updateRow(id, updates) {
  const r = S.data.find(r => r.id === id);
  if (r) Object.assign(r, updates);
  snap('Edit');
  _touchData();                     // 렌더 전 diff 캐시 무효화 (commitEdit과 동일)
  applyFilters();
  _emit('dataChange', { type:'update', id, updates });
}

/** 현재 선택(클릭) row id 배열 */
function getSelected() { return [...S.rowSel]; }
/** 현재 체크된 row id 배열 */
function getChecked()  { return [...S.rowCheck]; }
/** 현재 필터된 데이터 */
function getFilteredData() { return [...S.filtered]; }

/* ══════════ 컬럼 드래그 이동 ══════════
   헤더 th를 잡고 4px 이상 이동 시 드래그 시작 → 고스트+드롭 인디케이터 표시
   시스템(_) 컬럼·noMove 컬럼·(freezeOn 시) 고정 패널 컬럼은 이동 불가 */
function colMD(e, key){
  if(e.button!==0) return;
  if(e.target.closest('.rh')||e.target.closest('.fi-ico')) return;
  const col=COLS.find(c=>c.key===key);
  if(!col||col.key.startsWith('_')||col.noMove) return;
  if(S.freezeOn&&isFz(key)) return;
  const startX=e.clientX;
  let moved=false;
  const mv=ev=>{
    if(!moved && Math.abs(ev.clientX-startX)<4) return;
    if(!moved){
      moved=true; S._supSort=true;
      EL.colghost.textContent=col.label||key;
      EL.colghost.classList.add('vis');
      const srcTh=EL.wrap.querySelector(`th[data-c="${key}"]`);
      if(srcTh) srcTh.classList.add('col-dragging');
    }
    EL.colghost.style.left=(ev.clientX+12)+'px';
    EL.colghost.style.top =(ev.clientY+14)+'px';
    let x=null, before=null;
    for(const th of EL.ghead.querySelectorAll('th[data-c]')){
      const r=th.getBoundingClientRect();
      if(ev.clientX < r.left + r.width/2){ x=r.left; before=th.dataset.c; break; }
      x=r.right; before=null;
    }
    S._dropBefore=before;
    if(x!=null){
      const hr=EL.ghead.getBoundingClientRect();
      const br=EL.gsc.getBoundingClientRect();
      EL.dropind.style.left=(x-1)+'px';
      EL.dropind.style.top =hr.top+'px';
      EL.dropind.style.height=(br.bottom-hr.top)+'px';
      EL.dropind.classList.add('vis');
    }
  };
  const up=()=>{
    document.removeEventListener('mousemove',mv);
    document.removeEventListener('mouseup',up);
    EL.colghost.classList.remove('vis');
    EL.dropind.classList.remove('vis');
    const srcTh=EL.wrap.querySelector(`th[data-c="${key}"].col-dragging`);
    if(srcTh) srcTh.classList.remove('col-dragging');
    if(!moved) return;
    setTimeout(()=>{ S._supSort=false; },0);
    const before=S._dropBefore;
    const toIdx = before!=null ? COLS.findIndex(c=>c.key===before) : COLS.length;
    moveCol(key, toIdx);
  };
  document.addEventListener('mousemove',mv);
  document.addEventListener('mouseup',up);
}

/** moveCol(key, toIdx) — COLS[toIdx] 앞으로 이동. true=이동됨 / false=불가·제자리 */
function moveCol(key, toIdx){
  const from=COLS.findIndex(c=>c.key===key);
  if(from<0) return false;
  const col=COLS[from];
  if(col.key.startsWith('_')||col.noMove) return false;
  const minIdx=COLS.reduce((n,c)=>n+(c.key.startsWith('_')?1:0),0);
  toIdx=Math.max(minIdx, Math.min(+toIdx||0, COLS.length));
  if(toIdx===from||toIdx===from+1) return false;
  COLS.splice(from,1);
  if(toIdx>from) toIdx--;
  COLS.splice(toIdx,0,col);
  renderGrid();
  _renderColPanel();
  return true;
}

/* ══════════ 행 드래그 순서 변경 ══════════
   행번호(#) 셀을 잡고 상하 4px 이상 이동 → 고스트 + 행 사이 드롭 라인.
   짧은 클릭은 기존처럼 해당 행 선택.
   비활성: 정렬 중 / Tree·Group 모드 / 서버 모드 → 기존 선택 동작으로 폴백.
   순서 영속화(예: SORT_ORDER 컬럼)는 dataChange({type:'move'})에서 앱이 처리 */
function rowMD(e, ri, rowId){
  if(S.sorts.length||S.treeOn||S.groupBy||S.serverMode) return false;   // 폴백 → 선택 로직 진행
  if(e.button!==0) return false;
  if(e.target.closest('.rrh')) return false;                            // 행높이 리사이즈 핸들 제외
  e.preventDefault();
  const startY=e.clientY;
  let moved=false;
  const mv=ev=>{
    if(!moved && Math.abs(ev.clientY-startY)<4) return;
    if(!moved){
      moved=true;
      const num=S.filtered.findIndex(r=>r.id===rowId)+1;
      EL.colghost.textContent='↕ Row '+num;
      EL.colghost.classList.add('vis');
      EL.wrap.querySelectorAll(`tr[data-id="${rowId}"]`).forEach(tr=>tr.classList.add('row-dragging'));
    }
    EL.colghost.style.left=(ev.clientX+12)+'px';
    EL.colghost.style.top =(ev.clientY+14)+'px';
    // 드롭 위치: 우측 패널 행 중심점 기준 (좌/우 패널 세로 좌표 동일)
    let y=null, beforeId=null;
    for(const tr of EL.gbody.querySelectorAll('tr[data-id]')){
      const r=tr.getBoundingClientRect();
      if(ev.clientY < r.top + r.height/2){ y=r.top; beforeId=+tr.dataset.id; break; }
      y=r.bottom; beforeId=null;
    }
    S._rowDropBefore=beforeId;
    if(y!=null){
      const wr=EL.wrap.getBoundingClientRect();
      EL.dropind.style.left =wr.left+'px';
      EL.dropind.style.top  =(y-1)+'px';
      EL.dropind.style.width=wr.width+'px';
      EL.dropind.style.height='2px';
      EL.dropind.classList.add('vis');
    }
  };
  const up=()=>{
    document.removeEventListener('mousemove',mv);
    document.removeEventListener('mouseup',up);
    EL.colghost.classList.remove('vis');
    EL.dropind.classList.remove('vis');
    EL.dropind.style.width='2px'; EL.dropind.style.height='';   // 컬럼 드래그용 스타일 원복
    EL.wrap.querySelectorAll('tr.row-dragging').forEach(tr=>tr.classList.remove('row-dragging'));
    if(!moved){ _selectSingleRow(ri, rowId); return; }          // 클릭 = 기존 행 선택 유지
    moveRow(rowId, S._rowDropBefore);
  };
  document.addEventListener('mousemove',mv);
  document.addEventListener('mouseup',up);
  return true;   // mousedown 소비 → cellMD 선택 로직 스킵
}

function _selectSingleRow(ri, rowId){
  if(S.selMode!=='row') return;
  S.rowAnchor=ri; S.rowRanging=false;
  S.rowSel=new Set([rowId]);
  _applyRowSelCls();
  if(S.editMode){ S.focusRI=ri; S.focusCI=0; }   // 키보드 탐색 시작점
  _emit('rowClick',{id:rowId,selected:true});
  _emit('selectionChange',{selected:[...S.rowSel],checked:[...S.rowCheck]});
}

/** moveRow(rowId, beforeId) — beforeId 행 앞으로 이동(null=맨 뒤). Undo 1회 연동. true=이동됨 */
function moveRow(rowId, beforeId){
  if(S.sorts.length||S.treeOn||S.groupBy||S.serverMode) return false;
  const from=S.data.findIndex(r=>r.id===rowId);
  if(from<0) return false;
  let to=(beforeId==null)?S.data.length:S.data.findIndex(r=>r.id===beforeId);
  if(to<0) return false;
  if(to===from||to===from+1) return false;   // 제자리
  const [row]=S.data.splice(from,1);
  if(to>from) to--;
  S.data.splice(to,0,row);
  snap('Move row');
  applyFilters();
  _emit('dataChange',{type:'move', id:rowId});
  return true;
}

/* ══════════ 임의 컬럼 숨김 ══════════ */
/** hideCol(key) — 렌더에서 완전히 제외. 마지막 1개 데이터 컬럼은 숨김 불가 */
function hideCol(key){
  const col=COLS.find(c=>c.key===key);
  if(!col||col.key.startsWith('_')||S.hiddenCols.has(key)) return false;
  const vis=COLS.filter(c=>!c.key.startsWith('_')&&!S.hiddenCols.has(c.key));
  if(vis.length<=1) return false;
  if(S.editCell&&S.editCell.colKey===key) cancelEdit();
  S.hiddenCols.add(key);
  renderGrid(); _renderColPanel();
  return true;
}
function showCol(key){
  if(!S.hiddenCols.has(key)) return false;
  S.hiddenCols.delete(key);
  renderGrid(); _renderColPanel();
  return true;
}
function toggleColHidden(key){ return S.hiddenCols.has(key) ? showCol(key) : hideCol(key); }

/** 컬럼 표시/숨김 패널 */
function openColPanel(e){
  if(e&&e.stopPropagation) e.stopPropagation();
  _renderColPanel();
  const p=EL.colpanel; if(!p) return;
  const r=(e&&e.target&&e.target.getBoundingClientRect)?e.target.getBoundingClientRect():{left:80,bottom:80};
  p.style.left=r.left+'px'; p.style.top=(r.bottom+4)+'px';
  p.classList.add('vis');
  setTimeout(()=>document.addEventListener('click',()=>p.classList.remove('vis'),{once:true}),0);
}
function _renderColPanel(){
  const p=EL.colpanel; if(!p) return;
  const visCnt=COLS.filter(c=>!c.key.startsWith('_')&&!S.hiddenCols.has(c.key)).length;
  p.innerHTML=`<div class="cph">${msg('colVisible')}</div>`+
    COLS.filter(c=>!c.key.startsWith('_')).map(c=>{
      const on=!S.hiddenCols.has(c.key);
      const dis=(on&&visCnt<=1)?'disabled':'';
      return `<label class="cpi"><input type="checkbox" ${on?'checked':''} ${dis} data-act="coltog" data-c="${esc(c.key)}"> ${esc(c.label||c.key)}</label>`;
    }).join('');
}

/* ══════════════════════════════════════════════════════════
   ModuGrid PUBLIC API 객체
   모든 public 함수는 이 객체로 노출됩니다.
   inline HTML 이벤트 핸들러를 위해 window.G + window[fn] 도 등록됩니다.
══════════════════════════════════════════════════════════ */
  const api = {
    /* ── 데이터 관리 ─────────────────────── */
    setData, addRow, deleteRows, updateRow,

    /* ── 생명주기 ────────────────────────── */
    /** 그리드 정리: 스크롤 핸들러 해제, DOM 비움, window 전역 제거 */
    destroy() {
      if (EL.gsc) EL.gsc.onscroll = null;
      _fillOff();                                  // height:'fill' 의 window resize 리스너 해제
      _fitLastOff();                               // fitLast 의 window resize 리스너 해제
      document.removeEventListener('keydown', api._onKeydown);
      document.removeEventListener('paste', api._onPaste);
      document.removeEventListener('mouseup', _onDocMouseup);
      document.removeEventListener('mousedown', _onDocMousedown);
      _LBL.clear();
        delete ModuGrid._reg[GID];
      if (ModuGrid._active === GID) ModuGrid._active = null;
      root.innerHTML = '';
      root.classList.remove('jsg-root', 'editmode');
      S.data = []; S.filtered = []; S._flatData = [];
      S.rowSel.clear(); S.rowCheck.clear();
    },

    /* ── 조회 ────────────────────────────── */
    getSelected, getChecked, getFilteredData,
    getState: () => S,

    /* ── 리스트 옵션 값 환원 ─────────────────
       데이터에 옵션 객체({code,name} 등)가 들어있어도 코드 문자열로 환원한다.
       서버 전송(submit) 직전에 쓰면 [object Object]가 나가는 것을 막는다.
       배열·Date·옵션 키가 없는 일반 객체는 그대로 통과시킨다. */
    /* ── 변경 추적 / 전송 (Submit) ─────────
       markClean() 기준점 대비 diff. setData/서버 재조회 시 자동 재설정된다. */
    markClean, getChanges, getChangeCount, isDirty, getDirtyIds, submit,
    restoreRows, toggleStatusCol, toggleDirtyMark,
    toggleFoot, toggleRowsInfo, togglePager, togglePageSize,
    setFont, getFont, setPlaceholderMode, toggleFilter,
    setTheme, getTheme, getThemes,
    /** getPendingDeletes() → 삭제 예정 행 id 배열 */
    getPendingDeletes: () => S.data.filter(r=>r._del).map(r=>r.id),

    /* ── 유효성 오류 셀 ─────────────────────
       validate 실패 시 값은 유지되고 셀만 붉게 표시된다. 저장 전 확인용. */
    /** getInvalidCells() → [{id, key, message}] */
    getInvalidCells: () => [...S.invalid.entries()].map(([k,m])=>{
      const i=k.indexOf('\u0000');
      return { id:Number(k.slice(0,i)), key:k.slice(i+1), message:m };
    }),
    /** isValid() → 오류 셀이 하나도 없으면 true */
    isValid: () => S.invalid.size===0,

    /** toCode(value) → 코드 문자열 (옵션 객체가 아니면 원본 그대로) */
    toCode: (val) => _valCode(val),
    /**
     * toCodeRow(row, keys?) → 지정 키만 코드로 환원한 '사본'
     *   keys 생략 시 row의 모든 키. 원본 row는 변경하지 않는다.
     */
    toCodeRow(row, keys){
      if (!row || typeof row !== 'object') return row;
      const ks = Array.isArray(keys) ? keys : Object.keys(row);
      const o = {};
      ks.forEach(k => { o[k] = _valCode(row[k]); });
      return o;
    },

    /* ── 기능 토글 ───────────────────────── */
    toggleFreeze, toggleRowNum, toggleCheckbox,
    toggleVS, toggleEditMode, toggleStripe,
    setSelMode, toggleGroup, toggleTree, toggleMultiSort,

    /* ── 페이지네이션 ────────────────────── */
    goPage, changePS,

    /* ── 행 높이 ─────────────────────────── */
    /**
     * setRowHeight(rowId, px)
     *  - (id, 60)   : 해당 행 높이 지정 (최소 24)
     *  - (id, null) : 해당 행을 기본 높이로 복원
     *  - (null, 40) : 기본 높이 자체 변경 (전체 적용, VS 스페이서 기준)
     */
    setRowHeight(rowId, px){
      if (rowId == null) {
        S.defH = Math.max(24, +px || 25);
      } else if (px == null) {
        delete S.rowH[rowId];
      } else {
        S.rowH[rowId] = Math.max(24, +px);
      }
      renderGrid();
    },

    /* ── 레이아웃 저장/복원 ──────────────── */
    /**
     * getLayout() → JSON.stringify 가능한 순수 객체
     *  { v:2, order, hidden, widths, sorts, filters, pageSize,
     *    showRN, showCB, striped, freezeOn, multiSort, selMode }
     */
    getLayout(){
      const filters={};
      Object.entries(S.cfilters).forEach(([k,f])=>{
        filters[k] = f.type==='list'
          ? {type:'list', values:[...f.values]}            // Set → 배열 직렬화
          : {type:'range', min:f.min, max:f.max};
      });
      return {
        v:2,
        order: COLS.map(c=>c.key),
        hidden: [...S.hiddenCols],
        widths:{...CW},
        sorts:S.sorts.map(s=>({col:s.col, dir:s.dir})),
        filters,
        pageSize:S.ps,
        showRN:S.showRN, showCB:S.showCB, showST:S.showST, dirtyMark:S.dirtyMark, striped:S.striped,
        showFoot:S.showFoot, showRows:S.showRows, showPager:S.showPager, showPageSize:S.showPageSize,
        font:getFont(),
        placeholderMode:S.placeholderMode, showFilter:S.showFilter,
        theme:S.theme,
        freezeOn:S.freezeOn, multiSort:S.multiSort, selMode:S.selMode,
      };
    },

    /**
     * setLayout(layout) → true(적용) / false(형식 오류로 무시)
     *  - 현재 COLS에 없는 컬럼의 폭/정렬/필터는 건너뜀 (컬럼 정의 변경에 안전)
     *  - 토글은 기존 toggle 함수 경유 → 버튼 on/off 상태·부수효과 일관
     *  - multiSort 토글을 정렬 복원보다 먼저 적용 (OFF 전환이 sorts를 자르는 부수효과 방지)
     */
    setLayout(layout){
      if(!layout || typeof layout!=='object' || Array.isArray(layout)) return false;
      // 1) 토글류
      if(typeof layout.showRN==='boolean'    && S.showRN   !==layout.showRN)    toggleRowNum();
      if(typeof layout.showCB==='boolean'    && S.showCB   !==layout.showCB)    toggleCheckbox();
      if(typeof layout.showST==='boolean'    && S.showST   !==layout.showST)    toggleStatusCol();
      if(typeof layout.dirtyMark==='boolean' && S.dirtyMark!==layout.dirtyMark) toggleDirtyMark();
      if(typeof layout.showFoot==='boolean')     S.showFoot=layout.showFoot;
      if(typeof layout.showRows==='boolean')     S.showRows=layout.showRows;
      if(typeof layout.showPager==='boolean')    S.showPager=layout.showPager;
      if(typeof layout.showPageSize==='boolean') S.showPageSize=layout.showPageSize;
      _applyFootVis();
      if(['all','first','none'].includes(layout.placeholderMode)) S.placeholderMode=layout.placeholderMode;
      if(typeof layout.showFilter==='boolean' && S.showFilter!==layout.showFilter) toggleFilter(layout.showFilter);
      if(layout.theme) setTheme(layout.theme);
      if(layout.font && typeof layout.font==='object') setFont(layout.font);
      if(typeof layout.striped==='boolean'   && S.striped  !==layout.striped)   toggleStripe();
      if(typeof layout.freezeOn==='boolean'  && S.freezeOn !==layout.freezeOn)  toggleFreeze();
      if(typeof layout.multiSort==='boolean' && S.multiSort!==layout.multiSort) toggleMultiSort();
      if((layout.selMode==='row'||layout.selMode==='cell') && S.selMode!==layout.selMode)
        setSelMode(layout.selMode);
      // 1.5) 컬럼 순서 (v:2) — 존재하는 키만 재배열, 새 컬럼은 뒤에 유지
      if(Array.isArray(layout.order)){
        const map=new Map(COLS.map(c=>[c.key,c]));
        const next=[];
        layout.order.forEach(k=>{const c=map.get(k); if(c){next.push(c); map.delete(k);}});
        map.forEach(c=>next.push(c));
        COLS.length=0; next.forEach(c=>COLS.push(c));
      }
      // 1.6) 컬럼 숨김 (v:2)
      if(Array.isArray(layout.hidden))
        S.hiddenCols=new Set(layout.hidden.filter(k=>!k.startsWith('_')&&COLS.some(c=>c.key===k)));
      // 2) 컬럼 폭 — 존재하는 컬럼만
      if(layout.widths && typeof layout.widths==='object')
        Object.entries(layout.widths).forEach(([k,w])=>{
          if(CW[k]!==undefined && +w>0) CW[k]=+w;
        });
      // 3) 정렬 — 존재+정렬가능 컬럼만
      if(Array.isArray(layout.sorts)){
        S.sorts = layout.sorts
          .filter(s=>s && COLS.some(c=>c.key===s.col && !c.noSort))
          .map(s=>({col:s.col, dir:s.dir==='desc'?'desc':'asc'}));
        if(!S.multiSort && S.sorts.length>1) S.sorts=S.sorts.slice(0,1);
      }
      // 4) 컬럼 필터 — list values 배열 → Set 복원
      if(layout.filters && typeof layout.filters==='object'){
        S.cfilters={};
        Object.entries(layout.filters).forEach(([k,f])=>{
          if(!f || !COLS.some(c=>c.key===k)) return;
          if(f.type==='list' && Array.isArray(f.values))
            S.cfilters[k]={type:'list', values:new Set(f.values)};
          else if(f.type==='range')
            S.cfilters[k]={type:'range', min:+f.min, max:+f.max};
        });
      }
      // 5) 페이지 크기
      if(layout.pageSize!=null && +layout.pageSize>=0){ S.ps=+layout.pageSize; if(EL.psz) EL.psz.value=String(S.ps); }
      // 6) 반영
      S.page=1;
      applyFilters();
      renderSortBar();
      return true;
    },

    /* ── 컬럼 이동/숨김 ──────────────────── */
    colMD, moveCol, moveRow,
    hideCol, showCol, toggleColHidden, openColPanel,
    addCol, addCols, removeCol, updateCol, setCols, getCols,

    /* ── 서버사이드 데이터 ────────────────── */
    /** 현재 조건으로 서버 재조회 (Submit 성공 후 호출 권장). 클라이언트 모드에선 재필터 */
    reload(){ S._lastQuery=''; if(S.serverMode) _fetchServer(true); else applyFilters(); },

    /* ── 검색 ────────────────────────────── */
    search,

    /* ── Undo / Redo ─────────────────────── */
    undo, redo,

    /* ── 붙여넣기 (Ctrl+V) ────────────────── */
    pasteText,

    /* ── 내보내기 ────────────────────────── */
    /** CSV 내보내기 — 컬럼은 현재 COLS 정의에서 자동 파생 (id 포함, 시스템/이미지 컬럼 제외) */
    exportCSV: (filename = 'modugrid_export.csv') => {
      const keys = ['id', ...COLS.filter(c => !c.key.startsWith('_') && c.type !== 'images' && !S.hiddenCols.has(c.key)).map(c => c.key)];
      // 값 규칙은 우클릭 '엑셀로 복사'와 동일하게 맞춘다.
      //   리스트 옵션 컬럼 → optionFormat 적용 표시값 / 날짜 → 표시 형식
      //   숫자·통화·진행률 → 서식 없는 원본 (엑셀이 수치로 인식해야 하므로)
      const kc = new Map(keys.map(k => [k, COLS.find(c => c.key === k)]));
      const cell = (r, k) => {
        const col = kc.get(k);
        if (!col) return _valCode(r[k]);
        if (col.type === 'date') return _dateToDisplay(r[k]);
        if (col.type === 'currency' || col.type === 'number' || col.type === 'progress') return _valCode(r[k]);
        return _optDisp(col, r[k], r);
      };
      const rows = [keys.join(','), ...S.filtered.map(r =>
        keys.map(k => `"${(cell(r, k) ?? '').toString().replace(/"/g, '""')}"`).join(',')
      )];
      const a = document.createElement('a');
      a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(rows.join('\n'));
      a.download = filename; a.click();
    },
    clearCells,
    copyRange() {
      if(S.selMode!=='cell') return;
      // range가 있으면 range, 없으면(단일 클릭) focus 셀 하나
      let r1,r2,c1,c2;
      if(S.rangeR1>=0 && S.rangeR2>=0){
        r1=Math.min(S.rangeR1,S.rangeR2); r2=Math.max(S.rangeR1,S.rangeR2);
        c1=Math.min(S.rangeC1,S.rangeC2); c2=Math.max(S.rangeC1,S.rangeC2);
      } else if(S.focusRI>=0 && S.focusCI>=0){
        r1=r2=S.focusRI; c1=c2=S.focusCI;   // 단일 셀 복사
      } else { return; }
      // 범위 좌표(rangeC)는 [고정+스크롤] 순서 기준 → paste/포커스와 동일한 visCols 좌표계 사용
      // (과거 getScCols만 써서 Freeze ON 시 고정 컬럼 수만큼 어긋나던 버그 수정)
      const visCols=[...getFzCols(),...getScCols()];
      const lines=S.filtered.slice(r1,r2+1).map(r=>
        visCols.slice(c1,c2+1).map(c=>{
          let v=String(r[c.key]??'');
          // 엑셀 TSV: 값에 탭/개행/따옴표 있으면 큰따옴표로 감싸고 내부 따옴표 이스케이프
          if(/[\t\n\r"]/.test(v)){ v='"'+v.replace(/"/g,'""')+'"'; }
          return v;
        }).join('\t')
      );
      const tsv=lines.join('\n');   // 엑셀 호환 (LF)
      _copyToClipboard(tsv);
    },

    /* ── Modal / CRUD UI ─────────────────── */
    openAdd, openEdit, closeModal, saveModal,

    /* ── 툴바 액션 ───────────────────────── */
    deleteSelected, editSelected, insertAt,

    /* ── 컨텍스트 메뉴 ───────────────────── */
    showCtx, ctxDetail, ctxEdit, ctxModal, ctxCopy, ctxCopyExcel,
    ctxDel, ctxInsert, ctxTreeTog,

    /* ── inline HTML 이벤트 핸들러 ──────── */
    doSort, initCR, autoFit, openCF, filterCFL, applyCF, clearCF,
    togGrp, initRR, cellMD, cellMV, startEdit, startEditIME, openPicker, openDatePicker, setCellDate, toggleRowCheck, toggleRowSel,
    /** toggleCheckAll(on) — 헤더 전체선택과 동일 (범위: 현재 화면/페이지 행) */
    toggleCheckAll,
    openDetail, closeDetail, togTree,
    openRowModal:(mode,id)=>_openRowModal(mode,id), closeRowModal, saveRowModal,
    canInsert, canUpdate, canDelete, addImgToRow,
    /** 이미지 항목의 전송용 형태 (File 객체·blob URL 제외) */
    getImages: (rowId, colKey='images') => {
      const r=S.data.find(x=>x.id===rowId);
      return r ? _imgSer(r[colKey], rowId, colKey) : [];
    },
    /** 업로드 대기·실패가 남아 있는지 (upload 모드에서 submit 전 확인용) */
    hasPendingUploads: () => S.data.some(r =>
      _imgKeys().some(k => (r[k]||[]).some(x => x && x._up && x._up!=='done'))),
    acPick, trigImgInput, imgFromInput, imgDragOver, imgDragLeave, imgDrop, delImg,
    showPrev, hidePrev, rmSort, clearSorts,
    syncScroll, applyFilters, renderGrid, initGrid,
  };

  /* ── 인스턴스 레지스트리 등록 (전역 오염 없음) ── */
  ModuGrid._reg[GID] = api;
  _wireDelegation();        // 위임 이벤트 허브 (EL.wrap 1회 부착)
  /* 로드 직후 키보드 활성 인스턴스 — 기본은 마지막 생성 인스턴스(현행 유지).
     options.keyboardOnLoad:false 면 활성을 가져가지 않는다 → 그리드를 한 번 클릭해야
     방향키·단축키가 동작한다(_onDocMousedown 이 클릭 시 활성으로 올려준다).
     ※ 이때 _active 를 null 로 덮지 않는 것이 중요하다 — 먼저 만들어진 그리드의 활성을
       뺏지 않기 위해서다. initGrid 는 아래에서 호출되므로 config 를 직접 읽는다. */
  if (!(config && config.options && config.options.keyboardOnLoad === false))
    ModuGrid._active = GID;

  /* ── 키보드 핸들러 (인스턴스 격리: _active만 반응) ── */
  /* ══════════ Shift+화살표 범위 선택 (Excel) ══════════
   - cell 모드: 앵커(rangeR1/C1) 고정, 활성 끝(rangeR2/C2)을 화살표로 확장
     마우스로 만든 범위도 이어서 확장 — Ctrl+C 범위 복사와 그대로 연동
   - row 모드: rowAnchor(Shift+클릭과 공유)부터 연속 행 범위 확장, Shift+←/→는 포커스만
   - 일반 화살표: Excel처럼 범위를 붕괴시키고 이동 */
function _applyRowSelCls(){
  EL.wrap.querySelectorAll('tr[data-id]').forEach(tr=>
    tr.classList.toggle('rsel', S.rowSel.has(+tr.dataset.id)));
  updFoot();
}

function _extendRange(dci, dri){
  if(S.selMode==='cell'){
    if(S.rangeR1<0){                          // 앵커 확정 (기존 범위 있으면 유지)
      if(S.focusRI<0||S.focusCI<0) return;
      S.rangeR1=S.focusRI; S.rangeC1=S.focusCI;
      S.rangeR2=S.focusRI; S.rangeC2=S.focusCI;
    }
    S.focusRI=S.rangeR2; S.focusCI=S.rangeC2; // 활성 끝에서 이어서 이동
    moveFocus(dci, dri);
    S.rangeR2=S.focusRI; S.rangeC2=S.focusCI;
    S._kbRange=true;
    renderGrid();
    return;
  }
  if(S.selMode==='row'){
    if(dri===0){ moveFocus(dci, 0); return; } // Shift+←/→: 포커스만 이동
    if(S.rowAnchor<0) S.rowAnchor=Math.max(0, S.focusRI);
    moveFocus(0, dri);
    const a=Math.min(S.rowAnchor,S.focusRI), b=Math.max(S.rowAnchor,S.focusRI);
    S.rowSel=new Set(S.filtered.slice(a,b+1).map(r=>r.id));
    S._kbRange=true;
    _applyRowSelCls();
    _emit('selectionChange',{selected:[...S.rowSel],checked:[...S.rowCheck]});
  }
}

function _arrowNav(dci, dri, shift, ctrl){
  // Ctrl+화살표 = 데이터 끝으로 점프 (Excel).
  //   focusRI/CI만 바꾸면 페이징된 그리드에서 대상 행이 현재 페이지 밖이라 아무 일도 안 일어난다.
  //   목표 위치까지의 '거리'를 구해 moveFocus에 넘긴다
  //   → 페이지 점프·가상스크롤 보정·scrollIntoView·숨은 입력기 추적이 모두 그대로 동작.
  if(ctrl && !shift){
    if(S.selMode==='cell'){ S.rangeR1=S.rangeC1=S.rangeR2=S.rangeC2=-1; S._kbRange=false; }
    let dr=0, dc=0;
    if(dri!==0){
      const cur = S.focusRI<0 ? 0 : S.focusRI;
      dr = (dri>0 ? S.filtered.length-1 : 0) - cur;
    }
    if(dci!==0){
      // 열 이동 기준은 moveFocus와 동일하게 '편집 가능 컬럼' 목록
      const ec=COLS.filter(c=>!_isSysCol(c.key)&&!S.hiddenCols.has(c.key));
      if(!ec.length) return;
      const curKey=COLS[S.focusCI]?.key;
      let eci=ec.findIndex(c=>c.key===curKey); if(eci<0) eci=0;
      dc = (dci>0 ? ec.length-1 : 0) - eci;
    }
    moveFocus(dc, dr);   // 내부에서 클램프하므로 큰 값을 넘겨도 안전
    return;
  }
  if(shift){ _extendRange(dci, dri); return; }
  // 일반 화살표 = 범위 붕괴 (Excel)
  if(S.selMode==='cell' && S.rangeR1>=0){
    S.rangeR1=S.rangeC1=S.rangeR2=S.rangeC2=-1;
    S._kbRange=false;
    moveFocus(dci, dri);
    renderGrid();
    return;
  }
  if(S.selMode==='row' && S._kbRange){
    moveFocus(dci, dri);
    const row=S.filtered[S.focusRI];
    if(row){
      S.rowSel=new Set([row.id]);
      S.rowAnchor=S.focusRI;
      _applyRowSelCls();
      _emit('selectionChange',{selected:[...S.rowSel],checked:[...S.rowCheck]});
    }
    S._kbRange=false;
    return;
  }
  moveFocus(dci, dri);
}

/* 포커스 셀 편집기 열기 — keydown/beforeinput 공유 (seed: 초기값, null=기존값 유지) */
function _openFocusedEditor(seed){
  const row = S.filtered[S.focusRI], col = COLS[S.focusCI];
  if (!row || !col) return false;
  const td = EL.wrap.querySelector(`td[data-c="${col.key}"][data-id="${row.id}"]`);
  if (!td) return false;
  startEdit(td, row.id, col.key, seed);
  return true;
}

/* ── IME 대응: 그리드 모드에서 한글 등 조합 입력의 '첫 글자 유실' 방지 ──
   조합이 시작되면 브라우저가 첫 글자를 그리드가 아닌 곳에서 소비하므로,
   beforeinput의 e.data(조합/삽입 문자)를 seed로 편집기를 열고 이 입력은 취소한다.
   편집기가 열린 뒤에는 input이 조합을 정상 처리하므로 관여하지 않는다. */


/* 그리드 밖에서 드래그로 텍스트를 선택한 상태인지.
   ModuGrid._active는 한 번 클릭하면 파기 전까지 유지되므로, 이 확인이 없으면
   페이지 어디에서 Ctrl+C를 눌러도 그리드 셀 내용이 복사된다. */
function _selOutsideGrid(){
  const sel = window.getSelection && window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
  const n  = sel.getRangeAt(0).commonAncestorContainer;
  const el = n && (n.nodeType===1 ? n : n.parentElement);
  return !!el && !(EL.wrap && EL.wrap.contains(el));
}

const _onKeydown = e => {
    if (ModuGrid._active !== GID) return;
    /* 포커스가 그리드 밖 요소에 있으면(Tab 이동 등) 페이지에 양보한다.
       아무것도 포커스되지 않은 상태(body/html)는 그리드가 처리한다 —
       cell 선택 모드 + editMode off 는 그리드 안에 포커스 대상이 없어 이 경로를 탄다.
       예외: 포커스가 '다른 ModuGrid' 안에 남아있는 경우(그리드 A의 숨은 입력기를 쥔 채
       그리드 B를 클릭)는 마지막 클릭을 따르는 _active 라우팅이 더 정확하므로 통과시킨다. */
    const _ae = document.activeElement;
    if (_ae && _ae !== document.body && _ae !== document.documentElement
        && root && !root.contains(_ae)
        && !(_ae.closest && _ae.closest('.jsg-root'))) return;
    /* 그리드 밖 입력란/편집영역에서 누른 단축키는 그대로 둔다.
       (앱 검색창에서 Ctrl+Z를 눌렀는데 그리드가 undo 되는 것 방지) */
    const t = e.target;
    if (!(t && EL.wrap && EL.wrap.contains(t))) {
      const tag = t && t.tagName;
      if (tag==='INPUT' || tag==='TEXTAREA' || tag==='SELECT' || (t && t.isContentEditable)) return;
    }
    // Ctrl+Z / Ctrl+Y
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    // 셀 탐색: Cell 선택 모드 또는 EditMode에서 활성
    if (S.selMode !== 'cell' && !S.editMode) return;
    // Ctrl+C 범위 복사는 Cell 선택 모드 전용.
    //   단 그리드 밖 텍스트가 선택돼 있으면 브라우저 기본 복사에 양보한다.
    if (S.selMode === 'cell' && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      if (_selOutsideGrid()) return;
      e.preventDefault(); api.copyRange(); return;
    }
    if (S.editCell) {   // 입력모드 중엔 inp.onkeydown이 전담
      // 예외: 검증 실패로 포커스가 편집기 밖에 있어도 Esc로 취소 가능해야 함
      if (e.key === 'Escape') cancelEdit();
      return;
    }

    /* ── 그리드 이동 모드: 화살표/Enter/Tab/Ctrl+Tab = 이동만 ── */
    if (e.key === 'Escape')     { S.focusRI = -1; S.focusCI = -1; renderGrid(); return; }
    if (e.key === 'ArrowUp')    { e.preventDefault(); _arrowNav(0, -1, e.shiftKey, e.ctrlKey||e.metaKey); return; }
    if (e.key === 'ArrowDown')  { e.preventDefault(); _arrowNav(0,  1, e.shiftKey, e.ctrlKey||e.metaKey); return; }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); _arrowNav(-1, 0, e.shiftKey, e.ctrlKey||e.metaKey); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); _arrowNav(1,  0, e.shiftKey, e.ctrlKey||e.metaKey); return; }
    if (e.key === 'Enter')      { e.preventDefault(); moveFocus(0, e.shiftKey ? -1 : 1); return; }
    // Delete: 편집모드에서 포커스 셀(또는 선택 범위)의 내용을 지운다
    if (e.key === 'Delete' && S.editMode) { e.preventDefault(); clearCells(); return; }
    if (e.key === 'Tab')        { e.preventDefault(); moveFocus((e.shiftKey || e.ctrlKey) ? -1 : 1, 0); return; }

    /* ── 입력모드 진입 ── */
    const _openEditor = _openFocusedEditor;   // 모듈 스코프 헬퍼 (beforeinput과 공유)
    // F2: 기존 값 유지한 채 편집 진입
    if (e.key === 'F2') {
      e.preventDefault();
      if (S.editMode) {
        // 숨은 입력기(holder+input 존재)가 활성이고 text류 셀이면 Excel F2 동작
        const useIme = EL.imeHolder && EL.imeInput && S._imeCell &&
                       (S._imeCell.et==='text'||S._imeCell.et==='number'||S._imeCell.et==='textarea');
        if (useIme) { _imeEditFromF2(); }
        else { _openEditor(null); }
      }
      return;
    }
    // (문자 입력은 항상 focus된 숨은 입력기가 처리 — grid keydown에서 가로채지 않음)

  };
  _wireImeInput();   // 숨은 입력기 이벤트 배선

/* ══════════ 이벤트 위임 허브 ══════════
   생성 마크업에는 인라인 핸들러(onclick= 등)를 넣지 않는다.
   모든 상호작용은 data-* 속성으로 표시하고, 여기서 EL.wrap 단위로 위임 처리한다.
   장점: 렌더 문자열 축소(셀당 ~170B), 재렌더 시 리스너 재부착 불필요,
         CSP(unsafe-inline) 불필요, 키/라벨의 따옴표 이스케이프 문제 소멸. */

/* data-act 값 → 처리 함수. el = 매칭된 요소, e = 원본 이벤트 */
const _ACT = {
  /* ── 셀/행 (버블링) ── */
  sort:      (el,e)=>doSort(el.dataset.c, e),
  colfilter: (el,e)=>{ e.stopPropagation(); openCF(e, el.dataset.c); },
  grptog:    (el)=>togGrp(el.dataset.k),
  treetog:   (el,e)=>{ e.stopPropagation(); togTree(+el.dataset.id); },
  rowdetailclose:(el)=>closeDetail(+el.dataset.id),
  acpick:    (el,e)=>{ e.preventDefault(); e.stopPropagation(); acPick(+el.dataset.i); },
  /* ── 이미지 셀 ── */
  imgadd:    (el,e)=>{ e.stopPropagation(); trigImgInput(+el.dataset.id); },
  imgdel:    (el,e)=>{ e.stopPropagation(); delImg(+el.dataset.id, +el.dataset.i); },
  /* ── 컨텍스트 메뉴 ── */
  ctxdetail: ()=>ctxDetail(),   ctxedit:  ()=>ctxModal(),
  mclose:    ()=>closeRowModal(), msave: ()=>saveRowModal(),
  ctxmodal:  ()=>ctxModal(),    ctxcopy:  ()=>ctxCopy(),
  ctxcopyxl: ()=>ctxCopyExcel(),
  ctxinsa:   ()=>ctxInsert('above'), ctxinsb: ()=>ctxInsert('below'),
  ctxtree:   ()=>ctxTreeTog(),  ctxdel:   ()=>ctxDel(),
  /* ── 필터 팝업 / 정렬바 / 컬럼 패널 / 페이저 ── */
  cfapply:   ()=>applyCF(),
  cfclear:   ()=>clearCF(),
  rmsort:    (el,e)=>{ e.stopPropagation(); rmSort(+el.dataset.c); },
  clearsorts:()=>clearSorts(),
  gopage:    (el)=>goPage(+el.dataset.p),
};

function _findAct(e){
  let el=e.target;
  while(el && el!==root && el.nodeType===1){
    if(el.dataset && el.dataset.act) return el;
    el=el.parentElement;
  }
  return null;
}

function _wireDelegation(){
  /* 기준은 root(컨테이너 전체). EL.wrap(테이블 영역)만 잡으면
     컨텍스트 메뉴·필터 팝업·페이저·정렬바·자동완성(전부 wrap 밖)이 동작하지 않는다. */
  const W=root;

  /* click — data-act 라우팅 */
  W.addEventListener('click', e=>{
    /* 컬럼 패널 내부 클릭: document의 {once} 닫기 리스너로 전파 차단 (기존 인라인 대체) */
    if(e.target.closest('.jsg-colpanel')) e.stopPropagation();
    if(e.target.closest('a.clnk')) e.stopPropagation();
    const el=_findAct(e);
    if(el){ const fn=_ACT[el.dataset.act]; if(fn){ fn(el,e); return; } }
    /* 헤더 본문 클릭은 정렬하지 않는다 — 정렬은 ▲▼ 아이콘(data-act="sort")으로만.
       (라벨 클릭이 의도치 않은 정렬을 일으키는 것을 막는다) */

    /* cellClick — render 로 그린 셀 안의 버튼을 받으려면 이게 필요하다.
       rowClick 은 행 단위라 어느 셀인지, 셀 안 어느 요소인지 알 수 없어서
       버튼을 여러 개 넣으면 구분할 방법이 없었다. target 을 그대로 넘기므로
       호출자가 target.dataset 등으로 판별하면 된다.

       그리드 내부 위젯(data-act)은 위에서 return 하므로 여기까지 오지 않는다.
       mousedown 의 cellMD(선택/포커스)와는 별개 경로이고, 브라우저가 mousedown 을
       먼저 보내므로 rowClick 이 cellClick 보다 앞선다. */
    const td=e.target.closest('td[data-c][data-id]');
    if(td && root.contains(td)){
      _emit('cellClick', { id:+td.dataset.id, key:td.dataset.c, target:e.target });
    }
  });

  /* dblclick — 셀 편집 진입 / 헤더 autoFit */
  W.addEventListener('dblclick', e=>{
    /* 엑셀과 동일 — 헤더의 '컬럼 경계'(리사이즈 핸들)를 더블클릭해야 폭 자동 맞춤.
       헤더 본문 더블클릭은 정렬 클릭 2회로만 처리한다. */
    const rh=e.target.closest('.rh');
    if(rh){
      const hth=rh.closest('th[data-c]');
      if(hth){ const hc=COLS.find(x=>x.key===hth.dataset.c); if(hc&&!hc.noResize) autoFit(hth.dataset.c); }
      return;
    }
    const th=e.target.closest('th[data-c]');
    if(th) return;
    const td=e.target.closest('td[data-c][data-id]');
    if(!td) return;
    const key=td.dataset.c, rowId=+td.dataset.id;
    const col=COLS.find(x=>x.key===key); if(!col) return;
    const row=S.data.find(r=>r.id===rowId);
    const canEdit=S.editMode&&!_isSysCol(key)&&col.type!=='images'&&col.editor!==false&&!_isDel(row)
                  &&!_lockedCell(col,row);        // rowEditable / col.editable
    if(!canEdit){ e.preventDefault(); return; }
    const et=getEditType(col);
    if(et==='date') openDatePicker(rowId,key);
    else if(et==='text'||et==='number') startEditIME(rowId,key);
    else startEdit(td,rowId,key);
  });

  /* mousedown — 셀 선택 / 컬럼 드래그 / 행높이·컬럼폭 핸들 / ▼·📅 */
  W.addEventListener('mousedown', e=>{
    const t=e.target;
    /* 행 높이 핸들 */
    const rr=t.closest('.rrh'); if(rr){ initRR(e, +rr.closest('td[data-id]').dataset.id); return; }
    /* 컬럼 폭 핸들 */
    const rh=t.closest('.rh'); if(rh){ initCR(e, rh.closest('th[data-c]').dataset.c); return; }
    /* 드롭다운 ▼ */
    const sa=t.closest('.jsg-selarw'); if(sa){ e.preventDefault(); e.stopPropagation();
      const td=sa.closest('td[data-c][data-id]'); openPicker(+td.dataset.id, td.dataset.c); return; }
    /* 셀 달력 (.jsg-cell-pick) — 네이티브 동작 유지, 셀 선택으로 전파만 차단 */
    if(t.closest('.jsg-datearw')){ e.stopPropagation(); return; }
    /* 체크박스 — change에서 처리, 셀 선택 전파만 차단 */
    if(t.classList && t.classList.contains('jcb')){ e.stopPropagation(); return; }
    /* 이미지 셀 내부 — 자체 인터랙션 */
    if(t.closest('.img-dnd-wrap')){ e.stopPropagation(); return; }
    /* 헤더: 컬럼 드래그 이동 */
    const th=t.closest('th[data-c]');
    if(th && !t.closest('.rh')){ colMD(e, th.dataset.c); return; }
    /* 바디 셀: 선택/포커스 */
    const td=t.closest('td[data-c][data-id]');
    if(td){
      const ri=+td.dataset.ri, ci=+td.dataset.ci;
      if(Number.isFinite(ri)&&Number.isFinite(ci)) cellMD(e, ri, ci, +td.dataset.id, td.dataset.c);
    }
  });

  /* mousemove — 범위 드래그 */
  W.addEventListener('mousemove', e=>{
    if(!S.ranging && !S.rowRanging) return;
    const td=e.target.closest('td[data-c][data-id]');
    if(!td) return;
    const ri=+td.dataset.ri, ci=+td.dataset.ci;
    if(Number.isFinite(ri)&&Number.isFinite(ci)) cellMV(e, ri, ci);
  });

  /* contextmenu — 우클릭 메뉴 */
  W.addEventListener('contextmenu', e=>{
    const tr=e.target.closest('tr[data-id]');
    if(tr) showCtx(e, +tr.dataset.id);
  });

  /* change — 행 체크박스 / 이미지 파일 선택 / 컬럼 패널 토글 */
  W.addEventListener('change', e=>{
    const t=e.target;
    if(t.classList.contains('jcbh')){ toggleCheckAll(t.checked); return; }   // 헤더 전체선택 (jcb 보다 먼저)
    if(t.classList.contains('jcb')){ const tr=t.closest('tr[data-id]'); if(tr) toggleRowCheck(+tr.dataset.id, t); return; }
    if(t.matches('input[type=file][data-imgid]')){ imgFromInput(+t.dataset.imgid, t); return; }
    if(t.matches('input[data-act=coltog]')){ toggleColHidden(t.dataset.c); return; }
    if(t.matches('select[data-act=pagesize]')){ changePS(+t.value); return; }
    if(t.matches('input[data-act=cfall]')){ toggleCFAll(t.checked); return; }
    if(t.closest('#cflist .cfpci')){ _cfSyncAll(); return; }   // 개별 선택 → 전체선택 상태 갱신
    if(t.matches('input[data-act=datepick]')){ e.stopPropagation();
      const td=t.closest('td[data-c][data-id]'); if(td) setCellDate(+td.dataset.id, td.dataset.c, t.value); return; }
  });

  /* keydown — 그리드 안 input 에서 Enter 로 form 이 전송되는 것 방지.
     그리드가 <form> 안에 있으면(JSP 화면에서 흔하다) Enter 가 submit 으로
     해석되어 페이지가 새로고침된다. 편집 확정은 자체 핸들러가 처리한다. */
  W.addEventListener('keydown', e=>{
    if(e.key!=='Enter') return;
    const t=e.target;
    if(t && (t.tagName==='INPUT' || t.tagName==='SELECT')) e.preventDefault();
  });

  /* input — 필터 팝업 검색 */
  W.addEventListener('input', e=>{
    if(e.target.matches('input[data-act=cfsearch]')) filterCFL(e.target.value);
  });

  /* mouseover/out — 이미지 미리보기 */
  W.addEventListener('mouseover', e=>{
    const nm=e.target.closest('.img-dnd-name[data-url]');
    if(nm) showPrev(e, nm.dataset.url);
  });
  W.addEventListener('mouseout', e=>{
    if(e.target.closest('.img-dnd-name[data-url]')) hidePrev();
  });

  /* 이미지 드래그&드롭 */
  W.addEventListener('dragover', e=>{
    const w=e.target.closest('.img-dnd-wrap[data-imgid]'); if(w) imgDragOver(e, +w.dataset.imgid);
  });
  W.addEventListener('dragleave', e=>{
    if(e.target.closest('.img-dnd-wrap[data-imgid]')) imgDragLeave(e);
  });
  W.addEventListener('drop', e=>{
    const w=e.target.closest('.img-dnd-wrap[data-imgid]'); if(w) imgDrop(e, +w.dataset.imgid);
  });
}

  document.addEventListener('keydown', _onKeydown);
document.addEventListener('paste', _onPaste);
  api._onKeydown = _onKeydown;   // destroy에서 해제용
api._onPaste   = _onPaste;

  // 제작자 정보 (읽기 전용) — ModuGrid.about 과 동일 객체
  try {
    Object.defineProperty(api, 'about', { value:ModuGrid.about, writable:false, enumerable:true, configurable:false });
  } catch(e){}
  if (typeof ModuGrid._banner === 'function') ModuGrid._banner();

  // 초기화
  if (config) initGrid(config);

  return api;

} // end ModuGrid

/* ══════════════════════════════════════════════════
   ModuGrid 정적 헬퍼 — 생성된 HTML 핸들러가 사용
══════════════════════════════════════════════════ */
ModuGrid.get = id => ModuGrid._reg && ModuGrid._reg[id];

/* ══════════════════════════════════════════════════
   제작자 정보 (읽기 전용)

   보호 수준
     · Object.freeze + defineProperty(writable:false, configurable:false)
       → 실행 중 덮어쓰기·삭제·재정의 불가 (strict mode에서는 TypeError)
   한계
     · 브라우저에서 실행되는 JS는 소스 파일 자체를 고칠 수 있다.
       MIT 라이선스가 수정·재배포를 허용하므로 그것을 막으려 하지 않는다.
       이 블록은 출처를 밝히기 위한 것이지 사용을 제한하기 위한 것이 아니다.
══════════════════════════════════════════════════ */
(function(){
  var A = {
    name:      'ModuGrid',
    version:   '1.1.0',
    author:    'BongJun Park',
    license:   'MIT',
    copyright: '© 2026 BongJun Park',
    homepage:  'https://github.com/PulseKCode'
  };

  var about = Object.freeze({
    name:A.name, version:A.version, author:A.author,
    license:A.license, copyright:A.copyright, homepage:A.homepage,
    toString:function(){ return A.name+' v'+A.version+' · '+A.author+' · '+A.license; }
  });

  Object.defineProperty(ModuGrid, 'about',  { value:about, writable:false, enumerable:true,  configurable:false });
  Object.defineProperty(ModuGrid, 'version',{ value:A.version, writable:false, enumerable:true, configurable:false });

  /* 페이지당 1회 콘솔 배너 */
  Object.defineProperty(ModuGrid, '_banner', { value:function(){
    if (ModuGrid._bannerShown) return;
    ModuGrid._bannerShown = true;
    try {
      console.info('%c'+A.name+' v'+A.version+'%c  '+A.author+' · '+A.license,
        'font-weight:700;color:#4361ee', 'color:#5a5f7a');
    } catch(e){}
  }, writable:false, enumerable:false, configurable:false });
})();

return ModuGrid;
}));
