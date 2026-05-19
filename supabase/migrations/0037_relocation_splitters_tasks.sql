-- =====================================================================
-- edenMG  지장이설 자동화 설계 모듈 (M-Relocation)
-- Migration 0037 — splices + splitters + splitter_ports + task_type_master + facility_tasks
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0036 이 먼저 실행돼 있어야 한다.
--
-- 사양: docs/RELOCATION_DESIGN_PLAN.md (v0.8)
--
-- 본 마이그 내용:
--   - relocation_splices            (함체 내 접속 매핑 = 직선도의 매트릭스)
--   - relocation_splitters          (1차 RN 스플리터)
--   - relocation_splitter_ports     (스플리터 출력 포트)
--   - relocation_task_type_master   (회사 단위 공종 마스터, 시드 14종 + 자유 추가)
--   - relocation_facility_tasks     (시설별 공종 수량)
--
-- 후속 마이그:
--   0038 — phases · phase_tasks · task_pairs
-- =====================================================================


-- =====================================================================
-- TABLE: relocation_splices (함체 내 접속 매핑 = 직선도)
-- =====================================================================
-- 한 함체에서 입력 케이블의 어느 코어가 출력 케이블의 어느 코어로 접속되는지.
-- tray_index 는 자동 계산값. is_continuous 는 양쪽 모두 연속 코어인지 (시간 산출용).
create table if not exists public.relocation_splices (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.relocation_projects(id) on delete cascade,
  facility_id     uuid not null references public.relocation_facilities(id) on delete cascade,
  in_cable_id     uuid not null references public.relocation_cables(id),
  in_core         smallint not null,
  out_cable_id    uuid not null references public.relocation_cables(id),
  out_core        smallint not null,
  tray_index      smallint,                                                 -- 자동 계산 + 사람 override
  is_continuous   boolean not null default true,                            -- 양쪽 모두 연속 코어
  notes           text,
  created_at      timestamptz not null default now(),

  constraint relocation_splices_cores_positive
    check (in_core >= 1 and out_core >= 1),

  -- 자기 자신을 접속하는 경우는 금지 (같은 케이블·같은 코어)
  constraint relocation_splices_no_self
    check (not (in_cable_id = out_cable_id and in_core = out_core))
);

alter table public.relocation_splices enable row level security;

create index if not exists relocation_splices_project_idx
  on public.relocation_splices(project_id);

create index if not exists relocation_splices_facility_idx
  on public.relocation_splices(facility_id);

create index if not exists relocation_splices_in_idx
  on public.relocation_splices(in_cable_id, in_core);

create index if not exists relocation_splices_out_idx
  on public.relocation_splices(out_cable_id, out_core);


-- =====================================================================
-- TABLE: relocation_splitters (1차 RN 스플리터)
-- =====================================================================
-- 함체 안에 내장된 PON 스플리터. 입력 2 코어(다이버시티) + 출력 N 포트.
-- work_mode: '분기' = 출력 포트 외부 연결 / '내부접속만' = 외부 분기 없음
create table if not exists public.relocation_splitters (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.relocation_projects(id) on delete cascade,
  facility_id       uuid not null references public.relocation_facilities(id) on delete cascade,
  splitter_type     public.relocation_splitter_type not null,
  -- 입력단 (다이버시티 — 두 코어가 서로 다른 케이블·다른 함체 경로로 와야 함)
  input_a_cable_id  uuid references public.relocation_cables(id),
  input_a_core      smallint,
  input_b_cable_id  uuid references public.relocation_cables(id),
  input_b_core      smallint,
  -- 작업 모드 (분기 vs 내부접속만)
  work_mode         public.relocation_splitter_work_mode not null default '분기',
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint relocation_splitters_input_cores_positive
    check (
      (input_a_core is null or input_a_core >= 1)
      and (input_b_core is null or input_b_core >= 1)
    )
);

alter table public.relocation_splitters enable row level security;

create index if not exists relocation_splitters_project_idx
  on public.relocation_splitters(project_id);

create index if not exists relocation_splitters_facility_idx
  on public.relocation_splitters(facility_id);


do $$ begin
  create trigger relocation_splitters_touch_updated_at
    before update on public.relocation_splitters
    for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;


-- =====================================================================
-- TABLE: relocation_splitter_ports (출력 포트)
-- =====================================================================
-- splitter 의 출력 N 포트. work_mode='분기' 일 때만 채움.
-- 한 포트는 한 가입자 회선 + 한 드랍 케이블에 1:1 매핑.
create table if not exists public.relocation_splitter_ports (
  splitter_id           uuid not null references public.relocation_splitters(id) on delete cascade,
  port_index            smallint not null,                                  -- 1~16 (splitter_type 에 따라)
  subscriber_circuit_id uuid references public.relocation_circuits(id),
  drop_cable_id         uuid references public.relocation_cables(id),
  notes                 text,
  primary key (splitter_id, port_index),
  constraint relocation_splitter_ports_index_positive
    check (port_index >= 1)
);

alter table public.relocation_splitter_ports enable row level security;

create index if not exists relocation_splitter_ports_circuit_idx
  on public.relocation_splitter_ports(subscriber_circuit_id)
  where subscriber_circuit_id is not null;


-- =====================================================================
-- TABLE: relocation_task_type_master (회사 단위 공종 마스터)
-- =====================================================================
-- 시드 14종 + 설계자가 자유 추가 가능. M3 접속일보의 connection_task_type
-- enum 과 이름은 동일하지만 별도 마스터로 관리 (수정·확장 자유).
create table if not exists public.relocation_task_type_master (
  id                        uuid primary key default gen_random_uuid(),
  company_id                uuid not null references public.companies(id) on delete cascade,
  name                      text not null,                                  -- 예: '함체작업(야간)', 'OJC 접속'
  standard_minutes_per_unit numeric(6,2) not null default 0,                -- 단위당 표준 시간(분)
  unit_label                text not null default '개',                    -- '개', '코어', '쌍' 등
  is_active                 boolean not null default true,
  is_seed                   boolean not null default false,                 -- 시드 14종은 true (이름 변경·삭제 잠금)
  position                  smallint not null default 0,                    -- 표시 순서
  notes                     text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint relocation_task_type_master_name_unique
    unique (company_id, name)
);

alter table public.relocation_task_type_master enable row level security;

create index if not exists relocation_task_type_master_company_idx
  on public.relocation_task_type_master(company_id)
  where is_active = true;


do $$ begin
  create trigger relocation_task_type_master_touch_updated_at
    before update on public.relocation_task_type_master
    for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;


-- ===== 시드 14종 — 모든 기존 회사에 일괄 insert (멱등) =================
-- 시간 값은 사양서 § 2-5·§ 9-3 기준 합리적 기본값. owner 가 마스터 페이지에서 수정 가능.
-- 신호수는 0 (이미 2인1조 시간에 포함)
insert into public.relocation_task_type_master
  (company_id, name, standard_minutes_per_unit, unit_label, is_seed, position)
select c.id, t.name, t.minutes, t.unit, true, t.pos
from public.companies c
cross join (values
  ('접속(12C이하)',        3,    '코어',  10),
  ('접속(12C초과)',        8,    '코어',  20),
  ('성단접속',             5,    '코어',  30),
  ('성단작업',             30,   '개',    40),
  ('함체작업(주간)',       20,   '개',    50),
  ('함체작업(야간)',       20,   '개',    60),
  ('중간분기함체(기설)',   30,   '개',    70),
  ('중간분기함체(신설)',   60,   '개',    80),
  ('단자함설치',           30,   '개',    90),
  ('국사패치',             10,   '회',    100),
  ('IJP신설',              30,   '개',    110),
  ('고위험(함체)',         30,   '개',    120),
  ('신호수',               0,    '회',    130),
  ('기타',                 0,    '회',    140)
) as t(name, minutes, unit, pos)
on conflict (company_id, name) do nothing;


-- =====================================================================
-- TABLE: relocation_facility_tasks (시설별 공종 수량)
-- =====================================================================
-- 모든 작업 발생 시설(접속함체·종단)에 공종+수량 입력.
-- 차수 시간 산출의 입력. master 와 FK 연결.
create table if not exists public.relocation_facility_tasks (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.relocation_projects(id) on delete cascade,
  facility_id   uuid not null references public.relocation_facilities(id) on delete cascade,
  task_type_id  uuid not null references public.relocation_task_type_master(id),
  quantity      smallint not null default 1,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint relocation_facility_tasks_quantity_positive
    check (quantity >= 1),

  constraint relocation_facility_tasks_unique
    unique (facility_id, task_type_id)
);

alter table public.relocation_facility_tasks enable row level security;

create index if not exists relocation_facility_tasks_facility_idx
  on public.relocation_facility_tasks(facility_id);

create index if not exists relocation_facility_tasks_project_idx
  on public.relocation_facility_tasks(project_id);


do $$ begin
  create trigger relocation_facility_tasks_touch_updated_at
    before update on public.relocation_facility_tasks
    for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;


-- =====================================================================
-- RLS — 모두 회사 스코프
-- =====================================================================

-- ===== relocation_splices =============================================
drop policy if exists relocation_splices_all on public.relocation_splices;
create policy relocation_splices_all
  on public.relocation_splices
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


-- ===== relocation_splitters ===========================================
drop policy if exists relocation_splitters_all on public.relocation_splitters;
create policy relocation_splitters_all
  on public.relocation_splitters
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


-- ===== relocation_splitter_ports — splitter → project → company 추적 ==
drop policy if exists relocation_splitter_ports_all on public.relocation_splitter_ports;
create policy relocation_splitter_ports_all
  on public.relocation_splitter_ports
  for all
  using (
    splitter_id in (
      select s.id from public.relocation_splitters s
      join public.relocation_projects p on p.id = s.project_id
      where p.company_id = (select company_id from public.current_employee())
    )
  )
  with check (
    splitter_id in (
      select s.id from public.relocation_splitters s
      join public.relocation_projects p on p.id = s.project_id
      where p.company_id = (select company_id from public.current_employee())
    )
  );


-- ===== relocation_task_type_master — 회사 단위 직접 =====================
drop policy if exists relocation_task_type_master_all on public.relocation_task_type_master;
create policy relocation_task_type_master_all
  on public.relocation_task_type_master
  for all
  using (
    company_id = (select company_id from public.current_employee())
  )
  with check (
    company_id = (select company_id from public.current_employee())
  );


-- ===== relocation_facility_tasks ======================================
drop policy if exists relocation_facility_tasks_all on public.relocation_facility_tasks;
create policy relocation_facility_tasks_all
  on public.relocation_facility_tasks
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
grant select, insert, update, delete on public.relocation_splices              to authenticated;
grant select, insert, update, delete on public.relocation_splitters            to authenticated;
grant select, insert, update, delete on public.relocation_splitter_ports      to authenticated;
grant select, insert, update, delete on public.relocation_task_type_master    to authenticated;
grant select, insert, update, delete on public.relocation_facility_tasks      to authenticated;

grant all on public.relocation_splices            to service_role;
grant all on public.relocation_splitters          to service_role;
grant all on public.relocation_splitter_ports     to service_role;
grant all on public.relocation_task_type_master   to service_role;
grant all on public.relocation_facility_tasks     to service_role;


-- =====================================================================
-- 마이그 0037 완료.
--
-- 시드 데이터:
--   - 회사 1개 기준 14종 × 1 회사 = 14 row insert
--   - 추후 회사 증가 시 별도 처리 필요 (트리거 또는 회원가입 흐름에서)
--
-- 다음 단계: 0038_relocation_phases.sql
--   - 차수 (phases)
--   - 차수별 작업 (phase_tasks)
--   - 양쪽 작업자 페어링 (task_pairs)
-- =====================================================================
