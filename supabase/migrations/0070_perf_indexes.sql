-- =====================================================================
-- edenMG  성능 보강 — 점검 결과 누락 인덱스 추가
-- Migration 0070 — 자주 사용되는 쿼리 패턴에 맞는 복합·partial 인덱스
--
-- 배경 (2026-05-25)
--   /works/[id] · /vehicles/trips · /admin/employees 등에서 Promise.all 로
--   쿼리 병렬화 후, 추가로 인덱스 누락 의심 지점 점검. 이미 125 개 인덱스가
--   잘 깔려있어 큰 누락은 적지만 다음 3 가지가 핫패스에서 풀스캔 가능성.
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--   실행 시간: 데이터 적은 베타 단계라 < 1초.
--
-- 영향
--   - 작업 상세 페이지 / 작업 통계 / 일보 진행률 계산 시 효과
--   - 쓰기 (insert) 오버헤드는 거의 무시 가능 (인덱스 3개 추가, 베타 데이터량)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) works.order_id — 공사번호 형제 작업 검색
-- ---------------------------------------------------------------------
-- 사용처: /works/[id] siblings 쿼리 (`company_id = X AND order_id = Y`)
--         /works/stats order 차원 그룹 + 자재·공종 합계 (같은 공사번호 작업끼리)
-- 현재 인덱스: works_company_status_idx, works_company_active_idx, works_company_dates_idx
--             → company_id 시작은 있지만 order_id 결합 없음. 풀스캔 가능
-- 추가: 같은 회사 안 같은 order_id 찾기 (partial — order_id IS NOT NULL 만)
create index if not exists works_company_order_idx
  on public.works(company_id, order_id)
  where order_id is not null;

-- ---------------------------------------------------------------------
-- 2) connection_report_segments.plan_node_id + is_completed — 진행률 계산
-- ---------------------------------------------------------------------
-- 사용처: /works/[id] 진행률 (`plan_node_id IN (...) AND is_completed = true`)
-- 현재 인덱스: connection_report_segments_report_idx (report_id 만)
--             → plan_node_id FK 는 PostgreSQL 가 자동 인덱싱 안 함. ON DELETE RESTRICT
--               제약도 plan_node_id 인덱스 없으면 노드 삭제 시 풀스캔.
-- 추가: 완료된 segment 만 조회용 partial — 진행률 쿼리 정확히 매칭
create index if not exists connection_report_segments_node_completed_idx
  on public.connection_report_segments(plan_node_id)
  where is_completed = true;

-- 추가: plan_node_id 기본 인덱스 (delete restrict + 그 외 lookup)
create index if not exists connection_report_segments_node_idx
  on public.connection_report_segments(plan_node_id);

-- ---------------------------------------------------------------------
-- 3) relocation_core_assignments — 회선·코어 조회 자주 함
-- ---------------------------------------------------------------------
-- 사용처: 지장이설 캔버스 · 고장점 검색 · 자동배정 · 검증
-- 현재 인덱스: relocation_core_project_idx, relocation_core_cable_idx, _circuit_idx
--             → 충분. 추가 안 함.

-- =====================================================================
-- 점검 권장 (owner)
--   Supabase Dashboard → Database → Query Performance 에서
--   상위 느린 쿼리 확인하면 추가 인덱스 후보 더 찾을 수 있음.
--   "rows" / "calls" / "mean_exec_time" 컬럼 정렬.
-- =====================================================================
