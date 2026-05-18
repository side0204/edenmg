-- =====================================================================
-- edenMG  M3 Phase 2-C 접속일보 사진 첨부
-- Migration 0020 — connection_report_photos 테이블 + connection-photos 버킷 + RLS
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0012 (connection_reports) 가 먼저 실행돼 있어야 한다.
--
-- 정책 요약 (owner 결정):
--   - 다중 사진 (1:N). 한 일보에 여러 장.
--   - 형식: 이미지(JPG/PNG/WEBP/HEIC) 한정. 장당 10MB.
--   - EXIF (촬영시각·GPS) 는 클라이언트에서 추출해 컬럼 저장. DB 자체 추출 안 함.
--   - 업로드/삭제: 작성자 본인 + connection_reports.status='대기' 동안만.
--   - 다운로드: 같은 회사 누구나 (connection_reports SELECT RLS 와 동일 스코프).
--   - 경로 규칙: '{report_id}/{uuid}.{ext}'  ← 첫 segment 가 일보 id
-- =====================================================================


-- ===== TABLE: connection_report_photos =================================
create table if not exists public.connection_report_photos (
  id              uuid primary key default gen_random_uuid(),
  report_id       uuid not null references public.connection_reports(id) on delete cascade,
  plan_node_id    uuid references public.connection_plan_nodes(id) on delete set null,
  path            text not null,
  filename        text not null,
  mime_type       text not null,
  file_size       int  not null check (file_size > 0),
  taken_at        timestamptz,
  gps_lat         numeric(10, 7),
  gps_lng         numeric(10, 7),
  uploaded_by     uuid not null references public.employees(id) on delete restrict,
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists connection_report_photos_report_idx
  on public.connection_report_photos(report_id, created_at);
create index if not exists connection_report_photos_node_idx
  on public.connection_report_photos(plan_node_id)
  where plan_node_id is not null;

alter table public.connection_report_photos enable row level security;


-- ===== RLS: connection_report_photos ==================================
-- 같은 회사 조회 가능 (connection_reports 패턴과 동일)
drop policy if exists connection_report_photos_select on public.connection_report_photos;
create policy connection_report_photos_select
  on public.connection_report_photos
  for select
  using (
    exists (
      select 1 from public.connection_reports r
      join public.works w on w.id = r.work_id
      where r.id = connection_report_photos.report_id
        and w.company_id = (select company_id from public.current_employee())
    )
  );

-- 작성자 + 대기 시에만 insert
drop policy if exists connection_report_photos_insert on public.connection_report_photos;
create policy connection_report_photos_insert
  on public.connection_report_photos
  for insert
  with check (
    uploaded_by = (select id from public.current_employee())
    and exists (
      select 1 from public.connection_reports r
      join public.works w on w.id = r.work_id
      where r.id = connection_report_photos.report_id
        and w.company_id = (select company_id from public.current_employee())
        and r.status = '대기'
        and r.author_employee_id = (select id from public.current_employee())
    )
  );

-- 작성자 + 대기 OR admin 일 때 delete
drop policy if exists connection_report_photos_delete on public.connection_report_photos;
create policy connection_report_photos_delete
  on public.connection_report_photos
  for delete
  using (
    exists (
      select 1 from public.connection_reports r
      join public.works w on w.id = r.work_id
      where r.id = connection_report_photos.report_id
        and w.company_id = (select company_id from public.current_employee())
        and (
          (
            r.author_employee_id = (select id from public.current_employee())
            and r.status = '대기'
          )
          or (select permission from public.current_employee()) in ('admin', 'ceo')
        )
    )
  );


-- ===== GRANTS =========================================================
grant select, insert, delete on public.connection_report_photos to authenticated;
-- update 미부여 (교체 = 삭제 + 재업로드)


-- ===== BUCKET =========================================================
-- private 버킷. 이미지 한정, 10MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'connection-photos',
  'connection-photos',
  false,
  10485760,  -- 10 MB
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ===== POLICIES on storage.objects ====================================
-- name 첫 segment 를 report_id 로 파싱해 connection_reports 와 join.

-- SELECT (다운로드) — 같은 회사 누구나
drop policy if exists connection_photos_select on storage.objects;
create policy connection_photos_select
  on storage.objects
  for select
  using (
    bucket_id = 'connection-photos'
    and exists (
      select 1
      from public.connection_reports r
      join public.works w on w.id = r.work_id
      where r.id::text = split_part(name, '/', 1)
        and w.company_id = (select company_id from public.current_employee())
    )
  );

-- INSERT (업로드) — 작성자 + 대기
drop policy if exists connection_photos_insert on storage.objects;
create policy connection_photos_insert
  on storage.objects
  for insert
  with check (
    bucket_id = 'connection-photos'
    and exists (
      select 1
      from public.connection_reports r
      where r.id::text = split_part(name, '/', 1)
        and r.author_employee_id = (select id from public.current_employee())
        and r.status = '대기'
    )
  );

-- DELETE — 작성자 + 대기 OR admin
drop policy if exists connection_photos_delete on storage.objects;
create policy connection_photos_delete
  on storage.objects
  for delete
  using (
    bucket_id = 'connection-photos'
    and exists (
      select 1
      from public.connection_reports r
      join public.works w on w.id = r.work_id
      where r.id::text = split_part(name, '/', 1)
        and w.company_id = (select company_id from public.current_employee())
        and (
          (
            r.author_employee_id = (select id from public.current_employee())
            and r.status = '대기'
          )
          or (select permission from public.current_employee()) in ('admin', 'ceo')
        )
    )
  );
