-- =====================================================================
-- edenMG  국사출입등록 (작업탭)
-- Migration 0090 — station_access_requests + 회신 RPC
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능).
--
-- 배경
--   owner 요청 (2026-06-24): 국사 출입을 앱에서 요청하면 Power Automate
--   데스크톱 흐름(RPA)이 국사출입등록시스템에 자동 입력.
--
--   결정사항:
--     - 출입자 = 로그인한 본인 1명 (여러 명은 추후). 본인 이름·연락처·차량 스냅샷
--     - 국사   = 기존 「현장관리 → 국사현황」(field_stations) 에서 선택
--     - 출입기간 = 앱에서 시작일·종료일 입력
--     - 민감정보(주민번호 등)는 앱에 미저장 — PC 엑셀에만. 앱은 이름(매칭 키)만 전달
--     - 상태 = 대기 → 등록중 → 완료 / 실패 / 취소 (재시도·취소 지원)
--
--   연동:
--     앱 → Power Automate : 서버액션이 JSON POST { request_id, requester_name,
--                           station_name, access_start, access_end, purpose }
--     Power Automate → 앱 : RPA 끝나면 RPC station_access_set_result 로 상태 회신
--                           (anon 키 + 시크릿 검증 — service 키를 PA 에 안 둠)
-- =====================================================================


-- =====================================================================
-- TABLE: station_access_requests
-- =====================================================================
create table if not exists public.station_access_requests (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,

  -- 국사 (현장관리 국사현황에서 선택). 마스터 삭제돼도 스냅샷 보존.
  station_id            uuid references public.field_stations(id) on delete set null,
  station_name          text not null,
  station_address       text,

  -- 출입기간 (앱 입력)
  access_start_date     date not null,
  access_end_date       date not null,
  purpose               text,

  -- 출입자 = 요청자 본인. 등록 시점 스냅샷 (RPA 매칭 키 = visitor_name)
  requested_by          uuid references public.employees(id) on delete set null,
  visitor_name          text not null,
  visitor_phone         text,
  visitor_vehicle_plate text,

  -- RPA 진행 상태
  status                text not null default '대기'
                          check (status in ('대기', '등록중', '완료', '실패', '취소')),
  rpa_result            text,
  rpa_completed_at      timestamptz,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists station_access_requests_company_idx
  on public.station_access_requests(company_id, created_at desc);

create index if not exists station_access_requests_status_idx
  on public.station_access_requests(status);

drop trigger if exists station_access_requests_touch_updated_at on public.station_access_requests;
create trigger station_access_requests_touch_updated_at
  before update on public.station_access_requests
  for each row
  execute function public.touch_updated_at();

alter table public.station_access_requests enable row level security;


-- ===== RLS — 회사 스코프 + 본인 작성 =====================================

drop policy if exists station_access_requests_select on public.station_access_requests;
create policy station_access_requests_select
  on public.station_access_requests
  for select
  to authenticated
  using (company_id = (select company_id from public.current_employee()));

drop policy if exists station_access_requests_insert on public.station_access_requests;
create policy station_access_requests_insert
  on public.station_access_requests
  for insert
  to authenticated
  with check (
    company_id = (select company_id from public.current_employee())
    and requested_by = (select id from public.current_employee())
  );

-- 수정(재시도·취소 등): 작성자 본인 OR admin. 회사 스코프.
drop policy if exists station_access_requests_update on public.station_access_requests;
create policy station_access_requests_update
  on public.station_access_requests
  for update
  to authenticated
  using (
    company_id = (select company_id from public.current_employee())
    and (
      requested_by = (select id from public.current_employee())
      or (select permission from public.current_employee()) = 'admin'
    )
  )
  with check (
    company_id = (select company_id from public.current_employee())
    and (
      requested_by = (select id from public.current_employee())
      or (select permission from public.current_employee()) = 'admin'
    )
  );

-- 삭제: 작성자 본인 OR admin.
drop policy if exists station_access_requests_delete on public.station_access_requests;
create policy station_access_requests_delete
  on public.station_access_requests
  for delete
  to authenticated
  using (
    company_id = (select company_id from public.current_employee())
    and (
      requested_by = (select id from public.current_employee())
      or (select permission from public.current_employee()) = 'admin'
    )
  );


-- ===== GRANTS =========================================================
grant select, insert, update, delete on public.station_access_requests to authenticated;
grant all on public.station_access_requests to service_role;


-- =====================================================================
-- 회신 시크릿 보관 (Power Automate → 앱 상태 회신용)
--   authenticated/anon 에 GRANT 안 함 → 아래 security definer 함수만 읽음
-- =====================================================================
create table if not exists public.station_access_config (
  id              int primary key default 1,
  callback_secret text,
  constraint station_access_config_single_row check (id = 1)
);

alter table public.station_access_config enable row level security;
-- 정책 없음 + GRANT 없음 → authenticated/anon 직접 접근 불가
revoke all on public.station_access_config from authenticated, anon;
grant all on public.station_access_config to service_role;


-- =====================================================================
-- RPC: station_access_set_result
--   Power Automate 가 RPA 종료 후 호출 (anon 키 + 시크릿).
--   시크릿 일치 + 허용 상태값일 때만 해당 요청의 상태를 갱신.
--   security definer → RLS 우회하되 시크릿으로 보호.
-- =====================================================================
create or replace function public.station_access_set_result(
  _request_id uuid,
  _status     text,
  _message    text,
  _secret     text
) returns void
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

  if _status not in ('등록중', '완료', '실패') then
    raise exception 'invalid status: %', _status;
  end if;

  update public.station_access_requests
    set status           = _status,
        rpa_result       = _message,
        rpa_completed_at = case when _status in ('완료', '실패') then now() else rpa_completed_at end,
        updated_at       = now()
  where id = _request_id;
end;
$$;

grant execute on function public.station_access_set_result(uuid, text, text, text) to anon, authenticated;


-- =====================================================================
-- 마이그 0090 완료.
--   ⚠️  owner 추가 작업 (Supabase SQL Editor 에서 1회):
--       회신 시크릿 설정 — 아래 한 줄의 'CHANGE-ME...' 를 임의의 긴 문자열로 교체 후 실행
--
--   insert into public.station_access_config (id, callback_secret)
--   values (1, 'CHANGE-ME-to-a-long-random-string')
--   on conflict (id) do update set callback_secret = excluded.callback_secret;
--
--   ⚠️  앱 환경변수 (.env.local + Vercel):
--       STATION_ACCESS_WEBHOOK_URL    = Power Automate 클라우드 흐름 HTTP 트리거 URL
--       STATION_ACCESS_WEBHOOK_SECRET = 앱→PA 전송 시 헤더(x-eden-secret) 검증값
-- =====================================================================
