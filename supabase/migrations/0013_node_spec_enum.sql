-- =====================================================================
-- edenMG  M3 Phase 2-B 후속 — 함체 규격 enum 도입
-- Migration 0013 — connection_plan_nodes.spec_enum (cable_spec) 컬럼 추가
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0011~0012 가 먼저 실행돼 있어야 한다.
--
-- 정책 (owner 결정):
--   - 함체 규격 = 케이블 규격 enum 재사용 (코어 수 기준)
--   - 기존 text 컬럼 spec 은 그대로 두고 spec_enum 신설 (legacy 데이터 보존)
--   - UI 는 이후 spec_enum 만 사용. spec(text) 는 마이그 가능한 값만 자동 변환
-- =====================================================================

alter table public.connection_plan_nodes
  add column if not exists spec_enum public.cable_spec;

-- spec(text) 값 중 cable_spec enum 매칭되는 것은 자동 migrate
update public.connection_plan_nodes
  set spec_enum = (
    case spec
      when '1C' then '1C'::public.cable_spec
      when '1C(드랍)' then '1C(드랍)'::public.cable_spec
      when '2C' then '2C'::public.cable_spec
      when '2C(드랍)' then '2C(드랍)'::public.cable_spec
      when '12C' then '12C'::public.cable_spec
      when '36C' then '36C'::public.cable_spec
      when '72C' then '72C'::public.cable_spec
      when '144C' then '144C'::public.cable_spec
      when '288C' then '288C'::public.cable_spec
      when '576C' then '576C'::public.cable_spec
      else null
    end
  )
  where spec_enum is null
    and spec in ('1C', '1C(드랍)', '2C', '2C(드랍)', '12C', '36C', '72C', '144C', '288C', '576C');
