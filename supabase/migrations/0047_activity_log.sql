-- =====================================================================
-- edenMG  베타 사용 모니터링 — 접속 현황 · 로그인 기록
-- Migration 0047 — employees.last_seen_at + activity_logs
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0001~0046 이 먼저 실행돼 있어야 한다.
--
-- 본 마이그 내용:
--   - employees.last_seen_at — 마지막 활동 시각. proxy 가 5분 쿨다운으로 갱신.
--       관리자 「접속 현황」 페이지에서 최근 10분 이내 활동 = 접속 중으로 표시.
--   - activity_logs — 로그인·로그아웃 기록 (append-only). 같은 회사 관리자만 조회.
-- =====================================================================


-- ===== employees.last_seen_at =========================================
-- 마지막 활동 시각. 기존 employees_update_self RLS 가 본인 row 갱신을 허용한다.
alter table public.employees
  add column if not exists last_seen_at timestamptz;

create index if not exists employees_last_seen_idx
  on public.employees (company_id, last_seen_at desc);


-- ===== TABLE: activity_logs ===========================================
-- 로그인·로그아웃 이벤트. update/delete GRANT 미부여 (append-only).
create table if not exists public.activity_logs (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  action      text not null check (action in ('login', 'logout')),
  created_at  timestamptz not null default now()
);

alter table public.activity_logs enable row level security;

create index if not exists activity_logs_company_created_idx
  on public.activity_logs (company_id, created_at desc);


-- ===== RLS: activity_logs =============================================
-- select: 같은 회사 관리자만
drop policy if exists activity_logs_select on public.activity_logs;
create policy activity_logs_select
  on public.activity_logs
  for select
  using (
    company_id = (select company_id from public.current_employee())
    and (select permission from public.current_employee()) = 'admin'
  );

-- insert: 본인 행만 (로그인·로그아웃 시 자신의 기록 추가)
drop policy if exists activity_logs_insert on public.activity_logs;
create policy activity_logs_insert
  on public.activity_logs
  for insert
  with check (
    employee_id = (select id from public.current_employee())
    and company_id = (select company_id from public.current_employee())
  );


-- ===== GRANTS =========================================================
grant select, insert on public.activity_logs to authenticated;


-- =====================================================================
-- 마이그 0047 완료.
-- =====================================================================
