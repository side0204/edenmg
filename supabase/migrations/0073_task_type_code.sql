-- =====================================================================
-- edenMG  지장이설 — 공종 마스터에 「공종코드」 컬럼 추가
-- Migration 0073 — relocation_task_type_master.code
--
-- 배경 (owner 2026-05-25)
--   기존 task_type_master 는 공종명(name) 만 있었음.
--   캔버스 시설물 「작업내역입력」 popover 에서 (공종코드, 공종명) 으로 입력받음.
--   같은 회사 안 코드 중복 방지.
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--   멱등 — 여러 번 실행해도 안전.
-- =====================================================================

alter table public.relocation_task_type_master
  add column if not exists code text;

-- 같은 회사 안 코드 unique — 코드 있을 때만 검사 (partial unique).
create unique index if not exists relocation_task_type_company_code_idx
  on public.relocation_task_type_master(company_id, code)
  where code is not null;

-- =====================================================================
-- 마이그 0073 완료.
-- =====================================================================
