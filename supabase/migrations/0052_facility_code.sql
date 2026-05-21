-- =====================================================================
-- edenMG  지장이설 — 접속함체 ID
-- Migration 0052 — relocation_facilities.facility_code
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0001~0051 이 먼저 실행돼 있어야 한다.
--
-- 본 마이그 내용:
--   - relocation_facilities 에 facility_code 컬럼 추가.
--     접속함체 ID (LGU+ 제공 식별자 등). 자동 부여 번호(seq_no)와 별개로 직접 입력.
-- =====================================================================

alter table public.relocation_facilities
  add column if not exists facility_code text;

-- =====================================================================
-- 마이그 0052 완료.
-- =====================================================================
