-- =====================================================================
-- edenMG  지장이설 자동화 설계 모듈 (M-Relocation)
-- Migration 0039 — relocation_migrations + relocation_migration_circuits
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0035~0038 이 먼저 실행돼 있어야 한다.
--
-- 사양: docs/RELOCATION_DESIGN_PLAN.md (v0.9, § 2-7)
--
-- 본 마이그 내용:
--   - relocation_migrations          (이전 작업 단위 — 옛 케이블 → 새 케이블)
--   - relocation_migration_circuits  (한 migration 안 실제 옮긴 회선들)
--
-- 워크플로우:
--   1. 기설 임포트 (LGU+ DB) → core_assignments 가 lifecycle='preexisting' 로 채워짐
--   2. 변경 마킹: 철거 케이블 → status='removing'. 신설 케이블·함체 추가
--   3. 영향 회선 자동 추출 (status='removing' 케이블에 매핑된 회선들)
--   4. 이전 액션: 옛→새 매핑 (이 테이블에 audit) + core_assignments 갱신
--   5. 자동 코어 배정 (별도 알고리즘)
-- =====================================================================


-- =====================================================================
-- TABLE: relocation_migrations (이전 작업 단위)
-- =====================================================================
-- 한 옛 케이블의 일부 또는 전체 회선을 한 새 케이블로 옮긴 audit.
-- 옛→새 케이블이 N:M 분할이면 한 옛 케이블에 대해 여러 migration row 가 생김.
create table if not exists public.relocation_migrations (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.relocation_projects(id) on delete cascade,
  from_cable_id uuid not null references public.relocation_cables(id),     -- 옛 케이블 (status='removing' 또는 'relocating')
  to_cable_id   uuid not null references public.relocation_cables(id),     -- 새 케이블 (status='new')
  notes         text,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.employees(id),

  constraint relocation_migrations_no_self
    check (from_cable_id <> to_cable_id),

  constraint relocation_migrations_unique
    unique (project_id, from_cable_id, to_cable_id)
);

alter table public.relocation_migrations enable row level security;

create index if not exists relocation_migrations_project_idx
  on public.relocation_migrations(project_id);

create index if not exists relocation_migrations_from_idx
  on public.relocation_migrations(from_cable_id);

create index if not exists relocation_migrations_to_idx
  on public.relocation_migrations(to_cable_id);


-- =====================================================================
-- TABLE: relocation_migration_circuits (옮긴 회선들)
-- =====================================================================
-- 한 migration 안에 실제 옮긴 회선들. 이원화 회선은 segment_idx 로 짝 구분.
create table if not exists public.relocation_migration_circuits (
  migration_id uuid not null references public.relocation_migrations(id) on delete cascade,
  circuit_id   uuid not null references public.relocation_circuits(id) on delete cascade,
  segment_idx  smallint not null default 0,
  notes        text,
  primary key (migration_id, circuit_id, segment_idx),

  constraint relocation_migration_circuits_segment_range
    check (segment_idx between 0 and 9)
);

alter table public.relocation_migration_circuits enable row level security;

create index if not exists relocation_migration_circuits_circuit_idx
  on public.relocation_migration_circuits(circuit_id);


-- =====================================================================
-- RLS — 회사 스코프 (project → company 체인)
-- =====================================================================

-- ===== relocation_migrations ==========================================
drop policy if exists relocation_migrations_all on public.relocation_migrations;
create policy relocation_migrations_all
  on public.relocation_migrations
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


-- ===== relocation_migration_circuits — migration → project → company =
drop policy if exists relocation_migration_circuits_all on public.relocation_migration_circuits;
create policy relocation_migration_circuits_all
  on public.relocation_migration_circuits
  for all
  using (
    migration_id in (
      select m.id from public.relocation_migrations m
      join public.relocation_projects p on p.id = m.project_id
      where p.company_id = (select company_id from public.current_employee())
    )
  )
  with check (
    migration_id in (
      select m.id from public.relocation_migrations m
      join public.relocation_projects p on p.id = m.project_id
      where p.company_id = (select company_id from public.current_employee())
    )
  );


-- =====================================================================
-- GRANTS
-- =====================================================================
grant select, insert, update, delete on public.relocation_migrations          to authenticated;
grant select, insert, update, delete on public.relocation_migration_circuits  to authenticated;

grant all on public.relocation_migrations         to service_role;
grant all on public.relocation_migration_circuits to service_role;


-- =====================================================================
-- 마이그 0039 완료. Phase 1 (DB Foundation) + 이전 워크플로우 모두 완료.
--
-- 누적 결과:
--   0035 — 프로젝트 + enum 9종
--   0036 — facilities · cables · circuits · core_assignments + 카운터 2종
--   0037 — splices · splitters · task_type_master · facility_tasks
--   0038 — phases · phase_tasks · task_pairs
--   0039 — migrations · migration_circuits (이전 audit)
--
-- 다음 단계: 코드 (Step C)
--   - 시드 데이터 보강 (기설 core_assignments 시드까지)
--   - "이전" 탭 UI (영향 회선 자동 추출 + 옛→새 매핑)
--   - 자동 코어 배정 알고리즘
-- =====================================================================
