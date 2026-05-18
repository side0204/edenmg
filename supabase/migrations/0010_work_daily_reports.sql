-- =====================================================================
-- edenMG  M3 작업관리 Phase 2 — 일일 작업일보 + works 확장
-- Migration 0010 — works.worker_type/worker_type_custom/assignee_employee_id
--                + work_daily_reports + work_worker_type·work_report_progress·work_report_status enum
--                + RLS
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0001~0009 가 먼저 실행돼 있어야 한다.
--
-- 정책 요약 (owner 결정):
--   - 작업자 구분: 접속팀 / 외선팀 / 기타(직접입력)
--   - 담당자(assignee) 1명 — 일보 결재자 역할
--   - 결재: 1단 (작성자 → 담당자 승인/반려)
--   - 작성 단위: 작업+날짜+작성자 unique (한 작업·한 날짜에 한 사람 1장)
--   - 작성 권한: 해당 작업 배정 직원 + admin/ceo
--   - 자재는 자유 텍스트, 사진은 이번 단계 미포함
--   - 진행률: enum (시작전/진행중/완료)
-- =====================================================================


-- ===== ENUM ===========================================================
do $$ begin
  create type public.work_worker_type as enum ('접속팀', '외선팀', '기타');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.work_report_progress as enum ('시작전', '진행중', '완료');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.work_report_status as enum ('대기', '승인', '반려');
exception when duplicate_object then null; end $$;


-- ===== works 확장 =====================================================
alter table public.works
  add column if not exists worker_type        public.work_worker_type,
  add column if not exists worker_type_custom text,
  add column if not exists assignee_employee_id uuid references public.employees(id) on delete restrict;

-- worker_type = '기타' 일 때만 worker_type_custom 사용
alter table public.works
  drop constraint if exists works_worker_type_custom_chk;
alter table public.works
  add constraint works_worker_type_custom_chk check (
    (worker_type is null and worker_type_custom is null) or
    (worker_type = '기타' and worker_type_custom is not null and length(btrim(worker_type_custom)) > 0) or
    (worker_type <> '기타' and worker_type_custom is null)
  );

create index if not exists works_assignee_idx on public.works(assignee_employee_id);


-- ===== TABLE: work_daily_reports ======================================
create table if not exists public.work_daily_reports (
  id                   uuid primary key default gen_random_uuid(),
  work_id              uuid not null references public.works(id)     on delete cascade,
  author_employee_id   uuid not null references public.employees(id) on delete restrict,
  report_date          date not null,

  content              text not null,                            -- 작업내역
  materials_used       text,                                     -- 사용 자재 (자유 텍스트)
  progress             public.work_report_progress not null default '진행중',
  notes                text,                                     -- 특이사항

  status               public.work_report_status not null default '대기',
  reviewed_by          uuid references public.employees(id) on delete restrict,
  reviewed_at          timestamptz,
  review_comment       text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  unique (work_id, report_date, author_employee_id)
);

alter table public.work_daily_reports enable row level security;

create index if not exists work_daily_reports_work_idx    on public.work_daily_reports(work_id, report_date);
create index if not exists work_daily_reports_author_idx  on public.work_daily_reports(author_employee_id, report_date);
create index if not exists work_daily_reports_pending_idx on public.work_daily_reports(status) where status = '대기';

drop trigger if exists work_daily_reports_touch_updated_at on public.work_daily_reports;
create trigger work_daily_reports_touch_updated_at
  before update on public.work_daily_reports
  for each row execute function public.touch_updated_at();


-- ===== RLS: work_daily_reports ========================================
-- 조회: 같은 회사 작업에 달린 일보 모두 (작업자·동료가 서로 일보 볼 수 있도록)
drop policy if exists work_daily_reports_select on public.work_daily_reports;
create policy work_daily_reports_select
  on public.work_daily_reports
  for select
  using (
    exists (
      select 1 from public.works w
      where w.id = work_daily_reports.work_id
        and w.company_id = (select company_id from public.current_employee())
    )
  );

-- 작성: author = 본인 + 같은 회사 작업 + (배정자 OR admin/ceo)
drop policy if exists work_daily_reports_insert on public.work_daily_reports;
create policy work_daily_reports_insert
  on public.work_daily_reports
  for insert
  with check (
    author_employee_id = (select id from public.current_employee())
    and exists (
      select 1 from public.works w
      where w.id = work_daily_reports.work_id
        and w.company_id = (select company_id from public.current_employee())
    )
    and (
      (select permission from public.current_employee()) in ('admin', 'ceo')
      or exists (
        select 1 from public.work_assignments wa
        where wa.work_id = work_daily_reports.work_id
          and wa.employee_id = (select id from public.current_employee())
      )
    )
  );

-- 수정: 본인 작성+대기  OR  담당자/admin/ceo (결재용). 회사 스코프는 필수.
drop policy if exists work_daily_reports_update on public.work_daily_reports;
create policy work_daily_reports_update
  on public.work_daily_reports
  for update
  using (
    exists (
      select 1 from public.works w
      where w.id = work_daily_reports.work_id
        and w.company_id = (select company_id from public.current_employee())
    )
    and (
      (author_employee_id = (select id from public.current_employee()) and status = '대기')
      or (select permission from public.current_employee()) in ('admin', 'ceo')
      or exists (
        select 1 from public.works w
        where w.id = work_daily_reports.work_id
          and w.assignee_employee_id = (select id from public.current_employee())
      )
    )
  )
  with check (
    exists (
      select 1 from public.works w
      where w.id = work_daily_reports.work_id
        and w.company_id = (select company_id from public.current_employee())
    )
  );

-- 삭제: append-only — GRANT 미부여


-- ===== GRANTS =========================================================
grant select, insert, update on public.work_daily_reports to authenticated;
