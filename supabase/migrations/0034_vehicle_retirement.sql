-- =====================================================================
-- edenMG  업무용 차량 사용 종료 + 영구 삭제
-- Migration 0034 — vehicles.retired_at + retire_reason 컬럼 추가
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능).
--
-- 정책 요약 (owner 결정, 2026-05-19):
--   - 운행 이력 0건 → 영구 삭제 가능 (실수 등록 정정).
--     vehicle_trips.vehicle_id 는 ON DELETE RESTRICT 라 DB 가 0건 보장.
--   - 운행 이력 있음 → 사용 종료 처리 (retired_at + retire_reason + is_active=false).
--     운영 재개 시 retired_at=null + retire_reason=null.
--   - 사유 enum 화하지 않음 — 폐차·매각·렌트반납·리스반납·기타 자유 텍스트.
-- =====================================================================

alter table public.vehicles
  add column if not exists retired_at    date,
  add column if not exists retire_reason text;

create index if not exists vehicles_retired_at_idx
  on public.vehicles(retired_at) where retired_at is not null;
