-- =====================================================================
-- edenMG  지장이설 — 프로젝트 동시 작업 실시간 동기화
-- Migration 0059 — Supabase Realtime publication 에 relocation_* 테이블 추가
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등 (table 이 publication 에 이미 있으면 ALTER PUBLICATION 이 에러를 던지므로
-- 각 ADD 를 do $$ exception-handled block 으로 감싼다).
--
-- 동작
--   - 같은 프로젝트를 다른 직원이 동시에 보고 있을 때, 서로의 변경이 즉시 반영되도록
--     supabase_realtime publication 에 핵심 테이블을 등록.
--   - 클라이언트(TopologyCanvas 안 RealtimeSync) 는 프로젝트 id 로 채널을 구독해
--     관련 변경 이벤트가 오면 router.refresh() 트리거.
--   - 같이 변경되는 자식 테이블(splitter_ports·phase_tasks·task_pairs·migration_circuits)
--     은 등록 안 함 — 부모 변경으로 같은 refresh 가 일어나므로 노이즈 감소.
--
-- 비용 영향
--   - 무료 플랜의 동시 접속 200·메시지 2M 한도 안에서 충분.
--   - 추가 결제 없음.
-- =====================================================================

do $$
begin
  alter publication supabase_realtime add table public.relocation_projects;
exception when duplicate_object then null; end $$;

do $$
begin
  alter publication supabase_realtime add table public.relocation_facilities;
exception when duplicate_object then null; end $$;

do $$
begin
  alter publication supabase_realtime add table public.relocation_cables;
exception when duplicate_object then null; end $$;

do $$
begin
  alter publication supabase_realtime add table public.relocation_circuits;
exception when duplicate_object then null; end $$;

do $$
begin
  alter publication supabase_realtime add table public.relocation_core_assignments;
exception when duplicate_object then null; end $$;

do $$
begin
  alter publication supabase_realtime add table public.relocation_splices;
exception when duplicate_object then null; end $$;

do $$
begin
  alter publication supabase_realtime add table public.relocation_splitters;
exception when duplicate_object then null; end $$;

do $$
begin
  alter publication supabase_realtime add table public.relocation_facility_tasks;
exception when duplicate_object then null; end $$;

do $$
begin
  alter publication supabase_realtime add table public.relocation_facility_materials;
exception when duplicate_object then null; end $$;

do $$
begin
  alter publication supabase_realtime add table public.relocation_phases;
exception when duplicate_object then null; end $$;

do $$
begin
  alter publication supabase_realtime add table public.relocation_migrations;
exception when duplicate_object then null; end $$;
