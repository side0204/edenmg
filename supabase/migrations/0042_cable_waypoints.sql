-- =====================================================================
-- edenMG 지장이설 — Migration 0042: 케이블 경로 waypoint
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0036 이 먼저 실행돼 있어야 한다.
--
-- owner 요청 (2026-05-20):
--   케이블을 두 시설에 연결하면 시작·종료점은 시설 위치로 자동 결정되고,
--   연결 후 케이블을 선택해 중간 경로를 길(도로)에 맞춰 꺾을 수 있어야 한다.
--   → 케이블을 직선이 아닌 polyline 으로 렌더. 중간 꺾임점(waypoint)을 저장.
--
-- 본 마이그 내용:
--   relocation_cables.waypoints jsonb — 중간 꺾임점 좌표 배열
--     형식: [{"x": 123, "y": 456}, ...]  (캔버스 SVG 좌표계 — 시설 x_hint/y_hint 와 동일)
--     빈 배열 = 직선 (시작 시설 중심 → 도착 시설 중심)
--     시작·종료점은 저장 안 함 — 시설 위치에서 항상 derive (시설 이동 시 자동 추종)
-- =====================================================================

alter table public.relocation_cables
  add column if not exists waypoints jsonb not null default '[]'::jsonb;


-- =====================================================================
-- 마이그 0042 완료.
--
-- 다음 단계 (코드):
--   - position-actions.ts 의 saveCableWaypoints
--   - TopologyCanvas 케이블 polyline 렌더 + waypoint 편집 (드래그·추가·삭제)
-- =====================================================================
