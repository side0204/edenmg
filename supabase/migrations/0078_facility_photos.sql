-- 청약 시설별 작업사진 첨부 (마이그 0078).
--   - 캔버스 「작업내역입력」 popover 아래 「작업사진 입력」 버튼에서 업로드
--   - 카테고리: 전경 / 랙전경 / MOFD / 전주명판 / 접속여장판 / 케이블번호(LOT/제작사) / 기타
--   - 「기타」 는 custom_label 자유 텍스트
--   - 시설 정보 패널 (FacilityInfoPanel) 에서 갤러리로 확인
--
-- Storage:
--   - 버킷명 'relocation-facility-photos' — Cloudflare R2 (2026-05-25 이후 표준)
--   - 10MB 제한, image/* MIME
--   - 경로: {facility_id}/{timestamp}-{random}.{ext}
--
-- RLS:
--   - SELECT/INSERT: 같은 회사 직원 누구나 (회사 스코프)
--   - DELETE: 업로더 본인 + admin (소속 회사)
--
-- 멱등.

create table if not exists public.relocation_facility_photos (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.relocation_projects(id) on delete cascade,
  facility_id   uuid not null references public.relocation_facilities(id) on delete cascade,
  category      text not null,                                    -- 전경/랙전경/MOFD/...
  custom_label  text,                                              -- 「기타」 일 때 사용자 입력
  image_path    text not null,                                     -- R2 키
  original_filename text,                                          -- 원본 파일명 (다운로드용)
  taken_at      timestamptz,                                       -- EXIF 촬영시각 (없으면 null)
  uploaded_by   uuid references public.employees(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint relocation_facility_photos_category_check
    check (category in (
      '전경', '랙전경', 'MOFD', '전주명판', '접속여장판',
      '케이블번호(LOT/제작사)', '기타'
    ))
);

create index if not exists relocation_facility_photos_facility_idx
  on public.relocation_facility_photos(facility_id, created_at desc);
create index if not exists relocation_facility_photos_project_idx
  on public.relocation_facility_photos(project_id);

alter table public.relocation_facility_photos enable row level security;

-- 같은 회사 직원 누구나 select / insert (회사 스코프 — 시설 RLS 가 자동 보장)
drop policy if exists relocation_facility_photos_select on public.relocation_facility_photos;
create policy relocation_facility_photos_select
  on public.relocation_facility_photos
  for select
  using (
    project_id in (
      select id from public.relocation_projects
      where company_id = (select company_id from public.current_employee())
    )
  );

drop policy if exists relocation_facility_photos_insert on public.relocation_facility_photos;
create policy relocation_facility_photos_insert
  on public.relocation_facility_photos
  for insert
  with check (
    project_id in (
      select id from public.relocation_projects
      where company_id = (select company_id from public.current_employee())
    )
  );

-- 본인 업로드 OR admin 만 삭제
drop policy if exists relocation_facility_photos_delete on public.relocation_facility_photos;
create policy relocation_facility_photos_delete
  on public.relocation_facility_photos
  for delete
  using (
    project_id in (
      select id from public.relocation_projects
      where company_id = (select company_id from public.current_employee())
    )
    and (
      uploaded_by = (select id from public.current_employee())
      or (select permission from public.current_employee()) = 'admin'
    )
  );

-- GRANT (update 는 미부여 — append-only)
grant select, insert, delete on public.relocation_facility_photos to authenticated;
