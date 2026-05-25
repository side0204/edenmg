-- =====================================================================
-- edenMG  공사 설계 — 청약 카테고리 전용 필드 추가
-- Migration 0066 — relocation_projects 청약 컬럼 8 종
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등 (여러 번 실행 가능).
--
-- 배경 (2026-05-25 owner 요청)
--   청약 설계 폼은 LGU+ 청약 안건 특성에 맞춰 가입자·하위국·청약일 등
--   별도 필드가 필요. 다른 카테고리(계획·지장이설)에서는 미사용.
--   모두 nullable — UI 에서만 카테고리 분기.
--
-- 본 마이그 내용:
--   - subscription_id text       청약ID (LGU+ 청약 시스템 식별자)
--   - subscriber_name text       가입자명
--   - subscriber_address text    가입자 주소
--   - branch_contact text        하위국 연락처
--   - branch_manager text        하위국 담당자
--   - subscribed_at date         청약일
--   - desired_open_at date       개통희망일
--   - order_no text              공사번호
-- =====================================================================

alter table public.relocation_projects
  add column if not exists subscription_id     text,
  add column if not exists subscriber_name     text,
  add column if not exists subscriber_address  text,
  add column if not exists branch_contact      text,
  add column if not exists branch_manager      text,
  add column if not exists subscribed_at       date,
  add column if not exists desired_open_at     date,
  add column if not exists order_no            text;

-- 공사번호 검색 인덱스 (청약 카테고리에 한해 자주 검색됨)
create index if not exists relocation_projects_order_no_idx
  on public.relocation_projects(company_id, order_no)
  where order_no is not null;

-- =====================================================================
-- 마이그 0066 완료.
-- =====================================================================
