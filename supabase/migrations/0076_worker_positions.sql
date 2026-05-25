-- 작업자 위치 확인 — 작업 중인 작업자의 GPS 위치를 지도에 표시.
--
-- 동작 모델:
--   - 작업자가 work_daily_checks 로 「작업시작」 누르면 활성 윈도우 시작
--   - 활성 윈도우 동안 (모바일/PC) 클라이언트가 주기적으로 위치 push
--   - 「작업종료」 (closed_at 채워짐) 시 윈도우 종료 → 더 이상 push 안 함
--   - 위치는 지도 모드에서 시설(작업구간) 반경 1km 안에 들 때만 표시
--
-- 권한:
--   - INSERT/UPDATE: 본인만 (employee_id = current_employee())
--   - SELECT: 같은 회사 직원 누구나 (협업 + 안전 관리)
--   - DELETE: 미부여 (append-only audit)
--
-- 신선도:
--   - last_seen_at < now() - interval '15 minutes' 인 행은 「오프라인」 으로 간주
--   - 위치는 항상 1행 per (project_id, employee_id) — upsert

create table if not exists public.relocation_worker_positions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.relocation_projects(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy_m double precision,
  recorded_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (project_id, employee_id)
);

create index if not exists relocation_worker_positions_project_seen_idx
  on public.relocation_worker_positions(project_id, last_seen_at desc);

alter table public.relocation_worker_positions enable row level security;

-- 같은 회사 직원 모두 select
drop policy if exists relocation_worker_positions_select on public.relocation_worker_positions;
create policy relocation_worker_positions_select
  on public.relocation_worker_positions
  for select
  using (company_id = (select company_id from public.current_employee()));

-- 본인 위치만 insert
drop policy if exists relocation_worker_positions_insert on public.relocation_worker_positions;
create policy relocation_worker_positions_insert
  on public.relocation_worker_positions
  for insert
  with check (
    company_id = (select company_id from public.current_employee())
    and employee_id = (select id from public.current_employee())
  );

-- 본인 위치만 update (upsert)
drop policy if exists relocation_worker_positions_update on public.relocation_worker_positions;
create policy relocation_worker_positions_update
  on public.relocation_worker_positions
  for update
  using (
    company_id = (select company_id from public.current_employee())
    and employee_id = (select id from public.current_employee())
  );

-- GRANT (delete 는 미부여)
grant select, insert, update on public.relocation_worker_positions to authenticated;
