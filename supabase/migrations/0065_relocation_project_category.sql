-- =====================================================================
-- edenMG  공사 설계 — 프로젝트 카테고리 추가
-- Migration 0065 — relocation_projects.category 컬럼 추가
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등 (여러 번 실행 가능).
--
-- 배경 (2026-05-25 owner 요청)
--   기존 '지장이설 설계' 단일 진입을 「공사 설계」로 일반화.
--   진입하면 청약 설계 / 계획 설계 / 지장이설 설계 3개 카테고리로 분기,
--   각 카테고리 안에서 프로젝트를 생성·관리. 모든 공사의 행정도·코어
--   구성도·직선도 설계를 한 모듈에서 다룸.
--
-- 본 마이그 내용:
--   - relocation_projects.category text not null default '지장이설'
--   - CHECK 제약 (청약 · 계획 · 지장이설 3개 enum-like 값)
--   - 카테고리 인덱스
--
-- 기존 row 는 모두 '지장이설' 로 backfill (default 가 적용).
-- =====================================================================

alter table public.relocation_projects
  add column if not exists category text not null default '지장이설';

do $$ begin
  alter table public.relocation_projects
    add constraint relocation_projects_category_chk
    check (category in ('청약', '계획', '지장이설'));
exception when duplicate_object then null; end $$;

create index if not exists relocation_projects_category_idx
  on public.relocation_projects(company_id, category);

-- =====================================================================
-- 마이그 0065 완료.
-- =====================================================================
