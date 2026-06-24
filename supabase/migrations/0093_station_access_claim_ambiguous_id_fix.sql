-- =====================================================================
-- edenMG  국사출입등록 — claim RPC 버그 수정 (ambiguous "id")
-- Migration 0093
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능).
--
-- 배경
--   0092 의 station_access_claim_pending 는 RETURNS TABLE 에 id 컬럼을 두는데,
--   시크릿 조회 줄 `where id = 1` 의 id 가 반환용 OUT 변수 id 와 설정 테이블
--   컬럼 id 사이에서 모호(ambiguous)해 42702 오류 발생.
--   → 설정 테이블을 별칭(cfg)으로 명시해 해결. 함수 시그니처 동일.
-- =====================================================================

create or replace function public.station_access_claim_pending(_secret text)
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
            u.station_name,
            u.access_start_date as access_start,
            u.access_end_date   as access_end;
end;
$$;

grant execute on function public.station_access_claim_pending(text) to anon, authenticated;

-- =====================================================================
-- 마이그 0093 완료.
-- =====================================================================
