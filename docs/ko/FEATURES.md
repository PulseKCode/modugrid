[English](../en/FEATURES.md) | **한국어**

# ModuGrid v1.0.0 — 기능 전체 목록

`modugrid.min.js` / `modugrid.min.css` 코드에서 직접 추출해 기능별로 묶은 문서입니다.
`☐` 는 동작 확인용 체크박스입니다.

---

## 목차

| # | 그룹 | 내용 |
|---|---|---|
| 1 | [기본 구조](#1-기본-구조) | 파일 · 초기화 · 인스턴스 |
| 2 | [컬럼](#2-컬럼) | 정의 · 타입 · 시스템 컬럼 · 동적 조작 |
| 3 | [데이터 표현](#3-데이터-표현) | 정렬 · 필터 · 검색 · 그룹핑 · 트리 |
| 4 | [선택](#4-선택) | 행 선택 · 셀 선택 · 범위 |
| 5 | [편집](#5-편집) | 진입 경로 · 권한 · 입력 제어 |
| 6 | [목록 값](#6-목록-값-코드--표시명) | 코드/표시명 · 드롭다운 · 자동완성 |
| 7 | [유효성 검사](#7-유효성-검사) | validate · 오류 표시 |
| 8 | [변경추적 · 전송](#8-변경추적--전송) | diff · 소프트삭제 · submit · **이미지 전송 4방식** |
| 9 | [복사 · 붙여넣기 · 내보내기](#9-복사--붙여넣기--내보내기) | TSV · JSON · CSV |
| 10 | [레이아웃](#10-레이아웃) | 폭 · 고정 · 페이징 · 가상스크롤 |
| 11 | [모달](#11-모달) | 상세 · 편집 · 추가 |
| 12 | [모양](#12-모양) | 테마 · 폰트 · 표시 옵션 |
| 13 | [서버 연동](#13-서버-연동) | dataSource · filterSource |
| 14 | [기타](#14-기타) | Undo/Redo · 이미지 · i18n · 제작자 |
| 15 | [키보드 단축키](#15-키보드-단축키) | |
| 16 | [옵션 전체](#16-옵션-전체) | |
| 17 | [API 전체](#17-api-전체) | |
| 18 | [이벤트](#18-이벤트) | |

---

## 1. 기본 구조

| 파일 | 필수 | 역할 |
|---|---|---|
| `modugrid.min.js` | O | 그리드 엔진 전체 (단일 파일, 외부 의존 없음) |
| `modugrid.min.css` | O | 스타일 · 테마 변수 |
| `submit.jsp` | | 서버 수신 샘플 (JSP + Oracle) |

```javascript
const G = ModuGrid('#grid', { cols: COLS, options: {...} });
G.setData(rows);
```

- 그리드가 컨테이너 안에 자신의 DOM(테이블 · 푸터 · 팝업 · 모달 · 토스트)을 직접 생성 ☐
- 멀티 인스턴스 — 한 화면에 여러 그리드, 상태 · 테마 · 폰트 전부 독립 ☐
- 전역 오염 없음 — `window`에 등록되는 건 `ModuGrid` 하나 ☐
- 인라인 이벤트 핸들러 0개, 전부 위임 처리 (CSP `unsafe-inline` 불필요) ☐
- 폼 안에 있어도 버튼 · Enter가 submit을 일으키지 않음 ☐
- `destroy()` — 리스너 해제 · DOM 비움 · 레지스트리 제거 ☐

---

## 2. 컬럼

### 2.1 컬럼 속성

| 속성 | 타입 | 설명 |
|---|---|---|
| `key` | string | 데이터 키 (필수) |
| `label` | string | 헤더 표시명. `\n` 으로 줄바꿈 |
| `w` | number | 폭(px). 미지정 시 120 |
| `type` | string | 셀 렌더 타입 (2.2) |
| `group` | string | 그룹 헤더명 — 같은 값끼리 2행 헤더로 묶임 |
| `freeze` | 1 | 고정 컬럼 (`freezeOn` 켜졌을 때) |
| `noSort` | 1 | 정렬 비활성 |
| `noResize` | 1 | 폭 조절 비활성 |
| `noFilter` | 1 | 필터 아이콘 숨김 |
| `noMove` | 1 | 드래그 이동 비활성 |
| `editor` | false ǀ 'text' ǀ 'number' ǀ 'select' ǀ 'date' ǀ 'textarea' | 편집기 지정 / `false` = 편집 불가 |
| `options` | array ǀ (row)=>array | 목록 (코드/표시명 지원) |
| `optionFormat` | string ǀ (o,row)=>string | 목록 · 셀 표시 포맷 |
| `acHints` | array ǀ (row)=>array | 이 컬럼 전용 자동완성 목록 |
| `acSource` | (key,q,col)=>Promise | 이 컬럼 전용 서버 자동완성 |
| `acLimit` | number | 자동완성 표시 개수 (기본 8) |
| `ac` | false | 이 컬럼 자동완성 끄기 |
| `validate` | (v,row)=>bool ǀ string | 유효성 검사 |
| `render` | (v,row)=>html | 커스텀 셀 렌더러 |
| `textCase` | 'upper' ǀ 'lower' | 대/소문자 강제 |
| `placeholder` | string | 빈 셀 안내 문구 |

### 2.2 셀 타입

| `type` | 표시 |
|---|---|
| (없음) | 일반 텍스트 |
| `number` | 우측 정렬 숫자 |
| `currency` | 통화 서식 (콤마) |
| `progress` | 진행률 바 |
| `date` | 날짜 (`dateFormat` 적용) |
| `avatar` | 이니셜 원형 + 이름 |
| `images` | 이미지 썸네일 |
| `textarea` | 여러 줄 텍스트 |

### 2.3 시스템 컬럼

`cols` 배열에 직접 선언합니다.

```javascript
{key:'_rn', label:'#', w:42, type:'rn', noSort:1,noResize:1,noFilter:1},
{key:'_st', label:'',  w:28, type:'st', noSort:1,noResize:1,noFilter:1},
{key:'_cb', label:'',  w:36, type:'cb', noSort:1,noResize:1,noFilter:1},
```

| 키 | 내용 | 옵션 | 토글 |
|---|---|---|---|
| `_rn` | 행 번호 + 행 높이 조절 핸들 | `showRN` | `toggleRowNum()` |
| `_st` | 변경 상태 마커 `+` `*` `-` | `showST` | `toggleStatusCol()` |
| `_cb` | 행 체크박스 | `showCB` | `toggleCheckbox()` |

- 항상 좌측 고정 패널에 배치 ☐
- 본문에서 엑셀 행 머리글처럼 헤더 계열 배경 (`--bg-gut`) ☐

### 2.4 동적 조작

```javascript
G.addCol({key:'memo', label:'메모', w:150});    // 맨 뒤
G.addCol({...}, 2);          // 인덱스 위치
G.addCol({...}, 'qty');      // 해당 컬럼 앞
G.addCols([...]);            // 여러 개 (재렌더 1회)
G.removeCol('memo');
G.updateCol('memo', {label:'비고', w:200});
G.setCols([...]);            // 전체 교체
G.getCols();                 // 사본
```

- 폭 등록 · 캐시 무효화 · 편집 중 커밋 · 정렬/필터 정리 자동 처리 ☐
- `key` 변경은 차단 (데이터 매핑 보호) ☐
- `dataChange {type:'cols'}` 발화 ☐

---

## 3. 데이터 표현

### 3.1 정렬

- **▲▼ 아이콘 클릭으로만** 정렬 (헤더 라벨 클릭은 정렬 안 함) ☐
- 3단계 순환: 오름차순 → 내림차순 → 해제 ☐
- 활성 방향 화살표만 표시 + 라벨 강조 ☐
- 멀티정렬 — 순번 배지, 컬럼별 독립 순환 ☐
- 정렬바에서 개별 제거 / 전체 해제 ☐

### 3.2 필터

- 컬럼별 목록 필터 (체크박스 다중 선택) ☐
- **전체 선택** — 3단 상태(전체/부분/해제) + `선택수 / 전체수` ☐
- 팝업 내 검색 — 검색 중에는 보이는 항목만 전체선택 대상 ☐
- 컬럼별 범위 필터 (숫자 min/max) ☐
- 필터 적용 컬럼에 표시 점 ☐
- 전체 끄기 `showFilter:false` / `toggleFilter()` — 끌 때 적용 필터도 해제 ☐
- 컬럼별 끄기 `noFilter:1` ☐

### 3.3 검색

```javascript
G.search('김');
options: { searchKeys: ['name','memo'] }   // 미지정 시 COLS 자동 파생
```

- 목록 컬럼은 **코드 · 표시명 양쪽** 매칭 ☐

### 3.4 그룹핑 · 트리

- 그룹별 집계 행 (Count · Avg · Sum), 접기/펼치기 ☐
- 트리 모드 — `parentId` 기반 계층, 접기/펼치기 ☐

---

## 4. 선택

| 모드 | 동작 |
|---|---|
| `selMode:'row'` | 행 단위. 클릭 · 드래그 · Ctrl+클릭 · Shift+클릭 |
| `selMode:'cell'` | 셀 포커스 + 드래그 범위 |

- 체크박스는 선택과 독립 상태 ☐
- **`_cb` 헤더의 전체선택 체크박스** — 전부 체크 / 일부 체크(중간 상태) / 해제 3단 ☐
- 개별 행을 체크하면 헤더 상태가 즉시 따라옴 ☐
- 전체선택 대상 = 화면에 그려진 행 (일반 페이징이면 현재 페이지) ☐
- `cbHeader:'선택'` 처럼 문자열을 주면 체크박스 대신 그 글자를 헤더로 ☐
- `cbHeader:'none'`·`false` → 빈 헤더 ☐
- `toggleCheckAll(on)` — API 로도 동일 동작 ☐
- Shift+화살표 범위 확장 ☐
- 같은 셀 안 미세 이동은 범위로 잡지 않음 (길게 눌러도 상태 안 바뀜) ☐
- 범위 표시는 클래스만 갱신 — 드래그 중 재렌더 없음 ☐
- `getSelected()` / `getChecked()` → **id 배열** ☐

---

## 5. 편집

### 5.1 진입 경로

편집 모드(`editMode`)에서만 동작합니다.

| 타입 | 더블클릭 | F2 / Enter | 문자 키인 | 아이콘 |
|---|---|---|---|---|
| text · number | 숨은 입력기 | 숨은 입력기 | 숨은 입력기 | — |
| textarea | 확장 편집기 | 확장 편집기 | 확장 편집기 | — |
| select | 콤보 + 목록 | 콤보 + 목록 | 콤보 + 목록(필터) | ▼ |
| date | 편집기 + 달력 | 편집기 + 달력 | 편집기만 | 📅 (첫 클릭에 달력) |

- text/number는 세 경로가 **동일한 편집기** 사용 (테두리 두께까지 일치) ☐
- 셀을 한 번 클릭한 뒤 바로 키인하면 입력됨. `selMode` 가 `'row'` 든 `'cell'` 이든 동일 ☐
- 편집 중에 다른 셀을 클릭하면 이전 값이 커밋되고 입력기가 새 셀로 따라감 ☐
- Tab / Shift+Tab — 커밋 후 좌우 이동 ☐
- Enter — 커밋 후 아래 이동 / Esc — 취소 ☐
- **Delete — 셀 내용 지우기.** 범위 선택 시 범위 전체, `snap` 1회 ☐
- 숫자 컬럼은 `null`로 지움 (`0`과 구분) ☐

### 5.2 편집 권한

```javascript
options: { editMode:true, canInsert:true, canUpdate:true, canDelete:true }
```

| 옵션 | 차단 대상 |
|---|---|
| `canUpdate:false` | 셀 편집 전체 · 붙여넣기 · Delete · 편집 모달(→ 상세로) |
| `canInsert:false` | 추가 모달 · Insert Above/Below |
| `canDelete:false` | 행 삭제 |

- 우클릭 메뉴가 권한에 따라 자동으로 숨겨짐 ☐

**행 · 셀 단위 잠금**

```javascript
options: { rowEditable: (row) => row.status !== 'CLOSED' }          // 행 전체
{ key:'salary', editable: (row, col) => row.owner === myId }        // 그 셀만
```

- `true` 반환 = 수정 가능, `false` = 잠금. 둘 다 쓰면 **행 잠금이 먼저** 적용 ☐
- 콜백이 예외를 던지면 잠금으로 처리하고 콘솔에 오류 기록 ☐
- 잠긴 셀은 `editable` 클래스가 빠져 텍스트 커서·hover 강조가 없음 ☐

| 경로 | 잠금 적용 |
|---|---|
| 클릭 후 키인 · 더블클릭 · F2 | ○ ☐ |
| Delete 키로 셀 비우기 | ○ (건너뜀) ☐ |
| 붙여넣기 | ○ (건너뛰고 `skipped` 집계) ☐ |
| 행 모달 | ○ (읽기 전용으로 표시) ☐ |
| `updateRow()` API | **✗** — 프로그램 호출은 막지 않음 ☐ |

### 5.3 입력 제어

- 대/소문자 강제 — `textCase:'upper'ǀ'lower'` (컬럼/그리드), IME 조합 종료 후 적용 ☐
- placeholder — `col.placeholder` + `placeholderMode:'all'ǀ'first'ǀ'none'` ☐
- 행 추가 · 삭제 · 삽입 (위/아래) ☐
- 행 드래그 이동 · 행 높이 개별 조절 ☐

---

## 6. 목록 값 (코드 / 표시명)

드롭다운이든 자동완성이든 **같은 해석기**를 씁니다.

```javascript
options: [
  'active',                     // 코드 = 표시명
  {code:'A', name:'활성'},       // Oracle 공통코드 스타일
  {value:'A', label:'활성'},     // JS 관례
  {id:'A', text:'활성'},
  {v:'A', t:'활성'},
]
optionFormat: '{code} - {name}'          // 또는 (o,row)=>string
```

**목록 우선순위** — `col.options` → `col.acHints` → `options.acHints[key]`

- 데이터에는 **코드**, 화면에는 **표시명/포맷** ☐
- 자리표시자 `{code}` `{value}` `{name}` `{label}` `{text}` + 원본 객체 임의 필드 ☐
- 적용 범위: 셀 · 드롭다운 · 자동완성 · 필터 팝업 · 검색 · CSV · 엑셀복사 ☐
- 콤보 필터는 포맷 · 표시명 · 코드 세 가지 모두 매칭 ☐
- 목록에 없는 값 입력 시 그대로 저장 (목록에는 미추가) ☐
- **런타임 라벨 사전** — 서버 자동완성으로 받은 코드도 선택 후 셀에 표시명 유지 ☐
- `toCode()` / `toCodeRow()` — 전송 전 코드 환원 ☐

**자동완성** — `acSource` 서버 조회(디바운스), 실패 시 로컬 폴백, LRU 캐시 ☐

---

## 7. 유효성 검사

```javascript
validate: v => !!String(v).trim() || '이름은 필수입니다'
```

반환값 — `true` · `undefined` · `null` · `''` = 통과 / `false` = 실패(기본 메시지) / 문자열 = 실패(해당 메시지)

- **값을 되돌리지 않음** — 입력 내용 유지, 셀 배경만 붉게 + 툴팁 ☐
- 값이 통과하면 해당 셀만 표시 해제 ☐
- 네 경로 동일 처리 (정식 편집기 · 숨은 입력기 · 셀 달력 · 모달) ☐
- `getInvalidCells()` / `isValid()` — 저장 전 확인 ☐

**오류 말풍선 자동 소멸** (`errorMsgDuration`, 기본 3000ms)

- 일정 시간이 지나면 `⚠ 메시지` 말풍선이 사라짐. `0` 이하면 계속 표시 ☐
- **말풍선만 사라지고 오류 상태는 유지** — 셀 붉은 표시 · `isValid()` · `getInvalidCells()` 그대로 ☐
- 같은 셀에 오류가 연달아 나면 타이머 재시작 ☐
- 값이 통과하면 시간과 무관하게 즉시 해제 ☐

> 텍스트·숫자 셀은 검증에 실패해도 **값을 저장하고** 셀만 붉게 남깁니다(Enter 로 다음 행 이동).
> select·date·textarea 는 값을 저장하지 않고 편집 상태를 유지합니다. 저장 전 `isValid()` 확인이 필요합니다.

---

## 8. 변경추적 · 전송

```javascript
G.markClean();          // 기준점 (setData / 서버 재조회 시 자동)
G.getChanges();         // {inserted, updated, deleted}
G.getChangeCount();     // {inserted, updated, deleted, total}
G.isDirty();  G.getDirtyIds();  G.getPendingDeletes();

await G.submit('submit.jsp', { json:false, paramName:'changes', isOk:r=>r.ok });
```

- 스냅샷 diff 방식 — 편집 · 모달 · 삽입 · 삭제 · Undo/Redo 전부 자동 반영 ☐
- 코드 환원 적용 (옵션 객체가 그대로 나가지 않음) ☐
- diff 결과는 데이터 버전으로 캐싱 (대용량 렌더 성능) ☐
- `submitFields` 미지정 시 COLS 자동 파생 ☐
- **컬럼을 옮기거나 삭제해도 수정 상태가 되지 않음** — 값이 바뀐 것만 잡음 ☐
- `getChanges().updated` 는 **바뀐 필드만** 담음 (UPDATE 문에 그대로 사용 가능) ☐
- `inserted` 의 JSON 키 순서는 컬럼 순서를 따름 ☐

**소프트 삭제** (`softDelete:true`)

- 삭제해도 목록에 남고 취소선 표시, `submit()` 성공 시 실제 제거 ☐
- 신규 행은 즉시 제거 (서버에 보낼 게 없음). `Ctrl+Z` 로 복구 가능 ☐

**삭제 확인창** — 되돌릴 수 없을 때만 뜹니다.

| 설정 | 툴바 삭제 | 우클릭 삭제 | `deleteRows()` |
|---|---|---|---|
| `softDelete:true` (기본) | 없음 ☐ | 없음 ☐ | 없음 ☐ |
| `softDelete:false` | `Delete N row(s)?` ☐ | `Delete this row?` ☐ | 없음 ☐ |
- 삭제 예정 행은 편집 · 붙여넣기 차단 ☐
- `restoreRows()` / `Ctrl+Z`로 복원 ☐

**변경 표시** (`dirtyMark`)

| 클래스 | 대상 | 마커 |
|---|---|---|
| `jnew` | 신규 | `+` 초록 |
| `jupd` | 수정 | `*` 앰버 |
| `jdel` | 삭제 예정 | `-` 빨강 + 취소선 |

- `dirtyMark:false` → 배경색만 끔 (삭제 취소선은 유지) ☐
- 좌측 머리글 칸은 변경 상태와 무관하게 일정한 배경 유지 ☐

### 8.1 이미지 전송 방식 4가지

`type:'images'` 컬럼의 파일을 **언제, 어떤 형태로** 보낼지 정합니다.

```javascript
options: {
  imageMode: 'none',              // none | upload | multipart | base64
  imageMaxSize: 2*1024*1024,      // 장당 최대 바이트. 0 = 무제한
  imageLimit: 5,                  // 행당 최대 장수
}
```

| 모드 | 업로드 시점 | submit 본문 | 적합한 경우 |
|---|---|---|---|
| `none` | 안 함 | 이미지 제외 | 이미지 미사용 · 화면 미리보기만 |
| `upload` | **파일 선택 즉시** | JSON (URL 참조) | 대용량 · 다량 |
| `multipart` | submit 할 때 | FormData (JSON + 파일) | 저장 한 번으로 끝내기 |
| `base64` | 변환 즉시, 전송은 submit | JSON 에 dataURL 동봉 | 서명 · 아이콘 등 작은 것 |

- 용량·장수를 넘기면 해당 파일만 제외하고 안내 메시지 표시 ☐
- **모드는 런타임에 바꾸지 말 것** — 보관 형태가 달라 이미 담아둔 이미지의 전송 형식이 어긋남 ☐

#### `none` — 전송하지 않음 (기본값)

이미지 컬럼이 submit 대상에서 아예 빠집니다. `getChanges()` 에도 `images` 필드가 없습니다. ☐

#### `upload` — 선택 즉시 개별 업로드

```javascript
options: {
  imageMode: 'upload',
  imageUpload: async (file, row) => {
    const fd = new FormData();
    fd.append('file', file); fd.append('rowId', row.id);
    const res = await fetch('upload.jsp', { method:'POST', body:fd });
    return await res.json();          // { id, url }
  }
}
```

- `imageUpload` 함수 **필수**. 없으면 콘솔 경고 후 업로드되지 않음 ☐
- 업로드 중 진행 표시, 성공 시 서버가 준 `{id,url}` 로 교체, 실패 시 실패 표시 ☐
- `hasPendingUploads()` 로 submit 전 완료 여부 확인 ☐

submit 본문 — 파일은 이미 서버에 있으므로 참조만 전송합니다.

```json
{ "id":3, "changes":{ "images":[
    { "id":"F123", "url":"/files/F123.jpg", "name":"photo.jpg", "size":204800 } ]}}
```

> 저장하지 않고 이탈하면 파일이 고아로 남습니다. 미참조 파일 정리 배치를 두세요.

#### `multipart` — submit 때 파일까지 한 번에

파일 원본을 들고 있다가 `submit()` 시 변경분 JSON 과 파일을 `FormData` 하나로 묶어 보냅니다.

<!-- sync:ignore-code -->
```
POST submit.jsp
Content-Type: multipart/form-data; boundary=...

changes         = {"inserted":[...],"updated":[...],"deleted":[...]}
img_3_images_0  = (파일 바이너리)
img_7_images_0  = (파일 바이너리)
```

- 파트 이름 규칙 `img_{행id}_{컬럼key}_{순번}` ☐
- JSON 쪽 이미지 항목의 `ref` 값이 곧 파트 이름 → 서버는 `ref` 로 파일을 찾음 ☐
- `Content-Type` 은 브라우저가 boundary 와 함께 자동 지정 (직접 넣지 말 것) ☐
- submit 성공 시 들고 있던 파일 참조 해제 ☐

```json
{ "id":3, "changes":{ "images":[
    { "name":"photo.jpg", "size":204800, "ref":"img_3_images_0" } ]}}
```

#### `base64` — JSON 안에 문자열로 동봉

파일 선택 즉시 dataURL 로 변환해 보관하고, submit 시 JSON 에 그대로 담아 보냅니다.

```json
{ "id":3, "changes":{ "images":[
    { "name":"sign.png", "size":8200, "data":"data:image/png;base64,iVBORw0KG..." } ]}}
```

```jsp
String dataUrl = img.getString("data");
byte[] bytes   = Base64.getDecoder().decode(dataUrl.substring(dataUrl.indexOf(',') + 1));
```

> **base64 는 원본보다 약 33% 커집니다.** 서명·아이콘처럼 작고 개수가 적은 경우에만 쓰고,
> `imageMaxSize` 를 반드시 함께 지정하세요. ☐

---

---

## 9. 복사 · 붙여넣기 · 내보내기

| 동작 | 형식 |
|---|---|
| `Ctrl+C` | 범위 TSV |
| 우클릭 `Copy Row(Json)` | JSON |
| 우클릭 `Copy Row(Excel)` | TSV (선택 행 전부) |
| `Ctrl+V` | TSV 다중 셀 |
| `exportCSV()` | CSV (BOM 포함) |

- CSV · 엑셀복사 값 규칙 동일 — 목록은 표시값, **숫자 · 통화는 서식 없는 원본** ☐
- 붙여넣기는 `snap` 1회 → `Ctrl+Z` 한 번에 전체 복구 ☐
- 검증 실패 · `editor:false` · 시스템/이미지 컬럼 · 삭제예정 행은 건너뛰고 건수 집계 ☐
- **그리드 밖 선택 · 복사 · 붙여넣기는 가로채지 않음** ☐

---

## 10. 레이아웃

- 컬럼 폭 드래그 조절 ☐
- **컬럼 경계 더블클릭 → 폭 자동 맞춤** (엑셀 방식, 표시값 기준) ☐
- 컬럼 드래그 이동 · 숨김/표시 패널 ☐
- 고정(Freeze) 패널 — `col.freeze` + `freezeOn`, 헤더 · 행 높이 자동 동기화 ☐
- 그룹 헤더(2행) — sticky 오프셋 실측 ☐
- 헤더 줄바꿈 — 라벨 `\n`(수동) / `headerWrap:true`(자동) ☐
- **헤더 말줄임** — 라벨이 폭보다 길면 끝에 `...`. 정렬 화살표·필터 깔때기 자리는 항상 확보 ☐
- 컬럼 폭을 조절하는 동안에도 좌우(freeze ↔ 본문) 헤더 높이가 계속 맞음 ☐
- 폭을 넓혀 줄바꿈이 풀리면 헤더 높이도 다시 줄어듦 ☐
- 페이징 — 10/25/50/100/**전체(`pageSize:0`)** ☐
- 가상 스크롤 (`toggleVS`) ☐
- 레이아웃 저장/복원 — `getLayout()` / `setLayout()` ☐

---

## 11. 모달

```javascript
G.openDetail(id);              // 상세 (읽기 전용)
G.openRowModal('edit', id);    // 편집
G.openRowModal('add');         // 추가
```

- **COLS 정의에서 필드 자동 생성** (앱 HTML 의존 없음) ☐
- 타입별 렌더 — select · textarea · date · number ☐
- **수정 가능한 컬럼만 입력**, 나머지는 읽기 전용으로 함께 표시 ☐
- 판정 규칙은 셀 편집과 동일 (권한 · 컬럼 정의 · 행 상태) ☐
- 저장 시 validate 적용 ☐

---

## 12. 모양

### 12.1 테마 (11종)

```javascript
G.setTheme('dark');
G.setTheme('ocean', { ac:'#ff6600' });   // 프리셋 + 변수 덮어쓰기
G.setTheme(undefined, { ROW:'30px' });   // 변수만
G.getThemes();
```

`light` `dark` `midnight` `slate` `ocean` `forest` `sunset` `rose` `contrast` `compact` `compact-dark`

- 그리드 컨테이너에 `data-theme` → 그리드마다 다른 테마 가능 ☐
- 프리셋 전환 시 이전 커스텀 변수 자동 정리 ☐

### 12.2 폰트 (헤더 / 본문 독립)

```javascript
G.setFont({
  header: { size:12, family:'Pretendard', bold:true },
  body:   { size:14, italic:true, weight:500 }
});
G.setFont(14);      // 본문 크기만
G.setFont(null);    // 초기화
```

- 부분 지정 가능 (나머지 유지), 개별 속성 `null`로 항목별 초기화 ☐
- 행번호 · 숫자 셀은 본문 크기에 비례 (`calc`) ☐

### 12.3 표시 옵션

```javascript
options: {
  showFoot:true, showRows:true, showPager:true, showPageSize:true,
  showRN:true, showST:true, showCB:true,
  striped:true, dirtyMark:true, showFilter:true,
}
```

- 상태바 순서: `Rows 정보` → `페이지 목록` → `Per page` ☐
- 개별 항목 숨김 시 **자리는 유지** (나머지 위치 안 바뀜) ☐
- 항목이 전부 꺼지면 상태바도 자동 숨김 ☐
- 알림 토스트는 **그리드 중앙**에 표시 (그리드별 독립) ☐

---

## 13. 서버 연동

```javascript
options: {
  dataSource:   (req) => Promise<{rows, total, agg}>,
  filterSource: (colKey, req) => Promise<string[]>,
  acSource:     (colKey, q) => Promise<string[]>,
}
```

- 정렬 · 필터 · 검색 · 페이징 조건을 `req`로 전달 ☐
- 요청 시퀀스 관리 — 늦게 도착한 응답 폐기 ☐
- 로딩 오버레이 / `dataError` 이벤트 / `reload()` ☐
- distinct 목록 · 자동완성 LRU 캐시 (내장) ☐

---

## 14. 기타

- Undo / Redo — 스냅샷 방식, `dataChange {type:'undo'ǀ'redo'}` 발화 ☐
- id 자동 채번 — 누락 시 부여, 중복 정리, 재사용 없음, `genId` 교체 가능 ☐
- 이미지 셀 — 파일 선택 · 드래그&드롭 · 미리보기 · 삭제 · 개수/용량 제한 ☐
- 이미지 전송 방식 4가지 — `imageMode` (8.1 참고) ☐
- **우클릭 메뉴 표시 설정** — `contextMenu` ☐

```javascript
options: { contextMenu: false }                       // 전체 끄기
options: { contextMenu: { copy:false, delete:false } } // 항목별
```

  항목명 — `detail` · `edit` · `copy` · `copyExcel` · `insertAbove` · `insertBelow` · `tree` · `delete`

- 적지 않은 항목은 표시됨. 옵션은 권한 위에 얹히는 **추가 제한** ☐
- `contextMenu:false` 면 브라우저 기본 메뉴가 정상 표시됨 ☐
- 표시할 항목이 없으면 빈 메뉴를 띄우지 않음 ☐
- 항목을 감추면 구분선도 함께 정리됨 ☐
- i18n — 31개 키, `options.i18n`으로 부분/전체 덮어쓰기 ☐
- **콘솔 로그·경고·예외 메시지는 전부 영어** (주석만 한국어) ☐
- 제작자 정보 — `ModuGrid.about`, 동결된 읽기 전용 ☐

```javascript
ModuGrid.about
// { name:'ModuGrid', version:'1.0.0', author:'BongJun Park', license:'MIT',
//   copyright:'© 2026 BongJun Park', homepage:'https://github.com/PulseKCode' }
```
- 앱 컨트롤 매핑 — `options.controls` ☐

---

## 15. 키보드 단축키

| 키 | 동작 |
|---|---|
| `↑` `↓` `←` `→` | 셀 포커스 이동 |
| `Ctrl` + 방향키 | 데이터 끝으로 점프 (페이지 전환 포함) |
| `Shift` + 방향키 | 범위 확장 |
| `Tab` / `Shift+Tab` | 커밋 후 좌우 이동 |
| `Enter` | 편집 시작 / 커밋 후 아래 이동 |
| `F2` | 편집 시작 (기존 값 전체 선택) |
| `Esc` | 편집 취소 |
| `Delete` | 셀 내용 지우기 |
| 문자 키 | 즉시 편집 시작 |
| `Ctrl+C` / `Ctrl+V` | 범위 복사 / 붙여넣기 |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |

그리드 밖 입력란에서는 가로채지 않습니다. ☐

---

## 16. 옵션 전체

```javascript
options: {
  // 표시
  showRN, showST, showCB, striped, rowHeight, freezeOn,
  showFoot, showRows, showPager, showPageSize, showFilter,
  headerWrap, placeholderMode, dirtyMark, cbHeader, contextMenu,

  // 모양
  theme, themeVars, headerFont, bodyFont,

  // 선택 · 편집
  selMode, editMode, canInsert, canUpdate, canDelete,
  rowEditable, errorMsgDuration, keyboardOnLoad,
  dateFormat, textCase, numericKeys, newRowDefaults, genId,

  // 이미지
  imageMode, imageUpload, imageMaxSize, imageLimit,

  // 정렬 · 검색 · 페이징
  multiSort, searchKeys, pageSize,

  // 목록 · 자동완성
  acHints, acSource, acDebounce,

  // 변경추적
  submitFields, softDelete,

  // 서버
  dataSource, filterSource,

  // 부가
  controls, i18n, on,
}
```

---

## 17. API 전체

**데이터** `setData` `addRow` `insertAt` `updateRow` `deleteRows` `restoreRows` `deleteSelected` `editSelected`

**조회** `getSelected` `getChecked` `getFilteredData` `getState` `getPendingDeletes`

**선택** `setSelMode` `toggleRowSel` `toggleRowCheck` `toggleCheckAll`

**이미지** `getImages` `hasPendingUploads`

**컬럼** `addCol` `addCols` `removeCol` `updateCol` `setCols` `getCols` `moveCol` `hideCol` `showCol` `toggleColHidden` `openColPanel` `autoFit`

**정렬 · 필터 · 검색** `doSort` `rmSort` `clearSorts` `openCF` `applyCF` `clearCF` `search` `toggleFilter` `toggleMultiSort`

**편집** `startEdit` `startEditIME` `openPicker` `openDatePicker` `setCellDate` `clearCells` `pasteText` `canInsert` `canUpdate` `canDelete`

**변경추적** `markClean` `getChanges` `getChangeCount` `isDirty` `getDirtyIds` `submit` `toCode` `toCodeRow`

**유효성** `getInvalidCells` `isValid`

**모달** `openDetail` `openRowModal` `closeRowModal` `saveRowModal`

**모양** `setTheme` `getTheme` `getThemes` `setFont` `getFont` `setPlaceholderMode` `toggleStripe` `toggleDirtyMark`

**표시 토글** `toggleFreeze` `toggleRowNum` `toggleStatusCol` `toggleCheckbox` `toggleVS` `toggleEditMode` `toggleGroup` `toggleTree` `toggleFoot` `toggleRowsInfo` `togglePager` `togglePageSize`

**행** `moveRow` `setRowHeight` `toggleRowSel` `toggleRowCheck` `setSelMode`

**페이징** `goPage` `changePS`

**복사 · 내보내기** `copyRange` `ctxCopy` `ctxCopyExcel` `exportCSV`

**레이아웃 · 생명주기** `getLayout` `setLayout` `reload` `undo` `redo` `destroy` `renderGrid`

---

## 18. 이벤트

```javascript
options: { on: { dataChange, cellEdit, selectionChange, rowClick, dataError, dirtyChange } }
```

| 이벤트 | payload |
|---|---|
| `dataChange` | `{type, ...}` |
| `cellEdit` | `{id, key, value}` |
| `selectionChange` | `{selected, checked}` |
| `rowClick` | `{id, selected}` |
| `dataError` | `{error}` |
| `dirtyChange` | `{inserted, updated, deleted, total}` |

`dataChange.type` — `load` `add` `insert` `update` `delete` `restore` `clear` `paste` `move` `cols` `undo` `redo`
