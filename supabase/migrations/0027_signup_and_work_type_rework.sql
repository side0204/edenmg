-- =====================================================================
-- edenMG  회원가입 흐름 + work_type 재구성 + 차량번호 + 반납위치
-- Migration 0027
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0026 까지 먼저.
--
-- 정책 요약 (owner 결정):
--   - 회원가입 → 관리자 승인 (개별 권한 부여) 후 활성화. 초대 흐름은 폐기.
--   - work_type 재구성:
--       공무 → 사무 / 외선 → 외선팀 / 접속 → 접속팀  (rename)
--       + 자재담당 / 장비팀 / 신호수  (add)
--   - employees.vehicle_plate text — 접속팀 필수, 외선팀 선택 (UI 단 검증)
--   - vehicle_trips.return_location text — 반납위치 표시용
--   - trigger 갱신: 가입자는 is_active=false 로 생성, accepted_at=null. 관리자 승인 후 활성화.
--     회사가 1개만 있을 때 자동 매핑 (single-tenant 가정). 다중 회사 도입 시 client metadata.company_id 사용.
-- =====================================================================


-- ===== work_type enum: 기존 값 rename ================================
-- PostgreSQL 의 alter type ... rename value 는 enum 사용 중에도 안전.
-- 'undefined_object' (이미 rename 됐을 때) 는 무시.
do $$ begin
  alter type public.employee_work_type rename value '공무' to '사무';
exception when undefined_object then null; end $$;

do $$ begin
  alter type public.employee_work_type rename value '외선' to '외선팀';
exception when undefined_object then null; end $$;

do $$ begin
  alter type public.employee_work_type rename value '접속' to '접속팀';
exception when undefined_object then null; end $$;


-- ===== work_type enum: 새 값 추가 ====================================
alter type public.employee_work_type add value if not exists '자재담당';
alter type public.employee_work_type add value if not exists '장비팀';
alter type public.employee_work_type add value if not exists '신호수';


-- ===== employees.vehicle_plate =======================================
alter table public.employees
  add column if not exists vehicle_plate text;


-- ===== vehicle_trips.return_location =================================
alter table public.vehicle_trips
  add column if not exists return_location text;


-- ===== 트리거 함수 갱신 — 회원가입 모드 ==============================
-- 변경점:
--   1) phone, vehicle_plate 메타데이터 추가 수집
--   2) company_id 누락 시 회사 1개면 자동 매핑 (single-tenant)
--   3) 새 가입자 (기존 employees row 없음): is_active=false + accepted_at=null
--      → 관리자가 /admin/employees 에서 승인 시 is_active=true 로 변경
--   4) 기존 row 매칭 (legacy invite 잔재): auth_user_id 만 연결
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  meta_company_id   uuid;
  meta_name         text;
  meta_phone        text;
  meta_permission   public.employee_permission;
  meta_position     public.employee_position;
  meta_team         public.employee_team;
  meta_work_type    public.employee_work_type;
  meta_vehicle_plate text;
  existing_id       uuid;
  fallback_company  uuid;
begin
  meta_company_id := nullif(new.raw_user_meta_data ->> 'company_id', '')::uuid;
  meta_name       := nullif(new.raw_user_meta_data ->> 'name', '');
  meta_phone      := nullif(new.raw_user_meta_data ->> 'phone', '');
  meta_permission := coalesce(
                       nullif(new.raw_user_meta_data ->> 'permission', '')::public.employee_permission,
                       'worker'
                     );
  meta_position   := nullif(new.raw_user_meta_data ->> 'position',  '')::public.employee_position;
  meta_team       := nullif(new.raw_user_meta_data ->> 'team',      '')::public.employee_team;
  meta_work_type  := nullif(new.raw_user_meta_data ->> 'work_type', '')::public.employee_work_type;
  meta_vehicle_plate := nullif(new.raw_user_meta_data ->> 'vehicle_plate', '');

  -- 회사 ID 누락 + 단일 회사면 자동 매핑
  if meta_company_id is null then
    select id into fallback_company from public.companies order by created_at limit 1;
    if found then
      meta_company_id := fallback_company;
    end if;
  end if;

  -- 1) 기존 employees row 매칭 (이메일 일치) — legacy invite 흐름 잔재
  select id into existing_id
  from public.employees
  where email = new.email
    and (meta_company_id is null or company_id = meta_company_id)
  limit 1;

  if existing_id is not null then
    update public.employees
       set auth_user_id = new.id,
           accepted_at  = coalesce(accepted_at, now())
     where id = existing_id;

  elsif meta_company_id is not null then
    -- 2) 신규 가입: is_active=false 로 만들어서 관리자 승인 대기 상태로
    insert into public.employees
      (company_id, auth_user_id, name, email, phone, permission, position, team, work_type,
       vehicle_plate, is_active, invited_at, accepted_at)
    values
      (meta_company_id, new.id, coalesce(meta_name, new.email), new.email, meta_phone,
       meta_permission, meta_position, meta_team, meta_work_type,
       meta_vehicle_plate, false, now(), null);
  end if;

  return new;
end;
$$;
