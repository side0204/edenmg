-- =====================================================================
-- edenMG  M3 Phase 2-B 후속 — 케이블 마스터 + 일보 세그먼트 cable_code
-- Migration 0014
--   1) cables 테이블 (회사별 케이블 마스터, 자재 마스터 패턴 동일)
--   2) connection_report_segments.cable_code text 추가
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0011~0013 이 먼저 실행돼 있어야 한다.
--
-- 정책 (owner 결정):
--   - 케이블ID 는 일보 작성 시 검색(마스터 자동완성) 또는 직접입력 또는 공란
--   - 마스터에 매치되면 client-side 에서 cable_spec 자동 prefill
--   - segments 는 free text cable_code 만 저장 (마스터 ref 없음 — 마스터 비활성/삭제와 무관)
-- =====================================================================


-- ===== TABLE: cables (회사 케이블 마스터) ============================
create table if not exists public.cables (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete restrict,
  code        text not null,                                  -- 케이블ID (회사 내 unique)
  spec_enum   public.cable_spec,                              -- 케이블 규격 (선택)
  notes       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists cables_company_code_uniq
  on public.cables(company_id, code);

create index if not exists cables_company_active_idx
  on public.cables(company_id, is_active);

alter table public.cables enable row level security;

drop trigger if exists cables_touch_updated_at on public.cables;
create trigger cables_touch_updated_at
  before update on public.cables
  for each row execute function public.touch_updated_at();

-- RLS: select 같은 회사, CUD admin/ceo
drop policy if exists cables_select on public.cables;
create policy cables_select
  on public.cables
  for select
  using (company_id = (select company_id from public.current_employee()));

drop policy if exists cables_admin_all on public.cables;
create policy cables_admin_all
  on public.cables
  for all
  using (
    company_id = (select company_id from public.current_employee())
    and (select permission from public.current_employee()) in ('admin', 'ceo')
  )
  with check (
    company_id = (select company_id from public.current_employee())
    and (select permission from public.current_employee()) in ('admin', 'ceo')
  );

grant select, insert, update on public.cables to authenticated;


-- ===== ALTER: connection_report_segments.cable_code ===================
alter table public.connection_report_segments
  add column if not exists cable_code text;
