-- =====================================================================
-- edenMG  업무용 차량 사용 관리
-- Migration 0006 — vehicles(차량 마스터) + vehicle_trips(운행 기록) + RLS
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0001~0005 가 먼저 실행돼 있어야 한다.
--
-- 정책 요약 (owner 결정):
--   - 결재 없음. 출고→반납 2단계로 운행 기록.
--   - 주유는 운행 기록에 흡수 (체크박스 + 금액).
--   - 마스터 필드: 차량번호 + 차명 (+ 활성 · 비고).
--   - 권한: 회사 내 전 직원 SELECT. 마스터 CUD 는 admin/ceo.
--   - 운행 기록 INSERT: 본인만. UPDATE: 본인(반납) 또는 admin/ceo.
--   - 한 차량당 동시 사용 1명 (returned_at IS NULL 행이 차량당 최대 1개).
-- =====================================================================


-- ===== TABLE: vehicles ================================================
-- 차량 마스터. 회사별 차량번호 unique.
create table if not exists public.vehicles (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete restrict,
  plate_number  text not null,
  name          text not null,
  is_active     boolean not null default true,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (company_id, plate_number)
);

alter table public.vehicles enable row level security;

create index if not exists vehicles_company_id_idx     on public.vehicles(company_id);
create index if not exists vehicles_company_active_idx on public.vehicles(company_id, is_active);


-- ===== TABLE: vehicle_trips ===========================================
-- 운행 기록. departed_at(출고) 시점에 row 생성, returned_at(반납) 시점에 update.
-- returned_at IS NULL → "사용 중".
-- start/end_odometer_km 는 선택 입력 (모르거나 안 적는 운영도 허용).
create table if not exists public.vehicle_trips (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete restrict,
  vehicle_id          uuid not null references public.vehicles(id)  on delete restrict,
  driver_employee_id  uuid not null references public.employees(id) on delete restrict,

  departed_at         timestamptz not null default now(),
  start_odometer_km   integer check (start_odometer_km is null or start_odometer_km >= 0),

  returned_at         timestamptz,
  end_odometer_km     integer check (end_odometer_km is null or end_odometer_km >= 0),

  purpose             text,

  refueled            boolean not null default false,
  refuel_amount_krw   integer check (refuel_amount_krw is null or refuel_amount_krw >= 0),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- 반납 시각은 출고 이후
  check (returned_at is null or returned_at >= departed_at),
  -- km 둘 다 입력됐을 때만 비교
  check (
    end_odometer_km is null
    or start_odometer_km is null
    or end_odometer_km >= start_odometer_km
  ),
  -- 주유 안 했으면 금액도 null
  check (refueled = true or refuel_amount_krw is null)
);

alter table public.vehicle_trips enable row level security;

create index if not exists vehicle_trips_company_dep_idx    on public.vehicle_trips(company_id, departed_at desc);
create index if not exists vehicle_trips_vehicle_dep_idx    on public.vehicle_trips(vehicle_id, departed_at desc);
create index if not exists vehicle_trips_driver_dep_idx     on public.vehicle_trips(driver_employee_id, departed_at desc);

-- 차량당 "사용 중" 행은 최대 1개 (partial unique).
create unique index if not exists vehicle_trips_active_per_vehicle
  on public.vehicle_trips(vehicle_id)
  where returned_at is null;


-- ===== updated_at 자동 갱신 ===========================================
-- public.touch_updated_at() 는 0003 에서 이미 생성됨. 재사용.
drop trigger if exists vehicles_touch_updated_at on public.vehicles;
create trigger vehicles_touch_updated_at
  before update on public.vehicles
  for each row execute function public.touch_updated_at();

drop trigger if exists vehicle_trips_touch_updated_at on public.vehicle_trips;
create trigger vehicle_trips_touch_updated_at
  before update on public.vehicle_trips
  for each row execute function public.touch_updated_at();


-- ===== RLS: vehicles ==================================================
-- 같은 회사 직원이면 누구나 조회 (출고 시 차량 선택 위해 필요).
drop policy if exists vehicles_select_same_company on public.vehicles;
create policy vehicles_select_same_company
  on public.vehicles
  for select
  using (
    company_id = (select company_id from public.current_employee())
  );

-- 관리자/대표만 차량 CUD.
drop policy if exists vehicles_admin_all on public.vehicles;
create policy vehicles_admin_all
  on public.vehicles
  for all
  using (
    company_id = (select company_id from public.current_employee())
    and (select permission from public.current_employee()) in ('admin', 'ceo')
  )
  with check (
    company_id = (select company_id from public.current_employee())
    and (select permission from public.current_employee()) in ('admin', 'ceo')
  );


-- ===== RLS: vehicle_trips =============================================
-- 권한 (owner 결정: 전원 공개):
--   read   : 같은 회사 전 직원
--   create : 본인 운행만 (driver_employee_id = current_employee)
--   update : 본인 OR admin/ceo
--   delete : 금지 (정책 없음)

-- read
drop policy if exists vehicle_trips_select on public.vehicle_trips;
create policy vehicle_trips_select
  on public.vehicle_trips
  for select
  using (
    company_id = (select company_id from public.current_employee())
  );

-- create — 본인 행만, 본인 company_id 와 일치
drop policy if exists vehicle_trips_insert_self on public.vehicle_trips;
create policy vehicle_trips_insert_self
  on public.vehicle_trips
  for insert
  with check (
    driver_employee_id = (select id from public.current_employee())
    and company_id = (select company_id from public.current_employee())
  );

-- update — 본인 (반납 처리) 또는 admin/ceo
drop policy if exists vehicle_trips_update on public.vehicle_trips;
create policy vehicle_trips_update
  on public.vehicle_trips
  for update
  using (
    driver_employee_id = (select id from public.current_employee())
    or (
      company_id = (select company_id from public.current_employee())
      and (select permission from public.current_employee()) in ('admin', 'ceo')
    )
  )
  with check (
    driver_employee_id = (select id from public.current_employee())
    or (
      company_id = (select company_id from public.current_employee())
      and (select permission from public.current_employee()) in ('admin', 'ceo')
    )
  );


-- ===== GRANTS =========================================================
grant select, insert, update, delete on public.vehicles       to authenticated;
grant select, insert, update         on public.vehicle_trips  to authenticated;
-- vehicle_trips 는 delete 권한 자체를 부여하지 않음 (append-only 정신).
