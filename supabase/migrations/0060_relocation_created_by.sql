-- =====================================================================
-- edenMG  지장이설 — 시설·케이블 작성자(created_by) 추적
-- Migration 0060 — relocation_facilities + relocation_cables 에 created_by
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능).
--
-- 배경
--   owner 보고 (2026-05-24): 다중 작업 시 「케이블 정렬」·「그래프 자동 배치」
--   가 다른 사람이 작업한 시설·케이블까지 옮겨 배치가 다 틀어짐. 본인이
--   생성한 항목에만 적용하려면 작성자 추적이 필요.
--
-- 본 마이그 내용:
--   - relocation_facilities.created_by  uuid → employees.id (on delete set null)
--   - relocation_cables.created_by      uuid → employees.id (on delete set null)
--   - 둘 다 index 추가 (필터링 속도)
--
-- 기존 데이터는 created_by IS NULL — 클라이언트에서 「미지정」 그룹으로 처리.
-- =====================================================================


-- ===== relocation_facilities.created_by ===============================
alter table public.relocation_facilities
  add column if not exists created_by uuid references public.employees(id) on delete set null;

create index if not exists relocation_facilities_created_by_idx
  on public.relocation_facilities(project_id, created_by)
  where created_by is not null;


-- ===== relocation_cables.created_by ===================================
alter table public.relocation_cables
  add column if not exists created_by uuid references public.employees(id) on delete set null;

create index if not exists relocation_cables_created_by_idx
  on public.relocation_cables(project_id, created_by)
  where created_by is not null;


-- =====================================================================
-- 마이그 0060 완료.
--
-- 후속 (코드 작업, 마이그 아님):
--   - 시설·케이블 생성 server action 들이 created_by 를 자동으로 채움
--   - 캔버스의 「케이블 정렬」·「그래프 자동 배치」 가 본인 작업분만
--     적용 (선택 도구 활성 시 선택 범위만)
-- =====================================================================
