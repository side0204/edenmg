-- =====================================================================
-- edenMG  현장관리 — 독립 최상위 모듈로 승격
-- Migration 0086 — project_id nullable + shared_to_field 플래그
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능).
--
-- 배경
--   owner 요청 (2026-05-28): 현장관리를 공사(프로젝트) 종속이 아니라
--   「독립 최상위 메뉴」로 별도 관리. 하단 탭바에 「현장관리」 탭(/field) 추가.
--   공사 안에서 입력한 노트는 기본 그 공사에서만 보이되, 「현장관리로 보내기」
--   를 누른 노트만 최상위 통합 지도(/field)에 표시 (명시적 공유).
--
-- 데이터 모델 변경:
--   - project_id  : NOT NULL → nullable.
--       · 최상위 /field 에서 만든 노트 = project_id NULL (= 독립 노트)
--       · 공사 탭에서 만든 노트 = project_id SET (= 그 공사 소속)
--   - shared_to_field boolean : 공사 노트를 최상위에 노출할지 (명시적 보내기)
--       · 최상위 /field 쿼리 = (project_id IS NULL OR shared_to_field = true)
--       · 독립 노트(project_id NULL)는 항상 최상위 노출 (플래그 무관)
-- =====================================================================


-- project_id nullable
alter table public.relocation_field_notes
  alter column project_id drop not null;

-- shared_to_field — 공사 노트의 최상위 공유 플래그
alter table public.relocation_field_notes
  add column if not exists shared_to_field boolean not null default false;

-- 최상위 통합 지도 쿼리용 인덱스 (회사 스코프 + 공유/독립)
create index if not exists relocation_field_notes_field_view_idx
  on public.relocation_field_notes(company_id)
  where project_id is null or shared_to_field = true;


-- =====================================================================
-- 마이그 0086 완료.
--   기존 노트(0085 로 만든 것)는 project_id SET · shared_to_field=false →
--   해당 공사 탭에서만 보임. 최상위에 띄우려면 「현장관리로 보내기」 클릭.
-- =====================================================================
