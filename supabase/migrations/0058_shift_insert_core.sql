-- =====================================================================
-- edenMG  지장이설 — 선번장 코어 끼워넣기 (shift insert) RPC
-- Migration 0058 — A 를 새 코어 N 으로 옮기면서, N 부터 연속 사용 중인
--                  코어들을 한 칸씩 뒤로 밀어 첫 빈 코어까지 shift.
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등 (create or replace).
--
-- 동작
--   1) A 의 원래 자리 oldA 는 비게 됨 (A 가 N 으로 이동하므로)
--   2) 코어 N, N+1, N+2 … 의 사용 중 row 들을 모은다 (chain).
--      A 자기 자신은 chain 에 포함하지 않음 (oldA 가 N 보다 큰 경우 자연스럽게
--      A 가 떠나서 빈 자리가 생긴다).
--   3) chain 의 마지막 row 가 N+len-1 위치라면 N+len 이 빈 자리 여야 함.
--      N+len 이 케이블 코어 한도(_cable_core_count) 를 넘으면 거부.
--   4) exclusion constraint(즉시 검사) 우회를 위해 임시값 경유 ordered update:
--      a) A 를 임시값(같은 케이블 max + 100, smallint 상한 안)으로 옮김
--      b) chain 을 뒤에서부터(chain[len-1] → N+len, chain[len-2] → N+len-1, …)
--         한 칸씩 뒤로 shift. 매 단계마다 도착 자리가 비어 있어 충돌 없음.
--      c) A 를 임시값 → N 으로
--
-- 보안
--   security definer + 함수 내부 검증:
--     - 활성 직원만
--     - 같은 회사 소속 프로젝트
--     - 새 코어가 1 이상 + 케이블 한도 이하
-- =====================================================================

create or replace function public.shift_insert_core_assignment(
  _a_id uuid,
  _new_core int,
  _cable_core_count int
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me record;
  v_a record;
  v_temp smallint;
  v_max smallint;
  v_cur int;
  v_chain_count int := 0;
  v_chain record;
  v_chain_ids uuid[] := array[]::uuid[];
  v_chain_cores int[] := array[]::int[];
  i int;
begin
  -- caller 권한
  select id, company_id, is_active into v_me
    from public.employees
   where auth_user_id = auth.uid()
   limit 1;
  if v_me is null or not v_me.is_active then
    raise exception 'permission denied: inactive or unknown employee';
  end if;

  -- A 조회
  select id, project_id, cable_id, core_range_start, core_range_end
    into v_a
    from public.relocation_core_assignments
   where id = _a_id
   limit 1;
  if v_a is null then
    raise exception 'assignment not found: %', _a_id;
  end if;

  -- 회사 스코프
  if not exists (
    select 1 from public.relocation_projects p
     where p.id = v_a.project_id
       and p.company_id = v_me.company_id
  ) then
    raise exception 'cross-company access denied';
  end if;

  -- 새 코어 범위 검증
  if _new_core < 1 then
    raise exception '코어 번호는 1 이상이어야 합니다';
  end if;
  if _cable_core_count < 1 then
    raise exception '케이블 코어 한도가 올바르지 않습니다';
  end if;
  if _new_core > _cable_core_count then
    raise exception '코어 번호가 케이블 한도(%)를 초과합니다', _cable_core_count;
  end if;

  -- 같은 자리면 no-op
  if v_a.core_range_start = _new_core then
    return;
  end if;

  -- chain 수집 — _new_core 부터 연속 사용 중 row 들을 빈 자리 만날 때까지
  v_cur := _new_core;
  loop
    select id, core_range_start into v_chain
      from public.relocation_core_assignments
     where cable_id = v_a.cable_id
       and core_range_start = v_cur
       and id <> _a_id  -- A 자기 자신은 chain 에서 제외
     limit 1;
    if v_chain.id is null then
      exit;
    end if;
    v_chain_ids := v_chain_ids || v_chain.id;
    v_chain_cores := v_chain_cores || v_chain.core_range_start;
    v_chain_count := v_chain_count + 1;
    v_cur := v_cur + 1;
    -- 안전장치: 케이블 한도까지만 검사
    if v_cur > _cable_core_count + 1 then
      exit;
    end if;
  end loop;

  -- chain 의 마지막 row 다음 자리(v_cur)가 케이블 한도 초과면 거부
  if v_chain_count > 0 and v_cur > _cable_core_count then
    raise exception '끼워넣기를 하면 코어가 케이블 한도(%)를 초과합니다. 마지막 코어를 먼저 비워주세요.', _cable_core_count;
  end if;

  -- chain 이 비어 있으면 단순 이동 (move) 와 동일. 외부에서 move 를 쓰는 게 자연스럽지만
  -- 일관성을 위해 여기서도 처리 — 그냥 update.
  if v_chain_count = 0 then
    update public.relocation_core_assignments
       set core_range_start = _new_core,
           core_range_end = _new_core,
           is_auto_assigned = false
     where id = _a_id;
    return;
  end if;

  -- 임시값 — 같은 케이블 사용 중 최대 코어 + 100. smallint 상한 안.
  select coalesce(max(core_range_end), 0) into v_max
    from public.relocation_core_assignments
   where cable_id = v_a.cable_id;
  v_temp := v_max + 100;
  if v_temp >= 32767 then v_temp := 32766; end if;

  -- step 1: A 를 임시값으로
  update public.relocation_core_assignments
     set core_range_start = v_temp,
         core_range_end = v_temp,
         is_auto_assigned = false
   where id = _a_id;

  -- step 2: chain 을 뒤에서부터 한 칸씩 뒤로 shift
  --   chain[i] (코어 _new_core + i) → 코어 _new_core + i + 1
  --   i = v_chain_count - 1 .. 0
  i := v_chain_count;
  while i > 0 loop
    i := i - 1;
    update public.relocation_core_assignments
       set core_range_start = v_chain_cores[i + 1] + 1, -- PG 배열 1-based
           core_range_end = v_chain_cores[i + 1] + 1,
           is_auto_assigned = false
     where id = v_chain_ids[i + 1];
  end loop;

  -- step 3: A 를 _new_core 로
  update public.relocation_core_assignments
     set core_range_start = _new_core,
         core_range_end = _new_core,
         is_auto_assigned = false
   where id = _a_id;
end;
$$;

grant execute on function public.shift_insert_core_assignment(uuid, int, int) to authenticated;
grant execute on function public.shift_insert_core_assignment(uuid, int, int) to service_role;
