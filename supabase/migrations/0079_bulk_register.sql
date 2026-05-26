-- 공사설계 시설물 일괄등록 (마이그 0079).
--   캔버스 상단 「시설물 일괄등록」 버튼 → 텍스트 일괄 입력 → 드래그 범위에 자동 배치.
--
-- 함체 입력 형식: C, ID, 구분, 명칭 (4 필드)
-- 케이블 입력 형식: L, 코어수, ID, 구분, from, to (6 필드)
--
-- 미연결 케이블 임시 보관 — 일괄 입력 안 from/to 시설명이
--    매칭되지 않을 때 「미연결 목록」 으로 보관.
--    사용자가 나중에 선택해 시설 2 개를 클릭하면 실제 cable 로 변환.
--
-- 멱등.

-- 미연결 케이블 임시 테이블
create table if not exists public.relocation_pending_cables (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.relocation_projects(id) on delete cascade,
  cable_code        text,                 -- 사용자 입력 ID (relocation_cables.cable_code 와 동일 의미)
  spec              text not null,        -- '1C', '12C', '36C', '144C' 등 (cable_spec enum 문자열)
  installation_type text,                 -- '가공', '구내', '해저', '입상', '지중'
  expected_from     text,                 -- 사용자가 입력한 from 시설명 (매칭 실패)
  expected_to       text,                 -- 사용자가 입력한 to 시설명 (매칭 실패)
  notes             text,
  created_by        uuid references public.employees(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists relocation_pending_cables_project_idx
  on public.relocation_pending_cables(project_id, created_at desc);

alter table public.relocation_pending_cables enable row level security;

-- RLS — 회사 스코프 (같은 회사 직원 누구나)
drop policy if exists relocation_pending_cables_select on public.relocation_pending_cables;
create policy relocation_pending_cables_select
  on public.relocation_pending_cables
  for select
  using (
    project_id in (
      select id from public.relocation_projects
       where company_id = (select company_id from public.current_employee())
    )
  );

drop policy if exists relocation_pending_cables_insert on public.relocation_pending_cables;
create policy relocation_pending_cables_insert
  on public.relocation_pending_cables
  for insert
  with check (
    project_id in (
      select id from public.relocation_projects
       where company_id = (select company_id from public.current_employee())
    )
  );

drop policy if exists relocation_pending_cables_update on public.relocation_pending_cables;
create policy relocation_pending_cables_update
  on public.relocation_pending_cables
  for update
  using (
    project_id in (
      select id from public.relocation_projects
       where company_id = (select company_id from public.current_employee())
    )
  );

drop policy if exists relocation_pending_cables_delete on public.relocation_pending_cables;
create policy relocation_pending_cables_delete
  on public.relocation_pending_cables
  for delete
  using (
    project_id in (
      select id from public.relocation_projects
       where company_id = (select company_id from public.current_employee())
    )
  );

grant select, insert, update, delete on public.relocation_pending_cables to authenticated;
