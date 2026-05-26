-- 공사 목록 + 작업 캘린더 일괄 (마이그 0083).
--   owner 2026-05-26.
--
-- 1) relocation_projects 확장
--    - subcategory_major: 「대분류」 자유 텍스트. 청약 카테고리 프로젝트 등록 시 입력.
--      (기존 subcategory 는 「소분류」 — 소호/FTTH/모바일/...)
--    - work_request_start / work_request_end: 작업요청일 (단일 또는 기간).
--      목록 페이지에서 캘린더 드래그로 필터.
--
-- 2) work_schedule_change_requests 테이블 (신규)
--    - 작업자가 캘린더에서 자기 배정된 작업을 선택해 일정 변경을 요청.
--    - 작업 담당자(works.assignee_employee_id, 또는 admin)에게 알림 배지로 노출.
--    - append-only audit; delete GRANT 미부여.
--    - 처리(approve/reject) 후에도 row 유지 → 히스토리.
--
-- 멱등.

-- 1) relocation_projects
alter table public.relocation_projects
  add column if not exists subcategory_major text,
  add column if not exists work_request_start date,
  add column if not exists work_request_end date;

create index if not exists relocation_projects_work_request_idx
  on public.relocation_projects(work_request_start, work_request_end);

-- 2) work_schedule_change_requests
create table if not exists public.work_schedule_change_requests (
  id                   uuid primary key default gen_random_uuid(),
  work_id              uuid not null references public.works(id) on delete cascade,
  requested_by         uuid not null references public.employees(id) on delete restrict,  -- 요청자(현재 사용자)
  requested_start      date,
  requested_end        date,
  reason               text not null,
  status               text not null default 'pending'
                       check (status in ('pending', 'approved', 'rejected')),
  responded_by         uuid references public.employees(id) on delete set null,
  responded_at         timestamptz,
  response_note        text,
  created_at           timestamptz not null default now()
);

create index if not exists work_schedule_change_requests_work_idx
  on public.work_schedule_change_requests(work_id);
create index if not exists work_schedule_change_requests_pending_idx
  on public.work_schedule_change_requests(status, created_at desc);
create index if not exists work_schedule_change_requests_requested_by_idx
  on public.work_schedule_change_requests(requested_by);

alter table public.work_schedule_change_requests enable row level security;

-- RLS: 같은 회사 직원 누구나 SELECT (캘린더 표시·알림 배지 카운트용).
--      INSERT 본인만 (requested_by = current_employee).
--      UPDATE 작업 담당자(works.assignee_employee_id) OR admin only (status·responded_*).
--      DELETE 차단 (GRANT 미부여 — append-only).
drop policy if exists work_schedule_change_requests_select on public.work_schedule_change_requests;
create policy work_schedule_change_requests_select
  on public.work_schedule_change_requests
  for select
  using (
    work_id in (
      select w.id from public.works w
       where w.company_id = (select company_id from public.current_employee())
    )
  );

drop policy if exists work_schedule_change_requests_insert on public.work_schedule_change_requests;
create policy work_schedule_change_requests_insert
  on public.work_schedule_change_requests
  for insert
  with check (
    requested_by = (select id from public.current_employee())
    and work_id in (
      select w.id from public.works w
       where w.company_id = (select company_id from public.current_employee())
    )
  );

drop policy if exists work_schedule_change_requests_update on public.work_schedule_change_requests;
create policy work_schedule_change_requests_update
  on public.work_schedule_change_requests
  for update
  using (
    work_id in (
      select w.id from public.works w
       where w.company_id = (select company_id from public.current_employee())
        and (
          w.assignee_employee_id = (select id from public.current_employee())
          or exists (
            select 1 from public.employees me
             where me.id = (select id from public.current_employee())
              and me.permission = 'admin'
          )
        )
    )
  );

grant select, insert, update on public.work_schedule_change_requests to authenticated;
