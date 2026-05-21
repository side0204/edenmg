-- =====================================================================
-- edenMG  지장이설 — 시설 라벨 위치
-- Migration 0053 — relocation_facilities.label_position
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0001~0052 가 먼저 실행돼 있어야 한다.
--
-- 본 마이그 내용:
--   - relocation_facilities 에 label_position 컬럼 추가.
--     캔버스에서 시설명 라벨을 도형 기준 8방향 중 어디에 둘지 (겹침 방지).
--     기본값 'bottom'(아래).
-- =====================================================================

alter table public.relocation_facilities
  add column if not exists label_position text not null default 'bottom';

do $$ begin
  alter table public.relocation_facilities
    add constraint relocation_facilities_label_position_check
    check (label_position in (
      'bottom', 'top', 'left', 'right',
      'top_left', 'top_right', 'bottom_left', 'bottom_right'
    ));
exception when duplicate_object then null; end $$;

-- =====================================================================
-- 마이그 0053 완료.
-- =====================================================================
