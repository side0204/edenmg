-- =====================================================================
-- edenMG  M3 Phase 2-B 접속일보 (report side)
-- Migration 0012 — connection_reports + connection_report_segments
--                + connection_node_materials + connection_node_tasks
--                + ALTER connection_plan_nodes ADD added_during_report_id (forward FK 회피)
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0011 이 먼저 실행돼 있어야 한다.
-- =====================================================================


-- ===== TABLE: connection_reports =====================================
create table if not exists public.connection_reports (
  id                   uuid primary key default gen_random_uuid(),
  work_id              uuid not null references public.works(id)     on delete cascade,
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

create index if not exists connection_reports_work_idx
  on public.connection_reports(work_id, report_date);
create index if not exists connection_reports_author_idx
  on public.connection_reports(author_employee_id, report_date);
create index if not exists connection_reports_pending_idx
  on public.connection_reports(status) where status = '대기';

alter table public.connection_reports enable row level security;

drop trigger if exists connection_reports_touch_updated_at on public.connection_reports;
create trigger connection_reports_touch_updated_at
  before update on public.connection_reports
  for each row execute function public.touch_updated_at();


-- ===== TABLE: connection_report_segments =============================
-- 한 일보 안에서 각 cable(plan_nodes 의 parent→this edge) 에 대한 실 작업 기록
create table if not exists public.connection_report_segments (
  id              uuid primary key default gen_random_uuid(),
  report_id       uuid not null references public.connection_reports(id) on delete cascade,
  plan_node_id    uuid not null references public.connection_plan_nodes(id) on delete restrict,
  cable_spec      public.cable_spec not null,
  line_numbers    text not null,
  is_completed    boolean not null default true,
  segment_notes   text,
  created_at      timestamptz not null default now(),
  unique (report_id, plan_node_id)
);

create index if not exists connection_report_segments_report_idx
  on public.connection_report_segments(report_id);

alter table public.connection_report_segments enable row level security;


-- ===== TABLE: connection_node_materials =============================
create table if not exists public.connection_node_materials (
  id              uuid primary key default gen_random_uuid(),
  report_id       uuid not null references public.connection_reports(id) on delete cascade,
  plan_node_id    uuid not null references public.connection_plan_nodes(id) on delete restrict,
  -- 마스터 OR 직접 입력 둘 중 하나
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

create index if not exists connection_node_materials_report_idx
  on public.connection_node_materials(report_id, plan_node_id);

alter table public.connection_node_materials enable row level security;


-- ===== TABLE: connection_node_tasks ================================
create table if not exists public.connection_node_tasks (
  id                uuid primary key default gen_random_uuid(),
  report_id         uuid not null references public.connection_reports(id) on delete cascade,
  plan_node_id      uuid not null references public.connection_plan_nodes(id) on delete restrict,
  task_type         public.connection_task_type not null,
  custom_task_name  text,
  task_count        int  not null check (task_count > 0),
  notes             text,
  created_at        timestamptz not null default now(),
  check (
    (task_type <> '기타' and custom_task_name is null) or
    (task_type = '기타' and custom_task_name is not null and length(btrim(custom_task_name)) > 0)
  )
);

create index if not exists connection_node_tasks_report_idx
  on public.connection_node_tasks(report_id, plan_node_id);

alter table public.connection_node_tasks enable row level security;


-- ===== ALTER connection_plan_nodes ADD added_during_report_id =========
-- 0011 에서 정의한 plan_nodes 에 forward FK 추가.
alter table public.connection_plan_nodes
  add column if not exists added_during_report_id
    uuid references public.connection_reports(id) on delete set null;

create index if not exists connection_plan_nodes_added_during_idx
  on public.connection_plan_nodes(added_during_report_id)
  where added_during_report_id is not null;


-- ===== RLS: connection_reports ======================================
drop policy if exists connection_reports_select on public.connection_reports;
create policy connection_reports_select
  on public.connection_reports
  for select
  using (
    exists (
      select 1 from public.works w
      where w.id = connection_reports.work_id
        and w.company_id = (select company_id from public.current_employee())
    )
  );

drop policy if exists connection_reports_insert on public.connection_reports;
create policy connection_reports_insert
  on public.connection_reports
  for insert
  with check (
    author_employee_id = (select id from public.current_employee())
    and exists (
      select 1 from public.works w
      where w.id = connection_reports.work_id
        and w.company_id = (select company_id from public.current_employee())
    )
    and (
      (select permission from public.current_employee()) in ('admin', 'ceo')
      or exists (
        select 1 from public.work_assignments wa
        where wa.work_id = connection_reports.work_id
          and wa.employee_id = (select id from public.current_employee())
      )
    )
  );

drop policy if exists connection_reports_update on public.connection_reports;
create policy connection_reports_update
  on public.connection_reports
  for update
  using (
    exists (
      select 1 from public.works w
      where w.id = connection_reports.work_id
        and w.company_id = (select company_id from public.current_employee())
    )
    and (
      (author_employee_id = (select id from public.current_employee()) and status = '대기')
      or (select permission from public.current_employee()) in ('admin', 'ceo')
      or exists (
        select 1 from public.works w
        where w.id = connection_reports.work_id
          and w.assignee_employee_id = (select id from public.current_employee())
      )
    )
  )
  with check (
    exists (
      select 1 from public.works w
      where w.id = connection_reports.work_id
        and w.company_id = (select company_id from public.current_employee())
    )
  );


-- ===== RLS: connection_report_segments / node_materials / node_tasks ==
-- report 의 RLS 를 따른다. 같은 회사 + (작성자+대기 OR 담당자/admin) 시 update/insert 가능.
-- 모두 동일 패턴이라 함수화 대신 정책 직접 작성.

drop policy if exists connection_report_segments_all on public.connection_report_segments;
create policy connection_report_segments_all
  on public.connection_report_segments
  for all
  using (
    exists (
      select 1 from public.connection_reports r
      join public.works w on w.id = r.work_id
      where r.id = connection_report_segments.report_id
        and w.company_id = (select company_id from public.current_employee())
    )
  )
  with check (
    exists (
      select 1 from public.connection_reports r
      join public.works w on w.id = r.work_id
      where r.id = connection_report_segments.report_id
        and w.company_id = (select company_id from public.current_employee())
        and (
          (r.author_employee_id = (select id from public.current_employee()) and r.status = '대기')
          or (select permission from public.current_employee()) in ('admin', 'ceo')
          or w.assignee_employee_id = (select id from public.current_employee())
        )
    )
  );

drop policy if exists connection_node_materials_all on public.connection_node_materials;
create policy connection_node_materials_all
  on public.connection_node_materials
  for all
  using (
    exists (
      select 1 from public.connection_reports r
      join public.works w on w.id = r.work_id
      where r.id = connection_node_materials.report_id
        and w.company_id = (select company_id from public.current_employee())
    )
  )
  with check (
    exists (
      select 1 from public.connection_reports r
      join public.works w on w.id = r.work_id
      where r.id = connection_node_materials.report_id
        and w.company_id = (select company_id from public.current_employee())
        and (
          (r.author_employee_id = (select id from public.current_employee()) and r.status = '대기')
          or (select permission from public.current_employee()) in ('admin', 'ceo')
          or w.assignee_employee_id = (select id from public.current_employee())
        )
    )
  );

drop policy if exists connection_node_tasks_all on public.connection_node_tasks;
create policy connection_node_tasks_all
  on public.connection_node_tasks
  for all
  using (
    exists (
      select 1 from public.connection_reports r
      join public.works w on w.id = r.work_id
      where r.id = connection_node_tasks.report_id
        and w.company_id = (select company_id from public.current_employee())
    )
  )
  with check (
    exists (
      select 1 from public.connection_reports r
      join public.works w on w.id = r.work_id
      where r.id = connection_node_tasks.report_id
        and w.company_id = (select company_id from public.current_employee())
        and (
          (r.author_employee_id = (select id from public.current_employee()) and r.status = '대기')
          or (select permission from public.current_employee()) in ('admin', 'ceo')
          or w.assignee_employee_id = (select id from public.current_employee())
        )
    )
  );


-- ===== GRANTS =========================================================
grant select, insert, update         on public.connection_reports          to authenticated;
grant select, insert, update, delete on public.connection_report_segments  to authenticated;
grant select, insert, update, delete on public.connection_node_materials   to authenticated;
grant select, insert, update, delete on public.connection_node_tasks       to authenticated;
-- connection_reports 자체는 delete 미부여 (append-only); 자식 테이블은 폼 재저장 시 row 다시 작성하므로 delete 필요.
