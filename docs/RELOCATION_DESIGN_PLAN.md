# 지장이설 자동화 설계서 (M-Relocation, v0.1)

> 작성: 2026-05-19 · 상태: **owner 검토 대기**
> 본 문서는 owner 와의 누적 합의 사항을 정리한 사양서 v0.1.
> 코드 진입 전 검토·수정 → v1.0 확정 → 마이그·구현.

## 1. 한 줄 요약

LGU+ 협력사로서 지장이설(기설 광케이블의 새 경로 재시공) 의 **코어구성도·직선도 설계를 웹에서 처리**한다. 설계자가 현장 답사 결과(시설·케이블)를 입력하면, 시스템이 **기설 코어 보존을 최우선으로 자동 코어 배정 + 검증 + 차수 분할 + 시각화 (SVG)** 까지 처리한다. 현재 엑셀에 도형 손그리기로 하는 작업을 0으로 수렴시키는 게 목표.

기존 `works`·접속일보(`connection_reports`) 모듈과는 **완전 독립된 별도 entity** 로 구성한다 (Q3 답변).

## 2. 결정사항 표 (owner 답변 종합)

### 2-1. 도메인 룰
| 항목 | 결정 | 근거 |
|---|---|---|
| **데이터 출처** | LGU+ 전용 DB 다운로드 (가입자·기설 코어·시설·회선) | Q1·Q5·Q14 |
| **파일 형식** | 엑셀 파일. 다운받은 파일을 시스템에 업로드 | Q19 |
| **연결 정보** | 기설 데이터에 케이블 from-to 시설 정보 **포함** → 다이버시티·경로 추적 자동 검증 가능 | Q8 |
| **케이블 ID — 기설** | LGU+ DB 가 제공하는 케이블ID 그대로 사용 (`relocation_cables.cable_code`) | v0.6 |
| **케이블 ID — 신설** | 시스템이 등록 시점에 임의 ID 자동 생성. 형식: `NEW-{프로젝트단축코드}-{6자리순번}` (예: `NEW-A1B2-000001`). 설계자 수정 가능 | v0.6 |
| **코어 범위 중복 금지** | 같은 케이블 안에서 코어 범위가 겹치는 배정 불가 — DB 제약(exclusion constraint) + 클라이언트 검증 이중 안전망 | v0.6 |
| **자동 배정 결과 수정** | 시스템이 자동 배정한 코어 번호를 설계자가 인라인으로 수정 가능. 수정 시 중복 검증 즉시 적용 | v0.6 |
| **시설별 공종 수량** | 모든 접속함체·종단에 공종+수량 입력 (예: 함체작업(야간)×1, 접속(12C이하)×2). 차수 알고리즘의 입력 | v0.6 |
| **공종 마스터 확장** | 회사 단위 공종 마스터 (`relocation_task_type_master`). 시드 14종 + **설계자가 자유 추가** (이름·표준시간·단위) | v0.7 |
| **국사 내부 분기** | 국사·하위국도 분기 노드. 국사 내부 MOFD·OJC·장비도 별도 시설로 등록 후 케이블/점프코드 연결. **시설 종류 확장** + `parent_facility_id` 로 국사에 그룹화 | v0.7 |
| **RN 내부 접속만** | 1·2·3차 RN 스플리터에서 외부 분기 없이 내부 접속만 하는 경우 = 출력 포트 미배정 상태로 두고, splitter 의 `work_mode='내부접속만'` 으로 표시 | v0.7 |
| **통신사** | LGU+ 고정. 통신사 컬럼 없음 | 도메인 |
| **코어 매핑 기준** | **기설 코어ID 보존이 최우선**. 신설은 빈 코어 중 앞부분부터 | Q1·Q11 |
| **다이버시티 식별** | (a) 1차 RN 입력 2 코어 = 자동 다이버시티 (b) 회선 분류 라벨로도 식별 | Q6 |
| **분리 수준** | 케이블 + 함체 둘 다 분리 (다이버시티 회선) | round-add |
| **분리 단위** | 1 코어씩 또는 2 코어씩 (회선마다 다름) | round-add |

### 2-2. 케이블·함체 물리 제약
| 항목 | 값 | 비고 |
|---|---|---|
| **케이블 길이·거리** | **시스템 고려 안 함** — 설계자 판단 (v0.5) | 1드럼 최대 2,000m 는 도메인 지식으로만 보존 |
| **GPS 좌표** | **시스템 미사용** (v0.5) | 캔버스 좌표만 사용 |
| **함체 종류** | 가공형 / 관로형 | 추가답변 |
| **함체별 케이블 수용 한도** | 12C/36C/72C 함체: **6 조** / 144C·288C 함체: **8 조** | round-add |
| **함체별 접속 코어 한도** | 12C/36C: 48C / 72C: 144C / 144C: 288C / 288C: 576C | round-add |
| **함체 신설 시 분기 한도** | **4 조 초과 금지** (설계자 판단으로 승인 가능) | Q18 |
| **함체 규격 권장 룰** | 케이블 규격보다 **한 단계 위** (기본 추천) | round-add |
| **함체 규격 최종 결정** | **설계자 확정** (시스템은 추천만) | Q12 |

### 2-3. 케이블 유니트·여장판
| 케이블 규격 | 유니트 크기 | 유니트 수 |
|---|---|---|
| 12C | 12 C | 1 |
| 36C | 12 C | 3 |
| 72C | 12 C | 6 |
| 144C | **24 C** | 6 |
| 288C | **48 C** | 6 |
| 576C | (TBD) | (TBD) |

| 함체 규격 | 여장판 1매 수용 |
|---|---|
| 12C/36C/72C 함체 | 36 C |
| 144C 함체 | 48 C |
| 288C 함체 | 72 C |

### 2-4. 1차 RN 스플리터
| 종류 | 입력 | 출력 | 비고 |
|---|---|---|---|
| `2:8` | 2 코어 | 8 포트 | 입력 2 코어는 자동 다이버시티 |
| `2:16` | 2 코어 | 16 포트 | 〃 |
| `1:2:8:4` | TBD | TBD | **owner 추가 설명 필요 (§ 9-1)** |
| `1:3:8:4` | TBD | TBD | 〃 |

2차·3차 RN 도 존재 — 1차 RN 의 출력 포트가 또 다른 스플리터로 가는 다단 구조 (Q14).

### 2-5. 작업 차수·시간 모델
| 항목 | 값 |
|---|---|
| **작업 가능 시간대** | 02:00 ~ 05:00 (3 시간 = 180 분) |
| **팀 구성** | 2 인 1 조 (작업자 1 + 신호수 1, **분리 불가**) |
| **차수당 팀 수** | 기본 2 팀, 복잡 시 3 팀, 최대 4 팀 (팀 수 증가 시 효율↓) |
| **연속 코어 접속 시간** | 3 분 / 코어 |
| **비연속 코어 접속 시간** | 8 분 / 코어 |
| **함체 신설 시간** | + 20 분 / 함체 |
| **최적화 목표** | 팀 수 최소화 우선, 차수 수 최소화 차순위 |
| **양쪽 동시작업 페어링** | 케이블 절체는 양쪽 끝 동시 작업. **각 작업자는 짝 작업자의 함체명 + 그쪽 같은 회선 코어 번호를 사전 인지** 필요 (오접속·오절단 사고 방지) |
| **작업자 간 교신** | 휴대폰 통화. 시스템 내 무전·인터컴 기능 없음 — 짝 작업자의 휴대폰 번호를 작업 지시서에 표시 |
| **작업 지시서 출력** | 차수 확정 후 작업자별 1매. 본인 정보 + 짝 작업자 정보·연락처 + 회선 식별자 + 안전 체크리스트 |
| **개인정보 노출 범위** | 작업 지시서는 **제한된 범위만** — 회선번호·설치장소명까지. 가입자 ID·연락처·계약 정보는 표시 안 함 |
| **사고 대응** | 본 모듈 범위 **외**. 잘못 절단·오접속 등의 대응 흐름은 시스템에 포함하지 않음 |

### 2-6. 시스템 통합·UI
| 항목 | 결정 |
|---|---|
| **`works` 연계** | 완전 독립 (Q3). 별도 메뉴 진입 |
| **권한 제한** | 없음 (회사 전체 접근) |
| **모바일 지원** | 설계 화면 = 데스크톱 전용. **완료된 설계 보기는 모바일 허용** (v0.8) |
| **시각화 출력** | SVG (Phase 3), 엑셀 자동출력은 후순위 (Phase 4, nice-to-have) |
| **노란색 마크** | 의미 미상 — 무시·보존 (`is_marked` 플래그) |
| **객체 번호 부여** | 모든 시설에 자동 번호 부여 — 종류별 prefix (예: S-001 국사 / B-001 함체 / C-001 가입자 / M-001 MOFD / O-001 OJC). 좌측 패널에서 번호별 정렬·검색 (v0.8) |

### 2-7. 이전(Migration) 워크플로우 (v0.9, 핵심 추가)

**문제**: 회선 경로가 확정 안 된 상태에서 "어느 회선을 어느 새 케이블에 수용할지" 결정하기 어렵다.
**해결**: 기설 상태를 먼저 임포트한 뒤, 변경 마킹 → 영향 회선 자동 추출 → 일괄 이전 작업.

| 항목 | 결정 |
|---|---|
| **임포트 데이터 단위** | 1 코어 1 행 매핑 (Q1). LGU+ DB 가 회선↔케이블↔코어 매핑까지 제공 → 시스템이 영향 회선을 자동 추출 |
| **이전 매핑 방식** | 옛 케이블 → 새 케이블 **N:M 분할 일반화** (Q2). 한 옛 케이블의 N 회선이 M 개 새 케이블에 자유롭게 쪼개짐 |
| **결재·승인** | 없음 (Q3). 설계자가 직접 확정. 미리보기만 제공 |
| **이전 audit** | `relocation_migrations` (옛 케이블 → 새 케이블 단위) + `relocation_migration_circuits` (실제 이동한 회선들) 로 이력 보존 |
| **워크플로우 순서** | ① 기설 임포트 → ② 변경 마킹(철거/이설) → ③ 영향 회선 자동 추출 → ④ 이전 액션(회선 그룹 → 새 케이블) → ⑤ 자동 코어 배정 → ⑥ 검증·차수 |

## 3. 도메인 용어 정의

| 용어 | 의미 |
|---|---|
| **지장이설** | 기 시설된 광케이블의 경로 변경. 도시 개발·도로 공사 등으로 인해 발생. 단순/일반/원인자 구분 (LGU+ 분류) |
| **코어ID** | 케이블 안 각 코어(섬유)의 고유 식별자. **설계의 기본 단위** |
| **회선번호** | 가입자 서비스 단위 식별자. 1 코어 회선 / 2 코어 회선 / 이원화 회선 분류 |
| **이원화 회선 (다이버시티)** | 동일 가입자/서비스의 보호 회선. 케이블·함체 모두 물리적 분리 필수 |
| **유니트 (Unit)** | 케이블 안 코어 묶음 단위. 같은 유니트 코어는 같은 색·같은 묶음. 접속 시 같은 여장판 사용 권장 |
| **여장판 (Splice Tray)** | 함체 내부의 접속 작업판. 함체에 여러 매 들어있음. 같은 여장판 안 접속이 작업 효율적 |
| **RN (Residential Network)** | 가입자망 분기 구조. 1차 RN = 함체 내장 스플리터. 입력 2 (다이버시티) → 출력 N 분배 |
| **1차 RN / 2차 RN / 3차 RN** | 스플리터 계층. 1차 출력이 또 분기되면 2차, 그 다음이 3차 |
| **함체 (Closure)** | 케이블 접속·분기 함체. **가공형** (전주 매달림) / **관로형** (지하) |
| **드랍 케이블** | 가입자단 최종 인입 케이블. 1C / 2C |
| **차수** | 새벽 02~05시 작업을 여러 날로 나눠 시공하는 단위. 차수마다 의존성·동시작업팀 산출 |
| **절체 작업** | 코어를 옛 경로에서 새 경로로 옮겨붙이는 작업 (지장이설의 핵심) |
| **신호수** | 작업자와 함께 2 인 1 조로 일하는 안전 감시 인원. 분리 불가 |

## 4. 외부 의존성 — LGU+ DB

설계 시 LGU+ 의 전용 DB 에서 4 종 데이터를 다운로드(엑셀) 받아 시스템에 업로드한다.

| 데이터셋 | 내용 | 용도 |
|---|---|---|
| **시설 마스터** | 국사·함체·맨홀·가입자 시설의 명칭·위치·종류 | 코어구성도의 노드 |
| **기설 케이블** | from 시설 → to 시설, 케이블 규격, 식별자, 길이 | 코어구성도의 엣지 |
| **기설 코어 사용 현황** | 케이블별 코어ID·사용 회선·가입자 | 자동 코어 배정 시 회피 대상 |
| **회선 마스터** | 회선번호·가입자(설치장소명)·1/2코어/이원화 분류 | 신설 회선 입력 시 참조 |

> **참고**: 첨부 분석본 `samples/코아구성도_수정용_170905.xlsx` 의 도형 텍스트 라벨이 모두 이 DB 에서 다운로드된 데이터다. 즉 그 파일의 라벨 포맷이 사실상의 LGU+ 표준 출력 형식.

### 4-1. 임포터 정책 (Phase 5)
- 사용자가 엑셀 파일 업로드 → 시트별 자동 파싱
- 시설·케이블·코어 사용 row 단위로 우리 DB 에 임시 적재
- 변경된 row 와 신규 row 만 적용 (diff 임포트)
- 파싱 실패 row 는 별도 표시 → 사람 보정

## 5. 데이터 모델

### 5-1. 신규 enum

```sql
create type public.relocation_closure_type as enum (
  '국사', '맨홀', '함체_가공형', '함체_관로형', '가입자시설',
  -- v0.7: 국사 내부 토폴로지 (parent_facility_id 로 국사에 그룹화)
  'MOFD', 'OJC', '국사내장비'
);

create type public.relocation_splitter_work_mode as enum (
  '분기',           -- 출력 포트가 외부 가입자/시설로 연결됨
  '내부접속만'      -- 외부 분기 없음 — 함체 내부 접속 작업만 (v0.7)
);

create type public.relocation_cable_status as enum (
  'existing',     -- 기설 (이번 작업 영향 없음)
  'relocating',   -- 기설 이설 (경로 변경)
  'new',          -- 신설
  'removing'      -- 철거
);

create type public.relocation_core_lifecycle as enum (
  'preexisting',  -- 기설 그대로 유지 (회피 대상)
  'relocating',   -- 이번 작업으로 재배정
  'new'           -- 이번 작업으로 신규 추가
);

create type public.relocation_circuit_kind as enum (
  '1코어', '2코어', '이원화_1코어씩', '이원화_2코어씩'
);

create type public.relocation_circuit_status as enum (
  'OK', 'ER', '확인', '해지'
);

create type public.relocation_splitter_type as enum (
  '2:8', '2:16', '1:2:8:4', '1:3:8:4'
  -- 추가는 마이그
);

create type public.relocation_phase_task_kind as enum (
  '함체신설_절단', '기설접속', '코어재배정', '제거'
);

create type public.relocation_phase_status as enum (
  '계획', '확정', '진행중', '완료', '취소'
);
```

### 5-2. 핵심 테이블

#### `relocation_projects` — 지장이설 프로젝트 단위
```sql
create table public.relocation_projects (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  title         text not null,
  client        text default 'LGU+',
  region        text,                 -- '서울 중구' 등
  surveyed_at   date,                 -- 현장답사일
  designer_id   uuid references public.employees(id),
  status        text default '설계중',
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
```

#### `relocation_facilities` — 시설 노드 (국사·함체·맨홀·가입자)
```sql
create table public.relocation_facilities (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.relocation_projects(id) on delete cascade,
  master_facility_id  uuid references public.connection_facilities(id),  -- 회사 마스터 FK (선택)
  parent_facility_id  uuid references public.relocation_facilities(id),  -- v0.7: 국사 내부 노드(MOFD/OJC/장비) 의 부모
  closure_type        relocation_closure_type not null,
  seq_no              integer not null,                                    -- v0.8: 프로젝트 내 종류별 1부터 자동 증가
  display_code        text generated always as                              -- v0.8: 'S-001' 같은 표시용 코드 (앱에서 조립)
    (null) stored,                                                          -- ※ 실제 생성은 server action 에서 closure_type+seq_no 로 조립
  name                text not null,         -- '필동간이국사', '0025A 79M3#1', '필동2가 동국대...' 등
  install_address     text,                  -- 설치장소명 (가입자)
  closure_spec        public.cable_spec,     -- 함체 규격 (가입자·국사·MOFD·OJC·장비는 null 가능)
  x_hint              integer,               -- 다이어그램 캔버스 X 좌표 (px)
  y_hint              integer,               -- 다이어그램 캔버스 Y 좌표 (px)
  is_marked           boolean default false, -- 노란색 마크 보존 (의미 미상)
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- v0.7: parent 는 국사여야 함 (MOFD/OJC/장비 → 국사)
  check (parent_facility_id is null or closure_type in ('MOFD', 'OJC', '국사내장비')),
  -- v0.8: 종류별 번호는 프로젝트 내 unique
  unique (project_id, closure_type, seq_no)
);

-- v0.8: 시설 번호 자동 부여용 시퀀스 (프로젝트 × 종류 별 카운터)
create table public.relocation_facility_seq (
  project_id    uuid not null references public.relocation_projects(id) on delete cascade,
  closure_type  relocation_closure_type not null,
  last_seq      integer not null default 0,
  primary key (project_id, closure_type)
);

create index relocation_facilities_parent_idx
  on public.relocation_facilities(parent_facility_id) where parent_facility_id is not null;

-- 주: GPS(lat/lng) 컬럼은 v0.5 사양에서 제외. 캔버스 좌표만 사용.
-- 주: parent_facility_id 는 국사 내부 분기 표현용 (v0.7). 평면 그래프 + 그룹 박스 시각화.

create index relocation_facilities_project_idx
  on public.relocation_facilities(project_id);
```

#### `relocation_cables` — 케이블 구간
```sql
create table public.relocation_cables (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.relocation_projects(id) on delete cascade,
  from_facility_id   uuid not null references public.relocation_facilities(id),
  to_facility_id     uuid not null references public.relocation_facilities(id),
  spec               public.cable_spec not null,
  status             relocation_cable_status not null default 'new',
  cable_code         text not null,         -- 기설: LGU+ 제공. 신설: 자동 생성 (NEW-XXXX-NNNNNN). 회사 내 unique
  route_type         text,                  -- '가공' / '지중' / '관로'
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (project_id, cable_code)
);

-- 신설 케이블 ID 자동 생성용 시퀀스 (project 별 카운터)
create table public.relocation_cable_seq (
  project_id  uuid primary key references public.relocation_projects(id) on delete cascade,
  last_seq    integer not null default 0
);

-- 주: length_m 컬럼·CHECK 제약 제거 (v0.5). 케이블 거리는 설계자 판단 영역.

create index relocation_cables_project_idx on public.relocation_cables(project_id);
create index relocation_cables_from_idx on public.relocation_cables(from_facility_id);
create index relocation_cables_to_idx on public.relocation_cables(to_facility_id);
```

#### `relocation_circuits` — 회선 마스터
```sql
create table public.relocation_circuits (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.relocation_projects(id) on delete cascade,
  circuit_id      text not null,           -- LGU+ 회선번호 (5632751 등)
  subscriber_name text,                    -- 설치장소명
  kind            relocation_circuit_kind not null,
  status          relocation_circuit_status not null default 'OK',
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (project_id, circuit_id)
);
```

#### `relocation_core_assignments` — 코어 배정 (직선도의 본체)
```sql
create table public.relocation_core_assignments (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.relocation_projects(id) on delete cascade,
  circuit_id          uuid references public.relocation_circuits(id) on delete cascade,
  segment_idx         smallint not null default 0,  -- 다이버시티 회선의 짝 번호 (0,1)
  cable_id            uuid not null references public.relocation_cables(id),
  core_range_start    smallint not null,
  core_range_end      smallint not null,
  lifecycle           relocation_core_lifecycle not null default 'new',
  status              relocation_circuit_status,
  paired_assignment_id uuid references public.relocation_core_assignments(id),  -- 다이버시티 짝
  is_auto_assigned    boolean default false,        -- true: 자동 배정 결과 / false: 사람 직접 입력 또는 수정
  notes               text,
  created_at          timestamptz not null default now(),
  check (core_range_start <= core_range_end),
  check (core_range_start >= 1)
);

-- 동일 케이블 안에서 코어 범위 중복 금지 (v0.6)
-- btree_gist extension 필요. int4range half-open [start, end+1)
create extension if not exists btree_gist;
alter table public.relocation_core_assignments
  add constraint relocation_core_no_overlap
  exclude using gist (
    cable_id with =,
    int4range(core_range_start, core_range_end + 1) with &&
  );

create index relocation_core_proj_idx
  on public.relocation_core_assignments(project_id);
create index relocation_core_cable_idx
  on public.relocation_core_assignments(cable_id);
```

#### `relocation_splices` — 함체 내 접속 매핑 (in 케이블 코어 ↔ out 케이블 코어)
```sql
create table public.relocation_splices (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.relocation_projects(id) on delete cascade,
  facility_id     uuid not null references public.relocation_facilities(id),
  in_cable_id     uuid not null references public.relocation_cables(id),
  in_core         smallint not null,
  out_cable_id    uuid not null references public.relocation_cables(id),
  out_core        smallint not null,
  tray_index      smallint,                -- 자동 계산 + 사람 override
  is_continuous   boolean default true,    -- 양쪽 모두 연속 코어인가 (시간 산출용)
  notes           text,
  created_at      timestamptz not null default now()
);

-- v0.7: 공종 마스터 (회사 단위. 시드 14종 + 설계자 자유 추가)
-- M3 접속일보의 connection_task_type enum 은 그대로 두고, relocation 전용 마스터 신설
create table public.relocation_task_type_master (
  id                       uuid primary key default gen_random_uuid(),
  company_id               uuid not null references public.companies(id) on delete cascade,
  name                     text not null,                          -- '함체작업(야간)', 'OJC 접속' 등
  standard_minutes_per_unit numeric(6,2) not null default 0,       -- 단위당 표준 시간(분)
  unit_label               text not null default '개',             -- '개', '코어', '쌍' 등
  is_active                boolean not null default true,
  is_seed                  boolean not null default false,         -- 시드 14종은 true
  position                 smallint not null default 0,            -- 표시 순서
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (company_id, name)
);

create index relocation_task_type_master_company_idx
  on public.relocation_task_type_master(company_id) where is_active = true;

-- 시드 14종 (회사 생성 시 자동 insert 또는 migration 에서 일괄)
-- 함체작업(주간) 20분/개·함체작업(야간) 20분/개·접속(12C이하) 3분/코어·접속(12C초과) 8분/코어 등

-- v0.9: 이전(migration) 작업 단위 — 옛 케이블 → 새 케이블 그룹핑 audit
create table public.relocation_migrations (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.relocation_projects(id) on delete cascade,
  from_cable_id uuid not null references public.relocation_cables(id),     -- 옛 케이블 (철거·이설)
  to_cable_id   uuid not null references public.relocation_cables(id),     -- 새 케이블 (신설)
  notes         text,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.employees(id),
  unique (project_id, from_cable_id, to_cable_id)
);

-- 한 migration 안에 실제 옮긴 회선들
create table public.relocation_migration_circuits (
  migration_id uuid not null references public.relocation_migrations(id) on delete cascade,
  circuit_id   uuid not null references public.relocation_circuits(id) on delete cascade,
  segment_idx  smallint not null default 0,  -- 이원화 회선의 짝 번호
  primary key (migration_id, circuit_id, segment_idx)
);

-- 시설별 공종 수량 (접속함체·종단별. 모든 작업 발생 시설마다 입력) — v0.6 → v0.7 으로 task_type 변경
-- 차수 시간 산출의 입력.
create table public.relocation_facility_tasks (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.relocation_projects(id) on delete cascade,
  facility_id   uuid not null references public.relocation_facilities(id) on delete cascade,
  task_type_id  uuid not null references public.relocation_task_type_master(id),   -- v0.7: FK 로 변경
  quantity      smallint not null default 1,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (facility_id, task_type_id),
  check (quantity >= 1)
);

create index relocation_facility_tasks_facility_idx
  on public.relocation_facility_tasks(facility_id);
```

#### `relocation_splitters` — 1차 RN 스플리터
```sql
create table public.relocation_splitters (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.relocation_projects(id) on delete cascade,
  facility_id       uuid not null references public.relocation_facilities(id),
  splitter_type     relocation_splitter_type not null,
  -- 입력단 (다이버시티)
  input_a_cable_id  uuid references public.relocation_cables(id),
  input_a_core      smallint,
  input_b_cable_id  uuid references public.relocation_cables(id),
  input_b_core      smallint,
  -- v0.7: 외부 분기 vs 내부 접속만
  work_mode         relocation_splitter_work_mode not null default '분기',
  -- 출력 포트는 별도 테이블로 분리
  notes             text,
  created_at        timestamptz not null default now()
);

create table public.relocation_splitter_ports (
  splitter_id       uuid not null references public.relocation_splitters(id) on delete cascade,
  port_index        smallint not null,                -- 1~16
  subscriber_circuit_id uuid references public.relocation_circuits(id),
  drop_cable_id     uuid references public.relocation_cables(id),
  primary key (splitter_id, port_index)
);
```

> 2차·3차 RN 은 v1.1 에서 추가. 1차 출력 포트가 또 다른 스플리터의 입력으로 연결되는 self-referential 구조.

#### `relocation_phases` — 차수
```sql
create table public.relocation_phases (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.relocation_projects(id) on delete cascade,
  phase_no           smallint not null,
  planned_at         date,                          -- 시공 예정일
  window_start       time default '02:00',
  window_end         time default '05:00',
  required_teams     smallint not null default 2,
  estimated_minutes  integer,                       -- 자동 계산값 (캐시)
  status             relocation_phase_status not null default '계획',
  notes              text,
  unique (project_id, phase_no)
);

create table public.relocation_phase_tasks (
  id                 uuid primary key default gen_random_uuid(),
  phase_id           uuid not null references public.relocation_phases(id) on delete cascade,
  facility_id        uuid not null references public.relocation_facilities(id),
  task_kind          relocation_phase_task_kind not null,
  cores_continuous   smallint default 0,            -- 연속 코어 수
  cores_noncontinuous smallint default 0,           -- 비연속 코어 수
  estimated_minutes  integer,
  depends_on_task_ids uuid[],                       -- 의존성 (선후관계)
  simultaneity_group text,                          -- 동시작업 그룹 키 (양쪽 짝)
  assigned_team_no   smallint,                      -- 1~4 (어느 팀이 맡나)
  notes              text
);

-- 짝 작업 페어링 — 한 회선의 양쪽 끝이 어느 task 인지 명시
create table public.relocation_task_pairs (
  id                  uuid primary key default gen_random_uuid(),
  phase_id            uuid not null references public.relocation_phases(id) on delete cascade,
  circuit_id          uuid not null references public.relocation_circuits(id),
  task_a_id           uuid not null references public.relocation_phase_tasks(id),
  task_a_cable_id     uuid not null references public.relocation_cables(id),
  task_a_core         smallint not null,
  task_b_id           uuid not null references public.relocation_phase_tasks(id),
  task_b_cable_id     uuid not null references public.relocation_cables(id),
  task_b_core         smallint not null,
  notes               text,
  unique (phase_id, circuit_id, task_a_id, task_b_id)
);

create index relocation_task_pairs_phase_idx on public.relocation_task_pairs(phase_id);
```

### 5-3. RLS 정책 요약

권한 제한 없음 (Q-권한) — 단 회사 스코프는 유지.

```sql
-- 예: relocation_projects
create policy relocation_projects_select on public.relocation_projects
  for select using (company_id = public.current_employee_company());

create policy relocation_projects_all on public.relocation_projects
  for all using (company_id = public.current_employee_company())
        with check (company_id = public.current_employee_company());
```

다른 테이블도 `project_id → relocation_projects.company_id` 체인으로 동일.

## 6. 자동화 로직 명세

### 6-1. 자동 코어 배정 알고리즘

**입력**: 새 회선 1개 (가입자·1코어/2코어/이원화 여부·시설 from-to)
**처리**:
1. 출발 → 도착 경로상의 모든 케이블 리스트업
2. 각 케이블에서 가용한 코어 페어 검색
   - `relocation_core_assignments.lifecycle='preexisting'` 코어는 제외 (회피 대상)
   - 기설 코어ID 보존이 최우선 (Q11)
   - **동일 케이블 내 이미 배정된 코어 범위와 겹치지 않음** (DB exclusion constraint + 사전 검색)
3. 후보 페어 점수 계산:
   - 낮은 코어 번호 선호 (LGU+ 관습)
   - 같은 유니트 안 코어 페어 가산점
   - 함체에서 같은 여장판 사용 가능 시 가산점
   - 이원화 회선은 두 페어를 각각 다른 케이블·다른 함체 경로로
4. 최고 점수 페어 자동 선택 → `is_auto_assigned=true` 로 저장
5. **사람이 인라인 수정 가능** — 코어배정 탭에서 row 인라인 편집
   - 수정 시 `is_auto_assigned=false` 로 전환
   - 코어 범위 중복 즉시 검증 (클라이언트 + DB exclusion 제약)
   - 수정 후 영향받는 splice·차수 자동 재계산

**구현 위치**: `src/lib/relocation/auto-assign.ts`

### 6-2. 자동 검증 룰

| 코드 | 룰 | 위반 시 |
|---|---|---|
| **C1** | 함체에 연결된 케이블 수 ≤ `max_cables` | 빨강. 함체 분할 제안 |
| **C2** | 함체 안 총 접속 코어수 ≤ `max_splice_cores` | 빨강. 함체 규격 상향 제안 |
| **C3** | 함체 신설 분기 ≤ 4 조 | **노랑 (정보)**. 설계자 판단 |
| **S1** | 함체 규격 ≥ 케이블 규격 한 단계 위 | 노랑. 상향 제안 |
| **U1** | 한 함체 안 접속이 같은 유니트끼리 모이는지 | 노랑. 코어 재배정 제안 |
| **U2** | 한 함체 안 접속이 여장판 1매에 들어가는지 | 노랑. 코어 재배정 제안 |
| **R1** | 1차 RN 입력 2 코어가 서로 다른 케이블·다른 함체 경로 | 빨강 (다이버시티 위반) |
| **D1** | 이원화 회선의 두 세그먼트가 다른 케이블 사용 | 빨강 |
| **D2** | 이원화 회선의 두 세그먼트가 통과 함체 교집합 없음 | 빨강 |
| **E1** | `lifecycle='preexisting'` 코어를 다른 회선이 덮어쓰지 않음 | 빨강 (기설 보존 위반) |
| **O1** | 동일 케이블 내 코어 범위 중복 금지 (v0.6) | DB 제약으로 차단 + 클라이언트 빨강 즉시 알림 |
| **T1** | 작업 발생 시설에 공종 수량 1건 이상 입력됨 (v0.6) | 노랑. 차수 시간 산출 정확도 저하 경고 |

검증 결과는 화면 우하단 패널에 누적 표시. 빨강·노랑 카운트.

### 6-3. 차수 자동 분할 알고리즘

**입력**: 프로젝트의 모든 절체 작업 노드
**처리**:
```
1. 각 노드의 task_kind·코어수·연속여부 파악
2. 작업시간 산출:
     time = (kind='함체신설_절단' ? 20 : 0)
          + cores_continuous × 3
          + cores_noncontinuous × 8
3. 동시작업 페어링 생성 (가장 중요):
     - 같은 케이블의 양쪽 끝 작업 → 동일 simultaneity_group
     - 같은 회선의 in-cable·out-cable 양쪽 작업 → 동일 group
     - 한 코어가 여러 곳 분기되면 N:N group (반대편 작업자가 다수)
4. 의존성 그래프 생성 (DAG)
     - simultaneity_group 내 task 들은 같은 차수의 같은 시점
     - 새 함체 신설 → 후속 절체 (다른 차수 OK)
5. 2 팀 가정으로 그리디 패킹:
     - 차수당 가용 = 2 × 180 = 360 분
     - 의존성 + 동시작업 그룹 만족하면서 360 분 안에 묶기
6. 못 묶이는 노드 발생 시 3 팀으로 재시도
7. 3 팀도 실패 시 4 팀
8. 4 팀도 실패 시 차수 추가
9. 차수 확정 후 relocation_task_pairs 자동 생성
     - 각 회선의 양쪽 task 를 페어로 묶고 cable·코어 명시
10. 결과: 차수 수 최소화 + 팀 수 최소화 (다목적 최적화)
```

**복잡도 점수** (3 팀 vs 2 팀 의사결정용):
- 동시 작업 필요 분기 수 ≥ 3 → 복잡
- 케이블 절단 노드 수 ≥ 2 → 복잡

**구현 위치**: `src/lib/relocation/phase-planner.ts`

### 6-4. 작업 지시서 자동 생성 (신규)

차수가 확정되면 **작업자 단위 작업 지시서** 자동 생성. 새벽 02~05시 현장에서 작업자가 들고 다닐 문서.

**1매 지시서 구성**:
```
┌──────────────────────────────────────────────────────────────┐
│ 작업 지시서                          차수 #3 · 2026-05-22 새벽 │
│ ──────────────────────────────────────────────────────────── │
│ ▣ 본인 정보                                                  │
│   팀 번호: 2팀                                               │
│   작업자: 홍길동 (작업)  /  김철수 (신호수)                  │
│   작업 함체: 중구 0025A 79M3#1 (가공형)                      │
│   작업 시각: 02:00 ~ 02:45  (예상 45분)                       │
│ ──────────────────────────────────────────────────────────── │
│ ▣ 작업 내역                                                  │
│   ① 회선 5632751 (설치장소: 필동 충무영상센터)               │
│      본인측: 케이블-A 코어 5,6 (연속)                        │
│      짝 작업: 1팀 / 함체 중구 0025A 79M2#1 / 케이블-B 코어 25,26 │
│   ② 회선 5680650 ...                                         │
│ ──────────────────────────────────────────────────────────── │
│ ▣ 짝 팀 연락처                                               │
│   1팀: 010-XXXX-XXXX (이순신 작업자)                         │
│ ──────────────────────────────────────────────────────────── │
│ ▣ 안전 체크리스트                                            │
│   □ 작업 전 짝 팀과 휴대폰 통화 확인                          │
│   □ 절체 전 회선번호·코어번호 양쪽 일치 확인                 │
│   □ 작업 완료 후 짝 팀에 완료 통보                           │
└──────────────────────────────────────────────────────────────┘
```

**노출 정보 정책**:
- 표시 OK: 회선번호, 설치장소명, 시설명, 케이블 식별자, 코어 번호, 짝 작업자 휴대폰
- 표시 X: 가입자 ID, 가입자 연락처, 계약 정보, 그 외 LGU+ DB 의 민감 식별자
- 시스템 DB 에는 다 저장하되 **지시서 렌더링 단계에서 필터링**

**출력 형식**:
- 화면: HTML 페이지 (`/relocation/<id>/phases/<phase_no>/instructions/<team_no>`)
- 인쇄: 브라우저 인쇄 기능 (A4 1장 / 작업자)
- (옵션) PDF 다운로드 — Phase 4 이후 추가

**구현 위치**: `src/app/relocation/[id]/phases/[phaseNo]/instructions/[teamNo]/page.tsx`

### 6-5. 시각화 (Phase 3)

**SVG 자동 생성**:
- 트리 토폴로지: 상위국 → 함체 → 하위국 (좌→우 또는 위→아래)
- 노드별 메타: 케이블 수 카운트, 접속 코어수 카운트 (한도 대비 %)
- 케이블별 라벨: 규격·코어 사용 범위·유니트 경계
- 다이버시티 회선은 두 경로를 같은 색 점선·실선으로 구분
- 노란 마크 시설은 노랑 배경 유지
- 사람이 드래그로 좌표 조정 → `x_hint`/`y_hint` 저장

**직선도 SVG**:
- 함체별 in-cable / out-cable 매트릭스
- 여장판 단위로 그룹화 (다른 색 배경)
- 유니트 경계 점선

## 7. UI 흐름

### 7-1. 진입점
- 별도 탭/메뉴: `/relocation` (works 무관, Q3 답변)
- 권한 제한 없이 회사 전체

### 7-2. 화면 구성 (와이어프레임)

```
┌─────────────────────────────────────────────────────────────────────┐
│ [지장이설] /relocation/<project_id>                       [⚙ 설정]   │
├─────────────────────────────────────────────────────────────────────┤
│ 상단 탭:  시설 │ 케이블 │ 코어배정 │ 직선도 │ 차수 │ 검증 │ 내보내기 │
├──────────────┬───────────────────────────────────┬──────────────────┤
│ 좌측 패널    │ 메인 캔버스 (SVG)                  │ 우측 패널        │
│              │                                   │                  │
│ + 시설 추가   │     ┌───┐  ┌───┐                  │ 선택된 노드 속성  │
│ + LGU+ 임포트 │     │국사│──│함체│                  │                 │
│              │     └───┘  └───┘                  │ 이름: ...        │
│ 🔍 검색       │       │     │                     │ 번호: S-001      │
│              │     ┌──────────┐                  │ 종류: ...        │
│ ▼ 국사 (3)   │     │ 분기함체 │                  │ 활성 케이블 수    │
│  S-001 필동..│     └──────────┘                  │ 접속 코어수      │
│  S-002 0025A..│                                  │ ...              │
│  S-003 ...   │                                   │                  │
│ ▼ 함체 (24)  │                                   │                  │
│  B-001 ...   │                                   │                  │
│  B-002 ...   │                                   │                  │
│  ...         │                                   │                  │
│ ▶ 맨홀 (12)  │                                   │                  │
│ ▶ MOFD (2)   │                                   │                  │
│ ▶ OJC (1)    │                                   │                  │
│ ▶ 가입자 (87)│                                   │                  │
│              │                                   │                  │
├──────────────┴───────────────────────────────────┴──────────────────┤
│ 하단 검증 패널: 🔴 5건  🟡 12건   [상세 보기]                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 7-2-1. 좌측 패널 — 시설 번호 목록 (v0.8)

**번호 부여 규칙** (시설 추가 시 server action 자동 부여):
| 시설 종류 | Prefix | 예시 |
|---|---|---|
| 국사 | `S-` (Station) | S-001, S-002 |
| 함체(가공형) | `B-` (Box) | B-001 |
| 함체(관로형) | `B-` | B-024 |
| 맨홀 | `H-` (manHole) | H-005 |
| 가입자시설 | `C-` (Customer) | C-001~C-087 |
| MOFD | `M-` | M-001 |
| OJC | `O-` | O-001 |
| 국사내장비 | `E-` (Equipment) | E-001 |

- 종류별 카운터는 `relocation_facility_seq` 테이블에서 관리 (프로젝트 × 종류 별)
- 시설 등록 server action 에서 `last_seq + 1` 부여 + 카운터 증가 (트랜잭션)
- 시설 삭제 시 번호는 재사용 X (gap 가능)
- 사람이 표시 번호를 수동 변경 가능 — 단 같은 종류 안 unique 검증

**좌측 패널 동작**:
- 종류별 그룹으로 접기/펼치기
- 검색창에 입력하면 번호·이름 부분 매칭으로 실시간 필터
- 항목 클릭 → 캔버스 중심이 해당 노드로 부드럽게 이동 + 노드 하이라이트 + 우측 패널에 속성 자동 로드
- 항목 우클릭 → 컨텍스트 메뉴 (편집·삭제·연결할 케이블 만들기 등)
- 부모-자식 관계 (국사 → MOFD/OJC) 는 들여쓰기로 표시

탭별 화면:
- **시설**: 노드 등록·편집·삭제. LGU+ 임포트 진입점
- **케이블**: 두 시설을 연결. 규격·길이·상태 입력
- **코어배정**: 회선별 코어 페어 자동 배정 + 사람 확정
- **직선도**: 함체별 splice 매트릭스
- **차수**: 자동 분할 결과 + 사람 조정. 작업자별 **작업 지시서 출력** 진입
- **검증**: 모든 룰 위반 리스트
- **내보내기**: SVG·PNG·PDF·엑셀 (옵션)

### 7-3. 모바일 보기 정책 (v0.8 갱신)

본 모듈은 **설계·편집은 데스크톱 전용** 이지만, **완료된 설계의 읽기 전용 보기는 모바일/태블릿 허용**.

| 화면 | 데스크톱 | 모바일 |
|---|---|---|
| 프로젝트 목록·상세 | ✅ | ✅ 읽기 |
| 시설·케이블·회선·코어배정 (편집) | ✅ | ❌ 안내 메시지 |
| **시설·케이블·회선·코어배정 (보기)** | ✅ | **✅ 읽기 전용** |
| 코어구성도 캔버스 (SVG) | ✅ 편집·드래그 | ✅ pinch-zoom·pan 만 |
| 직선도 | ✅ 편집 | ✅ 읽기 |
| 차수 계획 (편집) | ✅ | ❌ |
| 차수 계획 (보기) | ✅ | ✅ |
| **작업 지시서** | ✅ 인쇄·PDF | **✅ 새벽 현장에서 사용** |
| 검증 결과 | ✅ | ✅ 읽기 |
| 공종 마스터 관리 | ✅ | ❌ |

**모바일 진입 시 동작**:
- URL 동일 (`/relocation/<id>/...`) — User-Agent + 화면 크기로 분기
- 편집용 액션 버튼·드래그 핸들 비표시
- 좌측 패널은 상단 토글 버튼으로 슬라이드인 (시설 번호 목록 검색은 모바일에서도 유효)
- 캔버스는 단순화 — 노드 라벨 폰트 크게, 줌 컨트롤 + 미니맵

**왜 보기는 허용하나** (v0.8):
- 협력사 직원이 현장에서 폰으로 "이 함체가 어디 연결돼 있나" 확인하는 일상이 흔함
- 작업 지시서뿐 아니라 코어배정·검증 결과도 폰으로 보고 싶을 때가 있음
- 편집은 화면 좁아서 불가능, 보기는 충분히 가능

### 7-4. (삭제) — § 7-3 으로 통합 (v0.8)

기존 § 7-4 는 § 7-3 으로 흡수됨. § 7-3 에서 모든 모바일 정책을 통합 관리.

### 7-5. 신설 시설·케이블 등록 워크플로우

신설 함체·케이블은 설계자가 수동 입력. 자동 생성은 하지 않되, **반복 입력 부담을 줄이는 폼·기본값·자동 보조** 를 제공.

#### 7-5-1. 신설 시설(함체·맨홀) 추가

**진입**: 좌측 패널 [+ 시설 추가] 버튼 → 풀스크린 모달

**입력 폼**:
```
┌────────────────────────────────────────────────────┐
│ 신설 시설 추가                              [닫기] │
├────────────────────────────────────────────────────┤
│ 종류 *      ○ 국사  ○ 함체(가공형)  ○ 함체(관로형)  │
│             ○ 맨홀  ○ 가입자시설                    │
│             ○ MOFD ○ OJC  ○ 국사내장비    (v0.7)    │
│                                                    │
│ 부모 국사   [드롭다운 ▼ 필동간이국사]    (v0.7)     │
│            (MOFD·OJC·국사내장비 선택 시만 활성화)   │
│            ※ 캔버스에서 부모 국사 박스 안에 표시    │
│                                                    │
│ 이름 *      [_____________________________]         │
│            예: 0025A 79M3#1, 필동간이국사 MOFD#1    │
│                                                    │
│ 함체 규격   [드롭다운 ▼ 144C]      (함체일 때만)    │
│            ※ 권장: 연결될 케이블 규격의 1단계 위    │
│            ※ 설계자가 최종 확정 (Q12)               │
│                                                    │
│ 설치 주소   [_____________________________]         │
│            (가입자시설일 때 = 설치장소명)           │
│                                                    │
│ 노트        [_____________________________]         │
│                                                    │
│             [취소]                    [저장]       │
└────────────────────────────────────────────────────┘
```

> v0.5 정리: 위치 입력에 GPS 좌표는 제외. 캔버스 좌표(`x_hint`/`y_hint`)만 사용 — 시설 저장 후 사람이 캔버스에서 드래그로 위치 조정.
> v0.7 정리: 국사 내부 토폴로지 — MOFD/OJC/국사내장비는 반드시 부모 국사를 가져야 함. 캔버스에선 부모 국사를 둘러싸는 그룹 박스로 시각 묶음. 케이블 연결은 평면 그래프 그대로 (국사 내·외부 구분 없음).

**저장 후 동작**:
- 캔버스에 자동 배치 (다른 노드와 겹치지 않게)
- 기설 시설은 회색·테두리 점선 / 신설은 진한 색·실선 (시각 구분)
- 우측 패널에 방금 만든 노드 자동 선택

#### 7-5-2. 신설 케이블 연결

**진입 방식 2가지** (둘 다 같은 모달):
- (A) 좌측 패널 [+ 케이블 추가] 버튼
- (B) 캔버스에서 시설 노드 우클릭 → "케이블 연결" → 대상 시설 클릭 → 모달 자동 오픈 (from/to 미리 채움)

**입력 폼**:
```
┌─────────────────────────────────────────────────────┐
│ 신설 케이블 추가                              [닫기] │
├─────────────────────────────────────────────────────┤
│ 출발 시설 * [검색·드롭다운 ▼ 필동간이국사]           │
│ 도착 시설 * [검색·드롭다운 ▼ 0025A 79M3#1]          │
│                                                     │
│ 규격 *      [드롭다운 ▼ 144C]                       │
│            보기: 1C·2C·12C·36C·72C·144C·288C        │
│            드랍: 1C(드랍)·2C(드랍)                  │
│                                                     │
│ 케이블 ID   [NEW-A1B2-000017]     [자동 생성됨]      │
│            ※ 신설은 자동 생성. 필요 시 수정 가능     │
│            ※ 기설은 LGU+ 제공 ID 그대로 입력          │
│                                                     │
│ 경로 종류    ○ 가공  ○ 지중  ○ 관로                  │
│                                                     │
│ 노트        [_____________________________]          │
│                                                     │
│             [취소]                    [저장]        │
└─────────────────────────────────────────────────────┘
```

> v0.5 정리: 케이블 거리(`length_m`) 필드 제거. 거리·1드럼 한도는 설계자가 현장 판단.
> v0.6 정리: `cable_code` 자동 생성. 신설 케이블 추가 시 `relocation_cable_seq.last_seq + 1` 로 카운터 증가 → `NEW-{프로젝트단축코드}-{6자리}` 표시. 사용자가 직접 입력하여 override 가능 (회사 내 unique 제약).

**저장 시 자동 검증** (거리·길이는 미검증):
- **함체 수용 한도 초과** (이 케이블이 추가되면 함체에 N+1조):
  ```
  ⚠ 0025A 79M3#1 함체에 케이블 7조가 됩니다 (한도 6조 초과).
     함체 규격을 144C → 288C 로 상향 검토 필요.
  ```
- **함체 접속 코어 한도 초과** (코어 배정 후 시점):
  ```
  ⚠ 함체 접속 코어 총합이 한도를 초과합니다. 규격 상향 검토.
  ```

#### 7-5-3. 캔버스 직접 조작

저장 후 캔버스에서 가능한 조작:
- **노드 드래그**: 위치 미세 조정 (`x_hint`/`y_hint` 갱신)
- **노드 더블클릭**: 편집 모달 재오픈
- **노드 우클릭 메뉴**: 케이블 연결 / 편집 / 삭제 / 코어 사용 현황 보기
- **케이블 클릭**: 선택 → 우측 패널에 속성 표시
- **케이블 우클릭**: 편집 / 삭제 / 코어 배정 화면으로 이동

#### 7-5-4. 함체 권장 규격 자동 표시

함체 규격 드롭다운 옆에 라이브 추천:
```
함체 규격: [144C ▼]   💡 추천: 144C (연결된 최대 케이블 72C 의 1단계 위)
```
- 함체에 연결된 케이블이 변경되면 추천도 라이브 갱신
- 추천과 다른 선택 시 노란 정보 아이콘 (강제 X)

#### 7-5-5. 시설별 공종 수량 입력 (v0.6, 신규)

작업이 발생하는 모든 시설(접속함체·종단)에 **어떤 공종이 몇 개 일어나는지** 입력. 차수 시간 산출의 핵심 입력.

**진입**: 시설 노드 더블클릭 → 편집 모달 하단 "공종 수량" 섹션. 또는 시설 우클릭 → "공종 입력"

**입력 영역**:
```
┌────────────────────────────────────────────────────┐
│ 0025A 79M3#1 (함체·가공형, 144C)            [닫기] │
├────────────────────────────────────────────────────┤
│ ... (시설 기본 정보 위쪽) ...                       │
├────────────────────────────────────────────────────┤
│ ▣ 공종 수량                                         │
│                                                    │
│  공종              수량   비고                      │
│  ─────────────────────────────────────────────     │
│  함체작업(야간)    [1]   야간 신설                  │
│  접속(12C이하)     [2]   1유니트 2쌍                │
│  성단접속          [0]                              │
│  [+ 공종 추가 ▼]   [+ 공종 마스터 관리]   (v0.7)    │
│                                                    │
│  예상 작업시간: 약 26분 (자동 계산)                  │
│   = 20분(함체신설) + 2 × 3분(연속코어)               │
└────────────────────────────────────────────────────┘
```

**공종 선택**:
- 회사 단위 공종 마스터(`relocation_task_type_master`) 의 활성 row 가 드롭다운
- 시드 14종 (M3 접속일보 enum 과 동일 이름): 접속(12C이하)·접속(12C초과)·성단접속·성단작업·함체작업(주간)·함체작업(야간)·중간분기함체(기설)·중간분기함체(신설)·단자함설치·국사패치·IJP신설·고위험(함체)·신호수·기타
- **설계자가 추가 가능** (v0.7) — 예: 'OJC 접속', '광점프코드 정리', '장비 광포트 시험' 등

**[+ 공종 마스터 관리]** 진입 (v0.7):
- 별도 페이지 `/admin/relocation-task-types`
- 활성·비활성 토글, 표준시간·단위 수정, 새 공종 추가
- 권한: 회사 admin 또는 설계자 누구나 (Q-권한 답 = 권한 제한 없음)
- 시드 14종은 표준시간 수정만 가능 (이름·삭제 잠금)

**예상 작업시간 라이브 계산**:
- `task_type_master.standard_minutes_per_unit × quantity` 합산
- 비연속 코어 보정·함체신설 부가시간은 § 6-3 시간 공식 그대로
- 클라이언트 즉시 계산

**검증 룰 T1 (노랑)**:
- 시설에 코어 접속이 1개 이상이지만 공종 수량 합이 0 → "공종 수량 미입력. 차수 산출 정확도 저하" 노랑 경고

#### 7-5-6. 1차/2차/3차 RN 스플리터 입력 (v0.7 보강)

함체 시설 안에 스플리터가 있으면 시설 편집 모달의 별도 섹션으로 입력.

**입력 영역**:
```
┌────────────────────────────────────────────────────┐
│ 0025A 79M3#1 (함체·가공형)                  [닫기] │
├────────────────────────────────────────────────────┤
│ ▣ RN 스플리터                                       │
│  [+ 스플리터 추가]                                  │
│                                                    │
│  ─ 스플리터 #1 ───────────────────────────────     │
│  종류         ○ 2:8  ● 2:16  ○ 1:2:8:4  ○ 1:3:8:4  │
│                                                    │
│  작업 모드 *  ● 분기 (외부 가입자/시설로 연결)      │
│              ○ 내부접속만 (외부 분기 없음)  (v0.7)  │
│                                                    │
│  입력단 A     케이블 [▼ NEW-A1B2-001] 코어 [_3_]    │
│  입력단 B     케이블 [▼ NEW-A1B2-007] 코어 [_3_]    │
│              ※ 입력 A·B 는 자동 다이버시티 검증     │
│                                                    │
│  출력 포트                                          │
│  (작업 모드='분기' 일 때만 표시)                    │
│   #1 → 회선 [▼ 5632751] / 드랍 [▼ DROP-001]         │
│   #2 → ...                                          │
│   ...                                              │
│   #16 → (미배정)                                    │
│                                                    │
│  (작업 모드='내부접속만' 일 때):                    │
│   "내부 접속 작업만 — 출력 포트 배정 없음"          │
│   ※ 검증 룰 R1 도 입력 다이버시티만 검사            │
│   ※ 차수 알고리즘: 외부 분기 task 없음 — 함체 내    │
│     작업 시간만 산출                                │
└────────────────────────────────────────────────────┘
```

**작업 모드 동작 차이**:
| 항목 | 분기 | 내부접속만 |
|---|---|---|
| 입력단 A·B | 필수 | 필수 |
| 출력 포트 매핑 | 권장 (사용 포트 입력) | 입력 안 함 (UI 숨김) |
| 차수 작업 시간 | 분기 가입자별 작업 + 함체 내 접속 | 함체 내 접속만 |
| 검증 R1 | 입력 다이버시티 검사 | 입력 다이버시티만 검사 |
| 시각화 | 출력 포트별 분기선 | 함체 안에서 내부 표시 |

#### 7-5-7. 코어배정 탭 — 자동 결과 인라인 수정

**진입**: 상단 탭 "코어배정"

**화면 구성** (테이블 + 우측 패널):
```
┌──────────────────────────────────────────────────────────────────────┐
│ 코어배정                                  [자동 배정 실행]            │
├──────────────────────────────────────────────────────────────────────┤
│ 회선번호  설치장소        케이블        시작  끝   상태  자동  편집   │
│ ─────────────────────────────────────────────────────────────────── │
│ 5632751  필동충무영상센터  NEW-A1B2-001  5     6    OK   ⚡    ✏     │
│ 5680650  거봉빌딩 옥상    NEW-A1B2-001  7     8    OK   ⚡    ✏     │
│ 5572607  MBN(B1F송출실)   NEW-A1B2-002  1     2    OK   👤    ✏     │
│ ...                                                                 │
│                                                                     │
│ ⚡ 자동 배정 결과   👤 사람 수정·직접 입력                            │
└──────────────────────────────────────────────────────────────────────┘
```

**인라인 수정**:
- ✏ 클릭 → 시작·끝 코어 input 활성화
- 저장 시:
  - 클라이언트 즉시 검증: 동일 케이블 내 중복 (다른 row 의 [start, end] 범위와 겹침)
  - DB exclusion constraint 가 최종 안전망 — 중복이면 에러
  - 저장 후 `is_auto_assigned = false` 로 전환 (사람 수정 표시)
- 검증 실패 시 row 빨강 + 토스트 "코어 5~6 은 이미 NEW-A1B2-001 케이블에 배정됨"

**일괄 자동 배정 실행**:
- [자동 배정 실행] 버튼 → 미배정 회선 + 사람이 안 건드린 자동 row 를 재계산
- 사람이 수정한 row(`is_auto_assigned=false`)는 **유지** (덮어쓰지 않음)
- 결과 미리보기 → 확정/취소

#### 7-5-8. 일괄 등록 (v1.1, 후순위)

설계자가 손으로 함체 20개 가까이 등록해야 하는 경우를 대비:
- **CSV 업로드** — 종류·이름·규격 컬럼
- **클립보드 붙여넣기** — 엑셀 영역 복사 → 폼에 직접 paste

본 기능은 v0.5 범위 외. 1차 출시 후 사용 빈도 보고 결정.

## 8. Phase 분할

| Phase | 내용 | 산출물 | 추정 |
|---|---|---|---|
| **Phase 1** | DB 마이그·기본 CRUD | 시설·케이블·회선·코어 입력 화면 | 1.5 ~ 2 주 |
| **Phase 2** | 자동 검증 + 차수 분할 | 검증 패널·차수 자동 생성 | 1 ~ 1.5 주 |
| **Phase 3** | SVG 시각화 | 코어구성도·직선도 자동 렌더 | 2 주 |
| **Phase 4** | 엑셀 출력 (drawing.xml 직접 조립) | LGU+ 양식 엑셀 다운로드 | 2 주 (후순위) |
| **Phase 5** | LGU+ 엑셀 임포터 | 4 종 데이터셋 자동 파싱 | 1.5 ~ 2 주 |

**최소 가용 모듈** = Phase 1 + Phase 2 + Phase 3 (= 약 4.5 ~ 5.5 주)
Phase 3 까지 가면 이미지 보고 owner 가 손으로 엑셀 작성 가능 (Q19 답).

각 Phase 시작 전에 owner 와 짧은 합의 라운드 진행.

## 9. 미해결 항목

### 9-1. RN 표기 `1:2:8:4`·`1:3:8:4` 해석

owner 답변 받지 못함. 추측 후보:
- (a) 4 단 비율: 1차(1:2) → 2차(2:8) → 3차(8:4)
- (b) 다단 합산: 전체 분기 1 → 2 → 8 → 4 (즉 1×2×8×4 = 64 가입자)
- (c) 그 외

→ owner 검토 시 정확한 의미 확인 필요. v1.0 에서 결정.

### 9-2. 576C 케이블의 유니트·함체 규격
- 유니트 크기 미정 (TBD)
- 한 단계 위 함체 규격 미정 (288C 다음이 없음)
- 실무상 거의 안 쓰는 규격이면 enum 에서 제외 가능

### 9-3. 비연속 코어의 "비연속" 정의
- "한쪽이 연속이지만 반대쪽은 아닌" 경우 8 분 적용
- "둘 다 비연속" 인 경우는? (3 분 / 8 분 / 더 긴 시간?)

### 9-4. 기설 코어ID 변경 가능 시점
- 기설 코어ID 보존이 최우선이지만, 부득이 변경이 필요한 경우의 룰
- 예: 기설 케이블 자체가 철거되는 경우

### 9-5. 4분기 초과 승인 절차
- "설계자 판단" 으로 한도 초과 가능
- 시스템에 승인 기록을 남길지, 단순 노랑 경고만 띄울지

### 9-6. 작업 차수 시간대 예외
- 평일/주말, 도심/외곽, 가입자 종류 별로 02~05 외 시간 가능?
- 현재 모델은 02~05 고정

## 10. 운영 작업 (owner 가 Supabase Dashboard 에서 실행)

문서 v1.0 확정 후 작성될 마이그레이션 SQL:

| 마이그 | 내용 | 상태 |
|---|---|---|
| 0035 | relocation_projects · enum 일체 (closure_type 에 MOFD/OJC/국사내장비 + splitter_work_mode) · RLS · GRANT | ✅ 실행 |
| 0036 | facilities (+ parent_facility_id + seq_no + facility_seq) · cables · circuits · core_assignments (+ btree_gist + exclusion constraint + cable_seq) | ✅ 실행 |
| 0037 | splices · splitters (+ work_mode) · splitter_ports · task_type_master + 시드 14종 · facility_tasks | ✅ 실행 |
| 0038 | phases · phase_tasks · task_pairs (양쪽 작업자 페어링) | ✅ 실행 |
| 0039 | **migrations · migration_circuits (이전 워크플로우 audit)** | 미작성 |

추가로 시드 데이터 SQL:
- `cable_spec_meta` (유니트·길이 표)
- `closure_spec_meta` (수용·여장판 표)

## 11. Supabase 운영 검토 (v0.8)

지장이설 모듈 도입을 무료 플랜 한도와 대조한 결과 — 단기 영향은 적지만 **사진 누적이 결국 Storage 한도를 먼저 도달**한다.

### 11-1. 무료 플랜 한도 (2026년 기준)

| 자원 | 한도 |
|---|---|
| 데이터베이스 용량 | 500 MB |
| Storage | 1 GB |
| Auth MAU | 50,000 |
| Bandwidth (egress) | 5 GB/월 |
| Edge Function | 500K 호출/월 |
| Realtime | 200 동시연결, 2M 메시지/월 |
| 자동 일시정지 | 7일 미사용 시 |

### 11-2. 현재·예상 사용량

| 자원 | 현재 | +지장이설 1년 후 | 한도 대비 |
|---|---|---|---|
| DB 용량 | < 50 MB | 200~400 MB | 🟢 |
| Storage (사진) | 누적 시작 | **1~3 GB** | 🔴 한도 초과 가능 |
| Bandwidth | < 1 GB/월 | 2~4 GB/월 | 🟡 |
| Auth MAU | ~50 명 | ~100 명 | 🟢 |
| Edge Fn | 0 | 0 (Server Action 만 사용) | 🟢 |
| 자동 일시정지 | 매일 사용 → N/A | 〃 | 🟢 |

### 11-3. 지장이설 모듈 자체 영향

지장이설 모듈은 **이미지 저장을 안 하면 Storage 영향 0**.

- 코어구성도 SVG → 동적 렌더(클라이언트)
- 작업 지시서 → HTML + 브라우저 인쇄 (저장 안 함)
- 엑셀 출력(Phase 4) → 다운로드 즉시 사용, Storage 미저장

→ 권장: 지장이설 결과물을 Supabase Storage 에 저장하지 않는다. 사용자가 직접 캡처·다운로드.

DB 사이드 영향:
- 프로젝트당 row 합계 1,500~5,000 row (텍스트 주, 컬럼 작음)
- 100 프로젝트 누적 시 약 300~500MB → DB 한도 근접하지만 **3~5년 가능**

### 11-4. Pro 플랜 전환 시점·비용

**Pro 플랜**: $25/월 (= 약 35,000원)
- DB 8 GB, Storage 100 GB, Bandwidth 250 GB
- 자동 일시정지 X, 일일 백업, PITR 7일

전환 권장 시점 (둘 중 먼저 오는 것):
- (a) Storage 800 MB 도달 → 사진 누적 임계
- (b) 회사 활성 사용자 100명 초과
- (c) Bandwidth 4 GB/월 초과 3개월 연속

마이그 비용: **0** (스키마 그대로, 한도만 상향)

### 11-5. 무료 플랜 유지하기 위한 즉시 액션 (지장이설과 별개)

1. **접속일보 사진 압축** — [`PhotoUploader.tsx`](../src/app/works/PhotoUploader.tsx) 에 클라이언트 압축 추가
   - 해상도 1920px 제한, JPEG 80%
   - 평균 2MB → 평균 0.4MB (5배 절감)
2. **6개월 후 Storage 사용량 점검** — 800MB 도달 전 Pro 전환 검토
3. **지장이설 결과물 Storage 저장 안 함** — 위 11-3 권장

## 12. 참고 파일

- 분석 샘플: [`samples/코아구성도_수정용_170905.xlsx`](../samples/코아구성도_수정용_170905.xlsx) (LGU+ DB 출력 형식 사실상 표준)
- 분석 스크립트: [`samples/analyze_xlsx2.py`](../samples/analyze_xlsx2.py), [`samples/compare_drafts.py`](../samples/compare_drafts.py), [`samples/parse_drawing2.py`](../samples/parse_drawing2.py)
- 누적 결정 기록: [`CLAUDE.md`](../CLAUDE.md) 에 본 문서 위치 추가 필요

## 13. 변경 이력

| 일자 | 버전 | 변경 | 작성 |
|---|---|---|---|
| 2026-05-19 | v0.1 | 초안 작성 (owner 누적 답변 종합) | Claude |
| 2026-05-19 | v0.2 | 양쪽 작업자 페어링 추가 — relocation_task_pairs 테이블·작업 지시서 자동 생성·차수 알고리즘 보강·작업 지시서 모바일 예외 | Claude |
| 2026-05-19 | v0.3 | 작업자 간 교신=휴대폰 명시·개인정보 노출 범위 제한·사고 대응은 범위 외 | Claude |
| 2026-05-19 | v0.4 | 신설 시설·케이블 수동 등록 워크플로우 명시 (§ 7-5) — 폼 필드·자동 검증·캔버스 조작·권장 규격·일괄 등록 후순위 | Claude |
| 2026-05-19 | v0.5 | GPS·케이블 거리 자동화 제거 — 시설 lat/lng 컬럼 삭제·케이블 length_m 컬럼 삭제·검증 룰 L1 삭제·2,000m 자동 함체 삽입 다이얼로그 삭제. 거리·위치 판단은 설계자 영역 | Claude |
| 2026-05-19 | v0.6 | (1) 케이블 ID — 기설은 LGU+ 제공·신설은 자동 생성(NEW-XXXX-NNNNNN). cable_code NOT NULL + unique + cable_seq 테이블 (2) 동일 케이블 코어 범위 중복 금지 — DB exclusion constraint + 검증 룰 O1 (3) 자동 배정 결과 인라인 수정 — is_auto_assigned 플래그 + 코어배정 탭 UI (4) 시설별 공종 수량 — relocation_facility_tasks 테이블 + 시설 편집 모달 영역 + 검증 룰 T1 + 예상 작업시간 라이브 계산 | Claude |
| 2026-05-19 | v0.7 | (1) 공종 마스터 확장 — relocation_task_type_master 회사 단위 마스터. 시드 14종 + 설계자 자유 추가. facility_tasks.task_type 을 enum → FK 변경. /admin/relocation-task-types 페이지 (2) 국사 내부 토폴로지 — closure_type 에 MOFD/OJC/국사내장비 추가 + facilities.parent_facility_id (3) RN 내부 접속만 — relocation_splitter_work_mode enum + splitter.work_mode 컬럼. UI 토글로 분기/내부접속만 전환. 모드별 검증·차수·시각화 차이 명시 | Claude |
| 2026-05-19 | v0.8 | (1) 객체 번호 자동 부여 — facilities.seq_no + facility_seq 카운터 + 종류별 prefix(S/B/H/C/M/O/E) (2) 좌측 패널 — 시설 번호 목록·검색·그룹·캔버스 점프 (§ 7-2-1 신규) (3) 모바일 보기 정책 갱신 — 설계 화면은 데스크톱이지만 완료된 설계의 읽기 전용은 모바일 허용 (§ 7-3 통합 재작성, § 7-4 삭제) (4) Supabase 운영 검토 신규 (§ 11) — 무료 플랜 한도·예상 사용량·Pro 전환 시점·즉시 액션 | Claude |
| 2026-05-20 | v0.9 | **이전(Migration) 워크플로우 추가 (§ 2-7)** — 기설 임포트 후 영향 회선 자동 추출 → 옛→새 케이블 N:M 분할 이전 → 자동 코어 배정. relocation_migrations + relocation_migration_circuits 테이블 (마이그 0039). 1코어 1행 임포트 가정. 결재 없이 설계자 직접 확정 | Claude |
