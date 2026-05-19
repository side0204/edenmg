-- =====================================================================
-- edenMG  M4 자재관리 Phase 2-A
-- Migration 0026 — 자재 사용 승인 + 초과 사용 + 취득사유 + 저비용 토글
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0025 가 먼저.
--
-- 정책 요약 (owner 결정):
--   - materials.low_value: 자재담당자가 등록 시 체크. 지입+저비용 자재는 작업외 사용 시 사후신고.
--   - daily_report_materials 에 컬럼 추가:
--       approval_status (자동승인/대기/승인/반려/사후신고)
--       over_quantity, over_reason            — 잔량 초과 사용
--       acquisition_reason_type, acquisition_reason — 미출고 자재 사용 시 취득사유
--       approved_by/approved_at/approval_comment
--   - holding.work_id ≠ 일보.work_id 일 때:
--       지입 + low_value → 사후신고 (즉시 차감)
--       그 외 → 사전 승인 대기 (승인 후 차감)
--   - 미출고 자재 (holding 없음) → 취득사유 필수 + 사후신고
-- =====================================================================


-- ===== materials.low_value ============================================
alter table public.materials
  add column if not exists low_value boolean not null default false;


-- ===== daily_report_materials 확장 ====================================
alter table public.daily_report_materials
  add column if not exists approval_status text not null default '자동승인'
    check (approval_status in ('자동승인', '대기', '승인', '반려', '사후신고')),
  add column if not exists approved_by         uuid references public.employees(id) on delete set null,
  add column if not exists approved_at         timestamptz,
  add column if not exists approval_comment    text,
  add column if not exists over_quantity       numeric(14, 3) not null default 0 check (over_quantity >= 0),
  add column if not exists over_reason         text,
  add column if not exists acquisition_reason_type text
    check (acquisition_reason_type in ('현장구매', '이전잔여', '임시차용', '기타')),
  add column if not exists acquisition_reason  text;

-- 초과 사용 시 사유 필수, 미출고 사용 시 취득사유 필수
alter table public.daily_report_materials
  drop constraint if exists daily_report_materials_over_chk;
alter table public.daily_report_materials
  add constraint daily_report_materials_over_chk check (
    over_quantity = 0
    or (over_reason is not null and length(btrim(over_reason)) > 0)
  );

alter table public.daily_report_materials
  drop constraint if exists daily_report_materials_acq_chk;
alter table public.daily_report_materials
  add constraint daily_report_materials_acq_chk check (
    holding_id is not null
    or (acquisition_reason_type is not null and acquisition_reason is not null and length(btrim(acquisition_reason)) > 0)
  );

create index if not exists daily_report_materials_pending_idx
  on public.daily_report_materials(approval_status)
  where approval_status = '대기';


-- ===== connection_node_materials — 동일 컬럼 (Phase 1.5 통합 대비) ===
alter table public.connection_node_materials
  add column if not exists approval_status text not null default '자동승인'
    check (approval_status in ('자동승인', '대기', '승인', '반려', '사후신고')),
  add column if not exists approved_by         uuid references public.employees(id) on delete set null,
  add column if not exists approved_at         timestamptz,
  add column if not exists approval_comment    text,
  add column if not exists over_quantity       numeric(14, 3) not null default 0 check (over_quantity >= 0),
  add column if not exists over_reason         text,
  add column if not exists acquisition_reason_type text
    check (acquisition_reason_type in ('현장구매', '이전잔여', '임시차용', '기타')),
  add column if not exists acquisition_reason  text;

create index if not exists connection_node_materials_pending_idx
  on public.connection_node_materials(approval_status)
  where approval_status = '대기';


-- ===== RLS 보강: 자재담당자가 일보 자재 row 승인 가능 ================
-- 기존 정책 (daily_report_materials_all) 은 같은 회사 select + 작성자+대기 등 update.
-- 자재담당자(admin 또는 can_manage_stock) 가 모든 일보 자재 row 를 update 할 수 있게 추가 정책.
-- (drop + recreate 가 아닌 정책 추가)
drop policy if exists daily_report_materials_stock_manager on public.daily_report_materials;
create policy daily_report_materials_stock_manager
  on public.daily_report_materials
  for update
  using (
    exists (
      select 1 from public.work_daily_reports r
      join public.works w on w.id = r.work_id
      where r.id = daily_report_materials.report_id
        and w.company_id = (select company_id from public.current_employee())
        and (
          (select permission from public.current_employee()) in ('admin', 'ceo')
          or (select can_manage_stock from public.current_employee()) = true
        )
    )
  )
  with check (
    exists (
      select 1 from public.work_daily_reports r
      join public.works w on w.id = r.work_id
      where r.id = daily_report_materials.report_id
        and w.company_id = (select company_id from public.current_employee())
    )
  );

drop policy if exists connection_node_materials_stock_manager on public.connection_node_materials;
create policy connection_node_materials_stock_manager
  on public.connection_node_materials
  for update
  using (
    exists (
      select 1 from public.connection_reports r
      join public.works w on w.id = r.work_id
      where r.id = connection_node_materials.report_id
        and w.company_id = (select company_id from public.current_employee())
        and (
          (select permission from public.current_employee()) in ('admin', 'ceo')
          or (select can_manage_stock from public.current_employee()) = true
        )
    )
  )
  with check (
    exists (
      select 1 from public.connection_reports r
      join public.works w on w.id = r.work_id
      where r.id = connection_node_materials.report_id
        and w.company_id = (select company_id from public.current_employee())
    )
  );
