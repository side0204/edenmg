-- =====================================================================
-- edenMG  공사 설계 — 청약 카테고리 폼 보강 (준공예정일 + 작업자 배정)
-- Migration 0067 — relocation_projects 청약 컬럼 3 종 추가
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등 (여러 번 실행 가능).
--
-- 배경 (2026-05-25 owner 요청 — 0066 후속)
--   청약 설계 폼 보강:
--   - 「지역」 필드는 청약 화면에서 숨김 (DB 컬럼은 그대로 유지 — 다른 카테고리에서 사용)
--   - 「공사계약일」 옆에 「준공예정일」 추가
--   - 「작업자배정」 외선/접속 구분하여 자유 텍스트 입력
--
-- 본 마이그 내용:
--   - expected_completion_at date  준공예정일
--   - outside_workers text         외선 작업자 (이름 자유 입력)
--   - splice_workers text          접속 작업자 (이름 자유 입력)
--
-- 모두 nullable — 다른 카테고리에서는 미사용.
-- =====================================================================

alter table public.relocation_projects
  add column if not exists expected_completion_at  date,
  add column if not exists outside_workers         text,
  add column if not exists splice_workers          text;

-- =====================================================================
-- 마이그 0067 완료.
-- =====================================================================
