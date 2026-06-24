-- =====================================================================
-- edenMG  국사출입등록 — 출입시간(시·분) 입력 + 불필요 필드 제거
-- Migration 0092
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능).
--
-- 배경 (owner 결정 2026-06-24)
--   - 출입기간을 날짜만 → 날짜+시간(시·분)까지 입력
--   - 주소·출입목적·차량번호는 앱에서 제거 (외부 엑셀/등록시스템에서 처리)
--   - 매칭 키(이름)·연락처(전화)는 그대로 유지
--
--   컬럼명 access_start_date / access_end_date 는 그대로 두되 타입만
--   date → timestamptz 로 확장 (시·분 저장). 코드 참조 변경 최소화.
-- =====================================================================

-- 1) 출입 시작/종료: date → timestamptz (시·분 입력)
alter table public.station_access_requests
  alter column access_start_date type timestamptz using access_start_date::timestamptz,
  alter column access_end_date   type timestamptz using access_end_date::timestamptz;

-- 2) 앱 미사용 컬럼 제거 (주소·목적·차량 — 외부에서 처리)
alter table public.station_access_requests
  drop column if exists station_address,
  drop column if exists purpose,
  drop column if exists visitor_vehicle_plate;

-- 3) claim RPC 갱신 — 반환 타입 변경(date→timestamptz) + purpose 제거.
--    반환 시그니처가 바뀌므로 drop 후 재생성.
drop function if exists public.station_access_claim_pending(text);

create function public.station_access_claim_pending(_secret text)
returns table (
  id             uuid,
  requester_name text,
  station_name   text,
  access_start   timestamptz,
  access_end     timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _expected text;
begin
  select callback_secret into _expected from public.station_access_config where id = 1;

  if _expected is null or _secret is null or _secret <> _expected then
    raise exception 'invalid secret';
  end if;

  -- 대기 행을 잠그고(등록중 전환) 한 번에 반환. skip locked 로 동시 폴링 안전.
  return query
  with claimed as (
    select r.id
    from public.station_access_requests r
    where r.status = '대기'
    order by r.created_at
    limit 50
    for update skip locked
  )
  update public.station_access_requests u
     set status = '등록중', updated_at = now()
    from claimed c
   where u.id = c.id
  returning u.id,
            u.visitor_name      as requester_name,
            u.station_name,
            u.access_start_date as access_start,
            u.access_end_date   as access_end;
end;
$$;

grant execute on function public.station_access_claim_pending(text) to anon, authenticated;

-- =====================================================================
-- 마이그 0092 완료.
--   추가 owner 작업 없음 (시크릿 A 는 0090 에서 이미 설정).
-- =====================================================================
