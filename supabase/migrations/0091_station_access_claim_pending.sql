-- =====================================================================
-- edenMG  국사출입등록 — 무료(폴링) 방식 지원
-- Migration 0091 — station_access_claim_pending RPC
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능).
--
-- 배경
--   owner 결정 (2026-06-24): Power Automate 프리미엄(클라우드 흐름) 회피.
--   클라우드 흐름 없이 Power Automate Desktop(무료) 이 직접 Supabase 를
--   주기적으로 폴링 → 대기 요청을 가져와 처리 → 결과 회신.
--
--   이 함수는 "대기" 요청을 한 번에 가져오면서 동시에 "등록중" 으로 잠금
--   (claim) → 중복 처리 방지. anon 키 + 시크릿(A) 으로 호출.
--   회신은 기존 station_access_set_result (0090) 재사용.
--
--   PAD 호출 (무료 "웹 서비스 호출" 액션):
--     POST {SUPABASE_URL}/rest/v1/rpc/station_access_claim_pending
--     headers: apikey: {ANON_KEY}, Content-Type: application/json
--     body:    { "_secret": "{시크릿 A}" }
--     응답:    [{ id, requester_name, station_name, access_start, access_end, purpose }, ...]
-- =====================================================================

create or replace function public.station_access_claim_pending(_secret text)
returns table (
  id             uuid,
  requester_name text,
  station_name   text,
  access_start   date,
  access_end     date,
  purpose        text
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
            u.access_end_date   as access_end,
            u.purpose;
end;
$$;

grant execute on function public.station_access_claim_pending(text) to anon, authenticated;

-- =====================================================================
-- 마이그 0091 완료.
--   추가 owner 작업 없음 (시크릿 A 는 0090 에서 이미 설정).
--   무료 방식에서는 STATION_ACCESS_WEBHOOK_URL 환경변수 불필요.
-- =====================================================================
