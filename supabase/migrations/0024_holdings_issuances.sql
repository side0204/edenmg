-- =====================================================================
-- edenMG  M4 자재관리 Phase 1
-- Migration 0024 — worker_holdings + stock_issuances
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0023 이 먼저.
--
-- 정책 요약 (owner 결정):
--   - worker_holdings: 작업자가 들고 있는 자재. (employee, lot, work) unique.
--                      동일 (작업자·lot·작업) 추가 출고 시 quantity 누적 (UPSERT).
--   - stock_issuances: 출고 audit log. append-only.
--   - 출고는 admin (또는 can_manage_stock, 0025) 만 등록. 작업자는 본인 holding select.
--   - 사용 차감은 일보 server action 에서 (0025 의 RPC 또는 server action 로직).
-- =====================================================================


-- ===== TABLE: worker_holdings ========================================
create table if not exists public.worker_holdings (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete restrict,
  employee_id         uuid not null references public.employees(id) on delete restrict,
  lot_id              uuid not null references public.stock_lots(id) on delete restrict,
  work_id             uuid not null references public.works(id) on delete restrict,
  quantity_remaining  numeric(14, 3) not null check (quantity_remaining >= 0),
  first_issued_at     timestamptz not null default now(),
  last_issued_at      timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (employee_id, lot_id, work_id)
);

create index if not exists worker_holdings_employee_idx
  on public.worker_holdings(employee_id, quantity_remaining)
  where quantity_remaining > 0;
create index if not exists worker_holdings_work_idx on public.worker_holdings(work_id);
create index if not exists worker_holdings_lot_idx on public.worker_holdings(lot_id);

alter table public.worker_holdings enable row level security;

drop trigger if exists worker_holdings_touch_updated_at on public.worker_holdings;
create trigger worker_holdings_touch_updated_at
  before update on public.worker_holdings
  for each row execute function public.touch_updated_at();


-- ===== TABLE: stock_issuances (audit log) ============================
create table if not exists public.stock_issuances (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete restrict,
  lot_id          uuid not null references public.stock_lots(id) on delete restrict,
  holding_id      uuid not null references public.worker_holdings(id) on delete restrict,
  employee_id     uuid not null references public.employees(id) on delete restrict,
  work_id         uuid not null references public.works(id) on delete restrict,
  quantity        numeric(14, 3) not null check (quantity > 0),
  issued_at       timestamptz not null default now(),
  issued_by       uuid not null references public.employees(id) on delete restrict,
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists stock_issuances_company_idx
  on public.stock_issuances(company_id, issued_at desc);
create index if not exists stock_issuances_employee_idx
  on public.stock_issuances(employee_id, issued_at desc);
create index if not exists stock_issuances_work_idx on public.stock_issuances(work_id);

alter table public.stock_issuances enable row level security;


-- ===== RLS: worker_holdings ==========================================
-- SELECT: 본인 + 같은 회사 admin/can_manage_stock 가능 (현재는 admin 만 — 0025 에서 토글)
-- 단순화: 같은 회사 누구나 select (작업자가 같은 작업 동료의 자재도 확인하면 인수인계 등에 편리)
drop policy if exists worker_holdings_select on public.worker_holdings;
create policy worker_holdings_select
  on public.worker_holdings
  for select
  using (company_id = (select company_id from public.current_employee()));

-- INSERT/UPDATE: admin (출고 등록 시) + server action 에서 사용 차감
drop policy if exists worker_holdings_admin_all on public.worker_holdings;
create policy worker_holdings_admin_all
  on public.worker_holdings
  for all
  using (
    company_id = (select company_id from public.current_employee())
    and (select permission from public.current_employee()) in ('admin', 'ceo')
  )
  with check (
    company_id = (select company_id from public.current_employee())
    and (select permission from public.current_employee()) in ('admin', 'ceo')
  );

-- 본인 holding 의 quantity_remaining 만 update (일보 사용 차감용 — server action 이 본인 식별)
drop policy if exists worker_holdings_self_update on public.worker_holdings;
create policy worker_holdings_self_update
  on public.worker_holdings
  for update
  using (
    company_id = (select company_id from public.current_employee())
    and employee_id = (select id from public.current_employee())
  )
  with check (
    company_id = (select company_id from public.current_employee())
    and employee_id = (select id from public.current_employee())
  );


-- ===== RLS: stock_issuances ==========================================
drop policy if exists stock_issuances_select on public.stock_issuances;
create policy stock_issuances_select
  on public.stock_issuances
  for select
  using (company_id = (select company_id from public.current_employee()));

drop policy if exists stock_issuances_admin_insert on public.stock_issuances;
create policy stock_issuances_admin_insert
  on public.stock_issuances
  for insert
  with check (
    company_id = (select company_id from public.current_employee())
    and (select permission from public.current_employee()) in ('admin', 'ceo')
  );
-- update/delete 미부여 (append-only)


-- ===== GRANTS =========================================================
grant select, insert, update on public.worker_holdings to authenticated;
grant select, insert         on public.stock_issuances to authenticated;
