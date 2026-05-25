-- =====================================================================
-- edenMG  공사 설계 — 작업완료일 + 작업자 ID 배정 + works 자동 연동
-- Migration 0068 — relocation_projects 확장 + works.relocation_project_id
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등 (여러 번 실행 가능).
--
-- 배경 (2026-05-25 owner 요청)
--   청약 프로젝트 생성/수정 시 작업관리(works) 에 자동으로 같은 작업이
--   생성·동기화돼 배정 외선/접속 작업자에게 노출. 작업자가 일보를 쓸
--   때는 작업관리 화면에서 「설계내역」 링크로 청약 프로젝트 캔버스에
--   접근할 수 있도록.
--
-- 본 마이그 내용:
--   relocation_projects 확장:
--   - completion_at date              작업완료일
--   - outside_worker_ids jsonb        외선 작업자 employees.id 배열
--   - splice_worker_ids  jsonb        접속 작업자 employees.id 배열
--   - subcategory text + CHECK        works.subcategory 와 동일 enum 텍스트
--                                     (청약일 때만 비-null 허용)
--
--   works 확장:
--   - relocation_project_id uuid      청약 프로젝트와 1:1 역방향 FK
--     ON DELETE SET NULL — 프로젝트 삭제 시 작업은 보존 (산안법 5년)
-- =====================================================================

-- ===== relocation_projects 확장 =======================================
alter table public.relocation_projects
  add column if not exists completion_at       date,
  add column if not exists outside_worker_ids  jsonb not null default '[]'::jsonb,
  add column if not exists splice_worker_ids   jsonb not null default '[]'::jsonb,
  add column if not exists subcategory         text;

-- 청약 카테고리에 한해 subcategory 강제 (works 모듈 enum 미러)
do $$ begin
  alter table public.relocation_projects
    add constraint relocation_projects_subcategory_chk
    check (
      subcategory is null
      or (category = '청약'
          and subcategory in ('소호', 'FTTH', '모바일', '전용회선', '다회선', '아파트'))
    );
exception when duplicate_object then null; end $$;

create index if not exists relocation_projects_outside_workers_idx
  on public.relocation_projects using gin (outside_worker_ids);
create index if not exists relocation_projects_splice_workers_idx
  on public.relocation_projects using gin (splice_worker_ids);


-- ===== works.relocation_project_id (역방향 FK) ========================
alter table public.works
  add column if not exists relocation_project_id uuid
    references public.relocation_projects(id) on delete set null;

-- 프로젝트 1개당 works row 1개 (자동 동기화 안전망)
create unique index if not exists works_relocation_project_uniq
  on public.works(relocation_project_id)
  where relocation_project_id is not null;

create index if not exists works_relocation_project_idx
  on public.works(relocation_project_id)
  where relocation_project_id is not null;

-- =====================================================================
-- 마이그 0068 완료.
-- =====================================================================
