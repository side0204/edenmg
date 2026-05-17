-- =====================================================================
-- edenMG  M2 후속 — 첨부파일
-- Migration 0005 — leave-attachments Storage 버킷 + RLS
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0001~0004 가 먼저 실행돼 있어야 한다.
--
-- 정책 요약 (owner 결정):
--   - 첨부 대상: 병가·공가 한정 (DB 제약 아님. UI 에서만 노출 통제)
--   - 크기·MIME: 10MB / 이미지(jpeg/png/webp/heic) + PDF
--   - 다운로드: 신청자 본인 + assigned_foreman + 회사 admin/ceo
--   - 업로드/교체/삭제: 신청자 본인 + status='대기' 동안만
--   - 경로 규칙: '{leave_request_id}/{uuid}.{ext}'  ← 첫 segment 가 신청서 id
-- =====================================================================


-- ===== COLUMN: attachment_filename ====================================
-- 다운로드 시 사용자에게 보여줄 원본 파일명. Storage path 는 UUID 만 두고
-- 표시용 이름은 별도 컬럼으로 분리해 충돌·인코딩 문제 회피.
alter table public.leave_requests
  add column if not exists attachment_filename text;


-- ===== BUCKET =========================================================
-- private 버킷. 크기·MIME 제한도 버킷 메타에 박아 Storage API 단에서 차단.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'leave-attachments',
  'leave-attachments',
  false,
  10485760,  -- 10 MB
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ===== POLICIES on storage.objects ====================================
-- storage 스키마의 objects 테이블에 정책을 박는다.
-- name 첫 segment 를 leave_request_id 로 파싱해 leave_requests 와 join.

-- SELECT (다운로드) — 신청자 / 지정 결재자(소장) / 회사 admin·ceo
drop policy if exists leave_attachments_select on storage.objects;
create policy leave_attachments_select
  on storage.objects
  for select
  using (
    bucket_id = 'leave-attachments'
    and exists (
      select 1
      from public.leave_requests lr
      where lr.id::text = split_part(name, '/', 1)
        and (
          lr.employee_id = (select id from public.current_employee())
          or lr.assigned_foreman_id = (select id from public.current_employee())
          or (
            lr.company_id = (select company_id from public.current_employee())
            and (select permission from public.current_employee()) in ('admin', 'ceo')
          )
        )
    )
  );

-- INSERT (업로드) — 신청자 본인 + 대기 상태일 때만.
-- 신청 row 가 먼저 존재해야 한다 (submitRequest 가 insert→upload→update 순으로 처리).
drop policy if exists leave_attachments_insert on storage.objects;
create policy leave_attachments_insert
  on storage.objects
  for insert
  with check (
    bucket_id = 'leave-attachments'
    and exists (
      select 1
      from public.leave_requests lr
      where lr.id::text = split_part(name, '/', 1)
        and lr.employee_id = (select id from public.current_employee())
        and lr.status = '대기'
    )
  );

-- UPDATE (덮어쓰기) — 본인 + 대기. 교체 흐름에서 upsert 가 일어날 때 필요.
drop policy if exists leave_attachments_update on storage.objects;
create policy leave_attachments_update
  on storage.objects
  for update
  using (
    bucket_id = 'leave-attachments'
    and exists (
      select 1
      from public.leave_requests lr
      where lr.id::text = split_part(name, '/', 1)
        and lr.employee_id = (select id from public.current_employee())
        and lr.status = '대기'
    )
  )
  with check (
    bucket_id = 'leave-attachments'
    and exists (
      select 1
      from public.leave_requests lr
      where lr.id::text = split_part(name, '/', 1)
        and lr.employee_id = (select id from public.current_employee())
        and lr.status = '대기'
    )
  );

-- DELETE (교체 시 이전 파일 정리) — 본인 + 대기.
drop policy if exists leave_attachments_delete on storage.objects;
create policy leave_attachments_delete
  on storage.objects
  for delete
  using (
    bucket_id = 'leave-attachments'
    and exists (
      select 1
      from public.leave_requests lr
      where lr.id::text = split_part(name, '/', 1)
        and lr.employee_id = (select id from public.current_employee())
        and lr.status = '대기'
    )
  );
