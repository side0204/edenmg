-- =====================================================================
-- edenMG  지장이설 — 시설 라벨 offset 을 도식·지도 모드별로 분리
-- Migration 0071 — relocation_facilities.label_dx_map / label_dy_map 추가
--
-- 배경 (owner 2026-05-25)
--   기존 label_dx / label_dy 는 도식 모드·지도 모드가 공유했음.
--   → 도식 모드에서 시설명 라벨을 옮기면 지도 모드도 함께 이동.
--   각 모드는 좌표계가 달라 (px 그리드 vs GPS) offset 도 별개로 관리하는 게 자연.
--
-- 변경 후 동작
--   - label_dx / label_dy = 도식 모드 전용
--   - label_dx_map / label_dy_map = 지도 모드 전용
--   - 기존 값을 map 컬럼에 복사 — 기존 사용자의 지도 모드 라벨 위치 보존
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--   멱등 — 여러 번 실행해도 안전.
-- =====================================================================

alter table public.relocation_facilities
  add column if not exists label_dx_map integer not null default 0;

alter table public.relocation_facilities
  add column if not exists label_dy_map integer not null default 0;

-- 기존 도식 모드 위치를 지도 모드에도 한 번 복사 (마이그 시점 한정).
--   이후 각 모드에서 드래그한 offset 은 해당 모드 컬럼만 갱신.
--   COALESCE 가 아니라 단순 = 인 이유: label_dx_map 가 NOT NULL DEFAULT 0 이라
--   이미 0 으로 채워져 있음. 0 인 행만 label_dx 값으로 덮어씀.
update public.relocation_facilities
  set label_dx_map = label_dx,
      label_dy_map = label_dy
  where label_dx_map = 0
    and label_dy_map = 0
    and (label_dx <> 0 or label_dy <> 0);

-- =====================================================================
-- 마이그 0071 완료.
-- =====================================================================
