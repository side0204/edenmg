-- =====================================================================
-- edenMG  지장이설 — 시설 라벨 위치 (마우스 드래그)
-- Migration 0054 — relocation_facilities.label_dx / label_dy
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0001~0053 이 먼저 실행돼 있어야 한다.
--
-- 본 마이그 내용:
--   - relocation_facilities 에 label_dx / label_dy 컬럼 추가.
--     캔버스에서 시설명 라벨을 마우스로 끌어 옮긴 offset(px). 기본값 0,0.
--   - 0053 의 label_position(8방향 고정) 은 드래그 방식으로 대체됨.
--     컬럼은 그대로 둔다(미사용). 코드는 더 이상 참조하지 않음.
-- =====================================================================

alter table public.relocation_facilities
  add column if not exists label_dx integer not null default 0;

alter table public.relocation_facilities
  add column if not exists label_dy integer not null default 0;

-- =====================================================================
-- 마이그 0054 완료.
-- =====================================================================
