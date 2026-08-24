[English](../en/API.md) | **한국어**

# ModuGrid v1.0.0 — API 레퍼런스

`modugrid.min.js` 현재 코드 기준입니다. 기능 개요는 [FEATURES.md](FEATURES.md)를 참고하세요.

---

## 목차

- [생성 · 정적 멤버](#생성--정적-멤버)
- [컬럼 정의](#컬럼-정의)
- [옵션](#옵션)
- [이벤트](#이벤트)
- [데이터](#데이터)
- [조회](#조회)
- [컬럼 조작](#컬럼-조작)
- [정렬 · 필터 · 검색](#정렬--필터--검색)
- [편집](#편집)
- [변경추적 · 전송](#변경추적--전송)
- [유효성 검사](#유효성-검사)
- [모달](#모달)
- [모양](#모양)
- [표시 토글](#표시-토글)
- [행 · 선택](#행--선택)
- [페이징](#페이징)
- [복사 · 내보내기](#복사--내보내기)
- [레이아웃 · 생명주기](#레이아웃--생명주기)

---

## 생성 · 정적 멤버

### `ModuGrid(container, config)`

| 인자 | 타입 | 설명 |
|---|---|---|
| `container` | string ǀ Element | CSS 선택자 또는 DOM 요소 |
| `config.cols` | array | 컬럼 정의 (필수) |
| `config.options` | object | 옵션 |

**반환** 인스턴스 객체(`G`)

```javascript
const G = ModuGrid('#grid', { cols: COLS, options: {...} });
```

한 화면에 여러 그리드를 만들 수 있고 상태는 서로 독립입니다.

### 정적 멤버

| 멤버 | 설명 |
|---|---|
| `ModuGrid.get(id)` | 인스턴스 조회 (내부 라우팅용) |
| `ModuGrid.about` | 제작자 정보 (읽기 전용, frozen) |
| `ModuGrid.version` | 버전 문자열 (`'1.0.0'`) |

```javascript
ModuGrid.about
// { name:'ModuGrid', version:'1.0.0', author:'BongJun Park', license:'MIT',
//   copyright:'© 2026 BongJun Park', homepage:'https://github.com/PulseKCode', signature:'...' }
```

콘솔·경고 메시지는 모두 영어입니다. UI 문구는 `options.i18n` 으로 덮어쓸 수 있습니다.

---

## 컬럼 정의

```javascript
{ key, label, w, type, group, freeze,
  noSort, noResize, noFilter, noMove,
  editor, editable, options, optionFormat,
  acHints, acSource, acLimit, ac,
  validate, render, textCase, placeholder }
```

| 속성 | 타입 | 기본 | 설명 |
|---|---|---|---|
| `key` | string | — | 데이터 키 **(필수)** |
| `label` | string | `key` | 헤더 표시명. `\n` 으로 줄바꿈. 폭보다 길면 끝에 `...` (정렬·필터 아이콘 자리는 항상 확보) |
| `w` | number | 120 | 폭(px) |
| `type` | string | — | `number` `currency` `progress` `date` `avatar` `images` `textarea` |
| `group` | string | — | 그룹 헤더명 (같은 값끼리 2행 헤더로 묶임) |
| `freeze` | truthy | — | 고정 컬럼 (`freezeOn`이 켜졌을 때만 적용) |
| `noSort` | truthy | — | 정렬 아이콘 숨김 |
| `noResize` | truthy | — | 폭 조절·자동맞춤 비활성 |
| `noFilter` | truthy | — | 필터 아이콘 숨김 |
| `noMove` | truthy | — | 드래그 이동 비활성 |
| `editor` | string ǀ false | 자동 | 편집기 강제 지정. `false`면 컬럼 전체 편집 불가 |
| `editable` | fn | — | `(row, col) => boolean`. **셀 단위 편집 잠금.** `false` 반환 시 그 셀만 잠김 |
| `options` | array ǀ fn | — | 목록 값 (코드/표시명) |
| `optionFormat` | string ǀ fn | — | 목록·셀 표시 포맷 |
| `acHints` | array ǀ fn | — | 이 컬럼 전용 자동완성 목록 |
| `acSource` | fn | — | `(colKey, q, col) => Promise<array>` |
| `acLimit` | number | 8 | 자동완성 표시 개수 |
| `ac` | false | — | 이 컬럼 자동완성 끄기 |
| `validate` | fn | — | `(value, row) => true ǀ false ǀ '메시지'` |
| `render` | fn | — | `(value, row) => HTML 문자열` |
| `textCase` | string | — | `'upper'` ǀ `'lower'` |
| `placeholder` | string | — | 빈 셀 안내 문구 |

### 시스템 컬럼

`type`으로 지정하며 `cols` 배열에 직접 선언합니다.

```javascript
{ key:'_rn', label:'#', w:42, type:'rn', noSort:1, noResize:1, noFilter:1 }   // 행 번호
{ key:'_st', label:'',  w:28, type:'st', noSort:1, noResize:1, noFilter:1 }   // 변경 상태
{ key:'_cb', label:'',  w:36, type:'cb', noSort:1, noResize:1, noFilter:1 }   // 체크박스
```

`_cb` 헤더에는 기본적으로 **전체선택 체크박스**가 표시됩니다. 범위 안 행이 전부 체크되면 체크,
일부만이면 중간 상태, 없으면 해제되는 3단 상태입니다. 대상 범위는 화면에 그려진 행
(일반 페이징이면 현재 페이지)입니다. `options.cbHeader` 로 바꿀 수 있습니다.

### `options` 항목 형식

아래 형식을 모두 인식합니다. 저장값은 **코드**, 화면에는 **표시명**입니다.

```javascript
'active'                  // 코드 = 표시명
{ code:'A',  name:'활성' }
{ code:'A',  label:'활성' }
{ value:'A', label:'활성' }
{ id:'A',    text:'활성' }
{ v:'A',     t:'활성' }
```

### `optionFormat`

```javascript
optionFormat: '{code} - {name}'
optionFormat: (o, row) => `[${o.code}] ${o.name}`
```

자리표시자 — `{code}` `{value}` = 코드 / `{name}` `{label}` `{text}` = 표시명 / 그 외 `{키}` = 원본 객체 필드

---

## 옵션

### 표시

| 옵션 | 기본 | 설명 |
|---|---|---|
| `showRN` `showST` `showCB` | `true` | 좌측 시스템 컬럼 표시 |
| `showFoot` | `true` | 하단 상태바 전체 |
| `showRows` `showPager` `showPageSize` | `true` | 상태바 개별 항목 |
| `showFilter` | `true` | 헤더 필터 아이콘 |
| `striped` | `true` | 줄무늬 |
| `dirtyMark` | `true` | 변경 행 배경색 |
| `rowHeight` | 25 | 행 높이(px) |
| `freezeOn` | `false` | 컬럼 고정 |
| `headerWrap` | `false` | 헤더 라벨 자동 줄바꿈 |
| `placeholderMode` | `'all'` | `'all'` ǀ `'first'` ǀ `'none'` |
| `cbHeader` | `'check'` | `_cb` 헤더. `'check'`=전체선택 체크박스 ǀ 문자열=그 글자 ǀ `'none'`·`false`=빈 헤더 |
| `contextMenu` | `true` | 우클릭 메뉴. `false`=끄기 ǀ `{항목:false}`=항목별 |

### 모양

| 옵션 | 기본 | 설명 |
|---|---|---|
| `theme` | `'light'` | 테마 프리셋 11종 |
| `themeVars` | — | CSS 변수 직접 지정 `{ac:'#...'}` |
| `headerFont` `bodyFont` | — | `{size, family, weight, bold, italic}` |

### 선택 · 편집

| 옵션 | 기본 | 설명 |
|---|---|---|
| `selMode` | `'row'` | `'row'` ǀ `'cell'` |
| `editMode` | `false` | 편집 모드 (마스터 스위치) |
| `canInsert` `canUpdate` `canDelete` | `true` | 편집모드 내 세부 권한 |
| `rowEditable` | — | `(row) => boolean`. **행 단위 편집 잠금.** `false` 반환 시 그 행 전체 잠김 |
| `errorMsgDuration` | 3000 | 검증 오류 말풍선 자동 소멸(ms). `0` 이하면 계속 표시 |
| `keyboardOnLoad` | `true` | 로드 직후 키보드 조작 활성. `false` 면 그리드를 한 번 클릭해야 동작 |
| `dateFormat` | `'yyyy-mm-dd'` | 날짜 표시 형식 |
| `textCase` | — | 전 컬럼 대/소문자 강제 |
| `numericKeys` | `[]` | 숫자로 다룰 키 목록 |
| `newRowDefaults` | `{}` | 신규 행 기본값 |
| `genId` | — | `(data) => id` 채번 규칙 교체 |

### 정렬 · 검색 · 페이징

| 옵션 | 기본 | 설명 |
|---|---|---|
| `multiSort` | `false` | 다중 정렬 |
| `searchKeys` | 자동 | 검색 대상 키. 미지정 시 COLS에서 파생 |
| `pageSize` | 100 | 페이지 크기. **`0` = 전체 보기** |

### 목록 · 자동완성

| 옵션 | 설명 |
|---|---|
| `acHints` | `{ colKey: [...] }` 그리드 공통 목록 |
| `acSource` | `(colKey, q) => Promise<array>` |
| `acDebounce` | 서버 조회 디바운스(ms, 기본 200) |

### 변경추적 · 서버

| 옵션 | 기본 | 설명 |
|---|---|---|
| `submitFields` | 자동 | diff 대상 필드. 미지정 시 COLS에서 파생 |
| `softDelete` | `true` | 삭제를 예약으로 처리 |
| `dataSource` | — | `(req) => Promise<{rows, total, agg}>` |
| `filterSource` | — | `(colKey, req) => Promise<string[]>` |

### 이미지

| 옵션 | 기본 | 설명 |
|---|---|---|
| `imageMode` | `'none'` | 전송 방식. `'none'` ǀ `'upload'` ǀ `'multipart'` ǀ `'base64'` |
| `imageUpload` | — | `(file, row) => Promise<{id,url}>`. **`'upload'` 모드 필수** |
| `imageMaxSize` | 0 | 장당 최대 바이트. `0` = 무제한 |
| `imageLimit` | 5 | 행당 최대 장수 |

**기본값 `'none'` 은 이미지를 전송하지 않습니다.** 모드별 전송 형식은 FEATURES.md 8장 참고.

### 부가

| 옵션 | 설명 |
|---|---|
| `controls` | 앱 소유 컨트롤 ID 매핑 |
| `i18n` | 메시지 사전 덮어쓰기 (31개 키) |
| `on` | 이벤트 핸들러 |

---

## 이벤트

```javascript
options: {
  on: {
    dataChange:      e => {},
    cellEdit:        e => {},
    selectionChange: e => {},
    rowClick:        e => {},
    dataError:       e => {},
    dirtyChange:     e => {},
  }
}
```

| 이벤트 | payload | 발화 시점 |
|---|---|---|
| `dataChange` | `{type, ...}` | 모든 데이터 변경 |
| `cellEdit` | `{id, key, value}` | 셀 편집 확정 |
| `selectionChange` | `{selected, checked}` | 선택·체크 변경 (id 배열) |
| `rowClick` | `{id, selected}` | 행 클릭 |
| `dataError` | `{error}` | 서버 조회 실패 |
| `dirtyChange` | `{inserted, updated, deleted, total}` | 변경 건수가 달라졌을 때만 |

`dataChange.type` — `load` `add` `insert` `update` `delete` `restore` `clear` `paste` `move` `cols` `undo` `redo`

---

## 데이터

### `setData(rows)`
전체 데이터를 교체합니다. `id` 누락 행은 자동 채번, 중복 id는 정리합니다.
변경추적 기준점이 재설정되고 오류 표시가 초기화됩니다.

### `addRow(row)`
행을 맨 뒤에 추가합니다. `id`가 없으면 자동 부여됩니다.

### `insertAt(pos, rowFactory?)`
`pos` 위치에 신규 행을 삽입합니다.

### `updateRow(id, updates)`
행의 일부 필드를 갱신합니다.

### `deleteRows(idsSet)`
`Set` 으로 받은 id들을 삭제합니다.
`softDelete`가 켜져 있으면 실제 제거 대신 **삭제 예정** 표시만 하고, `submit()` 성공 시 제거됩니다.
단, 아직 서버에 없는 신규 행은 즉시 제거됩니다.

### `restoreRows(idsSet)`
삭제 예정 표시를 해제합니다.

### `deleteSelected()` / `editSelected()`
선택된 행을 삭제 / 편집 모달로 엽니다.

---

## 조회

| 메서드 | 반환 |
|---|---|
| `getSelected()` | 선택된 행 **id 배열** |
| `getChecked()` | 체크된 행 **id 배열** |
| `getFilteredData()` | 필터·정렬이 적용된 행 배열 |
| `getPendingDeletes()` | 삭제 예정 id 배열 |
| `getState()` | 내부 상태 객체 (읽기 전용으로 사용) |

---

## 컬럼 조작

### `addCol(col, at?)`
컬럼을 추가합니다. `at` 이 숫자면 인덱스, 문자열이면 그 컬럼 **앞**에 삽입합니다. 생략 시 맨 뒤.
**반환** `boolean`

```javascript
G.addCol({ key:'memo', label:'메모', w:150 });
G.addCol({ key:'c1', label:'C1', w:60 }, 2);
G.addCol({ key:'c2', label:'C2', w:60 }, 'qty');
```

### `addCols(cols, at?)`
여러 개를 한 번에 추가합니다 (재렌더 1회). **반환** 추가된 개수

### `removeCol(key)`
컬럼을 삭제합니다. 해당 컬럼의 정렬·필터·폭·오류 표시가 함께 정리됩니다.
**데이터의 해당 필드는 남습니다.**

### `updateCol(key, patch)`
컬럼 속성을 변경합니다. `key` 변경은 무시됩니다(데이터 매핑 보호).

### `setCols(cols)` / `getCols()`
전체 교체 / 현재 정의의 **사본** 반환

### `moveCol(key, toIdx)` · `hideCol(key)` · `showCol(key)` · `toggleColHidden(key)` · `openColPanel()` · `autoFit(key)`

---

## 정렬 · 필터 · 검색

### `doSort(key, event)`
3단계 순환: 오름차순 → 내림차순 → 해제. 화면에서는 **▲▼ 아이콘 클릭**으로만 호출됩니다.

### `rmSort(index)` / `clearSorts()` / `toggleMultiSort()`

### `openCF(event, key)` / `applyCF()` / `clearCF()`
컬럼 필터 팝업 열기 / 적용 / 해제

### `toggleFilter(on?)`
헤더 필터 전체 on/off. 끌 때 적용 중이던 컬럼 필터도 해제됩니다.

### `search(q)`
전역 검색. 목록 컬럼은 코드·표시명 양쪽에 매칭됩니다.

---

## 편집

### `startEdit(td, rowId, colKey, seed?)`
정식 편집기(select · date · textarea)를 엽니다.

### `startEditIME(rowId, colKey)`
숨은 입력기 경로로 엽니다 (text · number).

### `openPicker(rowId, colKey)` / `openDatePicker(rowId, colKey)`
드롭다운 / 달력을 엽니다.

### `setCellDate(rowId, colKey, iso)`
셀 달력에서 고른 날짜를 편집기 없이 반영합니다.

### `clearCells()`
포커스 셀(또는 선택 범위)의 값을 지웁니다. `snap` 1회. **반환** 지운 셀 수

### `pasteText(text)`
TSV 문자열을 붙여넣습니다. **반환** `{cells, skipped}`

### `canInsert()` / `canUpdate()` / `canDelete()`
현재 권한 상태. `editMode`와 해당 옵션을 함께 판정합니다.

---

## 변경추적 · 전송

### `markClean()`
현재 상태를 기준점으로 삼습니다. `setData`·서버 재조회 시 자동 호출됩니다.

### `getChanges()`

<!-- sync:ignore-code -->
```javascript
{
  inserted: [ {id, ...필드} ],
  updated:  [ {id, changes:{바뀐 필드만}} ],
  deleted:  [ id, ... ]
}
```

값은 코드로 환원되어 옵션 객체가 그대로 나가지 않습니다.

### `getChangeCount()` → `{inserted, updated, deleted, total}`
### `isDirty()` → `boolean`
### `getDirtyIds()` → 변경된 행 id 배열

### `submit(url, opts?)`

```javascript
const out = await G.submit('submit.jsp', {
  method:    'POST',      // 기본 POST
  paramName: 'changes',   // form 전송 시 파라미터명
  json:      false,       // true면 application/json 본문
  headers:   {},
  credentials: 'include',
  isOk:      res => res.ok,
  markClean: true,        // false면 기준점 유지
});
```

**반환** 서버 응답. 변경이 없으면 `{ok:true, skipped:true, count}`
**예외** HTTP 오류 또는 `isOk`가 false면 throw
성공 시 삭제 예정 행이 제거되고 기준점이 갱신됩니다.

### `toCode(value)` / `toCodeRow(row, keys?)`
옵션 객체를 코드 문자열로 환원합니다. 배열·Date·일반 객체는 그대로 통과합니다.

---

## 유효성 검사

### `getInvalidCells()` → `[{id, key, message}]`
### `isValid()` → 오류 셀이 없으면 `true`

`validate` 실패 시 **값은 되돌리지 않고** 셀만 붉게 표시됩니다. 저장 전 이 API로 확인하세요.

---

## 모달

### `openDetail(id)`
행 상세를 읽기 전용 모달로 엽니다.

### `openRowModal(mode, id?)`
`mode` — `'detail'` ǀ `'edit'` ǀ `'add'`
필드는 COLS 정의에서 자동 생성되며, **수정 가능한 컬럼만 입력 가능**합니다.
수정 권한이 없으면 `'edit'` 요청도 상세로 열립니다.

### `closeRowModal()` / `saveRowModal()`

---

## 모양

### `setTheme(name?, vars?)`

```javascript
G.setTheme('dark');
G.setTheme('ocean', { ac:'#ff6600' });   // 프리셋 + 변수
G.setTheme(undefined, { ROW:'30px' });   // 테마 유지, 변수만
G.setTheme(null);                        // light 로 복귀
```

프리셋 — `light` `dark` `midnight` `slate` `ocean` `forest` `sunset` `rose` `contrast` `compact` `compact-dark`
그리드 컨테이너에 `data-theme` 를 걸므로 그리드마다 다른 테마가 가능합니다.

### `getTheme()` / `getThemes()`

### `setFont(spec)`

```javascript
G.setFont({ header:{size:12, bold:true}, body:{size:14, family:'Pretendard'} });
G.setFont({ body:{size:13} });   // 헤더 유지
G.setFont(14);                   // 본문 크기만
G.setFont(null);                 // 초기화
```

속성 — `size`(숫자=px 또는 CSS 길이) · `family` · `weight` · `bold` · `italic`
부분 지정이 가능하며, 개별 속성에 `null`을 주면 그 항목만 기본값으로 돌아갑니다.

### `getFont()` → `{header:{size,family,weight,style}, body:{...}}`

### `setPlaceholderMode(mode)`
`'all'` ǀ `'first'` ǀ `'none'`

---

## 표시 토글

인자를 생략하면 반전합니다.

| 메서드 | 대상 |
|---|---|
| `toggleEditMode()` | 편집 모드 |
| `toggleFreeze()` | 컬럼 고정 |
| `toggleRowNum()` `toggleStatusCol()` `toggleCheckbox()` | 좌측 시스템 컬럼 |
| `toggleStripe()` `toggleDirtyMark()` | 줄무늬 · 변경 배경색 |
| `toggleFoot()` `toggleRowsInfo()` `togglePager()` `togglePageSize()` | 하단 상태바 |
| `toggleGroup()` `toggleTree()` `toggleVS()` | 그룹핑 · 트리 · 가상스크롤 |

---

## 행 · 선택

| 메서드 | 설명 |
|---|---|
| `setSelMode(mode)` | `'row'` ǀ `'cell'` |
| `toggleRowSel(id, on?)` | 행 선택(하이라이트) 토글 |
| `toggleRowCheck(id, cb)` | 체크박스 토글 |
| `toggleCheckAll(on)` | 전체선택/해제. `_cb` 헤더 체크박스와 동일 (대상 = 화면에 그려진 행) |
| `moveRow(rowId, beforeId)` | 행 순서 이동 |
| `setRowHeight(rowId, px)` | 행 높이 지정 |

---

## 페이징

### `goPage(p)` / `changePS(n)`
`changePS(0)` 은 **전체 보기**입니다.

---

## 복사 · 내보내기

| 메서드 | 형식 |
|---|---|
| `copyRange()` | 선택 범위 TSV |
| `ctxCopy()` | 행 JSON |
| `ctxCopyExcel()` | 행 TSV (엑셀용) |
| `exportCSV(filename?)` | CSV (BOM 포함) |

CSV와 엑셀복사는 값 규칙이 같습니다 — 목록은 표시값, 숫자·통화는 서식 없는 원본.

---

## 레이아웃 · 생명주기

### `getLayout()` / `setLayout(layout)`

JSON 직렬화 가능한 순수 객체를 주고받습니다.

포함 항목 — 컬럼 순서 · 숨김 · 폭 · 정렬 · 필터 · 페이지 크기 · 선택 모드 · 시스템 컬럼 표시 ·
상태바 표시 · 필터 표시 · 줄무늬 · 변경 배경색 · placeholder 모드 · 테마 · 폰트

현재 COLS에 없는 컬럼은 건너뛰므로 정의가 바뀌어도 안전합니다.

### `reload()`
서버 모드면 재조회, 아니면 필터를 다시 적용합니다.

### `undo()` / `redo()`
스냅샷 기반 되돌리기. `dataChange {type:'undo'|'redo'}` 가 발화됩니다.

### `renderGrid()`
강제 재렌더.

### `destroy()`
전역 리스너 해제 · DOM 비움 · 레지스트리 제거.
