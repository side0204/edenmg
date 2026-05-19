-- =====================================================================
-- edenMG  service_role GRANT 일괄 부여
-- Migration 0032 — 회원가입 흐름에서 service role 키로 companies 조회 시
--                  "permission denied for table" 발생 → table-level GRANT 부여
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능).
--
-- 배경
--   - 자동 RLS ON 으로 생성된 프로젝트는 service_role 에 자동 GRANT 가 들어가지
--     않을 수 있다. service_role 은 BYPASSRLS 속성이 있어 RLS 는 우회하지만,
--     table-level GRANT 가 없으면 permission denied 가 발생한다.
--   - 마이그 0001~0031 의 GRANT 블록이 모두 `to authenticated` 만 명시했기에,
--     service_role 로 접근 시 PostgREST 가 차단.
--   - 회원가입 흐름 (비로그인 → admin client 로 companies 조회) 이 막혀
--     "회사 조회 실패: permission denied for table companies" 가 나옴.
--
-- 해결
--   - public 스키마의 모든 테이블·시퀀스·함수에 service_role 일괄 GRANT.
--   - 이후 생성될 테이블에도 자동 적용되도록 default privileges 도 함께 설정.
-- =====================================================================

grant usage on schema public to service_role;

grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

alter default privileges in schema public
  grant all on tables    to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;
alter default privileges in schema public
  grant all on functions to service_role;
