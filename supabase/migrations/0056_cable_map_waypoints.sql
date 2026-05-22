-- =====================================================================
-- edenMG  지장이설 자동화 설계 모듈 (M-Relocation)
-- Migration 0056 — 케이블 경로점 도식/지도 분리
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0055 까지 먼저 실행돼 있어야 한다.
--
-- 본 마이그 내용:
--   - relocation_cables.map_waypoints jsonb 컬럼 추가.
--     케이블 경로점이 도식 모드(waypoints, x/y)와 지도 모드(map_waypoints,
--     lat/lng)에서 공유되어, 지도에서 경로를 고치면 도식 정렬이 틀어졌다.
--     → 도식 경로점 = waypoints, 지도 경로점 = map_waypoints 로 완전 분리.
--   - 기존 waypoints 를 한 번 분리:
--       lat/lng 가 있는 항목(지도에서 만든 것) → map_waypoints
--       나머지(도식 x/y 항목) → waypoints 에 유지
--     map_waypoints 가 아직 null 인 행만 처리 → 여러 번 실행해도 안전.
-- =====================================================================

alter table public.relocation_cables
  add column if not exists map_waypoints jsonb;

update public.relocation_cables
set
  map_waypoints = coalesce((
    select jsonb_agg(w order by ord)
    from jsonb_array_elements(waypoints) with ordinality as t(w, ord)
    where (w->>'lat') is not null and (w->>'lng') is not null
  ), '[]'::jsonb),
  waypoints = coalesce((
    select jsonb_agg(w order by ord)
    from jsonb_array_elements(waypoints) with ordinality as t(w, ord)
    where (w->>'lat') is null or (w->>'lng') is null
  ), '[]'::jsonb)
where map_waypoints is null
  and waypoints is not null
  and jsonb_typeof(waypoints) = 'array';

-- =====================================================================
-- 마이그 0056 완료.
-- =====================================================================
