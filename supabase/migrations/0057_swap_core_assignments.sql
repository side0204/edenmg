-- =====================================================================
-- edenMG  지장이설 — 선번장 코어 swap RPC
-- Migration 0057 — 같은 케이블 안 두 코어 배정의 코어 번호를 서로 교체.
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등 (create or replace).
--
-- 배경
--   선번장에서 "코어 변경" 시 빈 코어로 이동(moveCoreAssignmentFromCanvas)
--   은 단일 update 로 충분하지만, 이미 사용 중인 코어와 교체(swap) 는
--   exclusion constraint (immediate · 같은 케이블 안 코어 범위 중복 금지)
--   가 즉시 검사하므로 단순 update 2회로는 불가능하다.
--
--   해결: PL/pgSQL 함수 안에서 3단계 update.
--     1) A 의 코어를 임시값(같은 케이블에서 사용 안 하는 큰 값)으로
--     2) B 의 코어를 A 가 원래 있던 자리로
--     3) A 를 B 가 원래 있던 자리로
--   각 단계마다 두 row 가 같은 코어를 갖는 순간이 없으므로 exclusion 통과.
--
-- 보안
--   security definer 이지만 함수 내부에서 caller 권한 검증:
--     - 활성 직원만
--     - 두 assignment 가 같은 프로젝트(같은 회사 RLS 통해)
--     - 같은 케이블 안에서만 swap (다른 케이블 간은 지원 안 함)
-- =====================================================================

create or replace function public.swap_core_assignments(
  _a_id uuid,
  _b_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a record;
  v_b record;
  v_me record;
  v_temp smallint;
  v_max smallint;
begin
  -- caller 권한 — 활성 직원만
  select id, company_id, is_active into v_me
    from public.employees
   where auth_user_id = auth.uid()
   limit 1;
  if v_me is null or not v_me.is_active then
    raise exception 'permission denied: inactive or unknown employee';
  end if;

  -- 두 assignment 조회
  select id, project_id, cable_id, core_range_start, core_range_end
    into v_a
    from public.relocation_core_assignments
   where id = _a_id
   limit 1;
  if v_a is null then
    raise exception 'assignment A not found: %', _a_id;
  end if;

  select id, project_id, cable_id, core_range_start, core_range_end
    into v_b
    from public.relocation_core_assignments
   where id = _b_id
   limit 1;
  if v_b is null then
    raise exception 'assignment B not found: %', _b_id;
  end if;

  -- 같은 프로젝트·같은 케이블에서만 swap 허용
  if v_a.project_id <> v_b.project_id then
    raise exception 'cross-project swap denied';
  end if;
  if v_a.cable_id <> v_b.cable_id then
    raise exception '서로 다른 케이블 간 swap 은 지원하지 않습니다';
  end if;
  if v_a.id = v_b.id then
    raise exception '같은 행은 swap 할 수 없습니다';
  end if;

  -- 회사 스코프 확인 — 프로젝트가 같은 회사 소속인지.
  -- (RLS 가 한 번 더 막아주지만 security definer 라 명시 검증)
  if not exists (
    select 1 from public.relocation_projects p
     where p.id = v_a.project_id
       and p.company_id = v_me.company_id
  ) then
    raise exception 'cross-company swap denied';
  end if;

  -- 임시값 — 같은 케이블 안에서 사용 중인 최대 코어 + 100. smallint 상한(32767) 안.
  select coalesce(max(core_range_end), 0) into v_max
    from public.relocation_core_assignments
   where cable_id = v_a.cable_id;
  v_temp := v_max + 100;
  if v_temp >= 32767 then
    v_temp := 32766;
  end if;

  -- 3단계 swap
  update public.relocation_core_assignments
     set core_range_start = v_temp,
         core_range_end = v_temp,
         is_auto_assigned = false
   where id = _a_id;

  update public.relocation_core_assignments
     set core_range_start = v_a.core_range_start,
         core_range_end = v_a.core_range_end,
         is_auto_assigned = false
   where id = _b_id;

  update public.relocation_core_assignments
     set core_range_start = v_b.core_range_start,
         core_range_end = v_b.core_range_end,
         is_auto_assigned = false
   where id = _a_id;
end;
$$;

grant execute on function public.swap_core_assignments(uuid, uuid) to authenticated;
grant execute on function public.swap_core_assignments(uuid, uuid) to service_role;
