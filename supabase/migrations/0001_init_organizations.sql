-- =====================================================================
-- edenMG  M1 조직·계정 모듈
-- Migration 0001 — companies, employees, RLS, auth.users trigger
--
-- 실행 방법
--   1) Supabase Dashboard → SQL Editor → New query
--   2) 이 파일 전체 복사 → 붙여넣기 → Run
--   3) 끝부분 SEED 블록의 첫 회사 INSERT 만 회사명에 맞게 수정 후 별도 실행
--
-- 멱등(여러 번 실행 가능)하게 작성했지만, ENUM 추가나 컬럼 변경은
-- 별도 마이그레이션 파일로 분리할 것.
-- =====================================================================


-- ===== ENUM: employee_role ============================================
do $$
begin
  create type public.employee_role as enum ('worker', 'foreman', 'admin', 'ceo');
exception
  when duplicate_object then null;
end $$;
-- worker=작업자, foreman=소장, admin=관리자, ceo=대표


-- ===== TABLE: companies ===============================================
create table if not exists public.companies (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  business_number text unique,           -- 사업자등록번호 (선택)
  created_at      timestamptz not null default now()
);

alter table public.companies enable row level security;


-- ===== TABLE: employees ===============================================
create table if not exists public.employees (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete restrict,
  auth_user_id  uuid unique references auth.users(id) on delete set null,
  name          text not null,
  email         text not null,
  phone         text,
  role          public.employee_role not null default 'worker',
  is_active     boolean not null default true,
  invited_at    timestamptz,
  accepted_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (company_id, email)
);

alter table public.employees enable row level security;

create index if not exists employees_company_id_idx  on public.employees(company_id);
create index if not exists employees_auth_user_id_idx on public.employees(auth_user_id);


-- ===== HELPER: current_employee() =====================================
-- RLS 정책 내부에서 직접 employees 를 조회하면 재귀가 발생하므로,
-- SECURITY DEFINER 함수로 한 번 우회한다.
create or replace function public.current_employee()
returns public.employees
language sql
stable
security definer
set search_path = public
as $$
  select * from public.employees where auth_user_id = auth.uid() limit 1;
$$;


-- ===== RLS: companies =================================================
drop policy if exists companies_select_own on public.companies;
create policy companies_select_own
  on public.companies
  for select
  using (
    id = (select company_id from public.current_employee())
  );


-- ===== RLS: employees =================================================
drop policy if exists employees_select_same_company on public.employees;
create policy employees_select_same_company
  on public.employees
  for select
  using (
    company_id = (select company_id from public.current_employee())
  );

-- 본인 행 일부 필드 업데이트 — 단 role 변경은 금지
drop policy if exists employees_update_self on public.employees;
create policy employees_update_self
  on public.employees
  for update
  using (auth_user_id = auth.uid())
  with check (
    auth_user_id = auth.uid()
    and role = (select role from public.current_employee())
  );

-- 관리자/대표는 같은 회사의 모든 행 CRUD 가능
drop policy if exists employees_admin_all on public.employees;
create policy employees_admin_all
  on public.employees
  for all
  using (
    company_id = (select company_id from public.current_employee())
    and (select role from public.current_employee()) in ('admin', 'ceo')
  )
  with check (
    company_id = (select company_id from public.current_employee())
    and (select role from public.current_employee()) in ('admin', 'ceo')
  );


-- ===== TRIGGER: auth.users → employees 자동 연결 ======================
-- 관리자가 inviteUserByEmail(email, { data: { company_id, name, role } })
-- 또는 admin.createUser({ ..., user_metadata: {...} }) 호출 시,
-- auth.users 행에 raw_user_meta_data 가 함께 저장된다.
-- 그 시점에 employees 행을 만들거나, 이메일 기준으로 기존 행에 auth_user_id 매칭.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  meta_company_id uuid;
  meta_name       text;
  meta_role       public.employee_role;
  existing_id     uuid;
begin
  meta_company_id := nullif(new.raw_user_meta_data ->> 'company_id', '')::uuid;
  meta_name       := nullif(new.raw_user_meta_data ->> 'name', '');
  meta_role       := coalesce(
                       nullif(new.raw_user_meta_data ->> 'role', '')::public.employee_role,
                       'worker'
                     );

  select id into existing_id
  from public.employees
  where email = new.email
    and (meta_company_id is null or company_id = meta_company_id)
  limit 1;

  if existing_id is not null then
    -- 시드 케이스: 관리자가 미리 만든 employees 행에 auth.users 가 매칭됨.
    -- 사용자가 즉시 로그인 가능한 상태이므로 accepted_at 도 함께 채운다.
    update public.employees
       set auth_user_id = new.id,
           accepted_at  = coalesce(accepted_at, now())
     where id = existing_id;
  elsif meta_company_id is not null then
    -- 초대 케이스: inviteUserByEmail 호출로 새 auth.users 가 생성됨.
    -- 사용자는 아직 이메일 링크 미클릭 + 비밀번호 미설정 상태.
    -- accepted_at 은 /welcome 에서 비밀번호 설정 완료 시 채운다.
    insert into public.employees
      (company_id, auth_user_id, name, email, role, invited_at, accepted_at)
    values
      (meta_company_id, new.id, coalesce(meta_name, new.email), new.email, meta_role, now(), null);
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();


-- ===== GRANTS ==========================================================
-- SQL Editor 로 raw SQL 테이블을 만들면 anon/authenticated 역할에 자동
-- GRANT 가 들어가지 않는다. row 단위 통제는 RLS 정책이 담당하지만, 그 앞단의
-- 테이블 접근 권한 자체는 명시적으로 부여해야 한다.
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.companies to authenticated;
grant select, insert, update, delete on public.employees to authenticated;

grant execute on function public.current_employee() to authenticated;


-- =====================================================================
-- SEED — 첫 회사 + 첫 대표 계정 (수동, 1회만 실행)
-- =====================================================================
-- ① 먼저 Supabase Dashboard → Authentication → Users → "Add user"
--    로 본인 이메일/비밀번호 계정을 만든다 (이메일 확인은 생략 가능).
-- ② 그 다음 아래 두 INSERT 를 회사명에 맞게 수정해서 실행.
-- ③ 마지막으로 employees.auth_user_id 를 본인 auth.users.id 로 채운다.
--
-- 예시:
--
--   insert into public.companies (name) values ('에덴엠지')
--     returning id;
--   -- 위에서 나온 id 를 아래 :company_id 에 넣는다
--
--   insert into public.employees (company_id, auth_user_id, name, email, role)
--   values (
--     '여기에-companies.id-uuid',
--     (select id from auth.users where email = 'side0204@gmail.com'),
--     '관리자',
--     'side0204@gmail.com',
--     'ceo'
--   );
--
-- 이 두 줄을 실행하면 트리거가 이미 연결돼있는 auth.users 와 충돌하지 않도록
-- 직접 행을 만들고 auth_user_id 도 함께 채운다.
-- =====================================================================
