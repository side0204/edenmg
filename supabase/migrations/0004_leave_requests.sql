-- =====================================================================
-- edenMG  M2 근태·결재 (2/2)
-- Migration 0004 — leave_requests(휴가/외근 신청) +
--                  leave_request_approvals(append-only 결재 로그) + RLS
--
-- 실행 방법
--   Supabase Dashboard → SQL Editor → New query → 전체 복사·붙여넣기 → Run
--
-- 멱등(여러 번 실행 가능). 0001, 0002, 0003 이 먼저 실행돼 있어야 한다.
-- =====================================================================


-- ===== ENUMs ==========================================================
-- 신청서 종류. owner 결정: 연차, 반차(오전/오후), 반반차(오전/오후), 병가, 공가, 외근.
do $$
begin
  create type public.leave_type as enum
    ('연차', '반차_오전', '반차_오후', '반반차_오전', '반반차_오후', '병가', '공가', '외근');
exception when duplicate_object then null;
end $$;

-- 결재 진행 상태.
do $$
begin
  create type public.leave_status as enum ('대기', '승인', '반려', '취소');
exception when duplicate_object then null;
end $$;

-- 현재 어느 단계의 결재가 필요한지. 처리 끝나면 null.
do $$
begin
  create type public.leave_stage as enum ('foreman', 'admin');
exception when duplicate_object then null;
end $$;

-- 결재 로그의 액션 종류. '전결' = 관리자/대표가 결재선 무관하게 단독 승인.
do $$
begin
  create type public.leave_action as enum ('신청', '승인', '반려', '전결', '취소');
exception when duplicate_object then null;
end $$;


-- ===== TABLE: leave_requests ==========================================
-- 한 건의 신청서. 본문 + 현재 상태만. 결재 이력은 별도 audit 테이블.
create table if not exists public.leave_requests (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete restrict,
  employee_id           uuid not null references public.employees(id) on delete cascade,
  type                  public.leave_type not null,

  -- 기간 — 연차는 여러 날 가능, 반차/반반차/외근은 보통 하루.
  start_date            date not null,
  end_date              date not null,
  -- 외근·반반차 등 시간 단위 신청은 함께 채움. 그 외엔 null.
  start_time            time,
  end_time              time,

  reason                text not null,
  attachment_path       text,  -- Supabase Storage 키 (leave-attachments 버킷). 없으면 null.

  is_urgent             boolean not null default false,

  -- 결재 라인의 1차 결재자. 신청 시점에 신청자가 직접 지정.
  -- null 이면 소장 단계를 건너뛰고 곧장 관리자/대표 단계로.
  assigned_foreman_id   uuid references public.employees(id) on delete set null,

  status                public.leave_status not null default '대기',
  pending_stage         public.leave_stage,  -- 처리 완료 시 null
  final_actor_id        uuid references public.employees(id) on delete set null,
  final_acted_at        timestamptz,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  check (end_date >= start_date),
  check ((start_time is null) = (end_time is null))
);

alter table public.leave_requests enable row level security;

create index if not exists leave_requests_company_status_idx  on public.leave_requests(company_id, status);
create index if not exists leave_requests_employee_idx        on public.leave_requests(employee_id, created_at desc);
create index if not exists leave_requests_pending_foreman_idx on public.leave_requests(assigned_foreman_id) where pending_stage = 'foreman';
create index if not exists leave_requests_pending_admin_idx   on public.leave_requests(company_id)         where pending_stage = 'admin';


-- ===== TABLE: leave_request_approvals (append-only) ===================
-- 모든 결재 이력. UPDATE/DELETE 금지(GRANT 미부여 + RLS 정책 없음).
-- 산안법/중대재해처벌법 대비 audit trail 패턴의 시작.
create table if not exists public.leave_request_approvals (
  id                  uuid primary key default gen_random_uuid(),
  leave_request_id    uuid not null references public.leave_requests(id) on delete cascade,
  actor_employee_id   uuid not null references public.employees(id) on delete restrict,
  action              public.leave_action not null,
  comment             text,
  acted_at            timestamptz not null default now()
);

alter table public.leave_request_approvals enable row level security;

create index if not exists leave_approvals_request_idx on public.leave_request_approvals(leave_request_id, acted_at);


-- ===== updated_at 자동 갱신 ===========================================
-- touch_updated_at() 함수는 0003 에서 이미 생성됨.
drop trigger if exists leave_requests_touch_updated_at on public.leave_requests;
create trigger leave_requests_touch_updated_at
  before update on public.leave_requests
  for each row execute function public.touch_updated_at();


-- ===== RLS: leave_requests ============================================
-- 신청자 본인 / 같은 회사의 관리자·대표 / 본인이 지정 결재자(소장)인 건.
drop policy if exists leave_requests_select on public.leave_requests;
create policy leave_requests_select
  on public.leave_requests
  for select
  using (
    employee_id = (select id from public.current_employee())
    or assigned_foreman_id = (select id from public.current_employee())
    or (
      company_id = (select company_id from public.current_employee())
      and (select permission from public.current_employee()) in ('admin', 'ceo')
    )
  );

-- 신청: 본인 행만.
drop policy if exists leave_requests_insert_self on public.leave_requests;
create policy leave_requests_insert_self
  on public.leave_requests
  for insert
  with check (
    employee_id = (select id from public.current_employee())
    and company_id = (select company_id from public.current_employee())
  );

-- 수정:
--   - 신청자 본인: status='대기' 인 동안만 (결재 들어가면 못 고침). 취소도 여기서.
--   - 지정 소장: 본인 단계(pending_stage='foreman') 일 때 결재 액션을 위해.
--   - 관리자/대표: 같은 회사면 언제든 (전결·번복 포함).
-- 비즈니스 로직(상태 전이의 정합성)은 server action 에서 강제.
drop policy if exists leave_requests_update on public.leave_requests;
create policy leave_requests_update
  on public.leave_requests
  for update
  using (
    (employee_id = (select id from public.current_employee()) and status = '대기')
    or (assigned_foreman_id = (select id from public.current_employee()) and pending_stage = 'foreman')
    or (
      company_id = (select company_id from public.current_employee())
      and (select permission from public.current_employee()) in ('admin', 'ceo')
    )
  )
  with check (
    company_id = (select company_id from public.current_employee())
  );

-- delete 정책 없음 → 신청서 자체 삭제 불가. 취소는 status 변경으로.


-- ===== RLS: leave_request_approvals ===================================
-- select: 같은 회사 전부. 신청서가 보이는 사람은 그 로그도 봐야 함.
--         (좁히려면 EXISTS 서브쿼리로 신청서 RLS 와 매칭해야 하나
--          비용 대비 실익이 적어서 MVP 는 company 단위로 둠.)
drop policy if exists leave_approvals_select on public.leave_request_approvals;
create policy leave_approvals_select
  on public.leave_request_approvals
  for select
  using (
    exists (
      select 1
      from public.leave_requests lr
      where lr.id = leave_request_id
        and lr.company_id = (select company_id from public.current_employee())
    )
  );

-- insert: actor 가 본인이어야 함. 어느 신청서에 대해 무엇을 기록할 수 있는지는
--         server action 에서 검증 (RLS 는 단순 안전망).
drop policy if exists leave_approvals_insert_self on public.leave_request_approvals;
create policy leave_approvals_insert_self
  on public.leave_request_approvals
  for insert
  with check (
    actor_employee_id = (select id from public.current_employee())
  );

-- update/delete 정책 없음 → append-only.


-- ===== GRANTS =========================================================
grant select, insert, update on public.leave_requests          to authenticated;
grant select, insert         on public.leave_request_approvals to authenticated;
-- approvals 는 insert 만. update/delete 권한 자체를 부여하지 않음.
