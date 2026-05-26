-- 캔버스 시설물 라벨·케이블 선 스타일 — 도식/지도 모드별 독립 저장 (마이그 0082).
--   owner 2026-05-26: 0081 의 단일 컬럼은 「도식」 전용으로 유지하고, 지도 전용
--   컬럼을 추가한다. 같은 시설을 도식에서 굵게 빨강·지도에서는 보통 검정으로
--   분리해 보관 가능 (label_dx/label_dx_map 와 동일 패턴).
--
-- 형식은 0081 과 동일 jsonb.
--
-- 멱등.

alter table public.relocation_facilities
  add column if not exists label_style_map jsonb not null default '{}'::jsonb;

alter table public.relocation_cables
  add column if not exists line_style_map jsonb not null default '{}'::jsonb;
