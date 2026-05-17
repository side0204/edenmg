-- =====================================================================
-- edenMG  M1 보강
-- Migration 0002 — 직급(position) · 팀(team) · 분야(work_type) 추가
--                 + 기존 role 컬럼을 permission 으로 이름 변경
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능)하도록 작성. 0001 이 먼저 실행되어 있어야 한다.
-- =====================================================================


-- ===== ENUMs ==========================================================
do $$
begin
  create type public.employee_position as enum
    ('이사', '부장', '차장', '과장', '대리', '사원');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.employee_team as enum
    ('지장', '계획', '공가', '청약', '정산', '자재', '지원');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.employee_work_type as enum
    ('공무', '외선', '접속');
exception when duplicate_object then null;
end $$;


-- ===== role → permission 이름 변경 ====================================
-- 0001 에서 만든 employee_role 타입과 employees.role 컬럼을 모두 rename.
-- 이미 0002 가 한 번 실행돼 이름이 바뀌었으면 건너뛴다.
do $$
begin
  alter type public.employee_role rename to employee_permission;
exception when undefined_object then null;
end $$;

do $$
begin
  alter table public.employees rename column role to permission;
exception when undefined_column then null;
end $$;


-- ===== employees 에 신규 컬럼 3개 (모두 nullable) =====================
alter table public.employees
  add column if not exists position  public.employee_position,
  add column if not exists team      public.employee_team,
  add column if not exists work_type public.employee_work_type;


-- ===== RLS 정책 재작성 (role → permission) ============================
drop policy if exists employees_select_same_company on public.employees;
create policy employees_select_same_company
  on public.employees
  for select
  using (
    company_id = (select company_id from public.current_employee())
  );

drop policy if exists employees_update_self on public.employees;
create policy employees_update_self
  on public.employees
  for update
  using (auth_user_id = auth.uid())
  with check (
    auth_user_id = auth.uid()
    and permission = (select permission from public.current_employee())
  );

drop policy if exists employees_admin_all on public.employees;
create policy employees_admin_all
  on public.employees
  for all
  using (
    company_id = (select company_id from public.current_employee())
    and (select permission from public.current_employee()) in ('admin', 'ceo')
  )
  with check (
    company_id = (select company_id from public.current_employee())
    and (select permission from public.current_employee()) in ('admin', 'ceo')
  );


-- ===== 트리거 함수 갱신 ================================================
-- 초대 메타데이터 key 를 role → permission 으로 바꾸고,
-- position·team·work_type 도 함께 받을 수 있게 한다.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  meta_company_id uuid;
  meta_name       text;
  meta_permission public.employee_permission;
  meta_position   public.employee_position;
  meta_team       public.employee_team;
  meta_work_type  public.employee_work_type;
  existing_id     uuid;
begin
  meta_company_id := nullif(new.raw_user_meta_data ->> 'company_id', '')::uuid;
  meta_name       := nullif(new.raw_user_meta_data ->> 'name', '');
  meta_permission := coalesce(
                       nullif(new.raw_user_meta_data ->> 'permission', '')::public.employee_permission,
                       'worker'
                     );
  meta_position   := nullif(new.raw_user_meta_data ->> 'position',  '')::public.employee_position;
  meta_team       := nullif(new.raw_user_meta_data ->> 'team',      '')::public.employee_team;
  meta_work_type  := nullif(new.raw_user_meta_data ->> 'work_type', '')::public.employee_work_type;

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
    insert into public.employees
      (company_id, auth_user_id, name, email, permission, position, team, work_type, invited_at, accepted_at)
    values
      (meta_company_id, new.id, coalesce(meta_name, new.email), new.email,
       meta_permission, meta_position, meta_team, meta_work_type, now(), null);
  end if;

  return new;
end;
$$;
