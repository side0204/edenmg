-- 청약 사용코어 라벨 박스 위치 사용자 정의 (마이그 0080).
--   `5~6` `1~4` 같은 사용코어 라벨 박스의 위치를 케이블 라벨 기본 위치
--   대비 dx/dy 오프셋(SVG viewport unit) 으로 저장. 역할(designer/worker)
--   별로 분리.
--
-- 형식 — { "designer": {"dx": 50, "dy": -20}, "worker": {"dx": 0, "dy": 0} }
--   누락된 역할은 기본 위치(0,0) 사용.
--
-- 멱등.

alter table public.relocation_cables
  add column if not exists core_label_offsets jsonb not null default '{}'::jsonb;
