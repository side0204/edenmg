-- =====================================================================
-- edenMG  작업 지시사항 필드
-- Migration 0016
--   works.instructions text 컬럼 추가.
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등 (여러 번 실행 가능). 0008 이 먼저 실행돼 있어야 한다.
--
-- 정책 (owner 결정):
--   - 'notes(비고)' 와 분리. 비고는 자유 메모, 지시사항은 작업자 유의사항·안전수칙·연락처 등 강조 표시 대상
--   - 일보 작성 화면 상단 노랑 박스로 항상 노출 → 작업자가 매번 보게 됨
--   - 작업 등록·수정 권한자만 입력 (RLS 는 기존 works_manager_update 가 처리)
-- =====================================================================

alter table public.works
  add column if not exists instructions text;
