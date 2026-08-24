[English](README.md) | **한국어**

# ModuGrid

**v1.0.0** · 의존성 없는 Vanilla JS 데이터 그리드.

`modugrid.min.js` + `modugrid.min.css` 두 파일이면 동작합니다. 빌드 도구 · 프레임워크 · 외부 라이브러리가 필요 없습니다.

---

## 특징

- **편집** — 셀 단위 인라인 편집, 유효성 검사, 추가/수정/삭제 권한 분리, 행·셀 단위 편집 잠금
- **변경추적** — 신규/수정/삭제를 자동 추적, 서버 전송용 diff 생성, 소프트 삭제
- **엑셀 호환** — TSV 복사·붙여넣기, CSV 내보내기, 컬럼 경계 더블클릭 자동 맞춤
- **목록 값** — 코드/표시명 분리, 표시 포맷, 서버 자동완성
- **이미지** — 전송 방식 4가지 (`none` · `upload` · `multipart` · `base64`)
- **대용량** — 페이징 · 가상 스크롤 · 컬럼 고정
- **데이터 표현** — 정렬 · 필터 · 검색 · 그룹핑 · 트리
- **모양** — 테마 11종, 헤더/본문 폰트 독립 제어
- **멀티 인스턴스** — 한 화면에 여러 그리드, 상태·테마 전부 독립
- 전역 오염 없음 · 인라인 이벤트 핸들러 0개 (CSP 대응) · i18n 내장

---

## 시작하기

```html
<link rel="stylesheet" href="modugrid.min.css">
<script src="modugrid.min.js"></script>

<div id="grid"></div>
```

```javascript
const G = ModuGrid('#grid', {
  cols: [
    { key:'_rn', label:'#', w:42, type:'rn', noSort:1, noResize:1, noFilter:1 },
    { key:'_st', label:'',  w:28, type:'st', noSort:1, noResize:1, noFilter:1 },
    { key:'_cb', label:'',  w:36, type:'cb', noSort:1, noResize:1, noFilter:1 },   // 헤더에 전체선택 체크박스

    { key:'name',   label:'이름',  w:150, placeholder:'이름 입력' },
    { key:'status', label:'상태',  w:120,
      options:[ {code:'A', name:'활성'}, {code:'P', name:'대기'} ],
      optionFormat:'{code} - {name}' },
    { key:'score',  label:'점수',  w:90, type:'number',
      validate: v => (v>=0 && v<=100) || '0~100 사이여야 합니다' },
    { key:'joined', label:'입사일', w:120, type:'date' },
  ],
  options: {
    editMode: true,
    selMode: 'cell',
    dateFormat: 'yyyy-mm-dd',
  }
});

G.setData([
  { id:1, name:'김민준', status:'A', score:88, joined:'2018-01-01' },
]);
```

`id`는 필수 키지만 없으면 그리드가 자동으로 채웁니다.

---

## 서버로 변경분 전송

```javascript
if (!G.isValid()) { alert('입력 오류를 먼저 수정해 주세요'); return; }

const out = await G.submit('submit.jsp');
if (out.skipped) alert('변경된 내용이 없습니다');
else alert(`추가 ${out.inserted} · 수정 ${out.updated} · 삭제 ${out.deleted}`);
```

`markClean()` 기준점 대비 diff를 만들어 `{ inserted, updated, deleted }` 형태로 전송하고,
성공하면 기준점을 갱신합니다. 기본 전송 형식은 `changes=<JSON>` (form) 이라 JSP에서
`request.getParameter("changes")` 로 바로 받을 수 있습니다.

컬럼을 옮기거나 삭제해도 값이 바뀌지 않았으면 수정으로 잡히지 않습니다.

### 이미지 전송

`type:'images'` 컬럼은 `imageMode` 로 전송 방식을 고릅니다. **기본값 `none` 은 이미지를 보내지 않습니다.**

| 모드 | 업로드 시점 | submit 본문 | 적합한 경우 |
|---|---|---|---|
| `none` | 안 함 | 이미지 제외 | 이미지 미사용 · 화면 미리보기만 |
| `upload` | 파일 선택 즉시 | JSON (URL 참조) | 대용량 · 다량 |
| `multipart` | submit 할 때 | FormData (JSON + 파일) | 저장 한 번으로 끝내기 |
| `base64` | 변환 즉시, 전송은 submit | JSON 에 dataURL 동봉 | 서명 · 아이콘 등 작은 것 |

자세한 형식과 JSP 수신 예시는 [FEATURES.md](docs/ko/FEATURES.md) 8장을 보세요.

---

## 자주 쓰는 설정

```javascript
options: {
  // 편집 권한 (editMode 안에서 세부 제어)
  editMode: true, canInsert: true, canUpdate: true, canDelete: true,

  // 행·셀 단위 편집 잠금
  rowEditable: row => row.status !== 'CLOSED',    // 행 전체 잠금

  // 표시
  showRN: true, showST: true, showCB: true,      // 좌측 시스템 컬럼
  showFoot: true, showFilter: true, striped: true,
  pageSize: 100,                                  // 0 = 전체 보기
  cbHeader: 'check',                              // 체크박스 헤더: 전체선택 / 문자열 / 'none'
  contextMenu: true,                              // 우클릭 메뉴: false 또는 { delete:false }
  errorMsgDuration: 3000,                         // 검증 오류 말풍선 자동 소멸(ms), 0=계속
  keyboardOnLoad: true,                           // 로드 직후 키보드 활성, false=클릭해야 활성

  // 이미지
  imageMode: 'none',                              // none | upload | multipart | base64

  // 모양
  theme: 'light',                                 // 11종
  headerFont: { size:12, bold:true },
  bodyFont:   { size:13 },

  // 이벤트
  on: {
    dirtyChange: e => submitBtn.disabled = (e.total === 0),
    cellEdit:    e => console.log(e.id, e.key, e.value),
  }
}
```

**테마** — `light` `dark` `midnight` `slate` `ocean` `forest` `sunset` `rose` `contrast` `compact` `compact-dark`

```javascript
G.setTheme('dark');
G.setTheme('ocean', { ac:'#ff6600' });   // 프리셋 + 색 일부 변경
```

---

## 서버사이드 모드

```javascript
options: {
  dataSource: async (req) => {
    const res = await fetch('list.jsp?' + new URLSearchParams(req));
    return res.json();          // { rows, total, agg }
  }
}
```

정렬 · 필터 · 검색 · 페이징 조건이 `req`로 전달되고, 늦게 도착한 응답은 자동으로 버려집니다.

---

## 파일

| 파일 | 필수 | 역할 |
|---|---|---|
| `modugrid.min.js` | O | 그리드 엔진 전체 |
| `modugrid.min.css` | O | 스타일 · 테마 변수 |
| `main.html` | | 데모 페이지 |
| `submit.jsp` | | 서버 수신 샘플 (JSP + Oracle) |
| `upload.jsp` | | 이미지 업로드 수신 샘플 (`imageMode:'upload'`) |

---

## 문서

| 문서 | 내용 |
|---|---|
| [FEATURES.md](docs/ko/FEATURES.md) | 기능 전체 목록 · 옵션 · API 요약 |
| [API.md](docs/ko/API.md) | API 레퍼런스 |

---

## 브라우저

Chrome · Edge · Firefox · Safari 최신 버전.
`<input type="date">`, Clipboard API, CSS custom properties를 사용합니다.
클립보드 API가 차단된 환경에서는 `execCommand`로 자동 대체됩니다.

---

## 라이선스

MIT · © 2026 BongJun Park

- **Author** — BongJun Park
- **Homepage** — <https://github.com/PulseKCode>
- **Version** — 1.0.0

제작자 정보는 `ModuGrid.about` 으로 확인할 수 있습니다. 동결된 읽기 전용 값이라 실행 중에 바꿀 수 없습니다.

```javascript
ModuGrid.about.version;    // '1.0.0'
ModuGrid.about.author;     // 'BongJun Park'
ModuGrid.about.homepage;   // 'https://github.com/PulseKCode'
```
