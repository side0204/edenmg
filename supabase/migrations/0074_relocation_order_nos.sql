-- 청약 프로젝트 작업번호 다중 입력 — 기존 order_no(단일 text) 를 array 화.
-- 기존 order_no 컬럼은 그대로 두고(legacy), order_nos jsonb 배열을 신규 추가.
--   - 기존 단일 값이 있는 행은 [order_no] 으로 자동 복사
--   - 새로 입력하는 값은 order_nos 배열에만 들어감
--   - 검색·CSV 등에서는 order_nos 우선, 비어있으면 order_no 폴백

alter table public.relocation_projects
  add column if not exists order_nos jsonb not null default '[]'::jsonb;

-- 기존 단일 값을 배열로 복사 (한 번만)
update public.relocation_projects
   set order_nos = jsonb_build_array(order_no)
 where order_no is not null
   and order_no <> ''
   and (order_nos is null or order_nos = '[]'::jsonb);

-- 검색용 GIN 인덱스 (배열 원소 매치)
create index if not exists relocation_projects_order_nos_idx
  on public.relocation_projects using gin (order_nos);
