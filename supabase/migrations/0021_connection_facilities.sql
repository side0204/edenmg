-- =====================================================================
-- edenMG  M3 Phase 2-D 함체·국사 마스터
-- Migration 0021 — connection_facilities + connection_plan_nodes.master_id
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0011~0013 이 먼저 실행돼 있어야 한다.
--
-- 정책 요약 (owner 결정):
--   - 함체·국사 통합 테이블 (facility_type='station' or 'box')
--   - 회사별 (type, code) unique — code 가 있을 때만
--   - admin 만 CUD. 같은 회사 누구나 SELECT (작업구간 등록 시 자동완성 사용)
--   - 함체 enum 규격 (cable_spec) — 함체만 사용. 국사는 NULL.
--   - GPS 좌표 (선택) — 한 번 입력해두면 같은 함체 다음 작업 시 재사용 가능
--   - plan_node 에 master_id FK (선택) — 없어도 자유 입력 가능 (기존 동작 유지)
-- =====================================================================


-- ===== TABLE: connection_facilities ===================================
create table if not exists public.connection_facilities (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete restrict,
  facility_type   text not null check (facility_type in ('station', 'box')),
  name            text not null,
  code            text,                              -- 회사 내 (type, code) unique
  spec_enum       public.cable_spec,                 -- 함체 규격 (국사는 NULL)
  address         text,
  lat             numeric(10, 7),
  lng             numeric(10, 7),
  notes           text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists connection_facilities_company_type_code_uniq
  on public.connection_facilities(company_id, facility_type, code)
  where code is not null;

create index if not exists connection_facilities_company_type_idx
  on public.connection_facilities(company_id, facility_type, is_active);

alter table public.connection_facilities enable row level security;

drop trigger if exists connection_facilities_touch_updated_at on public.connection_facilities;
create trigger connection_facilities_touch_updated_at
  before update on public.connection_facilities
  for each row execute function public.touch_updated_at();


-- ===== RLS ============================================================
-- 같은 회사 누구나 select (자동완성·통계에 사용)
drop policy if exists connection_facilities_select on public.connection_facilities;
create policy connection_facilities_select
  on public.connection_facilities
  for select
  using (company_id = (select company_id from public.current_employee()));

-- admin 만 CUD
drop policy if exists connection_facilities_admin_all on public.connection_facilities;
create policy connection_facilities_admin_all
  on public.connection_facilities
  for all
  using (
    company_id = (select company_id from public.current_employee())
    and (select permission from public.current_employee()) in ('admin', 'ceo')
  )
  with check (
    company_id = (select company_id from public.current_employee())
    and (select permission from public.current_employee()) in ('admin', 'ceo')
  );

grant select, insert, update on public.connection_facilities to authenticated;


-- ===== ALTER: connection_plan_nodes.master_id =========================
-- 마스터에서 선택했을 때 FK. 자유 입력 시 NULL (기존 동작 유지).
-- 마스터 삭제 시 SET NULL — plan_node 의 텍스트 (name/code/spec) 는 snapshot 으로 유지.
alter table public.connection_plan_nodes
  add column if not exists master_id
    uuid references public.connection_facilities(id) on delete set null;

create index if not exists connection_plan_nodes_master_idx
  on public.connection_plan_nodes(master_id)
  where master_id is not null;
