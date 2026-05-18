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
| **함체 식별** | 함체명 + 함체규격 + GPS + 함체ID(고유 식별번호) | round 2 + 후속 정정 |
| **엑셀 출력** | 일보별 1행 + 세그먼트별 1행 — 둘 다 다운로드 가능 | round 2 |
| **국사·함체 마스터** | 회사 현실로는 존재하지만 **수량이 많아 일괄 등록 시간 부담**. MVP는 마스터 테이블 없이 작업지시 시 직접 입력. 마스터 테이블화는 v2 후순위 | round 3 + 후속 정정 |
| **계획 외 함체 추가** | 작업자가 일보 작성 중 **트리의 원하는 위치에 끼워넣기 가능** (parent 선택). plan_nodes 에 그대로 들어가 chain 이 자라남 | round 3 + 후속 정정 |
| **멀티 작업자** | 각자 일보 작성 (UNIQUE work+date+author). 비고에 협업 메모. segment-level 작업자 태그는 **v2** | round 3 |
| **Plan/Actual 분리** | **B안** — Plan 에는 함체·구조만, 일보(Actual)에 케이블규격·선번 입력 | round 4 |
| **chain 입력 위치** | 작업 상세 페이지 `/works/[id]` 에 "chain 관리" 섹션 (별도) | round 4 |
| **분기 UI** | 들여쓰기 트리 시각화 | round 4 |
| **결재** | 1단 (작성자 → 담당자 승인/반려) — 일반 일보와 동일 | M3 Phase 2 합의 |
| **선번 중복 방지** | 같은 cable(segment) 안에서만 unique 강제 (다른 cable 은 재사용 OK) | 후속 정정 |
| **노드별 자재 입력** | 상위국·함체·하위국 각각 사용 자재 기록. 회사 자재 마스터에서 검색 + 비규격은 직접 입력 | 후속 정정 |
| **자재 마스터 필드** | 명·규격·단위 (회사별). 필요 시 컬럼 추가 가능 | 후속 정정 |
| **노드별 공종·공종수** | 노드마다 공종(13종 enum + 기타) + 횟수. 기타는 공종명 직접 입력. 공종 enum 은 owner 가 제공한 13개로 확정 (§ 3-1 참조) | 후속 정정 |
| **접속코어수** | 사용선번 입력 시 클라이언트가 자동 계산해서 표시. DB 에 별도 저장 없이 derived. 엑셀 출력 시 server-side 재계산 | 후속 정정 |

## 3. 데이터 모델

### 3-1. 새 enum

```sql
create type public.cable_spec as enum (
  '1C', '1C(드랍)', '2C', '2C(드랍)', '12C', '36C', '72C', '144C', '288C', '576C'
);

create type public.plan_node_type as enum (
  'upper_station', 'box', 'lower_station'
);

create type public.connection_task_type as enum (
  '접속(12C이하)',
  '접속(12C초과)',
  '성단접속',
  '성단작업',
  '함체작업(주간)',
  '함체작업(야간)',
  '중간분기함체(기설)',
  '중간분기함체(신설)',
  '단자함설치',
  '국사패치',
  'IJP신설',
  '고위험(함체)',
  '신호수',
  '기타'
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
  id                   uuid primary key default gen_random_uuid(),
  chain_id             uuid not null references public.connection_chains(id) on delete cascade,
  parent_id            uuid references public.connection_plan_nodes(id) on delete cascade,
  position             int not null default 0,  -- 같은 parent 안에서 형제 순서 (분기 시 정렬)
  node_type            public.plan_node_type not null,
  name                 text not null,            -- 상위국명 / 함체명 / 하위국명
  code                 text,                     -- 함체ID (고유 식별번호 / 관리번호) — node_type='box' 일 때만. UI 라벨은 "함체ID"
  spec                 text,                     -- 함체 규격 (box 만)
  lat                  numeric(10, 7),           -- GPS 위도 (box 만)
  lng                  numeric(10, 7),           -- GPS 경도 (box 만)
  address              text,                     -- 주소 (box 만)
  notes                text,
  -- ad-hoc 추가 추적 (작업자가 일보 중 끼워넣은 함체 표시용)
  created_by_employee_id  uuid references public.employees(id) on delete set null,
  added_during_report_id  uuid references public.connection_reports(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
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
                                        -- 서버에서 parse 시 같은 cable 안 중복 detect → reject
  is_completed    boolean not null default true,  -- 일보 작성 시점에 완료/미완료 구분
  segment_notes   text,

  created_at      timestamptz not null default now(),

  unique (report_id, plan_node_id)
);
```

#### `materials` — 회사별 자재 마스터
```sql
create table public.materials (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete restrict,
  name        text not null,
  spec        text,            -- 규격 / 모델명
  unit        text,            -- 'EA', 'm', '식' 등
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, name, coalesce(spec, ''))
);
```

#### `connection_node_materials` — 일보 노드별 사용 자재
```sql
create table public.connection_node_materials (
  id              uuid primary key default gen_random_uuid(),
  report_id       uuid not null references public.connection_reports(id) on delete cascade,
  plan_node_id    uuid not null references public.connection_plan_nodes(id) on delete restrict,

  -- 마스터 자재 선택 OR 비규격 직접 입력 (둘 중 하나만)
  material_id     uuid references public.materials(id) on delete restrict,
  custom_name     text,
  custom_spec     text,
  custom_unit     text,

  quantity        numeric(12, 3) not null check (quantity > 0),
  notes           text,
  created_at      timestamptz not null default now(),

  check (
    (material_id is not null and custom_name is null) or
    (material_id is null and custom_name is not null and length(btrim(custom_name)) > 0)
  )
);
```

#### `connection_node_tasks` — 일보 노드별 공종·공종수
```sql
create table public.connection_node_tasks (
  id                uuid primary key default gen_random_uuid(),
  report_id         uuid not null references public.connection_reports(id) on delete cascade,
  plan_node_id      uuid not null references public.connection_plan_nodes(id) on delete restrict,

  task_type         public.connection_task_type not null,
  custom_task_name  text,                      -- task_type='기타' 일 때만 사용
  task_count        int  not null check (task_count > 0),
  notes             text,
  created_at        timestamptz not null default now(),

  check (
    (task_type <> '기타' and custom_task_name is null) or
    (task_type = '기타' and custom_task_name is not null and length(btrim(custom_task_name)) > 0)
  )
);
```

### 3-3. RLS 정책

- `connection_chains`, `connection_plan_nodes`: 작업이 같은 회사면 select. CUD 는 작업관리자(admin/ceo/can_manage_works) — `work_assignments_manager_all` 패턴.
  - **예외**: plan_nodes insert/update 는 작업자(배정자)도 가능 — ad-hoc 함체 추가용. 단 같은 회사 + 작업 배정 확인.
- `connection_reports`: select 같은 회사, insert 본인+배정자+같은회사, update 본인작성+대기 OR 담당자/admin (일반 일보 RLS 와 동일).
- `connection_report_segments`, `connection_node_materials`, `connection_node_tasks`: report 의 RLS 를 따름 (report_id JOIN).
- `materials`: select 같은 회사, CUD admin/ceo.
- delete GRANT 미부여 (append-only): reports/segments/materials_node 등. materials 마스터는 update is_active=false 로 비활성 처리.

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
  ├─ 1번 함체 [함체ID: H001, 36C 함체, GPS: 37.49,127.02]
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
- 트리 시각화. 각 노드·각 cable 옆에 인라인 입력 영역.
- **각 cable (segment) 입력**:
  - 케이블규격(드롭다운, enum 10종)
  - 사용선번(텍스트). 입력 즉시 클라이언트가 parse → `접속코어수: N` 자동 표시
  - **선번 중복 검증**: 같은 cable 안에서 "1-6, 3-8" 같이 겹치면 빨간 경고 + 제출 차단. 서버에서도 재검증.
  - 완료 토글 + segment 메모
- **각 노드(상위국·함체·하위국) 입력**: 노드 클릭 → 드로워에서 두 영역
  - **공종·공종수**: [+ 추가] 버튼으로 행 추가. 각 행: 공종(접속/성단/기타 드롭다운) + (기타 시 공종명 직접입력) + 수량(정수) + 메모
  - **사용 자재**: [+ 추가] 버튼. 각 행:
    - 자재 검색 input → 회사 마스터에서 부분 매칭. 선택 시 명·규격·단위 자동 채움
    - "마스터에 없음" 인 경우 [직접 입력] 토글 → 명·규격·단위 직접 입력
    - 수량(소수 가능) + 메모
- **계획 외 함체 추가 (작업자 권한)**:
  - 트리 안 각 노드 옆에 [+ 자식으로 추가] 버튼 — 그 노드를 parent 로 새 함체 끼워넣기
  - 또는 cable 중간에 [⋯ 사이에 끼우기] — 부모-자식 사이에 함체 삽입 (기존 자식 노드들이 새 함체의 자식이 됨)
  - 모달에서 함체명·함체ID·규격·GPS·주소·메모 입력 → plan_nodes 에 즉시 insert + 트리 갱신 + 새 cable·자재·공종 입력 영역 자동 활성
  - 추가된 노드는 시각적으로 "★ 작업 중 추가" 배지 표시 (created_by_employee_id / added_during_report_id 활용)
- 비고 (전체 일보 메모) + 진행률 enum

> 💡 **접속코어수 파싱 규칙**:
> - `1-6` → 6 개 (1,2,3,4,5,6)
> - `1,3,5` → 3 개
> - `1-6,12-18` → 13 개 (6 + 7)
> - 음수·소수·0·역순(`8-3`) → 입력 거부
> - 같은 cable 안에서 다른 범위와 겹치는 번호 detect → 거부 (예: `1-6, 3-8` 의 3,4,5,6)
> - 클라이언트 + 서버 동일 로직 (공통 `src/lib/connection.ts` 파서)

### 4-4. 접속일보 상세 `/works/[id]/connection-reports/[reportId]`

- 트리 시각화 + 각 cable 의 실제 입력값 + 각 노드의 공종·자재 펼쳐 표시
- 작성자+대기 → 인라인 편집 (cable·노드·자재·공종 모두)
- 담당자/admin/ceo + 대기 → 승인·반려 액션

### 4-5. 자재 마스터 관리 `/admin/materials` (신설)

- admin/ceo 전용
- 자재 리스트: 명·규격·단위·활성 상태
- [+ 자재 등록] / 행 클릭 시 편집 / 비활성 토글 (삭제 대신 is_active=false)
- 접속일보 작성 시 비활성 자재는 검색 결과에서 제외

## 5. 엑셀 출력

### 5-1. 일보별 1행 (`/api/reports/connection-reports?mode=summary&...`)

| 일자 | 작성자 | 권한 | 직급 | 팀 | 작업명 | chain명 | 진행률 | 상태 | 처리자 | 처리시각 | 처리의견 | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

### 5-2. 세그먼트별 1행 (`/api/reports/connection-reports?mode=segment&...`)

| 일자 | 작성자 | 작업명 | chain명 | 출발노드 | 도착노드 | 도착노드 타입 | 함체ID | 함체규격 | GPS | 케이블규격 | 사용선번 | 접속코어수 | 완료여부 | 계획외추가 | segment 메모 | 일보 진행률 | 일보 상태 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

> "계획외추가" 컬럼 = 해당 노드가 작업자 ad-hoc 추가인지 (Y/N). `plan_nodes.added_during_report_id IS NOT NULL` 로 판단.
> "접속코어수" = server-side 에서 line_numbers 파서로 재계산한 값.

### 5-3. 노드 공종별 1행 (`/api/reports/connection-reports?mode=tasks&...`)

| 일자 | 작성자 | 작업명 | chain명 | 노드명 | 노드타입 | 함체ID | 공종 | 공종(기타) | 공종수 | 메모 |
|---|---|---|---|---|---|---|---|---|---|---|

### 5-4. 노드 자재별 1행 (`/api/reports/connection-reports?mode=materials&...`)

| 일자 | 작성자 | 작업명 | chain명 | 노드명 | 노드타입 | 함체ID | 자재명 | 규격 | 단위 | 수량 | 마스터여부 | 메모 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

> "마스터여부" = material_id 가 있으면 Y (마스터 자재), 없으면 N (직접 입력)

CSV 빌더는 기존 `src/lib/csv.ts` 재사용. UTF-8+BOM, CRLF, RFC 5987 Content-Disposition.

## 6. 일반 작업일보(`work_daily_reports`) 와의 관계

- worker_type='접속팀' 인 작업: **접속일보만 작성**. 작업 상세에서 일반 일보 섹션 숨김, 접속일보 섹션 노출.
- worker_type='외선팀' / '기타': **이번 phase 에서는 기존 일반 일보 그대로 유지**.
- ⚠️ **외선팀은 차후 별도 entity (외선일보) 로 분리 예정** — 접속일보와 동일한 패턴(별도 테이블·별도 페이지). 외선 작업 특성에 맞는 구조(케이블 포설구간·전주번호 등)를 별도 설계 후 도입.
- 결재 라인은 동일 (작업의 `assignee_employee_id`).

`/works/[id]` 페이지의 분기:
```ts
{work.worker_type === '접속팀'
  ? <ConnectionChainsSection /> + <ConnectionReportsSection />
  : <DailyReportsSection />}
```

## 7. 마이그레이션 순서

```
0011_connection_plan.sql        -- enum (cable_spec, plan_node_type, connection_task_type)
                                -- + connection_chains
                                -- + connection_plan_nodes (created_by_employee_id 포함, added_during_report_id 는 0012 에서)
                                -- + materials (회사 자재 마스터)
                                -- + RLS + GRANT
0012_connection_reports.sql     -- connection_reports
                                -- + connection_report_segments
                                -- + connection_node_materials
                                -- + connection_node_tasks
                                -- + ALTER plan_nodes ADD COLUMN added_during_report_id (forward FK 회피용)
                                -- + RLS + GRANT
```

(0010 의 `work_report_progress`·`work_report_status` enum 재사용)

## 8. 추후 (v2 후순위)

- **외선일보 별도 entity** — 접속일보처럼 worker_type='외선팀' 작업도 별도 모듈로. 구조는 외선 작업 특성에 맞게 별도 설계 (예: 케이블 포설구간·전주번호·인입선 등).
- **segment-level 작업자 태그** — 누가 어느 cable 작업했는지 (멀티 작업자 디테일)
- **사진 첨부** — 함체·접속 사진 (EXIF 보존 포함, PRD M3-06)
- **국사 마스터 테이블** — 자주 쓰는 국사 자동 완성. 회사 현실에는 마스터가 있으나 수량이 많아 일괄 등록 시간 부담 → MVP 이후 점진 등록
- **함체 마스터 테이블** — 같은 사유로 v2. 함체ID 검색으로 자동완성
- **재접속 이력 조회** — 같은 함체ID 로 검색해서 시계열 이력 보기
- **체인 시각화 지도** — GPS 좌표로 chain 경로 지도 그리기
- **plan 변경 이력 audit** — 누가 언제 함체 추가·삭제했는지 (Phase 1 의 created_by_employee_id 만으로는 추적 부족)

## 9. owner 가 확인할 항목

코드 들어가기 전에 한 번만 더 검토 부탁드립니다:

- [ ] **3-2 의 테이블 7개 구조** (chains·plan_nodes·reports·report_segments·materials·node_materials·node_tasks) 가 실제 업무 흐름과 맞나?
- [ ] **케이블 규격 enum 10개** 가 빠진 거 / 잘못된 거 없나? (1C·1C드랍·2C·2C드랍·12C·36C·72C·144C·288C·576C)
- [ ] **chain 명** 자유 텍스트로 충분한가? (자동 생성 vs 사용자 입력)
- [ ] **하위국이 여러 개** 가능 (분기 leaf) 한 가정이 맞나?
- [ ] **chain 관리 권한** = admin/ceo/can_manage_works/담당자. 작업자(배정자)도 함체 추가는 가능. 다른 권한 조정 필요?
- [ ] **계획외 추가 함체 표시** — 엑셀 "계획외추가 Y/N" 컬럼 + 트리 UI "★ 작업 중 추가" 배지로 구분. 이 정도면 충분?
- [ ] **선번 중복 검증 범위** = 같은 cable 안만. 다른 cable·다른 일보는 같은 선번 재사용 OK. (반대 케이스가 진짜 필요한지 한 번 더 확인)
- [ ] **자재 마스터 초기 등록** 누가 하나? `/admin/materials` 페이지에서 admin/ceo 가 사전 등록. 처음엔 비어있고 일보 작성 중 "직접 입력" 으로 시작 → 점차 마스터화 OK?
- [x] **공종 enum 14개 확정** (owner 승인): 접속(12C이하)·접속(12C초과)·성단접속·성단작업·함체작업(주간)·함체작업(야간)·중간분기함체(기설)·중간분기함체(신설)·단자함설치·국사패치·IJP신설·고위험(함체)·신호수·기타. **"기타" 유지 결정**
- [ ] **접속코어수 자동계산** = 표시만, DB 저장 안 함. 엑셀 출력 시 server 재계산. 이게 맞나? (혹시 코어수도 DB 에 redundant 저장해서 빠른 집계가 필요한가?)

> 6번 (외선일보 별도 entity v2) · 7번 (국사·함체 마스터 v2) 은 후속 약속으로 표기됨.

위 10개 확인되면 마이그레이션·구현 들어갑니다.
