-- =====================================================================
-- edenMG  현장관리 — 사진 설명(caption) 수정 권한
-- Migration 0088 — relocation_field_note_photos UPDATE GRANT + RLS
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능).
--
-- 배경
--   0085 에서 relocation_field_note_photos 에 select/insert/delete 정책·GRANT 만
--   만들고 UPDATE 를 빼먹음. 그래서 caption(사진 설명) 수정이 작성자·관리자
--   누구든 RLS 에 막힘 (「설명 수정 권한이 없습니다」). UPDATE GRANT + 정책 추가.
--   삭제와 동일 권한: 업로더 본인 OR admin.
-- =====================================================================

grant update on public.relocation_field_note_photos to authenticated;

drop policy if exists relocation_field_note_photos_update on public.relocation_field_note_photos;
create policy relocation_field_note_photos_update
  on public.relocation_field_note_photos
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

-- PostgREST 캐시 갱신 (RLS/GRANT 변경 즉시 반영)
notify pgrst, 'reload schema';

-- =====================================================================
-- 마이그 0088 완료.
-- =====================================================================
