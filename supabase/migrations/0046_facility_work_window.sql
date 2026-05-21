-- =====================================================================
-- edenMG  지장이설 자동화 설계 모듈 (M-Relocation)
-- Migration 0046 — 시설 작업 가능 시간대
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0045 가 먼저 실행돼 있어야 한다.
--
-- 본 마이그 내용:
--   - relocation_facilities.work_window_start / work_window_end (time, nullable)
--     특정 시간대에만 작업 가능한 시설(예: 학교 인근 00~02시만)의 제약 기록.
--     null = 시간대 제약 없음 (차수 시간대 안 아무때나 가능).
--     배정된 차수의 시간대와 겹치지 않으면 차수 탭에서 경고 표시.
-- =====================================================================

alter table public.relocation_facilities
  add column if not exists work_window_start time,
  add column if not exists work_window_end   time;

-- =====================================================================
-- 마이그 0046 완료.
-- =====================================================================
