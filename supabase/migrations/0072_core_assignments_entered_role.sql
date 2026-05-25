-- =====================================================================
-- edenMG  지장이설 — 코어 배정 입력 주체 분리 (설계자 / 작업자)
-- Migration 0072 — relocation_core_assignments.entered_role
--
-- 배경 (owner 2026-05-25 — 청약 카테고리)
--   설계자: 사용 코어 「계획」을 미리 입력. 기별명세서·정산에 반영하지 않음.
--   작업자: 실제 시공 결과 코어를 입력. 기별명세서·정산에 반영.
--   같은 케이블에 두 종류가 공존 가능 — 설계자가 입력해 두면 작업자가 보고 확인 후 작업자용 입력 추가.
--
-- 변경 후 동작
--   - entered_role = 'designer' → 설계자 입력. 통계·기별에서 제외.
--   - entered_role = 'worker'   → 작업자 입력. 기존 흐름 유지 (default).
--   - 캔버스 popover 가 현재 로그인 사용자와 프로젝트 designer_id 를 비교해 기본값 결정.
--     설계자는 정보 패널에서 「작업자용으로 추가」 옵션도 가능.
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--   멱등 — 여러 번 실행해도 안전.
-- =====================================================================

alter table public.relocation_core_assignments
  add column if not exists entered_role text not null default 'worker';

alter table public.relocation_core_assignments
  drop constraint if exists relocation_core_entered_role_check;

alter table public.relocation_core_assignments
  add constraint relocation_core_entered_role_check
    check (entered_role in ('designer', 'worker'));

-- 빠른 필터를 위한 partial index — 'designer' 만 따로 (소수라 partial 효율적).
--   기별명세서 쿼리는 보통 'worker' 만 (default) 이라 별도 인덱스 안 필요.
create index if not exists relocation_core_designer_idx
  on public.relocation_core_assignments(project_id, cable_id)
  where entered_role = 'designer';

-- =====================================================================
-- 마이그 0072 완료.
-- =====================================================================
