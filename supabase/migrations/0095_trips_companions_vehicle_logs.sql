-- =====================================================================
-- edenMG  외근·차량 통합 (외근 = 이동 1건) + 동행인 + 차계부
-- Migration 0095 — vehicle_trips 확장 + vehicle_trip_companions + vehicle_logs
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0006 · 0027 · 0084 가 먼저 실행돼 있어야 한다.
--
-- 정책 요약 (owner 결정 2026-09-20):
--   - 외근 시작에 결재 없음 (기록만). 차량 출고와 같은 정책.
--   - 외근 1건 = vehicle_trips 1행. 이동수단(transport) 업무용 / 자차 / 기타.
--     업무용만 vehicle_id 를 가진다. 자차는 personal_plate 스냅샷, 기타는 other_note.
--   - 동행인 최대 4명 (트리거 강제). 동행인 홈에는 「외근 중 (동승)」 표시만.
--   - 외근 현황은 회사 전원 공개 (기존 vehicle_trips_select 정책 그대로).
--   - 차계부(vehicle_logs) 수동 항목은 회사 누구나 입력. 수정·삭제는 작성자 OR admin.
--     운행·주유는 vehicle_trips 에서 자동 (중복 저장 X).
-- =====================================================================


-- ===== vehicle_trips 확장 ==============================================
alter table public.vehicle_trips
  add column if not exists transport            text not null default '업무용',
  add column if not exists place                text,
  add column if not exists expected_arrival_at  timestamptz,
  add column if not exists personal_plate       text,
  add column if not exists other_note           text,
  add column if not exists notes                text;

-- 자차·기타는 차량 마스터가 없으므로 vehicle_id NULL 허용
alter table public.vehicle_trips
  alter column vehicle_id drop not null;

do $$
begin
  alter table public.vehicle_trips
    add constraint vehicle_trips_transport_check
    check (transport in ('업무용', '자차', '기타'));
exception when duplicate_object then null;
end $$;

-- 업무용 ⇔ vehicle_id 있음
do $$
begin
  alter table public.vehicle_trips
    add constraint vehicle_trips_transport_vehicle_check
    check ((transport = '업무용') = (vehicle_id is not null));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.vehicle_trips
    add constraint vehicle_trips_expected_arrival_check
    check (expected_arrival_at is null or expected_arrival_at >= departed_at);
exception when duplicate_object then null;
end $$;

create index if not exists vehicle_trips_company_active_idx
  on public.vehicle_trips(company_id)
  where returned_at is null;

-- 한 사람은 동시에 외근 1건만 (기존 데이터에 중복이 있으면 건너뛰고 NOTICE)
do $$
begin
  if exists (
    select 1 from public.vehicle_trips
     where returned_at is null
     group by driver_employee_id
    having count(*) > 1
  ) then
    raise notice 'vehicle_trips: 한 운전자에 진행 중 운행이 2건 이상 있어 active_per_driver 인덱스를 건너뜁니다. 정리 후 재실행하세요.';
  else
    create unique index if not exists vehicle_trips_active_per_driver
      on public.vehicle_trips(driver_employee_id)
      where returned_at is null;
  end if;
end $$;


-- ===== TABLE: vehicle_trip_companions =================================
-- 외근 동행인. (trip, employee) 당 1행. 최대 4명 — 트리거로 강제.
create table if not exists public.vehicle_trip_companions (
  trip_id      uuid not null references public.vehicle_trips(id) on delete cascade,
  employee_id  uuid not null references public.employees(id)     on delete restrict,
  company_id   uuid not null references public.companies(id)     on delete restrict,
  created_at   timestamptz not null default now(),
  primary key (trip_id, employee_id)
);

alter table public.vehicle_trip_companions enable row level security;

create index if not exists vehicle_trip_companions_employee_idx
  on public.vehicle_trip_companions(employee_id);

create or replace function public.vehicle_trip_companions_guard()
returns trigger
language plpgsql
as $$
declare
  v_driver uuid;
  v_count  integer;
begin
  select driver_employee_id into v_driver
    from public.vehicle_trips where id = new.trip_id;
  if v_driver is null then
    raise exception '외근 기록을 찾을 수 없습니다.';
  end if;
  if v_driver = new.employee_id then
    raise exception '외근을 시작한 본인은 동행인으로 넣을 수 없습니다.';
  end if;
  select count(*) into v_count
    from public.vehicle_trip_companions where trip_id = new.trip_id;
  if v_count >= 4 then
    raise exception '동행인은 최대 4명까지 지정할 수 있습니다.';
  end if;
  return new;
end;
$$;

drop trigger if exists vehicle_trip_companions_guard on public.vehicle_trip_companions;
create trigger vehicle_trip_companions_guard
  before insert on public.vehicle_trip_companions
  for each row execute function public.vehicle_trip_companions_guard();

-- RLS: 같은 회사 누구나 조회. 추가·삭제는 그 외근의 운전자 OR admin.
drop policy if exists vehicle_trip_companions_select on public.vehicle_trip_companions;
create policy vehicle_trip_companions_select
  on public.vehicle_trip_companions
  for select
  using (
    company_id = (select company_id from public.current_employee())
  );

drop policy if exists vehicle_trip_companions_insert on public.vehicle_trip_companions;
create policy vehicle_trip_companions_insert
  on public.vehicle_trip_companions
  for insert
  with check (
    company_id = (select company_id from public.current_employee())
    and exists (
      select 1 from public.vehicle_trips t
       where t.id = trip_id
         and t.company_id = company_id
         and (
           t.driver_employee_id = (select id from public.current_employee())
           or (select permission from public.current_employee()) = 'admin'
         )
    )
  );

drop policy if exists vehicle_trip_companions_delete on public.vehicle_trip_companions;
create policy vehicle_trip_companions_delete
  on public.vehicle_trip_companions
  for delete
  using (
    company_id = (select company_id from public.current_employee())
    and exists (
      select 1 from public.vehicle_trips t
       where t.id = trip_id
         and (
           t.driver_employee_id = (select id from public.current_employee())
           or (select permission from public.current_employee()) = 'admin'
         )
    )
  );

grant select, insert, delete on public.vehicle_trip_companions to authenticated;


-- ===== TABLE: vehicle_logs (차계부) ===================================
-- 차량 1대(업무용 vehicle_id) 또는 자차 1대(personal_employee_id) 의 수동 기록.
-- 운행·주유는 vehicle_trips 가 원본이라 여기에 중복 저장하지 않는다.
create table if not exists public.vehicle_logs (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete restrict,
  vehicle_id            uuid references public.vehicles(id)  on delete restrict,
  personal_employee_id  uuid references public.employees(id) on delete restrict,
  kind                  text not null,
  occurred_on           date not null default ((now() at time zone 'Asia/Seoul')::date),
  title                 text not null,
  amount_krw            integer,
  odometer_km           integer,
  vendor                text,
  memo                  text,
  next_due_km           integer,
  next_due_on           date,
  created_by            uuid references public.employees(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  check (kind in ('주유', '정비', '보험', '검사', '세금', '통행', '주차', '기타')),
  -- 업무용 차량 XOR 자차
  check ((vehicle_id is not null)::int + (personal_employee_id is not null)::int = 1),
  check (amount_krw  is null or amount_krw  >= 0),
  check (odometer_km is null or odometer_km >= 0),
  check (next_due_km is null or next_due_km >= 0)
);

alter table public.vehicle_logs enable row level security;

create index if not exists vehicle_logs_vehicle_idx  on public.vehicle_logs(vehicle_id, occurred_on desc);
create index if not exists vehicle_logs_personal_idx on public.vehicle_logs(personal_employee_id, occurred_on desc);
create index if not exists vehicle_logs_company_idx  on public.vehicle_logs(company_id, occurred_on desc);

drop trigger if exists vehicle_logs_touch_updated_at on public.vehicle_logs;
create trigger vehicle_logs_touch_updated_at
  before update on public.vehicle_logs
  for each row execute function public.touch_updated_at();

-- RLS: 조회 같은 회사. 입력 회사 누구나(본인 created_by). 수정·삭제 작성자 OR admin.
drop policy if exists vehicle_logs_select on public.vehicle_logs;
create policy vehicle_logs_select
  on public.vehicle_logs
  for select
  using (
    company_id = (select company_id from public.current_employee())
  );

drop policy if exists vehicle_logs_insert on public.vehicle_logs;
create policy vehicle_logs_insert
  on public.vehicle_logs
  for insert
  with check (
    company_id = (select company_id from public.current_employee())
    and created_by = (select id from public.current_employee())
  );

drop policy if exists vehicle_logs_update on public.vehicle_logs;
create policy vehicle_logs_update
  on public.vehicle_logs
  for update
  using (
    company_id = (select company_id from public.current_employee())
    and (
      created_by = (select id from public.current_employee())
      or (select permission from public.current_employee()) = 'admin'
    )
  )
  with check (
    company_id = (select company_id from public.current_employee())
  );

drop policy if exists vehicle_logs_delete on public.vehicle_logs;
create policy vehicle_logs_delete
  on public.vehicle_logs
  for delete
  using (
    company_id = (select company_id from public.current_employee())
    and (
      created_by = (select id from public.current_employee())
      or (select permission from public.current_employee()) = 'admin'
    )
  );

grant select, insert, update, delete on public.vehicle_logs to authenticated;
