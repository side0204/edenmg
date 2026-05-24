-- =====================================================================
-- edenMG  지장이설 — 실사 캡처 Storage RLS column shadowing 버그 수정
-- Migration 0063 — split_part(name) → split_part(objects.name)
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등 (여러 번 실행 가능).
--
-- 배경 (2026-05-24 owner 보고 + pg_policies 결과 분석)
--   0061/0062 의 storage 정책 안 EXISTS subquery 에서 `name` 컬럼이
--   relocation_facilities.name (시설명) 으로 잘못 바인딩 됨.
--   PostgreSQL 의 column shadowing — relocation_facilities 에 name 컬럼이
--   있어서 inner scope 가 우선 → 시설명을 '/' 로 split 하는 게 돼
--   절대 시설 id 와 match X → EXISTS false → 모든 업로드 거부.
--
--   pg_policies 결과에 `split_part(f.name, '/', 1)` 로 표시된 게 증거.
--
--   connection-photos 정책 (0020) 은 우연히 작동: connection_reports 에
--   name 컬럼이 없어서 outer storage.objects.name 으로 정상 바인딩.
--
-- 수정
--   subquery 안에서 storage.objects 의 name 을 명시적으로 참조하기 위해
--   outer 테이블 alias `o` 를 추가하지 못하므로 (storage 정책 문법 제약),
--   `(select objects.name)` 를 outer scope 변수로 캡처:
--   `where f.id::text = split_part(o_name, '/', 1)` 패턴.
--   가장 단순: subquery 에서 outer reference 를 변수로 prebind.
-- =====================================================================


-- 헬퍼 함수 — storage path 의 첫 segment 추출. 컬럼 shadowing 회피.
create or replace function public.relocation_inspection_facility_id(_name text)
returns text
language sql
immutable
as $$
  select split_part(_name, '/', 1)
$$;


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
      where f.id::text = public.relocation_inspection_facility_id(storage.objects.name)
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
      where f.id::text = public.relocation_inspection_facility_id(storage.objects.name)
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
      where f.id::text = public.relocation_inspection_facility_id(storage.objects.name)
    )
  );


-- =====================================================================
-- 마이그 0063 완료.
-- 핵심: `split_part(name, ...)` → `public.relocation_inspection_facility_id(storage.objects.name)`.
--   1) 명시적 schema-qualified storage.objects.name 으로 column shadowing 회피
--   2) 헬퍼 함수로 한 번 더 안전 (subquery 안에서 outer column 안전 캡처)
-- =====================================================================
