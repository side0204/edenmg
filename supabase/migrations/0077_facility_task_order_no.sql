-- 청약 프로젝트에 작업번호가 여러 개 있을 때, 시설 공종이 어느 작업번호에 속하는지 명시.
--   - 동일 청약작업에 작업번호 다수 부여 가능 (마이그 0074 order_nos jsonb)
--   - 작업내역(공종량)은 그중 하나에 귀속되어야 정산·기별명세서 분리 가능
--   - 단일 작업번호 프로젝트나 작업번호 미부여 프로젝트는 null 허용
--
-- 작업번호 unique 컬럼 추가:
--   - (facility_id, task_type_id) 기존 unique 를 (facility_id, task_type_id, order_no) 로 확장
--   - 같은 시설·공종이라도 다른 작업번호면 별도 행으로 관리
--   - 기존 데이터는 order_no=null 로 유지 (legacy)
--
-- 변경:
--   - 기존 unique constraint 제거 후 새 unique index 생성
--   - 단, postgres unique constraint 는 NULL 을 별도 값으로 취급하므로
--     null 인 행끼리도 unique 가 안 잡힘 → 명시적 partial index 추가

alter table public.relocation_facility_tasks
  add column if not exists order_no text;

-- 기존 unique constraint 제거 (이름이 다를 수 있어 동적으로)
--   PL/pgSQL 변수와 pg_constraint.conname 컬럼 충돌 회피 위해 변수명 _name 으로
do $$
declare
  _name text;
begin
  for _name in
    select c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
     where t.relname = 'relocation_facility_tasks'
       and c.contype = 'u'
  loop
    execute format('alter table public.relocation_facility_tasks drop constraint if exists %I', _name);
  end loop;
end$$;

-- 새 unique: (facility_id, task_type_id, coalesce(order_no, ''))
--   - order_no null 도 빈 문자열로 변환해 고유성 검사
create unique index if not exists relocation_facility_tasks_uniq_idx
  on public.relocation_facility_tasks (facility_id, task_type_id, coalesce(order_no, ''));

create index if not exists relocation_facility_tasks_order_no_idx
  on public.relocation_facility_tasks (project_id, order_no)
  where order_no is not null;
