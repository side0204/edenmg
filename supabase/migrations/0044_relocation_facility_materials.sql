-- =====================================================================
-- edenMG 지장이설 — Migration 0044: 접속함체 사용 자재
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0036·0037 가 먼저 실행돼 있어야 한다.
--
-- owner 요청 (2026-05-20):
--   접속함체도 접속작업 여부에 따라 기별명세서에 「자재」 와 「공종량」 이
--   작성돼야 한다. 캔버스에서 접속함체를 선택하면 우상단 정보 패널에서
--   공종·자재를 입력한다.
--     - 공종량 : 0037 의 relocation_facility_tasks 가 이미 담당 (재사용)
--     - 자재   : 본 마이그의 relocation_facility_materials 신규 테이블
--
--   지장이설 모듈은 다른 모듈과 완전 독립 — 회사 자재 마스터(M4)와 FK
--   연결하지 않고 자유 텍스트로 입력한다 (자재명·규격·단위·수량).
-- =====================================================================


-- =====================================================================
-- TABLE: relocation_facility_materials (시설별 사용 자재)
-- =====================================================================
-- 접속함체(및 작업 발생 시설)의 기별명세서용 자재. facility 삭제 시 cascade.
create table if not exists public.relocation_facility_materials (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.relocation_projects(id) on delete cascade,
  facility_id   uuid not null references public.relocation_facilities(id) on delete cascade,
  name          text not null,                          -- 자재명 (자유 입력)
  spec          text,                                   -- 규격 (선택)
  unit          text not null default '개',            -- 단위 ('개', '조', 'm' 등)
  quantity      numeric(10,2) not null default 1,       -- 수량
  notes         text,
  created_at    timestamptz not null default now(),

  constraint relocation_facility_materials_quantity_positive
    check (quantity > 0)
);

alter table public.relocation_facility_materials enable row level security;

create index if not exists relocation_facility_materials_facility_idx
  on public.relocation_facility_materials(facility_id);

create index if not exists relocation_facility_materials_project_idx
  on public.relocation_facility_materials(project_id);


-- =====================================================================
-- RLS — 회사 스코프 (0037 의 facility_tasks 정책과 동일 패턴)
-- =====================================================================
drop policy if exists relocation_facility_materials_all on public.relocation_facility_materials;
create policy relocation_facility_materials_all
  on public.relocation_facility_materials
  for all
  using (
    project_id in (
      select id from public.relocation_projects
      where company_id = (select company_id from public.current_employee())
    )
  )
  with check (
    project_id in (
      select id from public.relocation_projects
      where company_id = (select company_id from public.current_employee())
    )
  );


-- =====================================================================
-- GRANTS
-- =====================================================================
grant select, insert, update, delete on public.relocation_facility_materials to authenticated;
grant all on public.relocation_facility_materials to service_role;


-- =====================================================================
-- 마이그 0044 완료.
--
-- 공종량은 0037 의 relocation_facility_tasks (시설별 공종 수량) 를 그대로 사용.
-- 본 마이그는 자재 테이블만 추가.
--
-- 다음 단계 (코드):
--   - FacilityInfoPanel — 접속함체 선택 시 우상단 정보 패널 (공종·자재 입력)
--   - facility-task-actions — addFacilityTask / addFacilityMaterial 등
-- =====================================================================
