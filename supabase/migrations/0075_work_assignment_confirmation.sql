-- 작업 배정 확정/취소 워크플로우.
-- 청약 프로젝트에서 작업자 배정 후 「확정」 누르기 전에는 작업자에게 안 보이게 한다.
-- 「취소」는 배정 자체 삭제 (= 기존 동기화 흐름과 동일).
--
-- 호환성:
--   - 기존 work_assignments 행에는 confirmed_at = created_at 으로 backfill
--     → 베타 사용 중 이미 만들어진 배정은 그대로 「확정」 상태로 보임
--   - 새로 syncLinkedWork 가 만드는 배정은 confirmed_at = null (대기)
--   - /works?mine=1 등 본인 배정 필터는 confirmed_at is not null 추가

alter table public.work_assignments
  add column if not exists confirmed_at timestamptz;

-- 기존 데이터는 모두 확정 처리 (작업자 화면이 갑자기 비어버리지 않도록)
update public.work_assignments
   set confirmed_at = coalesce(confirmed_at, created_at, now())
 where confirmed_at is null;

-- 빠른 검색: 「내 배정 중 확정된 것」
create index if not exists work_assignments_employee_confirmed_idx
  on public.work_assignments(employee_id, confirmed_at)
  where confirmed_at is not null;
