-- =====================================================================
-- edenMG  직원 본사/현장 구분
-- Migration 0028 — employees.workplace_type
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0027 까지 먼저.
--
-- 정책 요약 (owner 결정):
--   - 관리자가 회원가입 승인 시 본사/현장 구분 부여.
--   - 본사: 전체 관리탭 (사무·작업·자재) 모두 노출.
--   - 현장: 사무탭 + 홈의 업무용 차량·결재 카드 비표시.
--   - 기본값 '본사' (기존 직원에게 영향 없음).
-- =====================================================================

alter table public.employees
  add column if not exists workplace_type text not null default '본사'
    check (workplace_type in ('본사', '현장'));

create index if not exists employees_workplace_idx
  on public.employees(company_id, workplace_type);
