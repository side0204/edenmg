-- =====================================================================
-- edenMG  M2 근태·결재 (1/2)
-- Migration 0003 — sites(현장 마스터) + attendances(출퇴근) + RLS
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능)하도록 작성. 0001, 0002 가 먼저 실행돼 있어야 한다.
-- =====================================================================


-- ===== TABLE: sites ===================================================
-- 광케이블 시공 현장 마스터. 출퇴근·작업일보·자재청구가 전부 이 테이블을
-- 참조. lat/lng 는 nullable — 사무실/원격 작업처럼 좌표가 없는 행도 허용.
-- 반경(radius_m) 기본 500m, 현장별로 개별 조정 가능.
create table if not exists public.sites (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete restrict,
  name                text not null,
  address             text,
  lat                 double precision,
  lng                 double precision,
  radius_m            integer not null default 500 check (radius_m between 50 and 5000),
  manager_employee_id uuid references public.employees(id) on delete set null,
  start_date          date,
  end_date            date,
  is_active           boolean not null default true,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (company_id, name)
);

alter table public.sites enable row level security;

create index if not exists sites_company_id_idx     on public.sites(company_id);
create index if not exists sites_manager_id_idx     on public.sites(manager_employee_id);
create index if not exists sites_company_active_idx on public.sites(company_id, is_active);


-- ===== TABLE: attendances =============================================
-- 직원당 work_date(한국 시간 기준 출근 기준일) 별 1 row. 출근 시 insert,
-- 퇴근 시 update. site_id 는 nullable — 현장 매칭이 안 됐을 때(반경 외)는
-- null 로 두고 사유만 기록.
create table if not exists public.attendances (
  id                         uuid primary key default gen_random_uuid(),
  company_id                 uuid not null references public.companies(id) on delete restrict,
  employee_id                uuid not null references public.employees(id) on delete cascade,
  site_id                    uuid references public.sites(id) on delete set null,
  work_date                  date not null,

  check_in_at                timestamptz not null,
  check_in_lat               double precision,
  check_in_lng               double precision,
  check_in_outside_reason    text,

  check_out_at               timestamptz,
  check_out_lat              double precision,
  check_out_lng              double precision,
  check_out_outside_reason   text,

  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (employee_id, work_date)
);

alter table public.attendances enable row level security;

create index if not exists attendances_company_date_idx  on public.attendances(company_id, work_date);
create index if not exists attendances_employee_date_idx on public.attendances(employee_id, work_date);
create index if not exists attendances_site_date_idx     on public.attendances(site_id, work_date);


-- ===== updated_at 자동 갱신 ===========================================
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sites_touch_updated_at on public.sites;
create trigger sites_touch_updated_at
  before update on public.sites
  for each row execute function public.touch_updated_at();

drop trigger if exists attendances_touch_updated_at on public.attendances;
create trigger attendances_touch_updated_at
  before update on public.attendances
  for each row execute function public.touch_updated_at();


-- ===== RLS: sites =====================================================
-- 같은 회사 직원이면 누구나 조회 가능 (작업자가 본인 출근지 선택해야 함).
drop policy if exists sites_select_same_company on public.sites;
create policy sites_select_same_company
  on public.sites
  for select
  using (
    company_id = (select company_id from public.current_employee())
  );

-- 관리자/대표만 현장 CUD.
drop policy if exists sites_admin_all on public.sites;
create policy sites_admin_all
  on public.sites
  for all
  using (
    company_id = (select company_id from public.current_employee())
    and (select permission from public.current_employee()) in ('admin', 'ceo')
  )
  with check (
    company_id = (select company_id from public.current_employee())
    and (select permission from public.current_employee()) in ('admin', 'ceo')
  );


-- ===== RLS: attendances ===============================================
-- PRD §6 권한 매트릭스:
--   read   : 본인 OR (같은 회사 + foreman/admin/ceo)
--   create : 본인만
--   update : 본인(당일) OR 관리자/대표
--   delete : 금지 (정책 없음)

-- read
drop policy if exists attendances_select on public.attendances;
create policy attendances_select
  on public.attendances
  for select
  using (
    employee_id = (select id from public.current_employee())
    or (
      company_id = (select company_id from public.current_employee())
      and (select permission from public.current_employee()) in ('foreman', 'admin', 'ceo')
    )
  );

-- create — 본인 행만, 본인 company_id 와 일치해야 함
drop policy if exists attendances_insert_self on public.attendances;
create policy attendances_insert_self
  on public.attendances
  for insert
  with check (
    employee_id = (select id from public.current_employee())
    and company_id = (select company_id from public.current_employee())
  );

-- update — 본인 (당일 한정) 또는 관리자/대표 (제한 없음)
drop policy if exists attendances_update_self_today on public.attendances;
create policy attendances_update_self_today
  on public.attendances
  for update
  using (
    (employee_id = (select id from public.current_employee()) and work_date = current_date)
    or (
      company_id = (select company_id from public.current_employee())
      and (select permission from public.current_employee()) in ('admin', 'ceo')
    )
  )
  with check (
    (employee_id = (select id from public.current_employee()) and work_date = current_date)
    or (
      company_id = (select company_id from public.current_employee())
      and (select permission from public.current_employee()) in ('admin', 'ceo')
    )
  );


-- ===== GRANTS =========================================================
grant select, insert, update, delete on public.sites       to authenticated;
grant select, insert, update         on public.attendances to authenticated;
-- attendances 는 delete 권한 자체를 부여하지 않음 (append-only 정신).
