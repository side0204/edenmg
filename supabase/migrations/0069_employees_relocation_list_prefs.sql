-- =====================================================================
-- edenMG  공사 설계 목록 — 사용자별 컬럼 prefs DB 동기화
-- Migration 0069 — employees.relocation_list_prefs jsonb
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등 (여러 번 실행 가능).
--
-- 배경 (2026-05-25 owner 요청)
--   기존 컬럼 prefs(visibility·순서·폭)는 localStorage 에 저장 → 디바이스마다 따로.
--   PC·태블릿·모바일에서 한 번 설정한 컬럼 구성을 공유하도록 DB 로 이전.
--
-- 본 마이그 내용:
--   employees.relocation_list_prefs jsonb default '{}'::jsonb
--     형식:
--       {
--         "청약":  { "order": ["title", ...], "hidden": [...], "widths": { "title": 240 } },
--         "계획":  { ... },
--         "지장이설": { ... }
--       }
--     누락 키·값은 클라이언트에서 카테고리 기본값으로 보충 (forward-compat).
--
-- 본인 행 update 는 기존 employees_update_self RLS 가 허용 (home_card_prefs 동일 패턴).
-- =====================================================================

alter table public.employees
  add column if not exists relocation_list_prefs jsonb not null default '{}'::jsonb;

-- =====================================================================
-- 마이그 0069 완료.
-- =====================================================================
