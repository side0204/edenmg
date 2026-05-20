-- =====================================================================
-- edenMG 지장이설 — Migration 0045: 시설 GPS 좌표 (카카오맵 연동)
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0036 이 먼저 실행돼 있어야 한다.
--
-- owner 요청 (2026-05-20):
--   캔버스에 카카오맵을 배경으로 깔고 실제 시설물 위치를 지도 위에 배치한다.
--   기존 캔버스는 도식(schematic) — x_hint/y_hint 픽셀 좌표만 있었다.
--   지도 모드를 위해 실제 GPS 좌표(위도·경도) 컬럼을 추가한다.
--   x_hint/y_hint(도식)와 lat/lng(지도)는 공존한다 — 모드 토글로 전환.
-- =====================================================================

alter table public.relocation_facilities
  add column if not exists lat double precision,   -- 위도 (지도 모드)
  add column if not exists lng double precision;   -- 경도 (지도 모드)

comment on column public.relocation_facilities.lat
  is '위도 — 카카오맵 지도 모드 배치용 (도식 모드는 x_hint 사용)';
comment on column public.relocation_facilities.lng
  is '경도 — 카카오맵 지도 모드 배치용 (도식 모드는 y_hint 사용)';


-- =====================================================================
-- 마이그 0045 완료.
--   relocation_facilities.lat / lng 추가 (nullable — 기존 시설은 비어 있음).
--   RLS·GRANT 는 테이블 단위라 별도 작업 불필요 (컬럼 추가는 자동 상속).
--
-- 다음 단계 (코드):
--   - 카카오맵 SDK 로딩 + 캔버스에 도식/지도 토글
--   - 지도 모드: 카카오맵 배경 + 시설 GPS 배치 + 지도 클릭으로 시설 추가
-- =====================================================================
