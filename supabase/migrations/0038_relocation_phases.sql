-- =====================================================================
-- edenMG  지장이설 자동화 설계 모듈 (M-Relocation)
-- Migration 0038 — phases + phase_tasks + task_pairs (양쪽 작업자 페어링)
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0037 이 먼저 실행돼 있어야 한다.
--
-- 사양: docs/RELOCATION_DESIGN_PLAN.md (v0.8)
--
-- 본 마이그 내용:
--   - relocation_phases       (차수 — 새벽 02~05시 시공 단위)
--   - relocation_phase_tasks  (차수별 작업 — facility 단위)
--   - relocation_task_pairs   (양쪽 작업자 페어링 — 한 회선의 양쪽 끝 task)
--
-- 본 마이그까지 완료되면 Phase 1 (DB Foundation) 완료.
-- 다음은 페이지·server action 코드 작업.
-- =====================================================================


-- =====================================================================
-- TABLE: relocation_phases (차수)
-- =====================================================================
-- 새벽 02~05시 시공 단위. 한 프로젝트가 여러 차수로 나뉘어 시공됨.
-- 차수 자동 분할 알고리즘이 산출 + 사람 조정 가능.
create table if not exists public.relocation_phases (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.relocation_projects(id) on delete cascade,
  phase_no           smallint not null,                                     -- 1, 2, 3, ...
  planned_at         date,                                                  -- 시공 예정일
  window_start       time not null default '02:00',                         -- 작업 시작
  window_end         time not null default '05:00',                         -- 작업 종료
  required_teams     smallint not null default 2,                           -- 동시 작업 팀 수 (2/3/4)
  estimated_minutes  integer,                                               -- 자동 계산 캐시
  status             public.relocation_phase_status not null default '계획',
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint relocation_phases_phase_no_positive
    check (phase_no >= 1),

  constraint relocation_phases_teams_range
    check (required_teams between 1 and 4),

  constraint relocation_phases_unique
    unique (project_id, phase_no)
);

alter table public.relocation_phases enable row level security;

create index if not exists relocation_phases_project_idx
  on public.relocation_phases(project_id);

create index if not exists relocation_phases_planned_idx
  on public.relocation_phases(planned_at)
  where planned_at is not null;


do $$ begin
  create trigger relocation_phases_touch_updated_at
    before update on public.relocation_phases
    for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;


-- =====================================================================
-- TABLE: relocation_phase_tasks (차수별 작업)
-- =====================================================================
-- 한 차수에 어느 시설(함체·종단)에서 어떤 작업이 일어나는지.
-- 시간 산출: (kind='함체신설_절단' ? 20 : 0) + cores_continuous × 3 + cores_noncontinuous × 8
-- 동시작업 그룹: 케이블 양쪽 끝 task 는 같은 simultaneity_group
create table if not exists public.relocation_phase_tasks (
  id                  uuid primary key default gen_random_uuid(),
  phase_id            uuid not null references public.relocation_phases(id) on delete cascade,
  facility_id         uuid not null references public.relocation_facilities(id) on delete cascade,
  task_kind           public.relocation_phase_task_kind not null,
  cores_continuous    smallint not null default 0,                          -- 연속 코어 수
  cores_noncontinuous smallint not null default 0,                          -- 비연속 코어 수
  estimated_minutes   integer,                                              -- 자동 계산 캐시
  depends_on_task_ids uuid[] default '{}',                                  -- 선후 의존성 (DAG)
  simultaneity_group  text,                                                 -- 동시작업 그룹 키 (양쪽 짝)
  assigned_team_no    smallint,                                             -- 1~4 (어느 팀이 맡나)
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint relocation_phase_tasks_cores_nonnegative
    check (cores_continuous >= 0 and cores_noncontinuous >= 0),

  constraint relocation_phase_tasks_team_range
    check (assigned_team_no is null or assigned_team_no between 1 and 4)
);

alter table public.relocation_phase_tasks enable row level security;

create index if not exists relocation_phase_tasks_phase_idx
  on public.relocation_phase_tasks(phase_id);

create index if not exists relocation_phase_tasks_facility_idx
  on public.relocation_phase_tasks(facility_id);

create index if not exists relocation_phase_tasks_simultaneity_idx
  on public.relocation_phase_tasks(simultaneity_group)
  where simultaneity_group is not null;


do $$ begin
  create trigger relocation_phase_tasks_touch_updated_at
    before update on public.relocation_phase_tasks
    for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;


-- =====================================================================
-- TABLE: relocation_task_pairs (양쪽 작업자 페어링)
-- =====================================================================
-- 한 회선의 양쪽 끝 작업이 어느 task 끼리 페어인지 명시.
-- 작업 지시서 생성의 핵심 — 작업자가 짝 작업자의 함체·코어·휴대폰을 알아야 함.
-- 차수 자동 분할 알고리즘이 차수 확정 시 자동 생성.
create table if not exists public.relocation_task_pairs (
  id              uuid primary key default gen_random_uuid(),
  phase_id        uuid not null references public.relocation_phases(id) on delete cascade,
  circuit_id      uuid not null references public.relocation_circuits(id) on delete cascade,
  -- A 측
  task_a_id       uuid not null references public.relocation_phase_tasks(id) on delete cascade,
  task_a_cable_id uuid not null references public.relocation_cables(id),
  task_a_core     smallint not null,
  -- B 측
  task_b_id       uuid not null references public.relocation_phase_tasks(id) on delete cascade,
  task_b_cable_id uuid not null references public.relocation_cables(id),
  task_b_core     smallint not null,
  notes           text,
  created_at      timestamptz not null default now(),

  constraint relocation_task_pairs_cores_positive
    check (task_a_core >= 1 and task_b_core >= 1),

  constraint relocation_task_pairs_no_self
    check (task_a_id <> task_b_id),

  constraint relocation_task_pairs_unique
    unique (phase_id, circuit_id, task_a_id, task_b_id)
);

alter table public.relocation_task_pairs enable row level security;

create index if not exists relocation_task_pairs_phase_idx
  on public.relocation_task_pairs(phase_id);

create index if not exists relocation_task_pairs_circuit_idx
  on public.relocation_task_pairs(circuit_id);

create index if not exists relocation_task_pairs_task_a_idx
  on public.relocation_task_pairs(task_a_id);

create index if not exists relocation_task_pairs_task_b_idx
  on public.relocation_task_pairs(task_b_id);


-- =====================================================================
-- RLS — 모두 회사 스코프 (phase → project → company 체인)
-- =====================================================================

-- ===== relocation_phases ==============================================
drop policy if exists relocation_phases_all on public.relocation_phases;
create policy relocation_phases_all
  on public.relocation_phases
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


-- ===== relocation_phase_tasks =========================================
drop policy if exists relocation_phase_tasks_all on public.relocation_phase_tasks;
create policy relocation_phase_tasks_all
  on public.relocation_phase_tasks
  for all
  using (
    phase_id in (
      select ph.id from public.relocation_phases ph
      join public.relocation_projects p on p.id = ph.project_id
      where p.company_id = (select company_id from public.current_employee())
    )
  )
  with check (
    phase_id in (
      select ph.id from public.relocation_phases ph
      join public.relocation_projects p on p.id = ph.project_id
      where p.company_id = (select company_id from public.current_employee())
    )
  );


-- ===== relocation_task_pairs ==========================================
drop policy if exists relocation_task_pairs_all on public.relocation_task_pairs;
create policy relocation_task_pairs_all
  on public.relocation_task_pairs
  for all
  using (
    phase_id in (
      select ph.id from public.relocation_phases ph
      join public.relocation_projects p on p.id = ph.project_id
      where p.company_id = (select company_id from public.current_employee())
    )
  )
  with check (
    phase_id in (
      select ph.id from public.relocation_phases ph
      join public.relocation_projects p on p.id = ph.project_id
      where p.company_id = (select company_id from public.current_employee())
    )
  );


-- =====================================================================
-- GRANTS
-- =====================================================================
grant select, insert, update, delete on public.relocation_phases       to authenticated;
grant select, insert, update, delete on public.relocation_phase_tasks  to authenticated;
grant select, insert, update, delete on public.relocation_task_pairs   to authenticated;

grant all on public.relocation_phases       to service_role;
grant all on public.relocation_phase_tasks  to service_role;
grant all on public.relocation_task_pairs   to service_role;


-- =====================================================================
-- 마이그 0038 완료. Phase 1 (DB Foundation) 모두 완료.
--
-- 누적 결과:
--   0035 — 프로젝트 + enum 9종
--   0036 — facilities · cables · circuits · core_assignments + 카운터 2종
--   0037 — splices · splitters · task_type_master(시드 14종) · facility_tasks
--   0038 — phases · phase_tasks · task_pairs
--
-- 다음 단계: 페이지·server action 코드
--   - /relocation                  (프로젝트 목록)
--   - /relocation/new              (프로젝트 생성)
--   - /relocation/[id]             (메인 작업 화면 — 시설/케이블/코어배정/직선도/차수/검증 탭)
--   - /admin/relocation-task-types (공종 마스터)
--   - src/lib/relocation/...       (헬퍼·자동 알고리즘)
--   - src/app/relocation/actions.ts (server action)
-- =====================================================================
