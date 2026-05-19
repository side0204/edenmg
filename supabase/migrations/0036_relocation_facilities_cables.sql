-- =====================================================================
-- edenMG  지장이설 자동화 설계 모듈 (M-Relocation)
-- Migration 0036 — facilities + cables + circuits + core_assignments
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0035 가 먼저 실행돼 있어야 한다.
--
-- 사양: docs/RELOCATION_DESIGN_PLAN.md (v0.8)
--
-- 본 마이그 내용:
--   - relocation_facilities         (시설 노드 — 국사·함체·맨홀·가입자·MOFD·OJC·장비)
--   - relocation_facility_seq       (시설 번호 카운터: 프로젝트 × 종류 별)
--   - relocation_cables             (케이블 구간)
--   - relocation_cable_seq          (케이블 번호 카운터: 프로젝트 별)
--   - relocation_circuits           (회선 마스터)
--   - relocation_core_assignments   (코어배정 + 동일 케이블 코어 범위 중복 금지)
--   - btree_gist extension          (exclusion constraint 용)
--
-- 후속 마이그:
--   0037 — splices · splitters · task_type_master + 시드 14종 · facility_tasks
--   0038 — phases · phase_tasks · task_pairs
-- =====================================================================


-- ===== EXTENSION: btree_gist (코어 범위 중복 금지 exclusion constraint 용) =
create extension if not exists btree_gist;


-- =====================================================================
-- TABLE: relocation_facilities (시설 노드)
-- =====================================================================
create table if not exists public.relocation_facilities (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.relocation_projects(id) on delete cascade,
  master_facility_id  uuid references public.connection_facilities(id),     -- 회사 마스터 FK (선택)
  parent_facility_id  uuid references public.relocation_facilities(id),     -- 국사 내부 노드의 부모 국사
  closure_type        public.relocation_closure_type not null,
  seq_no              integer not null,                                     -- 프로젝트 × 종류 별 1부터
  name                text not null,                                        -- '필동간이국사', '0025A 79M3#1' 등
  install_address     text,                                                 -- 가입자 설치장소명
  closure_spec        public.cable_spec,                                    -- 함체 규격 (가입자·국사·MOFD·OJC·장비는 null)
  x_hint              integer,                                              -- 캔버스 좌표 X (px)
  y_hint              integer,                                              -- 캔버스 좌표 Y (px)
  is_marked           boolean not null default false,                       -- 노란색 마크 보존 (의미 미상)
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- parent_facility_id 는 국사 내부 토폴로지 노드만 가질 수 있음
  constraint relocation_facilities_parent_only_internal
    check (parent_facility_id is null or closure_type in ('MOFD', 'OJC', '국사내장비')),

  -- 프로젝트 × 종류 × seq_no 는 unique
  constraint relocation_facilities_seq_unique
    unique (project_id, closure_type, seq_no)
);

alter table public.relocation_facilities enable row level security;

create index if not exists relocation_facilities_project_idx
  on public.relocation_facilities(project_id);

create index if not exists relocation_facilities_parent_idx
  on public.relocation_facilities(parent_facility_id)
  where parent_facility_id is not null;

create index if not exists relocation_facilities_closure_type_idx
  on public.relocation_facilities(project_id, closure_type);


-- updated_at 트리거
do $$ begin
  create trigger relocation_facilities_touch_updated_at
    before update on public.relocation_facilities
    for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;


-- =====================================================================
-- TABLE: relocation_facility_seq (시설 번호 카운터)
-- =====================================================================
-- 프로젝트 × 종류 별 last_seq 관리. server action 에서 트랜잭션 내에
-- UPDATE ... RETURNING last_seq+1 패턴으로 다음 번호 발급.
create table if not exists public.relocation_facility_seq (
  project_id    uuid not null references public.relocation_projects(id) on delete cascade,
  closure_type  public.relocation_closure_type not null,
  last_seq      integer not null default 0,
  primary key (project_id, closure_type)
);

alter table public.relocation_facility_seq enable row level security;


-- =====================================================================
-- TABLE: relocation_cables (케이블 구간)
-- =====================================================================
-- 기설: cable_code 는 LGU+ DB 가 제공하는 ID
-- 신설: 시스템이 'NEW-{프로젝트단축코드}-{6자리}' 자동 생성 (server action)
create table if not exists public.relocation_cables (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.relocation_projects(id) on delete cascade,
  from_facility_id   uuid not null references public.relocation_facilities(id),
  to_facility_id     uuid not null references public.relocation_facilities(id),
  spec               public.cable_spec not null,
  status             public.relocation_cable_status not null default 'new',
  cable_code         text not null,                                         -- LGU+ 제공 또는 자동 생성
  route_type         text,                                                  -- '가공' / '지중' / '관로'
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- 프로젝트 안에서 cable_code 는 unique
  constraint relocation_cables_code_unique
    unique (project_id, cable_code),

  -- 자기 자신을 잇는 케이블은 금지
  constraint relocation_cables_no_self_loop
    check (from_facility_id <> to_facility_id)
);

alter table public.relocation_cables enable row level security;

create index if not exists relocation_cables_project_idx
  on public.relocation_cables(project_id);

create index if not exists relocation_cables_from_idx
  on public.relocation_cables(from_facility_id);

create index if not exists relocation_cables_to_idx
  on public.relocation_cables(to_facility_id);

create index if not exists relocation_cables_status_idx
  on public.relocation_cables(project_id, status);


do $$ begin
  create trigger relocation_cables_touch_updated_at
    before update on public.relocation_cables
    for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;


-- =====================================================================
-- TABLE: relocation_cable_seq (신설 케이블 번호 카운터)
-- =====================================================================
create table if not exists public.relocation_cable_seq (
  project_id  uuid primary key references public.relocation_projects(id) on delete cascade,
  last_seq    integer not null default 0
);

alter table public.relocation_cable_seq enable row level security;


-- =====================================================================
-- TABLE: relocation_circuits (회선 마스터)
-- =====================================================================
-- LGU+ 회선번호 + 가입자 설치장소명 + 회선 종류 (1코어/2코어/이원화)
create table if not exists public.relocation_circuits (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.relocation_projects(id) on delete cascade,
  circuit_id      text not null,                                            -- LGU+ 회선번호 (예: 5632751)
  subscriber_name text,                                                     -- 설치장소명
  kind            public.relocation_circuit_kind not null,
  status          public.relocation_circuit_status not null default 'OK',
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint relocation_circuits_circuit_unique
    unique (project_id, circuit_id)
);

alter table public.relocation_circuits enable row level security;

create index if not exists relocation_circuits_project_idx
  on public.relocation_circuits(project_id);

create index if not exists relocation_circuits_kind_idx
  on public.relocation_circuits(project_id, kind);


do $$ begin
  create trigger relocation_circuits_touch_updated_at
    before update on public.relocation_circuits
    for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;


-- =====================================================================
-- TABLE: relocation_core_assignments (코어배정 = 직선도 본체)
-- =====================================================================
-- 한 회선이 케이블에서 어느 코어 범위를 사용하는지.
-- 이원화 회선은 segment_idx 0/1 두 row.
-- is_auto_assigned: true = 자동 배정 결과, false = 사람이 수정·직접 입력
create table if not exists public.relocation_core_assignments (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.relocation_projects(id) on delete cascade,
  circuit_id           uuid references public.relocation_circuits(id) on delete cascade,
  segment_idx          smallint not null default 0,                         -- 이원화 짝 번호 (0,1)
  cable_id             uuid not null references public.relocation_cables(id),
  core_range_start     smallint not null,
  core_range_end       smallint not null,
  lifecycle            public.relocation_core_lifecycle not null default 'new',
  status               public.relocation_circuit_status,
  paired_assignment_id uuid references public.relocation_core_assignments(id),  -- 이원화 짝
  is_auto_assigned     boolean not null default false,
  notes                text,
  created_at           timestamptz not null default now(),

  constraint relocation_core_range_valid
    check (core_range_start <= core_range_end),

  constraint relocation_core_range_positive
    check (core_range_start >= 1)
);

alter table public.relocation_core_assignments enable row level security;

create index if not exists relocation_core_project_idx
  on public.relocation_core_assignments(project_id);

create index if not exists relocation_core_cable_idx
  on public.relocation_core_assignments(cable_id);

create index if not exists relocation_core_circuit_idx
  on public.relocation_core_assignments(circuit_id);


-- ===== 동일 케이블 내 코어 범위 중복 금지 (exclusion constraint) ========
-- int4range(start, end+1) = half-open [start, end+1) 로 표현하여 인접도 안 겹침
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'relocation_core_no_overlap'
      and conrelid = 'public.relocation_core_assignments'::regclass
  ) then
    alter table public.relocation_core_assignments
      add constraint relocation_core_no_overlap
      exclude using gist (
        cable_id with =,
        int4range(core_range_start, core_range_end + 1) with &&
      );
  end if;
end $$;


-- =====================================================================
-- RLS — 모두 회사 스코프. project_id → relocation_projects.company_id
-- =====================================================================
-- 헬퍼 패턴: project_id in (select id from relocation_projects where company_id = ...)

-- ===== relocation_facilities ==========================================
drop policy if exists relocation_facilities_all on public.relocation_facilities;
create policy relocation_facilities_all
  on public.relocation_facilities
  for all
  using (
    project_id in (
      select id from public.relocation_projects
      where company_id = (select company_id from public.current_employee())
    )
  )
  with check (
    project_id in (
      select id from public.relocation_projects
      where company_id = (select company_id from public.current_employee())
    )
  );


-- ===== relocation_facility_seq ========================================
drop policy if exists relocation_facility_seq_all on public.relocation_facility_seq;
create policy relocation_facility_seq_all
  on public.relocation_facility_seq
  for all
  using (
    project_id in (
      select id from public.relocation_projects
      where company_id = (select company_id from public.current_employee())
    )
  )
  with check (
    project_id in (
      select id from public.relocation_projects
      where company_id = (select company_id from public.current_employee())
    )
  );


-- ===== relocation_cables ==============================================
drop policy if exists relocation_cables_all on public.relocation_cables;
create policy relocation_cables_all
  on public.relocation_cables
  for all
  using (
    project_id in (
      select id from public.relocation_projects
      where company_id = (select company_id from public.current_employee())
    )
  )
  with check (
    project_id in (
      select id from public.relocation_projects
      where company_id = (select company_id from public.current_employee())
    )
  );


-- ===== relocation_cable_seq ===========================================
drop policy if exists relocation_cable_seq_all on public.relocation_cable_seq;
create policy relocation_cable_seq_all
  on public.relocation_cable_seq
  for all
  using (
    project_id in (
      select id from public.relocation_projects
      where company_id = (select company_id from public.current_employee())
    )
  )
  with check (
    project_id in (
      select id from public.relocation_projects
      where company_id = (select company_id from public.current_employee())
    )
  );


-- ===== relocation_circuits ============================================
drop policy if exists relocation_circuits_all on public.relocation_circuits;
create policy relocation_circuits_all
  on public.relocation_circuits
  for all
  using (
    project_id in (
      select id from public.relocation_projects
      where company_id = (select company_id from public.current_employee())
    )
  )
  with check (
    project_id in (
      select id from public.relocation_projects
      where company_id = (select company_id from public.current_employee())
    )
  );


-- ===== relocation_core_assignments ====================================
drop policy if exists relocation_core_assignments_all on public.relocation_core_assignments;
create policy relocation_core_assignments_all
  on public.relocation_core_assignments
  for all
  using (
    project_id in (
      select id from public.relocation_projects
      where company_id = (select company_id from public.current_employee())
    )
  )
  with check (
    project_id in (
      select id from public.relocation_projects
      where company_id = (select company_id from public.current_employee())
    )
  );


-- =====================================================================
-- GRANTS
-- =====================================================================
grant select, insert, update, delete on public.relocation_facilities       to authenticated;
grant select, insert, update, delete on public.relocation_facility_seq     to authenticated;
grant select, insert, update, delete on public.relocation_cables           to authenticated;
grant select, insert, update, delete on public.relocation_cable_seq        to authenticated;
grant select, insert, update, delete on public.relocation_circuits         to authenticated;
grant select, insert, update, delete on public.relocation_core_assignments to authenticated;

grant all on public.relocation_facilities       to service_role;
grant all on public.relocation_facility_seq     to service_role;
grant all on public.relocation_cables           to service_role;
grant all on public.relocation_cable_seq        to service_role;
grant all on public.relocation_circuits         to service_role;
grant all on public.relocation_core_assignments to service_role;


-- =====================================================================
-- 마이그 0036 완료.
--
-- 다음 단계: 0037_relocation_splitters_tasks.sql
--   - 함체 내 접속 매핑 (splices)
--   - 1차 RN 스플리터 + 출력 포트 (splitters · splitter_ports)
--   - 공종 마스터 + 시드 14종 (task_type_master)
--   - 시설별 공종 수량 (facility_tasks)
-- =====================================================================
