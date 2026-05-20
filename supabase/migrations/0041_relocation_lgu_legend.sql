-- =====================================================================
-- edenMG 지장이설 — Migration 0041: LGU+ 표준 범례 적용
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0035 가 먼저 실행돼 있어야 한다.
--
-- owner 제공 LGU+ 표준 범례 (2026-05-20):
--   1) 건물/설치장소 범례 — 국사 5종 + 설치장소 2종 + 모바일국소 8종
--   2) 광망 범례 — 광케이블(설치 3종·규격별 색) + 접속함체 3종 + RN/IJP/광MUX 5종
--
-- 본 마이그 내용:
--   1. relocation_closure_type enum 에 21 종 추가
--      - 국사 4 종: 종합국사·집중국사·가입자국사·간이국사
--      - 설치장소 2 종: 창고·일반설치장소
--      - 모바일국소 8 종: 기지국·중계기·안테나·ESS_LTE_DU·ESS_LTE_RRH·
--        ESS_CDMA_기지국·ESS_CDMA_광중계기·ESS_RF중계기
--      - 접속함체 3 종 (광망 범례): 중간접속형·중간분기형·SP내장형
--      - RN/IJP/광MUX 5 종: RN_TPS·RN_LTE·TPS_LTE_외·IJP·광Mux
--      → 기존 8 종 (국사·맨홀·함체_가공형·함체_관로형·가입자시설·
--         MOFD·OJC·국사내장비) 그대로 보존
--   2. relocation_cables.installation_type text 컬럼 추가
--      - 광망 범례의 「설치구분별 형태」 (가공·구내·해저·입상·지중)
--      - 캔버스에서 케이블 strokeDasharray 분기에 사용
-- =====================================================================

-- ===== relocation_closure_type 확장 =================================
-- 국사 카테고리 세분류
alter type public.relocation_closure_type add value if not exists '종합국사';
alter type public.relocation_closure_type add value if not exists '집중국사';
alter type public.relocation_closure_type add value if not exists '가입자국사';
alter type public.relocation_closure_type add value if not exists '간이국사';

-- 설치장소 카테고리 (기존 맨홀·가입자시설 외 신규 2종)
alter type public.relocation_closure_type add value if not exists '창고';
alter type public.relocation_closure_type add value if not exists '일반설치장소';

-- 모바일국소 카테고리 (신규 8종)
alter type public.relocation_closure_type add value if not exists '기지국';
alter type public.relocation_closure_type add value if not exists '중계기';
alter type public.relocation_closure_type add value if not exists '안테나';
alter type public.relocation_closure_type add value if not exists 'ESS_LTE_DU';
alter type public.relocation_closure_type add value if not exists 'ESS_LTE_RRH';
alter type public.relocation_closure_type add value if not exists 'ESS_CDMA_기지국';
alter type public.relocation_closure_type add value if not exists 'ESS_CDMA_광중계기';
alter type public.relocation_closure_type add value if not exists 'ESS_RF중계기';

-- 접속함체 카테고리 — 광망 범례의 3 종 (기존 함체_가공형·함체_관로형 은
-- 「설치 방식」 차원이고 신규 3 종은 「용도」 차원. 둘 다 보존)
alter type public.relocation_closure_type add value if not exists '중간접속형';
alter type public.relocation_closure_type add value if not exists '중간분기형';
alter type public.relocation_closure_type add value if not exists 'SP내장형';

-- RN/IJP/광MUX 카테고리 (5종)
alter type public.relocation_closure_type add value if not exists 'RN_TPS';
alter type public.relocation_closure_type add value if not exists 'RN_LTE';
alter type public.relocation_closure_type add value if not exists 'TPS_LTE_외';
alter type public.relocation_closure_type add value if not exists 'IJP';
alter type public.relocation_closure_type add value if not exists '광Mux';


-- ===== relocation_cables.installation_type =========================
-- 광망 범례의 「설치구분별 형태」 — 가공·구내·해저·입상·지중
-- 캔버스에서 strokeDasharray 분기에 사용 (가공·구내·해저 = solid, 입상 = dotted, 지중 = dashed)
alter table public.relocation_cables
  add column if not exists installation_type text;


-- =====================================================================
-- 마이그 0041 완료. 누적: closure_type 8 + 21 = 29 종.
--
-- 다음 단계 (코드):
--   - lib/relocation.ts 의 CLOSURE_TYPE_VALUES·LABEL·PREFIX·CATEGORY 확장
--   - LegendPanel.tsx 신규 — 두 표준 범례 UI 재현 (모달)
--   - TopologyCanvas 의 「추가 도구」 패널 카테고리 그룹화
--   - EDGE_COLOR 를 cable_spec 기반 LGU+ 표준 색으로
-- =====================================================================
