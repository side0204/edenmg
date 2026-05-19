-- =====================================================================
-- edenMG  M4 자재관리 Phase 1
-- Migration 0025 — can_manage_stock 토글 + daily_report_materials + node_materials.holding_id + RLS 보강
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0022~0024 가 먼저.
--
-- 정책 요약 (owner 결정):
--   - employees.can_manage_stock — admin 만 토글로 부여. 자재 입출고·import 권한.
--   - connection_node_materials.holding_id — 일보 자재 사용을 holding 에서 차감하는 경우 FK.
--   - daily_report_materials — 일반일보 자재 구조화 (기존 materials_used 텍스트는 deprecate).
--   - RLS 보강: 0022~0024 의 admin-only 정책을 can_manage_stock 도 허용하도록 확장.
-- =====================================================================


-- ===== employees.can_manage_stock =====================================
alter table public.employees
  add column if not exists can_manage_stock boolean not null default false;


-- ===== connection_node_materials.holding_id ==========================
alter table public.connection_node_materials
  add column if not exists holding_id
    uuid references public.worker_holdings(id) on delete set null;

create index if not exists connection_node_materials_holding_idx
  on public.connection_node_materials(holding_id)
  where holding_id is not null;


-- ===== TABLE: daily_report_materials =================================
-- 일반일보(외선·기타) 의 자재 사용 행. 접속일보의 connection_node_materials 와 동일 패턴.
-- material_id (마스터 ref) / custom_name (직접입력) / holding_id (홀딩 차감) 셋 중 하나 이상.
create table if not exists public.daily_report_materials (
  id              uuid primary key default gen_random_uuid(),
  report_id       uuid not null references public.work_daily_reports(id) on delete cascade,
  holding_id      uuid references public.worker_holdings(id) on delete set null,
  material_id     uuid references public.materials(id) on delete restrict,
  custom_name     text,
  custom_spec     text,
  custom_unit     text,
  quantity        numeric(14, 3) not null check (quantity > 0),
  notes           text,
  created_at      timestamptz not null default now(),
  -- master 또는 holding 또는 custom 셋 중 최소 하나
  check (
    material_id is not null
    or holding_id is not null
    or (custom_name is not null and length(btrim(custom_name)) > 0)
  )
);

create index if not exists daily_report_materials_report_idx
  on public.daily_report_materials(report_id);
create index if not exists daily_report_materials_holding_idx
  on public.daily_report_materials(holding_id)
  where holding_id is not null;

alter table public.daily_report_materials enable row level security;


-- ===== RLS: daily_report_materials ===================================
-- report 의 RLS 와 동일 패턴 — 같은 회사 select, 작성자+대기 OR 담당자/admin update
drop policy if exists daily_report_materials_all on public.daily_report_materials;
create policy daily_report_materials_all
  on public.daily_report_materials
  for all
  using (
    exists (
      select 1 from public.work_daily_reports r
      join public.works w on w.id = r.work_id
      where r.id = daily_report_materials.report_id
        and w.company_id = (select company_id from public.current_employee())
    )
  )
  with check (
    exists (
      select 1 from public.work_daily_reports r
      join public.works w on w.id = r.work_id
      where r.id = daily_report_materials.report_id
        and w.company_id = (select company_id from public.current_employee())
        and (
          (r.author_employee_id = (select id from public.current_employee()) and r.status = '대기')
          or (select permission from public.current_employee()) in ('admin', 'ceo')
          or w.assignee_employee_id = (select id from public.current_employee())
        )
    )
  );

grant select, insert, update, delete on public.daily_report_materials to authenticated;


-- ===== RLS 보강: warehouses / stock_receipts / stock_lots / worker_holdings / stock_issuances =====
-- 0022~0024 의 admin-only 정책을 can_manage_stock 도 허용하도록 확장.
-- (RLS 정책 재정의)

-- warehouses
drop policy if exists warehouses_admin_all on public.warehouses;
create policy warehouses_admin_all
  on public.warehouses
  for all
  using (
    company_id = (select company_id from public.current_employee())
    and (
      (select permission from public.current_employee()) in ('admin', 'ceo')
      or (select can_manage_stock from public.current_employee()) = true
    )
  )
  with check (
    company_id = (select company_id from public.current_employee())
    and (
      (select permission from public.current_employee()) in ('admin', 'ceo')
      or (select can_manage_stock from public.current_employee()) = true
    )
  );

-- stock_receipts insert
drop policy if exists stock_receipts_admin_insert on public.stock_receipts;
create policy stock_receipts_admin_insert
  on public.stock_receipts
  for insert
  with check (
    company_id = (select company_id from public.current_employee())
    and (
      (select permission from public.current_employee()) in ('admin', 'ceo')
      or (select can_manage_stock from public.current_employee()) = true
    )
  );

-- stock_lots insert/update
drop policy if exists stock_lots_admin_insert on public.stock_lots;
create policy stock_lots_admin_insert
  on public.stock_lots
  for insert
  with check (
    company_id = (select company_id from public.current_employee())
    and (
      (select permission from public.current_employee()) in ('admin', 'ceo')
      or (select can_manage_stock from public.current_employee()) = true
    )
  );

drop policy if exists stock_lots_admin_update on public.stock_lots;
create policy stock_lots_admin_update
  on public.stock_lots
  for update
  using (
    company_id = (select company_id from public.current_employee())
    and (
      (select permission from public.current_employee()) in ('admin', 'ceo')
      or (select can_manage_stock from public.current_employee()) = true
    )
  )
  with check (
    company_id = (select company_id from public.current_employee())
  );

-- worker_holdings (admin/can_manage_stock 가 등록, 본인이 사용 차감)
drop policy if exists worker_holdings_admin_all on public.worker_holdings;
create policy worker_holdings_admin_all
  on public.worker_holdings
  for all
  using (
    company_id = (select company_id from public.current_employee())
    and (
      (select permission from public.current_employee()) in ('admin', 'ceo')
      or (select can_manage_stock from public.current_employee()) = true
    )
  )
  with check (
    company_id = (select company_id from public.current_employee())
    and (
      (select permission from public.current_employee()) in ('admin', 'ceo')
      or (select can_manage_stock from public.current_employee()) = true
    )
  );

-- stock_issuances insert
drop policy if exists stock_issuances_admin_insert on public.stock_issuances;
create policy stock_issuances_admin_insert
  on public.stock_issuances
  for insert
  with check (
    company_id = (select company_id from public.current_employee())
    and (
      (select permission from public.current_employee()) in ('admin', 'ceo')
      or (select can_manage_stock from public.current_employee()) = true
    )
  );

-- materials CUD (자재 마스터 import 권한도 can_manage_stock 에 허용)
drop policy if exists materials_admin_all on public.materials;
create policy materials_admin_all
  on public.materials
  for all
  using (
    company_id = (select company_id from public.current_employee())
    and (
      (select permission from public.current_employee()) in ('admin', 'ceo')
      or (select can_manage_stock from public.current_employee()) = true
    )
  )
  with check (
    company_id = (select company_id from public.current_employee())
    and (
      (select permission from public.current_employee()) in ('admin', 'ceo')
      or (select can_manage_stock from public.current_employee()) = true
    )
  );
