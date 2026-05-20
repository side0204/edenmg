-- =====================================================================
-- edenMG  지장이설 자동화 설계 모듈 (M-Relocation)
-- Migration 0040 — relocation_core_assignments.is_terminal
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0036 이 먼저 실행돼 있어야 한다.
--
-- 사양: docs/RELOCATION_DESIGN_PLAN.md § 2-7 (v0.10).
--
-- owner 결정 (2026-05-20):
--   기존 "가입자시설로 끝나는 케이블 = 종단" 자동 추론은 **틀림**.
--     - 가입자시설이라도 통과되어 나가는 경우 있음
--     - 함체·국사·맨홀 등 모든 시설이 종단일 수 있음
--   따라서 종단 여부는 **설계자가 명시적으로 체크**. 회선/코어 단위.
--
-- 사용 패턴:
--   - 설계자가 종단 케이블에 회선·코어 입력 시 is_terminal=true 로 저장
--   - 자동 경로 탐색 (Step C-4) 은 is_terminal=true 행만 검색
--     → 같은 circuit_id 가 2 행 이상이면 시설 그래프 BFS 로 경유 케이블에 자동 코어 할당
-- =====================================================================

alter table public.relocation_core_assignments
  add column if not exists is_terminal boolean not null default false;

-- 종단 회선 검색 (Step C-4 자동 경로 탐색 입력) — 빠르게.
-- partial index — is_terminal=true 행만. 데이터 적게 누적되는 컬럼이라 효율적.
create index if not exists relocation_core_assignments_terminal_idx
  on public.relocation_core_assignments(project_id, circuit_id)
  where is_terminal = true;


-- =====================================================================
-- 마이그 0040 완료.
--
-- 다음 단계 (코드 Step C-3 → C-4):
--   - C-3: 코어배정 추가/수정 폼에 「종단」 체크박스 노출 (CoresTab)
--   - C-4: 자동 경로 탐색 server action — is_terminal=true 행 그룹핑 + 시설 그래프 BFS
-- =====================================================================
