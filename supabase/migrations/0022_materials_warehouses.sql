-- =====================================================================
-- edenMG  M4 자재관리 Phase 1
-- Migration 0022 — materials 확장 + warehouses
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0011 (materials), 0001 (companies) 이 먼저.
--
-- 정책 요약 (owner 결정):
--   - 자재 마스터에 카테고리·기본단위·기본규격·발주처(사급)·발주처코드(사급) 추가
--   - 같은 발주처 안에서 발주처코드 unique
--   - warehouses: 본사창고만 운영 (현재). 현장창고(site)는 Phase 3 확장 대비.
--   - 회사당 1개 본사창고 자동 생성 (idempotent insert)
--   - admin + can_manage_stock 만 CUD. 같은 회사 누구나 SELECT.
-- =====================================================================


-- ===== materials 확장 =================================================
alter table public.materials
  add column if not exists category         text,
  add column if not exists default_unit     text,
  add column if not exists default_spec     text,
  add column if not exists default_supplier text,
  add column if not exists supplier_code    text;

-- 사급 자재 발주처+코드 조합 unique (코드 있을 때만)
create unique index if not exists materials_company_supplier_code_uniq
  on public.materials(company_id, default_supplier, supplier_code)
  where supplier_code is not null;

create index if not exists materials_company_supplier_idx
  on public.materials(company_id, default_supplier)
  where default_supplier is not null;


-- ===== TABLE: warehouses ==============================================
create table if not exists public.warehouses (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete restrict,
  type        text not null check (type in ('headquarters', 'site')),
  name        text not null,
  work_id     uuid references public.works(id) on delete set null,
  address     text,
  notes       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- 현장창고(site) 는 work_id 필수, 본사창고(headquarters) 는 work_id 금지
  check (
    (type = 'site' and work_id is not null) or
    (type = 'headquarters' and work_id is null)
  )
);

-- 본사창고는 회사당 1개만 (idempotent 처리용)
create unique index if not exists warehouses_company_headquarters_uniq
  on public.warehouses(company_id)
  where type = 'headquarters';

create index if not exists warehouses_company_idx on public.warehouses(company_id, is_active);
create index if not exists warehouses_work_idx on public.warehouses(work_id) where work_id is not null;

alter table public.warehouses enable row level security;

drop trigger if exists warehouses_touch_updated_at on public.warehouses;
create trigger warehouses_touch_updated_at
  before update on public.warehouses
  for each row execute function public.touch_updated_at();


-- ===== RLS: warehouses ================================================
drop policy if exists warehouses_select on public.warehouses;
create policy warehouses_select
  on public.warehouses
  for select
  using (company_id = (select company_id from public.current_employee()));

-- CUD: admin (can_manage_stock 토글은 0025 에서 추가 — 일단 admin 만)
drop policy if exists warehouses_admin_all on public.warehouses;
create policy warehouses_admin_all
  on public.warehouses
  for all
  using (
    company_id = (select company_id from public.current_employee())
    and (select permission from public.current_employee()) in ('admin', 'ceo')
  )
  with check (
    company_id = (select company_id from public.current_employee())
    and (select permission from public.current_employee()) in ('admin', 'ceo')
  );

grant select, insert, update on public.warehouses to authenticated;


-- ===== SEED: 본사창고 자동 생성 ======================================
-- 모든 회사에 본사창고 1개씩. 이미 있으면 skip (unique index 가 보장).
insert into public.warehouses (company_id, type, name)
select c.id, 'headquarters', '본사 창고'
from public.companies c
on conflict do nothing;
