-- =====================================================================
-- edenMG  직원 퇴사 처리
-- Migration 0033 — employees.resigned_at 컬럼 추가
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능).
--
-- 정책 요약 (owner 결정, 2026-05-19):
--   - 차단 범위: 로그인 차단만. 진행중 차량·휴가·작업은 수동 정리.
--     (홈 페이지의 !is_active 분기가 이미 차단 → 별도 로직 불필요)
--   - 퇴사일: 관리자가 직접 입력 (기본 오늘). 수정 가능.
--   - 재입사: 같은 row 재활용. is_active=true + resigned_at=null.
--   - 화면: /admin/employees/resigned 별도 페이지.
-- =====================================================================

alter table public.employees
  add column if not exists resigned_at date;

create index if not exists employees_resigned_at_idx
  on public.employees(resigned_at) where resigned_at is not null;
