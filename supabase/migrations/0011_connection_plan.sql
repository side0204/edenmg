-- =====================================================================
-- edenMG  M3 Phase 2-B 접속일보 (chain side)
-- Migration 0011 — connection_chains + connection_plan_nodes
--                + materials (회사 자재 마스터)
--                + cable_spec, plan_node_type, connection_task_type enum
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0001~0010 이 먼저 실행돼 있어야 한다.
--
-- 정책 요약 (owner 결정):
--   - 접속팀(worker_type='접속팀') 작업에만 사용. 외선·기타는 일반 일보(v2 에서 외선일보 별도 도입 예정).
--   - chain 트리: 상위국(root) → 함체들(분기 가능) → 하위국(leaf)
--   - 함체에 함체ID(고유식별번호) + GPS 관리
--   - 자재 마스터는 회사별. 명·규격·단위.
-- =====================================================================


-- ===== ENUM ===========================================================
do $$ begin
  create type public.cable_spec as enum (
    '1C', '1C(드랍)', '2C', '2C(드랍)', '12C', '36C', '72C', '144C', '288C', '576C'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.plan_node_type as enum ('upper_station', 'box', 'lower_station');
exception when duplicate_object then null; end $$;

do $$ begin
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
exception when duplicate_object then null; end $$;


-- ===== TABLE: materials (회사 자재 마스터) ===========================
create table if not exists public.materials (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete restrict,
  name        text not null,
  spec        text,
  unit        text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 같은 회사 안에서 name+spec 조합 unique (spec NULL 도 unique 키로 동작하도록 coalesce)
create unique index if not exists materials_company_name_spec_uniq
  on public.materials(company_id, name, coalesce(spec, ''));

create index if not exists materials_company_active_idx
  on public.materials(company_id, is_active);

alter table public.materials enable row level security;

drop trigger if exists materials_touch_updated_at on public.materials;
create trigger materials_touch_updated_at
  before update on public.materials
  for each row execute function public.touch_updated_at();

-- RLS: select 같은 회사, CUD admin/ceo
drop policy if exists materials_select on public.materials;
create policy materials_select
  on public.materials
  for select
  using (company_id = (select company_id from public.current_employee()));

drop policy if exists materials_admin_all on public.materials;
create policy materials_admin_all
  on public.materials
  for all
  using (
    company_id = (select company_id from public.current_employee())
    and (select permission from public.current_employee()) in ('admin', 'ceo')
  )
  with check (
    company_id = (select company_id from public.current_employee())
    and (select permission from public.current_employee()) in ('admin', 'ceo')
  );


-- ===== TABLE: connection_chains ======================================
create table if not exists public.connection_chains (
  id          uuid primary key default gen_random_uuid(),
  work_id     uuid not null references public.works(id) on delete cascade,
  name        text,
  position    int not null default 0,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists connection_chains_work_idx on public.connection_chains(work_id, position);

alter table public.connection_chains enable row level security;

drop trigger if exists connection_chains_touch_updated_at on public.connection_chains;
create trigger connection_chains_touch_updated_at
  before update on public.connection_chains
  for each row execute function public.touch_updated_at();


-- ===== TABLE: connection_plan_nodes ==================================
create table if not exists public.connection_plan_nodes (
  id                       uuid primary key default gen_random_uuid(),
  chain_id                 uuid not null references public.connection_chains(id) on delete cascade,
  parent_id                uuid references public.connection_plan_nodes(id) on delete cascade,
  position                 int not null default 0,
  node_type                public.plan_node_type not null,
  name                     text not null,
  code                     text,             -- 함체ID (UI 라벨 = "함체ID")
  spec                     text,
  lat                      numeric(10, 7),
  lng                      numeric(10, 7),
  address                  text,
  notes                    text,
  -- ad-hoc 추가 추적용 (작업자가 일보 작성 중 끼워넣은 함체)
  created_by_employee_id   uuid references public.employees(id) on delete set null,
  -- added_during_report_id 는 0012 에서 ALTER ADD COLUMN (forward FK 회피)
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check (node_type = 'upper_station' or parent_id is not null),
  check (node_type <> 'upper_station' or parent_id is null)
);

create index if not exists connection_plan_nodes_chain_idx
  on public.connection_plan_nodes(chain_id, parent_id, position);

alter table public.connection_plan_nodes enable row level security;

drop trigger if exists connection_plan_nodes_touch_updated_at on public.connection_plan_nodes;
create trigger connection_plan_nodes_touch_updated_at
  before update on public.connection_plan_nodes
  for each row execute function public.touch_updated_at();


-- ===== RLS: connection_chains =======================================
drop policy if exists connection_chains_select on public.connection_chains;
create policy connection_chains_select
  on public.connection_chains
  for select
  using (
    exists (
      select 1 from public.works w
      where w.id = connection_chains.work_id
        and w.company_id = (select company_id from public.current_employee())
    )
  );

-- chain CUD: admin/ceo OR can_manage_works OR 작업의 담당자
drop policy if exists connection_chains_manager_all on public.connection_chains;
create policy connection_chains_manager_all
  on public.connection_chains
  for all
  using (
    exists (
      select 1 from public.works w
      where w.id = connection_chains.work_id
        and w.company_id = (select company_id from public.current_employee())
        and (
          (select permission from public.current_employee()) in ('admin', 'ceo')
          or (select can_manage_works from public.current_employee()) is true
          or w.assignee_employee_id = (select id from public.current_employee())
        )
    )
  )
  with check (
    exists (
      select 1 from public.works w
      where w.id = connection_chains.work_id
        and w.company_id = (select company_id from public.current_employee())
        and (
          (select permission from public.current_employee()) in ('admin', 'ceo')
          or (select can_manage_works from public.current_employee()) is true
          or w.assignee_employee_id = (select id from public.current_employee())
        )
    )
  );


-- ===== RLS: connection_plan_nodes ===================================
drop policy if exists connection_plan_nodes_select on public.connection_plan_nodes;
create policy connection_plan_nodes_select
  on public.connection_plan_nodes
  for select
  using (
    exists (
      select 1
      from public.connection_chains c
      join public.works w on w.id = c.work_id
      where c.id = connection_plan_nodes.chain_id
        and w.company_id = (select company_id from public.current_employee())
    )
  );

-- 노드 CUD: chain 관리자(위 조건) + 작업의 배정자(ad-hoc 함체 추가용)
drop policy if exists connection_plan_nodes_cud on public.connection_plan_nodes;
create policy connection_plan_nodes_cud
  on public.connection_plan_nodes
  for all
  using (
    exists (
      select 1
      from public.connection_chains c
      join public.works w on w.id = c.work_id
      where c.id = connection_plan_nodes.chain_id
        and w.company_id = (select company_id from public.current_employee())
        and (
          (select permission from public.current_employee()) in ('admin', 'ceo')
          or (select can_manage_works from public.current_employee()) is true
          or w.assignee_employee_id = (select id from public.current_employee())
          or exists (
            select 1 from public.work_assignments wa
            where wa.work_id = w.id
              and wa.employee_id = (select id from public.current_employee())
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.connection_chains c
      join public.works w on w.id = c.work_id
      where c.id = connection_plan_nodes.chain_id
        and w.company_id = (select company_id from public.current_employee())
        and (
          (select permission from public.current_employee()) in ('admin', 'ceo')
          or (select can_manage_works from public.current_employee()) is true
          or w.assignee_employee_id = (select id from public.current_employee())
          or exists (
            select 1 from public.work_assignments wa
            where wa.work_id = w.id
              and wa.employee_id = (select id from public.current_employee())
          )
        )
    )
  );


-- ===== GRANTS =========================================================
grant select, insert, update on public.materials              to authenticated;
grant select, insert, update, delete on public.connection_chains      to authenticated;
grant select, insert, update, delete on public.connection_plan_nodes  to authenticated;
-- materials 는 delete 미부여 (is_active=false 로 비활성)
