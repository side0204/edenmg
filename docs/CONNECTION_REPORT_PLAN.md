# 접속일보 설계서 (M3 Phase 2-B)

> 작성: 2026-05-18 · 상태: **owner 검토 대기**
> 코드 들어가기 전 owner 와 합의 후 마이그레이션·구현 진행.

## 1. 한 줄 요약

접속팀(worker_type='접속팀') 작업에 대해 **상위국 → 함체들 → 하위국** 의 트리형 chain 구조를 plan으로 등록하고, 작업자가 매일 일보를 작성하며 각 cable 구간의 케이블규격·실 사용선번을 기록한다. 일반 작업일보(`work_daily_reports`) 와 **완전히 분리된 별도 entity**.

## 2. 결정사항 표 (owner 4-round 답변 종합)

| 항목 | 결정 | 출처 |
|---|---|---|
| **entity 분리** | 별도 (`connection_reports`). 접속팀 작업은 접속일보만 작성 | round 1 |
| **chain 수** | 1:N — 한 작업에 chain 여러 개 가능 (대부분 1개) | round 1 |
| **케이블규격** | enum 고정: `1C, 1C(드랍), 2C, 2C(드랍), 12C, 36C, 72C, 144C, 288C, 576C` | round 1 + 3 |
| **사용선번** | 자유 텍스트 ("1-6", "1,3,5", "1-6,12-18") | round 1 |
| **분기** | 함체에서 갈래길 가능 — 트리 구조 | round 2 |
| **함체 식별** | 함체명 + 함체규격 + GPS + 고유 식별번호(함체 코드/관리번호) | round 2 |
| **엑셀 출력** | 일보별 1행 + 세그먼트별 1행 — 둘 다 다운로드 가능 | round 2 |
| **국사 마스터** | 없음. 작업지시 담당자가 작업 등록 시 chain 미리 입력 | round 3 |
| **함체 마스터** | 없음. plan 트리 노드로 직접 입력. 예정 외 함체는 작업 중 추가 | round 3 |
| **멀티 작업자** | 각자 일보 작성 (UNIQUE work+date+author). 비고에 협업 메모. segment-level 작업자 태그는 **v2** | round 3 |
| **Plan/Actual 분리** | **B안** — Plan 에는 함체·구조만, 일보(Actual)에 케이블규격·선번 입력 | round 4 |
| **chain 입력 위치** | 작업 상세 페이지 `/works/[id]` 에 "chain 관리" 섹션 (별도) | round 4 |
| **분기 UI** | 들여쓰기 트리 시각화 | round 4 |
| **결재** | 1단 (작성자 → 담당자 승인/반려) — 일반 일보와 동일 | M3 Phase 2 합의 |

## 3. 데이터 모델

### 3-1. 새 enum

```sql
create type public.cable_spec as enum (
  '1C', '1C(드랍)', '2C', '2C(드랍)', '12C', '36C', '72C', '144C', '288C', '576C'
);

create type public.plan_node_type as enum (
  'upper_station', 'box', 'lower_station'
);
-- (connection_report_progress / status 는 work_report_progress/status 재사용 가능 — 값이 동일)
```

### 3-2. 테이블

#### `connection_chains` — 작업의 chain (1:N)
```sql
create table public.connection_chains (
  id          uuid primary key default gen_random_uuid(),
  work_id     uuid not null references public.works(id) on delete cascade,
  name        text,           -- 'A동 ↔ B동' 같은 라벨 (선택)
  position    int not null default 0,  -- 한 작업 내 표시 순서
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

#### `connection_plan_nodes` — chain 트리 (상위국 + 함체들 + 하위국들)
```sql
create table public.connection_plan_nodes (
  id          uuid primary key default gen_random_uuid(),
  chain_id    uuid not null references public.connection_chains(id) on delete cascade,
  parent_id   uuid references public.connection_plan_nodes(id) on delete cascade,
  position    int not null default 0,  -- 같은 parent 안에서 형제 순서 (분기 시 정렬)
  node_type   public.plan_node_type not null,
  name        text not null,           -- 상위국명 / 함체명 / 하위국명
  code        text,                    -- 함체 코드 (node_type='box' 일 때만 사용)
  spec        text,                    -- 함체 규격 (box 만)
  lat         numeric(10, 7),          -- GPS 위도 (box 만)
  lng         numeric(10, 7),          -- GPS 경도 (box 만)
  address     text,                    -- 주소 (box 만)
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- 각 chain 은 정확히 1개의 upper_station (root, parent_id IS NULL)
  -- leaf 노드는 lower_station 으로 끝맺음 (분기 시 leaf 여러 개 가능)
  check (node_type = 'upper_station' or parent_id is not null),
  check (node_type <> 'upper_station' or parent_id is null)
);
```

**트리 의미**:
- `parent_id IS NULL` 인 노드 = chain 의 상위국 (root). chain 당 1개.
- 박스들이 트리 가지로 이어짐.
- leaf 노드 중 `node_type='lower_station'` 인 것이 chain 의 종착점. 분기 시 leaf 여러 개 가능.
- `parent → this_node` 가 하나의 cable segment 를 의미.

#### `connection_reports` — 일일 접속일보
```sql
create table public.connection_reports (
  id                   uuid primary key default gen_random_uuid(),
  work_id              uuid not null references public.works(id) on delete cascade,
  author_employee_id   uuid not null references public.employees(id) on delete restrict,
  report_date          date not null,

  notes                text,
  progress             public.work_report_progress not null default '진행중',

  status               public.work_report_status not null default '대기',
  reviewed_by          uuid references public.employees(id) on delete restrict,
  reviewed_at          timestamptz,
  review_comment       text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  unique (work_id, report_date, author_employee_id)
);
```

#### `connection_report_segments` — 일보가 기록하는 cable 작업
```sql
create table public.connection_report_segments (
  id              uuid primary key default gen_random_uuid(),
  report_id       uuid not null references public.connection_reports(id) on delete cascade,
  plan_node_id    uuid not null references public.connection_plan_nodes(id) on delete restrict,
  -- plan_node_id = 이 cable 의 도착 노드. 출발 노드는 plan_nodes.parent_id 로 추적.
  -- upper_station 노드는 cable 의 도착점이 될 수 없음 → plan_node.parent_id IS NOT NULL 필수.

  cable_spec      public.cable_spec not null,
  line_numbers    text not null,        -- 자유 텍스트: '1-6', '1,3,5', '1-6,12-18'
  is_completed    boolean not null default true,  -- 일보 작성 시점에 완료/미완료 구분
  segment_notes   text,

  created_at      timestamptz not null default now(),

  unique (report_id, plan_node_id)
);
```

### 3-3. RLS 정책

- `connection_chains`, `connection_plan_nodes`: 작업이 같은 회사면 select. CUD 는 작업관리자(admin/ceo/can_manage_works) — `work_assignments_manager_all` 패턴.
- `connection_reports`: select 같은 회사, insert 본인+배정자+같은회사, update 본인작성+대기 OR 담당자/admin (일반 일보 RLS 와 동일).
- `connection_report_segments`: report 의 RLS 를 따름 (report_id JOIN).
- delete GRANT 미부여 (append-only).

## 4. UI 흐름

### 4-1. 작업 상세 페이지 `/works/[id]`

기존 정보(작업명·기간·작업자 배정·일반 작업일보 섹션) **에 추가**:
- **chain 관리 섹션** — `worker_type='접속팀'` 인 작업에만 노출
  - chain 리스트 (없으면 "chain 등록" CTA)
  - 각 chain 옆에 [편집] [+ 함체 추가] 버튼
  - 트리 들여쓰기 시각화 (예시 아래)
  - 권한: admin/ceo/can_manage_works/담당자 만 편집

```
chain 1: 「강남 A동 ↔ B동」
  ┌─ 강남A국 (상위국)
  ├─ 1번 함체 [함체코드: H001, 36C 함체, GPS: 37.49,127.02]
  │  ├─ 2번 함체 [H002, 12C 함체]
  │  │  └─ B동 1층 (하위국)
  │  └─ B동 2층 (하위국)
  └─ ...
       [+ 함체 추가] [+ 분기]
```

- **접속일보 섹션** — `worker_type='접속팀'` 인 작업에만 노출 (일반 일보 섹션 대체)
  - 최근 10건 + 상태 배지
  - "오늘 일보 작성" / "오늘 일보 보기"

### 4-2. chain 등록·편집 `/works/[id]/chains/[chainId]/edit`

- chain 이름·메모 + 노드 트리 편집
- 노드 클릭 → 모달: 이름·코드·규격·GPS·주소·메모
- "+ 자식 함체 추가" / "+ 하위국 종착" 버튼
- 노드 삭제·이동 (드래그·드롭은 후순위, 처음엔 parent 변경 드롭다운)

### 4-3. 접속일보 작성 `/works/[id]/connection-reports/new`

- 일자 (기본: 오늘 KST)
- chain 선택 — chain 이 1개면 자동 선택, 2개 이상이면 select 보임
- 트리 시각화 + 각 cable 옆에 cable_spec/line_numbers 입력 폼
- 작업자가 해당 cable 클릭 → 인라인 입력: 케이블규격(드롭다운) + 선번(텍스트) + 완료 토글 + 메모
- 트리 상단 [+ 함체 추가] — 예정 외 함체. 모달에서 parent 선택 후 노드 입력 → plan_nodes 에 새 노드 추가 + 자동으로 입력 폼 활성
- 비고 (전체 일보 메모) + 진행률 enum

### 4-4. 접속일보 상세 `/works/[id]/connection-reports/[reportId]`

- 트리 시각화 + 각 cable 의 실제 입력값 표시
- 작성자+대기 → 인라인 편집
- 담당자/admin/ceo + 대기 → 승인·반려 액션

## 5. 엑셀 출력

### 5-1. 일보별 1행 (`/api/reports/connection-reports?mode=summary&...`)

| 일자 | 작성자 | 권한 | 직급 | 팀 | 작업명 | chain명 | 진행률 | 상태 | 처리자 | 처리시각 | 처리의견 | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

### 5-2. 세그먼트별 1행 (`/api/reports/connection-reports?mode=segment&...`)

| 일자 | 작성자 | 작업명 | chain명 | 출발노드 | 도착노드 | 도착노드 타입 | 함체코드 | 함체규격 | GPS | 케이블규격 | 사용선번 | 완료여부 | segment 메모 | 일보 진행률 | 일보 상태 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

CSV 빌더는 기존 `src/lib/csv.ts` 재사용. UTF-8+BOM, CRLF, RFC 5987 Content-Disposition.

## 6. 일반 작업일보(`work_daily_reports`) 와의 관계

- worker_type='접속팀' 인 작업: **접속일보만 작성**. 작업 상세에서 일반 일보 섹션 숨김, 접속일보 섹션 노출.
- worker_type='외선팀' / '기타': 기존 일반 일보 그대로.
- 결재 라인은 동일 (작업의 `assignee_employee_id`).

`/works/[id]` 페이지의 분기:
```ts
{work.worker_type === '접속팀'
  ? <ConnectionChainsSection /> + <ConnectionReportsSection />
  : <DailyReportsSection />}
```

## 7. 마이그레이션 순서

```
0011_connection_chains.sql          -- chains + plan_nodes + enum cable_spec + plan_node_type
0012_connection_reports.sql         -- reports + report_segments + RLS + GRANT
```

(0010 의 `work_report_progress`·`work_report_status` enum 재사용)

## 8. 추후 (v2 후순위)

- **segment-level 작업자 태그** — 누가 어느 cable 작업했는지 (멀티 작업자 디테일)
- **사진 첨부** — 함체·접속 사진 (EXIF 보존 포함, PRD M3-06)
- **함체 마스터 테이블** — 자주 쓰는 함체 자동 완성
- **국사 마스터 테이블** — 자주 쓰는 국사 자동 완성
- **재접속 이력 조회** — 같은 함체코드로 검색해서 이력 보기
- **체인 시각화 지도** — GPS 좌표로 chain 경로 지도 그리기
- **plan 변경 이력 audit** — 누가 언제 함체 추가·삭제했는지

## 9. owner 가 확인할 항목

코드 들어가기 전에 한 번만 더 검토 부탁드립니다:

- [ ] **3-2 의 테이블 4개 구조** 가 실제 업무 흐름과 맞나?
- [ ] **케이블 규격 enum 10개** 가 빠진 거 / 잘못된 거 없나?
- [ ] **chain 명** 자유 텍스트로 충분한가? (자동 생성 vs 사용자 입력)
- [ ] **하위국이 여러 개** 가능 (분기 leaf) 한 가정이 맞나?
- [ ] **일반 일보와 자동 분기** (접속팀 → 접속일보, 외선팀/기타 → 일반 일보) 동의?
- [ ] **chain 관리 권한** = admin/ceo/can_manage_works/담당자 — 다른 권한 필요?
- [ ] **predefined 함체와 ad-hoc 함체 차이** 를 일보·엑셀에서 시각적으로 구분할 필요? 아니면 동일 처리?

위 7개 확인되면 마이그레이션·구현 들어갑니다.
