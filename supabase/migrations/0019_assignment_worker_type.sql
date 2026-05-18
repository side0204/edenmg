-- =====================================================================
-- edenMG  배정 단위 작업자 구분 (worker_type)
-- Migration 0019
--
-- work_assignments.worker_type 컬럼 추가 — 같은 작업이라도 작업자별로
-- 다른 worker_type (접속팀/외선팀/기타) 을 지정하면 그 작업자는 본인
-- 분야에 맞는 일보(접속일보/외선일보) 를 작성한다.
--
-- 기본은 NULL — 작업.worker_type 을 따른다 (기존 동작 호환).
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등. 0010 (work_worker_type enum) 이 먼저 실행돼 있어야 함.
-- =====================================================================

alter table public.work_assignments
  add column if not exists worker_type public.work_worker_type;
