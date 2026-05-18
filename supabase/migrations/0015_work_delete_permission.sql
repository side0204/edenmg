-- =====================================================================
-- edenMG  작업 삭제 권한 분리
-- Migration 0015
--   1) employees.can_delete_works 컬럼 추가 (admin/ceo 가 직원별로 부여)
--   2) works RLS 분리 — 기존 works_manager_all(FOR ALL) → INSERT/UPDATE 만
--      허용하고 DELETE 는 새 works_deleter 폴리시로 따로 좁힘.
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0008 이 먼저 실행돼 있어야 한다.
--
-- 정책 (owner 결정):
--   - 작업 삭제는 admin/ceo + employees.can_delete_works=true 만 가능
--   - admin 이 /admin/employees 에서 직원별 토글로 부여 (can_manage_works 와 동일 패턴)
--   - 작업 삭제 시 FK cascade 로 배정·일보·작업구간·일보세그먼트 모두 함께 삭제됨
-- =====================================================================


-- ===== ADD COLUMN: employees.can_delete_works =========================
alter table public.employees
  add column if not exists can_delete_works boolean not null default false;


-- ===== RLS: works — DELETE 권한 분리 ==================================
-- 기존 manager_all(FOR ALL) 을 제거하고 INSERT/UPDATE 두 정책으로 분할.
drop policy if exists works_manager_all on public.works;

drop policy if exists works_manager_insert on public.works;
create policy works_manager_insert
  on public.works
  for insert
  with check (
    company_id = (select company_id from public.current_employee())
    and (
      (select permission from public.current_employee()) in ('admin', 'ceo')
      or (select can_manage_works from public.current_employee()) is true
    )
  );

drop policy if exists works_manager_update on public.works;
create policy works_manager_update
  on public.works
  for update
  using (
    company_id = (select company_id from public.current_employee())
    and (
      (select permission from public.current_employee()) in ('admin', 'ceo')
      or (select can_manage_works from public.current_employee()) is true
    )
  )
  with check (
    company_id = (select company_id from public.current_employee())
    and (
      (select permission from public.current_employee()) in ('admin', 'ceo')
      or (select can_manage_works from public.current_employee()) is true
    )
  );

-- DELETE 는 좁은 권한 — admin/ceo OR can_delete_works
drop policy if exists works_deleter on public.works;
create policy works_deleter
  on public.works
  for delete
  using (
    company_id = (select company_id from public.current_employee())
    and (
      (select permission from public.current_employee()) in ('admin', 'ceo')
      or (select can_delete_works from public.current_employee()) is true
    )
  );


-- ===== GRANTS (변화 없음. 참고로 명시) =================================
-- 이미 0008 에서 grant select, insert, update, delete on public.works to authenticated.
-- RLS 가 DELETE 를 좁히므로 GRANT 는 그대로 둬도 안전.
