-- =====================================================================
-- edenMG  오늘 작업 체크 (시작·마감 의사결정 기록)
-- Migration 0029 — work_daily_checks
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0001~0028 이 먼저 실행돼 있어야 한다.
--
-- 정책 요약 (owner 결정):
--   - 매일 아침 작업자가 본인 배정된 미완료 작업 중 오늘 진행할 작업을 체크인
--   - 낮 동안 작업목록·작업 상세에서 「오늘 N명 진행」 가시화
--   - 매일 저녁 본인 분을 「완료」 또는 「이월」 로 마감
--   - 「완료」 는 작업자 본인 분만. 작업 status='완료' 확정은 담당자/관리자가 별도 액션
--   - 일보와는 완전 분리 (의사결정 기록 vs 산출물 기록)
-- =====================================================================


-- ===== ENUM ===========================================================
do $$ begin
  create type public.daily_check_decision as enum ('진행중', '완료', '이월');
exception when duplicate_object then null; end $$;


-- ===== TABLE: work_daily_checks =======================================
create table if not exists public.work_daily_checks (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  work_id      uuid not null references public.works(id)     on delete cascade,
  employee_id  uuid not null references public.employees(id) on delete cascade,

  check_date   date not null,
  decision     public.daily_check_decision not null default '진행중',
  note         text,

  created_at   timestamptz not null default now(),
  closed_at    timestamptz,                       -- decision 이 완료·이월로 바뀐 시각

  unique (work_id, employee_id, check_date)
);

alter table public.work_daily_checks enable row level security;

create index if not exists work_daily_checks_date_emp_idx
  on public.work_daily_checks(check_date, employee_id);
create index if not exists work_daily_checks_date_work_idx
  on public.work_daily_checks(check_date, work_id);
create index if not exists work_daily_checks_company_idx
  on public.work_daily_checks(company_id, check_date);


-- ===== RLS: select — 같은 회사 누구나 (가시성 우선) ===================
drop policy if exists work_daily_checks_select on public.work_daily_checks;
create policy work_daily_checks_select
  on public.work_daily_checks
  for select
  using (
    company_id = (select company_id from public.current_employee())
  );


-- ===== RLS: insert — 본인 row 만, 본인 회사 ===========================
drop policy if exists work_daily_checks_insert_self on public.work_daily_checks;
create policy work_daily_checks_insert_self
  on public.work_daily_checks
  for insert
  with check (
    employee_id = (select id from public.current_employee())
    and company_id = (select company_id from public.current_employee())
  );


-- ===== RLS: update — 본인 row 만 (마감용) =============================
drop policy if exists work_daily_checks_update_self on public.work_daily_checks;
create policy work_daily_checks_update_self
  on public.work_daily_checks
  for update
  using (
    employee_id = (select id from public.current_employee())
    and company_id = (select company_id from public.current_employee())
  )
  with check (
    employee_id = (select id from public.current_employee())
    and company_id = (select company_id from public.current_employee())
  );


-- ===== GRANTS — delete 미부여 (append-only / 마감 후 잠금) ============
grant select, insert, update on public.work_daily_checks to authenticated;


-- =====================================================================
-- 보조 RPC — 작업 status 자동 변경 (예정→진행중) 및 완료 확정
-- works 의 update RLS 는 admin/ceo+can_manage_works 만 허용하므로
-- 일반 작업자가 체크인할 때 status='예정' → '진행중' 자동 전환이 필요하면
-- security definer 함수로 우회.
-- =====================================================================

-- (a) 체크인 시 호출: 본인 배정 + status='예정' 인 경우에만 '진행중' 으로
create or replace function public.work_advance_to_in_progress(_work_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid;
  v_company_id  uuid;
  v_assigned    boolean;
begin
  select id, company_id into v_employee_id, v_company_id
  from public.employees where auth_user_id = auth.uid() and is_active;
  if v_employee_id is null then
    raise exception '활성 직원이 아닙니다';
  end if;

  select exists (
    select 1 from public.work_assignments a
    join public.works w on w.id = a.work_id
    where a.work_id = _work_id
      and a.employee_id = v_employee_id
      and w.company_id = v_company_id
  ) into v_assigned;
  if not v_assigned then
    raise exception '배정된 작업이 아닙니다';
  end if;

  update public.works
  set status = '진행중'
  where id = _work_id and status = '예정' and company_id = v_company_id;
end;
$$;

revoke all on function public.work_advance_to_in_progress(uuid) from public;
grant execute on function public.work_advance_to_in_progress(uuid) to authenticated;


-- (b) 작업 완료 확정 — admin 또는 can_manage_works 또는 담당자(assignee)
create or replace function public.work_confirm_complete(_work_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me public.employees%rowtype;
  v_w  public.works%rowtype;
begin
  select * into v_me from public.employees
   where auth_user_id = auth.uid() and is_active;
  if v_me.id is null then
    raise exception '활성 직원이 아닙니다';
  end if;

  select * into v_w from public.works where id = _work_id;
  if v_w.id is null then
    raise exception '작업을 찾을 수 없습니다';
  end if;
  if v_w.company_id <> v_me.company_id then
    raise exception '다른 회사의 작업입니다';
  end if;

  if not (
    v_me.permission = 'admin'
    or v_me.can_manage_works = true
    or v_w.assignee_employee_id = v_me.id
  ) then
    raise exception '완료 확정 권한이 없습니다';
  end if;

  update public.works set status = '완료' where id = _work_id;
end;
$$;

revoke all on function public.work_confirm_complete(uuid) from public;
grant execute on function public.work_confirm_complete(uuid) to authenticated;
