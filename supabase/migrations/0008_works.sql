-- =====================================================================
-- edenMG  M3 작업관리 Phase 1
-- Migration 0008 — works(작업 마스터) + work_assignments(N:M 배정)
--                + work_category·work_subcategory·work_status enum
--                + employees.can_manage_works 권한 컬럼
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0001~0007 이 먼저 실행돼 있어야 한다.
--
-- 정책 요약 (owner 결정):
--   - 작업은 sites 와 무관한 별도 entity
--   - 작업 등록·수정: admin/ceo 또는 can_manage_works=true 직원
--   - 작업자 배정: N:M, 배정마다 기간 지정 가능
--   - 작업유형: 4 대분류(청약·계획·지장이설·기타) + 12 소분류 enum
-- =====================================================================


-- ===== ENUM ===========================================================
do $$ begin
  create type public.work_category as enum ('청약', '계획', '지장이설', '기타');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.work_subcategory as enum (
    '소호', 'FTTH', '모바일', '전용회선', '다회선', '아파트',
    '망보강', '코어분산', '이원화',
    '단순', '일반', '원인자'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.work_status as enum ('예정', '진행중', '완료', '취소');
exception when duplicate_object then null; end $$;


-- ===== ADD COLUMN: employees.can_manage_works =========================
-- admin/ceo 가 일반 직원에게 작업 관리 권한 부여할 수 있도록.
alter table public.employees
  add column if not exists can_manage_works boolean not null default false;


-- ===== TABLE: works ===================================================
create table if not exists public.works (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete restrict,

  name            text not null,
  client          text,                         -- 발주처 (예: KT, SKB)
  address         text,                         -- 현장 주소
  category        public.work_category not null,
  subcategory     public.work_subcategory,      -- 기타 카테고리는 null

  expected_volume text,                         -- 예상물량 자유 텍스트 (예: '100세대', '광케이블 500m')
  start_date      date,
  end_date        date,
  status          public.work_status not null default '예정',
  notes           text,
  is_active       boolean not null default true,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- 기간 정합성
  check (end_date is null or start_date is null or end_date >= start_date),

  -- 카테고리-서브카테고리 정합성 (기타는 sub null, 그 외는 sub 필수 + 매칭)
  check (
    (category = '기타' and subcategory is null) or
    (category = '청약' and subcategory in ('소호', 'FTTH', '모바일', '전용회선', '다회선', '아파트')) or
    (category = '계획' and subcategory in ('망보강', '코어분산', '이원화')) or
    (category = '지장이설' and subcategory in ('단순', '일반', '원인자'))
  )
);

alter table public.works enable row level security;

create index if not exists works_company_status_idx on public.works(company_id, status);
create index if not exists works_company_active_idx on public.works(company_id, is_active);
create index if not exists works_company_dates_idx  on public.works(company_id, start_date, end_date);


-- ===== TABLE: work_assignments (N:M + 기간) ==========================
create table if not exists public.work_assignments (
  id              uuid primary key default gen_random_uuid(),
  work_id         uuid not null references public.works(id)     on delete cascade,
  employee_id     uuid not null references public.employees(id) on delete restrict,

  assigned_start  date,                         -- 배정 시작일 (null = 작업 전체 기간)
  assigned_end    date,                         -- 배정 종료일

  created_at      timestamptz not null default now(),

  check (assigned_end is null or assigned_start is null or assigned_end >= assigned_start)
);

alter table public.work_assignments enable row level security;

create index if not exists work_assignments_work_idx     on public.work_assignments(work_id);
create index if not exists work_assignments_employee_idx on public.work_assignments(employee_id);


-- ===== updated_at 자동 갱신 ===========================================
-- public.touch_updated_at() 는 0003 에서 이미 생성됨.
drop trigger if exists works_touch_updated_at on public.works;
create trigger works_touch_updated_at
  before update on public.works
  for each row execute function public.touch_updated_at();


-- ===== RLS: works =====================================================
-- 같은 회사 직원이면 누구나 조회 (배정·일보 조회를 위해 필요).
drop policy if exists works_select_same_company on public.works;
create policy works_select_same_company
  on public.works
  for select
  using (
    company_id = (select company_id from public.current_employee())
  );

-- 작업 CUD: admin/ceo OR can_manage_works=true
drop policy if exists works_manager_all on public.works;
create policy works_manager_all
  on public.works
  for all
  using (
    company_id = (select company_id from public.current_employee())
    and (
      (select permission from public.current_employee()) in ('admin', 'ceo')
      or (select can_manage_works from public.current_employee()) is true
    )
  )
  with check (
    company_id = (select company_id from public.current_employee())
    and (
      (select permission from public.current_employee()) in ('admin', 'ceo')
      or (select can_manage_works from public.current_employee()) is true
    )
  );


-- ===== RLS: work_assignments ==========================================
-- read: 같은 회사 전 직원 (본인 배정 + 동료 배정 같이 볼 수 있도록)
drop policy if exists work_assignments_select on public.work_assignments;
create policy work_assignments_select
  on public.work_assignments
  for select
  using (
    exists (
      select 1 from public.works w
      where w.id = work_assignments.work_id
        and w.company_id = (select company_id from public.current_employee())
    )
  );

-- 배정 CUD: admin/ceo OR can_manage_works=true, 같은 회사 작업에 한해서
drop policy if exists work_assignments_manager_all on public.work_assignments;
create policy work_assignments_manager_all
  on public.work_assignments
  for all
  using (
    exists (
      select 1 from public.works w
      where w.id = work_assignments.work_id
        and w.company_id = (select company_id from public.current_employee())
    )
    and (
      (select permission from public.current_employee()) in ('admin', 'ceo')
      or (select can_manage_works from public.current_employee()) is true
    )
  )
  with check (
    exists (
      select 1 from public.works w
      where w.id = work_assignments.work_id
        and w.company_id = (select company_id from public.current_employee())
    )
    and (
      (select permission from public.current_employee()) in ('admin', 'ceo')
      or (select can_manage_works from public.current_employee()) is true
    )
  );


-- ===== GRANTS =========================================================
grant select, insert, update, delete on public.works              to authenticated;
grant select, insert, update, delete on public.work_assignments   to authenticated;
