-- =====================================================================
-- edenMG  M4 자재관리 Phase 1
-- Migration 0023 — stock_receipts + stock_lots
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0022 가 먼저.
--
-- 정책 요약 (owner 결정):
--   - stock_receipts: 입고 헤더 (한 번의 입고 행위). receipt → 1 lot 자동 생성.
--   - stock_lots: 재고 단위. quantity_remaining 추적. 출고/사용으로 차감, 반납으로 증가.
--   - lot 이 모두 소진되면 is_depleted=true (인덱스 효율). 반납 시 false 로 되돌림.
--   - source_type: '사급'/'지입'. 사급은 supplier 필수.
--   - receipt_type: '일반입고'/'직납입고'. 직납은 related_work_id 필수.
--   - admin 만 CUD (0025 에서 can_manage_stock 토글 부여).
--   - 회사 SELECT.
-- =====================================================================


-- ===== ENUM ===========================================================
do $$ begin
  create type public.stock_source_type as enum ('사급', '지입');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.stock_receipt_type as enum ('일반입고', '직납입고');
exception when duplicate_object then null; end $$;


-- ===== TABLE: stock_receipts (입고 헤더) ==============================
create table if not exists public.stock_receipts (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete restrict,
  warehouse_id      uuid not null references public.warehouses(id) on delete restrict,
  material_id       uuid not null references public.materials(id) on delete restrict,
  source_type       public.stock_source_type not null,
  receipt_type      public.stock_receipt_type not null,
  supplier          text,                          -- 사급 필수, 지입 NULL
  related_work_id   uuid references public.works(id) on delete set null,  -- 직납 필수
  quantity          numeric(14, 3) not null check (quantity > 0),
  unit_cost         numeric(14, 2),                -- 지입 시 사용
  notes             text,
  received_at       timestamptz not null default now(),
  received_by       uuid not null references public.employees(id) on delete restrict,
  created_at        timestamptz not null default now(),
  -- 사급은 supplier 필수
  check (
    (source_type = '사급' and supplier is not null and length(btrim(supplier)) > 0) or
    (source_type = '지입' and (supplier is null or length(btrim(supplier)) = 0))
  ),
  -- 직납은 related_work_id 필수
  check (
    (receipt_type = '직납입고' and related_work_id is not null) or
    (receipt_type = '일반입고')
  )
);

create index if not exists stock_receipts_company_idx on public.stock_receipts(company_id, received_at desc);
create index if not exists stock_receipts_material_idx on public.stock_receipts(material_id);
create index if not exists stock_receipts_warehouse_idx on public.stock_receipts(warehouse_id);
create index if not exists stock_receipts_supplier_idx on public.stock_receipts(company_id, supplier) where supplier is not null;

alter table public.stock_receipts enable row level security;


-- ===== TABLE: stock_lots (재고 단위) =================================
create table if not exists public.stock_lots (
  id                  uuid primary key default gen_random_uuid(),
  receipt_id          uuid not null references public.stock_receipts(id) on delete restrict,
  company_id          uuid not null references public.companies(id) on delete restrict,
  warehouse_id        uuid not null references public.warehouses(id) on delete restrict,
  material_id         uuid not null references public.materials(id) on delete restrict,
  source_type         public.stock_source_type not null,
  supplier            text,
  related_work_id     uuid references public.works(id) on delete set null,
  quantity_initial    numeric(14, 3) not null check (quantity_initial > 0),
  quantity_remaining  numeric(14, 3) not null check (quantity_remaining >= 0),
  is_depleted         boolean not null default false,
  barcode_value       text,                         -- QR/바코드 발행 시 (Phase 2)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists stock_lots_company_active_idx
  on public.stock_lots(company_id, is_depleted, warehouse_id);
create index if not exists stock_lots_material_idx on public.stock_lots(material_id);
create index if not exists stock_lots_supplier_idx
  on public.stock_lots(company_id, supplier)
  where supplier is not null;
create unique index if not exists stock_lots_receipt_uniq on public.stock_lots(receipt_id);

alter table public.stock_lots enable row level security;

drop trigger if exists stock_lots_touch_updated_at on public.stock_lots;
create trigger stock_lots_touch_updated_at
  before update on public.stock_lots
  for each row execute function public.touch_updated_at();


-- ===== RLS: stock_receipts ============================================
drop policy if exists stock_receipts_select on public.stock_receipts;
create policy stock_receipts_select
  on public.stock_receipts
  for select
  using (company_id = (select company_id from public.current_employee()));

drop policy if exists stock_receipts_admin_insert on public.stock_receipts;
create policy stock_receipts_admin_insert
  on public.stock_receipts
  for insert
  with check (
    company_id = (select company_id from public.current_employee())
    and (select permission from public.current_employee()) in ('admin', 'ceo')
  );

-- update/delete 미부여 (append-only)


-- ===== RLS: stock_lots ===============================================
drop policy if exists stock_lots_select on public.stock_lots;
create policy stock_lots_select
  on public.stock_lots
  for select
  using (company_id = (select company_id from public.current_employee()));

drop policy if exists stock_lots_admin_insert on public.stock_lots;
create policy stock_lots_admin_insert
  on public.stock_lots
  for insert
  with check (
    company_id = (select company_id from public.current_employee())
    and (select permission from public.current_employee()) in ('admin', 'ceo')
  );

-- quantity_remaining 차감/증가는 server action (admin 또는 시스템 트리거) 통해
drop policy if exists stock_lots_admin_update on public.stock_lots;
create policy stock_lots_admin_update
  on public.stock_lots
  for update
  using (
    company_id = (select company_id from public.current_employee())
    and (select permission from public.current_employee()) in ('admin', 'ceo')
  )
  with check (
    company_id = (select company_id from public.current_employee())
  );


-- ===== GRANTS =========================================================
grant select, insert        on public.stock_receipts to authenticated;
grant select, insert, update on public.stock_lots    to authenticated;
