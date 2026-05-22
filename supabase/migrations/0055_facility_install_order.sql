-- =====================================================================
-- edenMG  지장이설 — 시설 설치 순번 배지 수동 지정
-- Migration 0055 — relocation_facilities.install_order
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0001~0054 이 먼저 실행돼 있어야 한다.
--
-- 본 마이그 내용:
--   - relocation_facilities 에 install_order 컬럼 추가.
--     접속함체·RN·IJP 시설명 앞 숫자 배지(설치 순번)를 설계자가 수동 지정한 값.
--     NULL = 자동 (시설 생성 순서대로 빈 번호를 채워 배정).
--     값이 있으면 그 번호를 우선 적용. 설계자가 같은 번호를 지정하면
--     코드의 setFacilityInstallOrder 가 1..N 으로 재정렬한다.
-- =====================================================================

alter table public.relocation_facilities
  add column if not exists install_order integer;

-- =====================================================================
-- 마이그 0055 완료.
-- =====================================================================
