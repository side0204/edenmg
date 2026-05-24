-- =====================================================================
-- edenMG  지장이설 — 시설별 실사 내용 캡처 (Phase 2)
-- Migration 0061 — relocation_field_inspections + Storage 버킷
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능).
--
-- 배경
--   owner 요청 (2026-05-24): 캔버스 「실사」 그림 + 텍스트를 화면 캡처해
--   선택한 시설물에 첨부 → 사무실에서 시설 정보 패널에 「실사내용확인」
--   배지로 안내. 현장 답사 결과를 사진처럼 보관.
--
-- 본 마이그 내용:
--   - relocation_field_inspections 테이블 (시설별 N장)
--   - storage 버킷 relocation-field-inspections (private, 10MB, 이미지)
--   - RLS 3종 (select/insert/delete) — 같은 회사 누구나 보고 작성
-- =====================================================================


-- =====================================================================
-- TABLE: relocation_field_inspections
-- =====================================================================
create table if not exists public.relocation_field_inspections (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.relocation_projects(id) on delete cascade,
  facility_id   uuid not null references public.relocation_facilities(id) on delete cascade,
  image_path    text not null,                                            -- storage 경로
  note          text,                                                     -- 선택 메모
  captured_at   timestamptz not null default now(),
  uploaded_by   uuid references public.employees(id) on delete set null,
  created_at    timestamptz not null default now()
);

alter table public.relocation_field_inspections enable row level security;

create index if not exists relocation_field_inspections_project_idx
  on public.relocation_field_inspections(project_id);

create index if not exists relocation_field_inspections_facility_idx
  on public.relocation_field_inspections(facility_id, captured_at desc);


-- ===== RLS — 회사 스코프 =================================================
drop policy if exists relocation_field_inspections_all on public.relocation_field_inspections;
create policy relocation_field_inspections_all
  on public.relocation_field_inspections
  for all
  using (
    project_id in (
      select id from public.relocation_projects
      where company_id = (select company_id from public.current_employee())
    )
  )
  with check (
    project_id in (
      select id from public.relocation_projects
      where company_id = (select company_id from public.current_employee())
    )
  );


-- ===== GRANTS =========================================================
grant select, insert, update, delete on public.relocation_field_inspections to authenticated;
grant all on public.relocation_field_inspections to service_role;


-- =====================================================================
-- STORAGE BUCKET: relocation-field-inspections
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'relocation-field-inspections',
  'relocation-field-inspections',
  false,
  10485760,  -- 10 MB
  array[
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ===== Storage RLS ====================================================
-- 경로 패턴: {facility_id}/{uuid}.{ext}
-- name 첫 segment 를 facility_id 로 파싱해 시설→프로젝트→회사 join.

-- SELECT (다운로드) — 같은 회사 누구나
drop policy if exists relocation_field_inspections_storage_select on storage.objects;
create policy relocation_field_inspections_storage_select
  on storage.objects
  for select
  using (
    bucket_id = 'relocation-field-inspections'
    and exists (
      select 1
      from public.relocation_facilities f
      join public.relocation_projects p on p.id = f.project_id
      where f.id::text = split_part(name, '/', 1)
        and p.company_id = (select company_id from public.current_employee())
    )
  );

-- INSERT (업로드) — 같은 회사 누구나
drop policy if exists relocation_field_inspections_storage_insert on storage.objects;
create policy relocation_field_inspections_storage_insert
  on storage.objects
  for insert
  with check (
    bucket_id = 'relocation-field-inspections'
    and exists (
      select 1
      from public.relocation_facilities f
      join public.relocation_projects p on p.id = f.project_id
      where f.id::text = split_part(name, '/', 1)
        and p.company_id = (select company_id from public.current_employee())
    )
  );

-- DELETE — 같은 회사 누구나 (작성자 제한 없음 — 실사 메모라 자유 관리)
drop policy if exists relocation_field_inspections_storage_delete on storage.objects;
create policy relocation_field_inspections_storage_delete
  on storage.objects
  for delete
  using (
    bucket_id = 'relocation-field-inspections'
    and exists (
      select 1
      from public.relocation_facilities f
      join public.relocation_projects p on p.id = f.project_id
      where f.id::text = split_part(name, '/', 1)
        and p.company_id = (select company_id from public.current_employee())
    )
  );


-- =====================================================================
-- 마이그 0061 완료.
-- =====================================================================
