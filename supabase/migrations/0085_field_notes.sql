-- =====================================================================
-- edenMG  현장관리 (Phase A)
-- Migration 0085 — relocation_field_notes + relocation_field_note_photos
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능).
--
-- 배경
--   owner 요청 (2026-05-28): 현장에서 발생하는 특이점·주의·위험을 지도 위에
--   마커로 기록 (메모 + 사진 첨부). 작업자가 위치 등록 시 「현재 위치로 이동」
--   버튼으로 편의성 제공. 외부 네비 앱 deep link 로 즉시 길찾기.
--   기존 실사정보입력(relocation_field_inspections — 시설 첨부)과 별개.
--   이 모듈은 「프로젝트 단위 독립」, 좌표 기반.
--
-- 본 마이그 내용:
--   - relocation_field_notes 테이블 (프로젝트별, kind: 일반/주의/위험)
--   - relocation_field_note_photos 테이블 (1:N 사진)
--   - RLS:
--       select  — 같은 회사 누구나
--       insert  — 같은 회사 + 본인만
--       update  — 본인 OR admin
--       delete  — (본인 AND 등록 당일 KST) OR admin
--   - R2 버킷 relocation-field-notes 는 Cloudflare 콘솔에서 별도 생성
--     (Supabase Storage 미사용 — egress 정책상 R2 일관)
-- =====================================================================


-- =====================================================================
-- TABLE: relocation_field_notes
-- =====================================================================
create table if not exists public.relocation_field_notes (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.relocation_projects(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  kind        text not null check (kind in ('일반', '주의', '위험')),
  title       text,
  body        text,
  lat         double precision not null,
  lng         double precision not null,
  address     text,
  created_by  uuid references public.employees(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists relocation_field_notes_project_idx
  on public.relocation_field_notes(project_id, created_at desc);

create index if not exists relocation_field_notes_company_idx
  on public.relocation_field_notes(company_id);

create index if not exists relocation_field_notes_kind_idx
  on public.relocation_field_notes(kind)
  where kind in ('주의', '위험');

drop trigger if exists relocation_field_notes_touch_updated_at on public.relocation_field_notes;
create trigger relocation_field_notes_touch_updated_at
  before update on public.relocation_field_notes
  for each row
  execute function public.touch_updated_at();

alter table public.relocation_field_notes enable row level security;


-- ===== RLS — 회사 스코프 + 본인 + 당일 삭제 ==============================

drop policy if exists relocation_field_notes_select on public.relocation_field_notes;
create policy relocation_field_notes_select
  on public.relocation_field_notes
  for select
  to authenticated
  using (company_id = (select company_id from public.current_employee()));

drop policy if exists relocation_field_notes_insert on public.relocation_field_notes;
create policy relocation_field_notes_insert
  on public.relocation_field_notes
  for insert
  to authenticated
  with check (
    company_id = (select company_id from public.current_employee())
    and created_by = (select id from public.current_employee())
  );

drop policy if exists relocation_field_notes_update on public.relocation_field_notes;
create policy relocation_field_notes_update
  on public.relocation_field_notes
  for update
  to authenticated
  using (
    company_id = (select company_id from public.current_employee())
    and (
      created_by = (select id from public.current_employee())
      or (select permission from public.current_employee()) = 'admin'
    )
  )
  with check (
    company_id = (select company_id from public.current_employee())
    and (
      created_by = (select id from public.current_employee())
      or (select permission from public.current_employee()) = 'admin'
    )
  );

-- 당일 본인 OR admin 만 삭제. KST 기준.
drop policy if exists relocation_field_notes_delete on public.relocation_field_notes;
create policy relocation_field_notes_delete
  on public.relocation_field_notes
  for delete
  to authenticated
  using (
    company_id = (select company_id from public.current_employee())
    and (
      (select permission from public.current_employee()) = 'admin'
      or (
        created_by = (select id from public.current_employee())
        and (created_at at time zone 'Asia/Seoul')::date
          = (now() at time zone 'Asia/Seoul')::date
      )
    )
  );


-- ===== GRANTS =========================================================
grant select, insert, update, delete on public.relocation_field_notes to authenticated;
grant all on public.relocation_field_notes to service_role;


-- =====================================================================
-- TABLE: relocation_field_note_photos
-- =====================================================================
create table if not exists public.relocation_field_note_photos (
  id          uuid primary key default gen_random_uuid(),
  note_id     uuid not null references public.relocation_field_notes(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  path        text not null,
  taken_at    timestamptz,
  gps_lat     double precision,
  gps_lng     double precision,
  uploaded_by uuid references public.employees(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists relocation_field_note_photos_note_idx
  on public.relocation_field_note_photos(note_id, created_at);

alter table public.relocation_field_note_photos enable row level security;


-- ===== RLS ============================================================

drop policy if exists relocation_field_note_photos_select on public.relocation_field_note_photos;
create policy relocation_field_note_photos_select
  on public.relocation_field_note_photos
  for select
  to authenticated
  using (company_id = (select company_id from public.current_employee()));

drop policy if exists relocation_field_note_photos_insert on public.relocation_field_note_photos;
create policy relocation_field_note_photos_insert
  on public.relocation_field_note_photos
  for insert
  to authenticated
  with check (
    company_id = (select company_id from public.current_employee())
    and uploaded_by = (select id from public.current_employee())
    and exists (
      select 1 from public.relocation_field_notes n
      where n.id = note_id
        and n.company_id = (select company_id from public.current_employee())
    )
  );

-- 사진 삭제: 업로더 본인 OR admin. (note 자체가 cascade 삭제될 땐 별도 검증 X)
drop policy if exists relocation_field_note_photos_delete on public.relocation_field_note_photos;
create policy relocation_field_note_photos_delete
  on public.relocation_field_note_photos
  for delete
  to authenticated
  using (
    company_id = (select company_id from public.current_employee())
    and (
      uploaded_by = (select id from public.current_employee())
      or (select permission from public.current_employee()) = 'admin'
    )
  );


-- ===== GRANTS =========================================================
grant select, insert, delete on public.relocation_field_note_photos to authenticated;
grant all on public.relocation_field_note_photos to service_role;


-- =====================================================================
-- Realtime publication (다른 직원의 노트 추가/변경 즉시 반영)
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.relocation_field_notes;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.relocation_field_note_photos;
    exception when duplicate_object then null;
    end;
  end if;
end
$$;


-- =====================================================================
-- 마이그 0085 완료.
--   ⚠️  Cloudflare R2 콘솔에서 별도 작업:
--       1. 버킷 'relocation-field-notes' 생성 (region: auto, public access 비활성)
--       2. 기존 R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY 가 새 버킷 권한 가지는지 확인
--          (Account-level Object Read & Write 키면 자동 적용)
-- =====================================================================
