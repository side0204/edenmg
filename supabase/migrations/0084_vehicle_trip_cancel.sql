-- 0084_vehicle_trip_cancel.sql
-- 출고 취소 RPC — 출고 후 10분 내 본인 운행만 영구 삭제 가능.
--
-- vehicle_trips 는 append-only 정책이라 일반 DELETE GRANT 가 없음.
-- security definer 함수로 strict 검증 후 한 줄 삭제. 잘못 누른 출고
-- 즉시 정정용 — "안 한 걸로" 모델. 10분 지나면 반납 처리로 유도.

create or replace function public.vehicle_trip_cancel(_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me_id    uuid;
  v_me_perm  public.employee_permission;
  v_trip     record;
begin
  select id, permission
    into v_me_id, v_me_perm
    from public.current_employee();

  if v_me_id is null then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;

  select id, company_id, driver_employee_id, returned_at, departed_at
    into v_trip
    from public.vehicle_trips
    where id = _trip_id;

  if not found then
    raise exception '운행 기록을 찾을 수 없습니다.';
  end if;

  if v_trip.driver_employee_id <> v_me_id and v_me_perm <> 'admin' then
    raise exception '본인 운행만 취소할 수 있습니다.' using errcode = '42501';
  end if;

  if v_trip.returned_at is not null then
    raise exception '이미 반납된 운행은 취소할 수 없습니다.';
  end if;

  if v_trip.departed_at < now() - interval '10 minutes' then
    raise exception '출고 후 10분이 지나 취소할 수 없습니다. 반납 처리해주세요.';
  end if;

  delete from public.vehicle_trips where id = _trip_id;
end;
$$;

grant execute on function public.vehicle_trip_cancel(uuid) to authenticated;
