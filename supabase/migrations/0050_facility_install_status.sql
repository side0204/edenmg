-- =====================================================================
-- edenMG  지장이설 — 시설 설치 구분 (기설/신설)
-- Migration 0050 — relocation_facilities.install_status
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0001~0049 가 먼저 실행돼 있어야 한다.
--
-- 본 마이그 내용:
--   - relocation_facilities 에 install_status 컬럼 추가 ('existing' | 'new').
--     접속함체의 기설/신설 구분용 (UI 는 접속함체에만 노출). 기존 행·기본값 'new'.
-- =====================================================================

alter table public.relocation_facilities
  add column if not exists install_status text not null default 'new';

do $$ begin
  alter table public.relocation_facilities
    add constraint relocation_facilities_install_status_check
    check (install_status in ('existing', 'new'));
exception when duplicate_object then null; end $$;

-- =====================================================================
-- 마이그 0050 완료.
-- =====================================================================
