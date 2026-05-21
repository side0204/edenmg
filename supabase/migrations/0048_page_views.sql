-- =====================================================================
-- edenMG  베타 사용 모니터링 — 페이지(메뉴) 사용량
-- Migration 0048 — page_views + page_view_summary RPC
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0001~0047 이 먼저 실행돼 있어야 한다.
--
-- 본 마이그 내용:
--   - page_views — 페이지 방문 기록 (append-only). proxy 가 네비게이션마다 1행.
--   - page_view_summary(_since) — 경로별 방문수 집계 RPC (관리자 페이지용).
-- =====================================================================


-- ===== TABLE: page_views ==============================================
-- 페이지 방문 1건 = 1행. update/delete GRANT 미부여 (append-only).
create table if not exists public.page_views (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  path        text not null,
  created_at  timestamptz not null default now()
);

alter table public.page_views enable row level security;

create index if not exists page_views_company_created_idx
  on public.page_views (company_id, created_at desc);


-- ===== RLS: page_views ================================================
-- select: 같은 회사 관리자만
drop policy if exists page_views_select on public.page_views;
create policy page_views_select
  on public.page_views
  for select
  using (
    company_id = (select company_id from public.current_employee())
    and (select permission from public.current_employee()) = 'admin'
  );

-- insert: 본인 행만
drop policy if exists page_views_insert on public.page_views;
create policy page_views_insert
  on public.page_views
  for insert
  with check (
    employee_id = (select id from public.current_employee())
    and company_id = (select company_id from public.current_employee())
  );


-- ===== GRANTS =========================================================
grant select, insert on public.page_views to authenticated;


-- ===== RPC: page_view_summary =========================================
-- 경로별 방문수 집계. security definer 아님 → 호출자 RLS 적용
--   (page_views_select 가 같은 회사 관리자로 제한).
create or replace function public.page_view_summary(_since timestamptz)
returns table (path text, cnt bigint)
language sql
stable
as $$
  select pv.path, count(*)::bigint as cnt
  from public.page_views pv
  where pv.created_at >= _since
  group by pv.path
$$;

revoke all on function public.page_view_summary(timestamptz) from public;
grant execute on function public.page_view_summary(timestamptz) to authenticated;


-- =====================================================================
-- 마이그 0048 완료.
-- =====================================================================
