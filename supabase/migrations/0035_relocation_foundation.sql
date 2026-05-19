-- =====================================================================
-- edenMG  지장이설 자동화 설계 모듈 (M-Relocation)
-- Migration 0035 — 기반 enum 일체 + relocation_projects + RLS + GRANT
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0001~0034 가 먼저 실행돼 있어야 한다.
--
-- 사양: docs/RELOCATION_DESIGN_PLAN.md (v0.8)
--
-- 본 마이그는 모듈 foundation 만:
--   - 모든 enum 일체 (다른 테이블이 참조하므로 0035 에 선행)
--   - relocation_projects 테이블 (프로젝트 단위)
--   - RLS (회사 스코프, 권한 제한 없음 — 회사 내 누구나 접근)
--   - GRANT (authenticated · service_role 양쪽)
--
-- 후속 마이그:
--   0036 — facilities · cables · circuits · core_assignments
--   0037 — splices · splitters · task_type_master · facility_tasks
--   0038 — phases · phase_tasks · task_pairs
-- =====================================================================


-- ===== ENUMS ==========================================================

-- 시설 종류 (국사·맨홀·함체·가입자·국사내부 토폴로지 노드)
do $$ begin
  create type public.relocation_closure_type as enum (
    '국사', '맨홀', '함체_가공형', '함체_관로형', '가입자시설',
    'MOFD', 'OJC', '국사내장비'
  );
exception when duplicate_object then null; end $$;


-- 케이블 상태 (기설/이설/신설/철거)
do $$ begin
  create type public.relocation_cable_status as enum (
    'existing',    -- 기설 (이번 작업 영향 없음, 코어 보존 대상)
    'relocating',  -- 기설 이설 (경로 변경)
    'new',         -- 신설
    'removing'     -- 철거
  );
exception when duplicate_object then null; end $$;


-- 코어 lifecycle (기설/재배정/신설)
do $$ begin
  create type public.relocation_core_lifecycle as enum (
    'preexisting', -- 기설 그대로 유지 (회피 대상)
    'relocating',  -- 이번 작업으로 재배정
    'new'          -- 이번 작업으로 신규 추가
  );
exception when duplicate_object then null; end $$;


-- 회선 종류 (1코어/2코어/이원화)
do $$ begin
  create type public.relocation_circuit_kind as enum (
    '1코어', '2코어', '이원화_1코어씩', '이원화_2코어씩'
  );
exception when duplicate_object then null; end $$;


-- 회선·코어 상태
do $$ begin
  create type public.relocation_circuit_status as enum (
    'OK', 'ER', '확인', '해지'
  );
exception when duplicate_object then null; end $$;


-- 1차 RN 스플리터 종류
do $$ begin
  create type public.relocation_splitter_type as enum (
    '2:8', '2:16', '1:2:8:4', '1:3:8:4'
  );
exception when duplicate_object then null; end $$;


-- 스플리터 작업 모드 (분기 / 내부접속만)
do $$ begin
  create type public.relocation_splitter_work_mode as enum (
    '분기',           -- 출력 포트가 외부 가입자/시설로 연결됨
    '내부접속만'      -- 외부 분기 없음 — 함체 내부 접속 작업만
  );
exception when duplicate_object then null; end $$;


-- 차수 작업 종류 (함체 신설·기설 접속·코어 재배정·제거)
do $$ begin
  create type public.relocation_phase_task_kind as enum (
    '함체신설_절단', '기설접속', '코어재배정', '제거'
  );
exception when duplicate_object then null; end $$;


-- 차수 상태
do $$ begin
  create type public.relocation_phase_status as enum (
    '계획', '확정', '진행중', '완료', '취소'
  );
exception when duplicate_object then null; end $$;


-- ===== TABLE: relocation_projects =====================================
-- 지장이설 프로젝트 단위. 한 프로젝트 = 한 지장이설 안건 = 한 코어구성도
create table if not exists public.relocation_projects (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  title         text not null,                           -- 예: '필동 충무로 도로공사 지장이설'
  client        text not null default 'LGU+',            -- 발주처 (기본 LGU+)
  region        text,                                    -- '서울 중구' 등
  surveyed_at   date,                                    -- 현장답사일
  designer_id   uuid references public.employees(id),    -- 설계자 (회사 직원)
  status        text not null default '설계중',          -- 설계중·검증중·확정·시공중·완료·취소
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.relocation_projects enable row level security;

create index if not exists relocation_projects_company_idx
  on public.relocation_projects(company_id);

create index if not exists relocation_projects_designer_idx
  on public.relocation_projects(designer_id);


-- updated_at 자동 갱신 트리거
do $$ begin
  create trigger relocation_projects_touch_updated_at
    before update on public.relocation_projects
    for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;


-- ===== RLS: select — 같은 회사 누구나 (권한 제한 없음) ================
drop policy if exists relocation_projects_select on public.relocation_projects;
create policy relocation_projects_select
  on public.relocation_projects
  for select
  using (
    company_id = (select company_id from public.current_employee())
  );


-- ===== RLS: insert — 같은 회사면 누구나 ===============================
drop policy if exists relocation_projects_insert on public.relocation_projects;
create policy relocation_projects_insert
  on public.relocation_projects
  for insert
  with check (
    company_id = (select company_id from public.current_employee())
  );


-- ===== RLS: update — 같은 회사면 누구나 ===============================
drop policy if exists relocation_projects_update on public.relocation_projects;
create policy relocation_projects_update
  on public.relocation_projects
  for update
  using (
    company_id = (select company_id from public.current_employee())
  )
  with check (
    company_id = (select company_id from public.current_employee())
  );


-- ===== RLS: delete — 같은 회사면 누구나 (관리자 권한도 무관, 회사 단위) =
drop policy if exists relocation_projects_delete on public.relocation_projects;
create policy relocation_projects_delete
  on public.relocation_projects
  for delete
  using (
    company_id = (select company_id from public.current_employee())
  );


-- ===== GRANTS ==========================================================
grant select, insert, update, delete on public.relocation_projects to authenticated;
grant all on public.relocation_projects to service_role;


-- =====================================================================
-- 마이그 0035 완료.
--
-- 다음 단계: 0036_relocation_facilities_cables.sql
--   - 시설(facilities) + 시설 번호 카운터(facility_seq)
--   - 케이블(cables) + 케이블 번호 카운터(cable_seq)
--   - 회선(circuits)
--   - 코어배정(core_assignments) + btree_gist exclusion constraint
-- =====================================================================
