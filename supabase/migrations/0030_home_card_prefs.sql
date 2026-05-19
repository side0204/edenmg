-- =====================================================================
-- edenMG  홈 화면 카드 개인화 (사용자별 순서·표시)
-- Migration 0030 — employees.home_card_prefs jsonb
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0001~0029 이 먼저 실행돼 있어야 한다.
--
-- 정책 요약 (owner 결정):
--   - 카드별 표시·숨김 + 순서를 사용자가 직접 조정
--   - 디바이스 무관 (DB 저장 → PC·핸드폰·태블릿 동일)
--   - 형식: { "order": [card_id, ...], "hidden": [card_id, ...] }
--     빈 객체면 코드에서 기본 순서 사용 (forward-compat)
--   - 본인 row 만 update — 기존 employees RLS 가 정책 한 번 더 커버
-- =====================================================================

alter table public.employees
  add column if not exists home_card_prefs jsonb not null default '{}'::jsonb;
