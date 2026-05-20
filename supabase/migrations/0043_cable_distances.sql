-- =====================================================================
-- edenMG 지장이설 — Migration 0043: 케이블 정산 거리
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0036·0042 가 먼저 실행돼 있어야 한다.
--
-- owner 요청 (2026-05-20):
--   정산 시 기별명세서 작성용 — 케이블 경로의 구간별 거리가 필요.
--   경로점이 전주면 전주명 + 시설~전주 / 전주~전주 구간 거리를 입력.
--   구간 거리 합이 케이블 전체 거리와 일치해야 하며, 불일치 시 설계자가 결정.
--
-- 본 마이그 내용:
--   relocation_cables.total_length numeric — 케이블 전체 실제 거리 (정산 기준값)
--   relocation_cables.end_distance numeric — 마지막 경로점 → 도착시설 구간 거리
--
--   ※ 중간 구간 거리·전주명은 waypoints jsonb 안에 저장 (스키마 변경 불필요):
--     waypoints 형식 확장 — [{ "x", "y", "pole_name", "dist" }]
--       pole_name: 전주명 (단순 꺾임점이면 null)
--       dist     : 직전 점(시작시설 또는 이전 경로점) → 이 경로점 구간 거리(m)
--   거리 합 = Σ(waypoint.dist) + end_distance  →  total_length 와 비교
-- =====================================================================

alter table public.relocation_cables
  add column if not exists total_length numeric;

alter table public.relocation_cables
  add column if not exists end_distance numeric;


-- =====================================================================
-- 마이그 0043 완료.
--
-- 다음 단계 (코드):
--   - CableInfoPanel — 케이블 클릭 시 정보 수정 + 경로점 거리 입력 + 합계 검증
--   - cable-actions 의 updateCableFromCanvas / deleteCableFromCanvas
-- =====================================================================
