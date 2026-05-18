-- =====================================================================
-- edenMG  권한 enum 재구성
-- Migration 0018
--
-- 변경:
--   소장(foreman)  → 팀장(team_leader)        [enum value rename]
--   대표(ceo)      → 관리자(admin) 통합        [데이터 update — enum 'ceo' 자체는 Postgres
--                                              DROP VALUE 미지원이라 legacy 로 남음]
--   팀원(team_member) 신규                    [enum value add]
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--   (실패하면 statement 단위로 한 줄씩 실행)
--
-- 멱등 — 여러 번 실행 가능. 0001~0017 이 먼저 실행돼 있어야 함.
--
-- 정책 (owner 결정):
--   - 관리자(admin) 가 모든 권한을 가지며 다른 직원에게 권한 토글로 부여
--   - 기존 ceo 의 모든 기능은 admin 으로 통합 (한 위계로)
--   - 결재(휴가·일보) 가능 = team_leader OR admin
--   - 직원 관리·작업 삭제·통계 조회 등 토글 권한 부여 = admin 만
-- =====================================================================


-- ===== 1) ceo 데이터 → admin 통합 =====================================
update public.employees
  set permission = 'admin'
  where permission = 'ceo';


-- ===== 2) 새 enum 값 'team_member' 추가 ===============================
do $$ begin
  if not exists (
    select 1 from pg_enum e
      join pg_type t on e.enumtypid = t.oid
      where t.typname = 'employee_permission' and e.enumlabel = 'team_member'
  ) then
    alter type public.employee_permission add value 'team_member';
  end if;
end $$;


-- ===== 3) foreman → team_leader rename ===============================
do $$ begin
  if exists (
    select 1 from pg_enum e
      join pg_type t on e.enumtypid = t.oid
      where t.typname = 'employee_permission' and e.enumlabel = 'foreman'
  ) then
    alter type public.employee_permission rename value 'foreman' to 'team_leader';
  end if;
end $$;


-- ===== 4) 출퇴근 update 정책 재정의 (foreman → team_leader) ============
-- 0003 의 attendances_update 정책이 in ('foreman','admin','ceo') 였음.
-- enum rename + ceo 통합에 맞춰 in ('team_leader','admin') 으로 단순화.
drop policy if exists attendances_update on public.attendances;
create policy attendances_update
  on public.attendances
  for update
  using (
    employee_id = (select id from public.current_employee())
    or (
      company_id = (select company_id from public.current_employee())
      and (select permission from public.current_employee()) in ('team_leader', 'admin')
    )
  )
  with check (
    employee_id = (select id from public.current_employee())
    or (
      company_id = (select company_id from public.current_employee())
      and (select permission from public.current_employee()) in ('team_leader', 'admin')
    )
  );


-- 참고: 다른 RLS 정책은 모두 in ('admin','ceo') 형태인데 ceo 데이터가 0건이 되어
--        효과는 'admin' 만 매칭. 코드와 일관성 유지는 운영상 깨끗하지만, 마이그를
--        간결하게 유지하기 위해 그대로 둠. 추가 정리 필요 시 별도 마이그.
