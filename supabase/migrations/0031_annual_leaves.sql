-- =====================================================================
-- edenMG  연차 관리 (근로기준법 자동 부여 + 사용내역)
-- Migration 0031 — employees.hire_date + annual_leave_balances + audit
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0001~0030 이 먼저 실행돼 있어야 한다.
--
-- 정책 요약 (owner 결정):
--   - 부여 방식: 근로기준법 자동
--       · 1년 미만: 입사 후 매월 +1 일 (최대 11일까지 누적)
--       · 1년 이상: 매 1주년에 새 회차 시작 + 15 + min(10, floor((근속-1)/2)) 일
--   - 소진: 휴가 결재 승인 시 used 자동 증가. 반려·취소 시 복원
--   - 잔여 부족 신청: 허용. 승인 화면에 amber 경고만 표시
--   - 부여 단위: numeric(5,2) — 반차·반반차 사용 지원 (0.5·0.25)
--   - 회차 구분: period_seq (0 = 1년 미만, 1·2·... = 1주년 누적)
--                period_start ~ period_end (1년 단위, end_exclusive)
-- =====================================================================


-- ===== employees.hire_date ============================================
-- 입사일 — 없으면 자동 부여 로직 skip (NULL 안전). admin 이 직원 관리 페이지에서 입력
alter table public.employees
  add column if not exists hire_date date;


-- ===== TABLE: annual_leave_balances ===================================
create table if not exists public.annual_leave_balances (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  employee_id   uuid not null references public.employees(id) on delete cascade,

  period_seq    int  not null,                    -- 0 = 1년 미만, 1·2·... = 1주년·2주년·...
  period_start  date not null,                    -- 회차 시작일 (입사일 또는 N주년)
  period_end    date not null,                    -- 회차 종료일 (exclusive)

  granted       numeric(5,2) not null default 0,  -- 부여 일수 (반차·반반차 0.5·0.25 지원)
  used          numeric(5,2) not null default 0,  -- 누적 사용

  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (employee_id, period_seq),
  check (period_end > period_start),
  check (granted >= 0),
  check (used >= 0)
);

alter table public.annual_leave_balances enable row level security;

create index if not exists annual_leave_balances_emp_idx
  on public.annual_leave_balances(employee_id, period_seq);
create index if not exists annual_leave_balances_company_idx
  on public.annual_leave_balances(company_id);


-- updated_at 자동 갱신
drop trigger if exists annual_leave_balances_touch on public.annual_leave_balances;
create trigger annual_leave_balances_touch
  before update on public.annual_leave_balances
  for each row execute function public.touch_updated_at();


-- ===== TABLE: annual_leave_grants (audit) =============================
-- granted 의 모든 변경 이력. 부여 사유·시각·실행자 추적.
-- delete GRANT 미부여 (append-only).
create table if not exists public.annual_leave_grants (
  id            uuid primary key default gen_random_uuid(),
  balance_id    uuid not null references public.annual_leave_balances(id) on delete cascade,

  delta         numeric(5,2) not null,            -- +/- 변화량
  reason        text not null,                    -- '자동 부여 (근로기준법)', '관리자 가산', '관리자 차감', ...
  source        text not null,                    -- 'auto' / 'admin_manual'
  actor_employee_id uuid references public.employees(id) on delete set null,

  created_at    timestamptz not null default now()
);

alter table public.annual_leave_grants enable row level security;

create index if not exists annual_leave_grants_balance_idx
  on public.annual_leave_grants(balance_id, created_at desc);


-- ===== RLS: annual_leave_balances =====================================
-- select: 본인 + 같은 회사 admin
drop policy if exists annual_leave_balances_select on public.annual_leave_balances;
create policy annual_leave_balances_select
  on public.annual_leave_balances
  for select
  using (
    employee_id = (select id from public.current_employee())
    or (
      company_id = (select company_id from public.current_employee())
      and (select permission from public.current_employee()) = 'admin'
    )
  );

-- insert/update: admin 만 (실제 갱신은 security definer 함수로 처리하지만 admin 화면에서도 직접 조정 가능)
drop policy if exists annual_leave_balances_admin_all on public.annual_leave_balances;
create policy annual_leave_balances_admin_all
  on public.annual_leave_balances
  for all
  using (
    company_id = (select company_id from public.current_employee())
    and (select permission from public.current_employee()) = 'admin'
  )
  with check (
    company_id = (select company_id from public.current_employee())
    and (select permission from public.current_employee()) = 'admin'
  );


-- ===== RLS: annual_leave_grants (audit) ===============================
drop policy if exists annual_leave_grants_select on public.annual_leave_grants;
create policy annual_leave_grants_select
  on public.annual_leave_grants
  for select
  using (
    exists (
      select 1 from public.annual_leave_balances b
      where b.id = annual_leave_grants.balance_id
        and (
          b.employee_id = (select id from public.current_employee())
          or (
            b.company_id = (select company_id from public.current_employee())
            and (select permission from public.current_employee()) = 'admin'
          )
        )
    )
  );

drop policy if exists annual_leave_grants_admin_insert on public.annual_leave_grants;
create policy annual_leave_grants_admin_insert
  on public.annual_leave_grants
  for insert
  with check (
    exists (
      select 1 from public.annual_leave_balances b
      where b.id = annual_leave_grants.balance_id
        and b.company_id = (select company_id from public.current_employee())
    )
  );


-- ===== GRANTS =========================================================
grant select, insert, update on public.annual_leave_balances to authenticated;
grant select, insert            on public.annual_leave_grants   to authenticated;


-- =====================================================================
-- 보조 RPC — 휴가 승인·반려 시 used 갱신
--   leave_requests 의 status 변경은 admin/team_leader 만 가능하므로 이 함수도
--   같은 권한자가 호출. security definer 로 balance update.
-- =====================================================================

-- used += delta. delta 음수 가능 (반려·취소 시 복원).
create or replace function public.annual_leave_apply_usage(
  _employee_id uuid,
  _on_date     date,
  _delta       numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance public.annual_leave_balances%rowtype;
begin
  -- _on_date 가 속한 회차 찾기 (start <= date < end)
  select * into v_balance
  from public.annual_leave_balances
  where employee_id = _employee_id
    and _on_date >= period_start
    and _on_date <  period_end
  order by period_seq desc
  limit 1;

  if v_balance.id is null then
    -- 해당 회차가 아직 부여 안 됐으면 silent skip — refresh 시점에 보충됨
    return;
  end if;

  update public.annual_leave_balances
  set used = greatest(0, used + _delta)
  where id = v_balance.id;
end;
$$;

revoke all on function public.annual_leave_apply_usage(uuid, date, numeric) from public;
grant execute on function public.annual_leave_apply_usage(uuid, date, numeric) to authenticated;
