-- =====================================================================
-- edenMG  휴가 대무자 (substitute) 도입
-- Migration 0007 — leave_requests.substitute_employee_id 추가
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0001~0006 이 먼저 실행돼 있어야 한다.
--
-- 정책 요약 (owner 결정):
--   - 모든 휴가 신청에 대무자 필수 (실 운영 신청 폼 검증으로 강제)
--   - 본인·비활성 직원 제외 (폼/서버 액션 검증, RLS 별도 강제 없음)
-- =====================================================================

-- ===== ADD COLUMN ====================================================
-- 신청자가 휴가 동안 일을 대신할 직원을 지정. 사후에 해당 직원이 비활성/퇴사해도
-- 신청 이력은 보존(set null) 한다.
alter table public.leave_requests
  add column if not exists substitute_employee_id uuid references public.employees(id) on delete set null;

-- 휴가자 현황 카드(홈) 가 status='승인' + 기간 필터로 조회한다.
-- start_date, end_date, status 조합 인덱스 — 같은 회사 안에서 빠르게 조회.
create index if not exists leave_requests_company_approved_period_idx
  on public.leave_requests(company_id, status, start_date, end_date)
  where status = '승인';
