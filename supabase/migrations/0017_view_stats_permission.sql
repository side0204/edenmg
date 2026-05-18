-- =====================================================================
-- edenMG  작업통계 조회 권한 분리
-- Migration 0017
--   employees.can_view_stats boolean 추가.
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등 (여러 번 실행 가능). 0001 (employees) 만 있으면 OK.
--
-- 정책 (owner 결정):
--   - admin/ceo: 항상 전체 회사 통계 조회 가능 (이 컬럼 무관)
--   - can_view_stats=true: 전체 회사 통계 조회 가능
--   - 그 외 (worker/foreman 미부여): 본인이 작성한 일보 기반 통계만 표시
--   - /works/stats 페이지 진입 자체는 누구나 허용 (표시 데이터만 제한)
--   - admin 이 /admin/employees 에서 직원별 토글로 부여
-- =====================================================================

alter table public.employees
  add column if not exists can_view_stats boolean not null default false;
