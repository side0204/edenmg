-- =====================================================================
-- edenMG  현장관리 — 국사현황 (Phase D)
-- Migration 0089 — field_stations + field_station_sections + field_station_photos
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능).
--
-- 배경
--   owner 요청 (2026-05-29): 현장관리 안에 「국사현황」 서브탭. 국사별로
--   국사명·국사주소·상면도(사진)·장비랙정보(설명+사진)·OFD랙정보(설명+사진)
--   + 추가정보(이름 변경 가능, 여러 개) 를 입력·관리. 국사별 사진 갤러리.
--   주소를 입력하면 외부 네비 길찾기로 이동 (좌표는 클라이언트 카카오 지오코딩).
--
--   권한 (owner 결정): 같은 회사 누구나 등록·수정·사진 추가. 국사 삭제는
--   작성자 본인 OR admin. 사진 삭제는 업로더 본인 OR admin.
--
--   섹션(상면도/장비랙/OFD랙/추가정보…)은 국사의 일부 — 같은 회사 누구나 편집.
--   국사를 삭제하면 섹션·사진 cascade.
--
--   사진은 기존 R2 버킷 'relocation-field-notes' 재사용 (키 prefix 'stations/').
--   별도 버킷 생성 불필요.
-- =====================================================================


-- =====================================================================
-- TABLE: field_stations  (국사)
-- =====================================================================
create table if not exists public.field_stations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  address     text,
  lat         double precision,
  lng         double precision,
  created_by  uuid references public.employees(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists field_stations_company_idx
  on public.field_stations(company_id, name);

drop trigger if exists field_stations_touch_updated_at on public.field_stations;
create trigger field_stations_touch_updated_at
  before update on public.field_stations
  for each row
  execute function public.touch_updated_at();

alter table public.field_stations enable row level security;

drop policy if exists field_stations_select on public.field_stations;
create policy field_stations_select
  on public.field_stations
  for select
  to authenticated
  using (company_id = (select company_id from public.current_employee()));

drop policy if exists field_stations_insert on public.field_stations;
create policy field_stations_insert
  on public.field_stations
  for insert
  to authenticated
  with check (
    company_id = (select company_id from public.current_employee())
    and created_by = (select id from public.current_employee())
  );

-- 수정: 같은 회사 누구나 (국사는 공용 현장 정보 — 모두가 보강).
drop policy if exists field_stations_update on public.field_stations;
create policy field_stations_update
  on public.field_stations
  for update
  to authenticated
  using (company_id = (select company_id from public.current_employee()))
  with check (company_id = (select company_id from public.current_employee()));

-- 삭제: 작성자 본인 OR admin.
drop policy if exists field_stations_delete on public.field_stations;
create policy field_stations_delete
  on public.field_stations
  for delete
  to authenticated
  using (
    company_id = (select company_id from public.current_employee())
    and (
      created_by = (select id from public.current_employee())
      or (select permission from public.current_employee()) = 'admin'
    )
  );

grant select, insert, update, delete on public.field_stations to authenticated;
grant all on public.field_stations to service_role;


-- =====================================================================
-- TABLE: field_station_sections  (국사 정보 항목 — 상면도/장비랙/OFD랙/추가정보…)
-- =====================================================================
create table if not exists public.field_station_sections (
  id          uuid primary key default gen_random_uuid(),
  station_id  uuid not null references public.field_stations(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  label       text not null,
  body        text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists field_station_sections_station_idx
  on public.field_station_sections(station_id, sort_order, created_at);

drop trigger if exists field_station_sections_touch_updated_at on public.field_station_sections;
create trigger field_station_sections_touch_updated_at
  before update on public.field_station_sections
  for each row
  execute function public.touch_updated_at();

alter table public.field_station_sections enable row level security;

drop policy if exists field_station_sections_select on public.field_station_sections;
create policy field_station_sections_select
  on public.field_station_sections
  for select
  to authenticated
  using (company_id = (select company_id from public.current_employee()));

-- insert/update/delete: 같은 회사 누구나 (국사 편집의 일부). 국사가 같은 회사인지 확인.
drop policy if exists field_station_sections_insert on public.field_station_sections;
create policy field_station_sections_insert
  on public.field_station_sections
  for insert
  to authenticated
  with check (
    company_id = (select company_id from public.current_employee())
    and exists (
      select 1 from public.field_stations s
      where s.id = station_id
        and s.company_id = (select company_id from public.current_employee())
    )
  );

drop policy if exists field_station_sections_update on public.field_station_sections;
create policy field_station_sections_update
  on public.field_station_sections
  for update
  to authenticated
  using (company_id = (select company_id from public.current_employee()))
  with check (company_id = (select company_id from public.current_employee()));

drop policy if exists field_station_sections_delete on public.field_station_sections;
create policy field_station_sections_delete
  on public.field_station_sections
  for delete
  to authenticated
  using (company_id = (select company_id from public.current_employee()));

grant select, insert, update, delete on public.field_station_sections to authenticated;
grant all on public.field_station_sections to service_role;


-- =====================================================================
-- TABLE: field_station_photos  (항목별 사진 1:N)
-- =====================================================================
create table if not exists public.field_station_photos (
  id          uuid primary key default gen_random_uuid(),
  section_id  uuid not null references public.field_station_sections(id) on delete cascade,
  station_id  uuid not null references public.field_stations(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  path        text not null,
  caption     text,
  taken_at    timestamptz,
  gps_lat     double precision,
  gps_lng     double precision,
  uploaded_by uuid references public.employees(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists field_station_photos_section_idx
  on public.field_station_photos(section_id, created_at);

create index if not exists field_station_photos_station_idx
  on public.field_station_photos(station_id, created_at);

alter table public.field_station_photos enable row level security;

drop policy if exists field_station_photos_select on public.field_station_photos;
create policy field_station_photos_select
  on public.field_station_photos
  for select
  to authenticated
  using (company_id = (select company_id from public.current_employee()));

drop policy if exists field_station_photos_insert on public.field_station_photos;
create policy field_station_photos_insert
  on public.field_station_photos
  for insert
  to authenticated
  with check (
    company_id = (select company_id from public.current_employee())
    and uploaded_by = (select id from public.current_employee())
    and exists (
      select 1 from public.field_station_sections sec
      where sec.id = section_id
        and sec.company_id = (select company_id from public.current_employee())
    )
  );

-- 사진 설명 수정: 업로더 본인 OR admin.
drop policy if exists field_station_photos_update on public.field_station_photos;
create policy field_station_photos_update
  on public.field_station_photos
  for update
  to authenticated
  using (
    company_id = (select company_id from public.current_employee())
    and (
      uploaded_by = (select id from public.current_employee())
      or (select permission from public.current_employee()) = 'admin'
    )
  )
  with check (
    company_id = (select company_id from public.current_employee())
    and (
      uploaded_by = (select id from public.current_employee())
      or (select permission from public.current_employee()) = 'admin'
    )
  );

-- 사진 삭제: 업로더 본인 OR admin.
drop policy if exists field_station_photos_delete on public.field_station_photos;
create policy field_station_photos_delete
  on public.field_station_photos
  for delete
  to authenticated
  using (
    company_id = (select company_id from public.current_employee())
    and (
      uploaded_by = (select id from public.current_employee())
      or (select permission from public.current_employee()) = 'admin'
    )
  );

grant select, insert, update, delete on public.field_station_photos to authenticated;
grant all on public.field_station_photos to service_role;


-- =====================================================================
-- PostgREST 캐시 갱신
-- =====================================================================
notify pgrst, 'reload schema';

-- =====================================================================
-- 마이그 0089 완료.
--   R2 추가 작업 없음 — 기존 'relocation-field-notes' 버킷에 키 prefix
--   'stations/' 로 저장.
-- =====================================================================
