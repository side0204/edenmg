-- =====================================================================
-- edenMG  국사출입등록 — claim 반환에 전화번호 추가
-- Migration 0094
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능).
--
-- 배경 (owner 요청 2026-06-24)
--   PAD 가 등록시스템에 키 입력할 때 이름·전화번호·국사명이 필요.
--   기존 claim 은 전화번호를 안 줘서 requester_phone 추가.
--   (전화번호는 본인이 앱에 입력한 값 — 주민번호 등 민감정보는 여전히 미저장)
--
--   반환 시그니처가 바뀌므로 drop 후 재생성.
-- =====================================================================

drop function if exists public.station_access_claim_pending(text);

create function public.station_access_claim_pending(_secret text)
returns table (
  id              uuid,
  requester_name  text,
  requester_phone text,
  station_name    text,
  access_start    timestamptz,
  access_end      timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _expected text;
begin
  select cfg.callback_secret into _expected
  from public.station_access_config cfg
  where cfg.id = 1;

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
            u.visitor_phone     as requester_phone,
            u.station_name,
            u.access_start_date as access_start,
            u.access_end_date   as access_end;
end;
$$;

grant execute on function public.station_access_claim_pending(text) to anon, authenticated;

-- =====================================================================
-- 마이그 0094 완료.
--   이후 PAD 응답 JSON 키: id · requester_name · requester_phone ·
--                          station_name · access_start · access_end
-- =====================================================================
