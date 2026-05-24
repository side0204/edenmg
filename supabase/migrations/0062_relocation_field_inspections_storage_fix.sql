-- =====================================================================
-- edenMG  지장이설 — 실사 캡처 Storage RLS 단순화 (fix)
-- Migration 0062 — relocation_field_inspections storage policy 재작성
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등 (여러 번 실행 가능).
--
-- 배경
--   0061 의 storage.objects INSERT 정책이 relocation_facilities + projects 를
--   JOIN 하면서 `current_employee()` 를 호출 → 일부 환경에서 storage 컨텍스트
--   안 평가가 실패해 "new row violates row-level security policy" 발생.
--
-- 단순화
--   relocation_facilities 자체가 이미 회사 스코프 RLS (company_id = current
--   _employee.company_id) 로 보호됨. 따라서 storage 정책은 단순히 「path 의
--   첫 segment 가 회사 안에 보이는 시설 id 인가」 만 확인하면 회사 스코프가
--   자동 보장. JOIN + current_employee 호출 제거 → 평가 안정성 ↑.
--
-- 본 마이그 내용:
--   - storage.objects 의 relocation_field_inspections_storage_* 정책 3종 재작성
-- =====================================================================


-- SELECT (다운로드)
drop policy if exists relocation_field_inspections_storage_select on storage.objects;
create policy relocation_field_inspections_storage_select
  on storage.objects
  for select
  using (
    bucket_id = 'relocation-field-inspections'
    and exists (
      select 1
      from public.relocation_facilities f
      where f.id::text = split_part(name, '/', 1)
    )
  );

-- INSERT (업로드)
drop policy if exists relocation_field_inspections_storage_insert on storage.objects;
create policy relocation_field_inspections_storage_insert
  on storage.objects
  for insert
  with check (
    bucket_id = 'relocation-field-inspections'
    and exists (
      select 1
      from public.relocation_facilities f
      where f.id::text = split_part(name, '/', 1)
    )
  );

-- DELETE
drop policy if exists relocation_field_inspections_storage_delete on storage.objects;
create policy relocation_field_inspections_storage_delete
  on storage.objects
  for delete
  using (
    bucket_id = 'relocation-field-inspections'
    and exists (
      select 1
      from public.relocation_facilities f
      where f.id::text = split_part(name, '/', 1)
    )
  );


-- =====================================================================
-- 마이그 0062 완료.
-- 회사 스코프는 relocation_facilities 의 자체 RLS 가 자동 보장 (해당 회사
-- 직원만 그 시설 row 를 볼 수 있음 → exists 가 false → storage 차단).
-- =====================================================================
