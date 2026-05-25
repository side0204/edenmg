import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import {
  ChevronLeft,
  Cable,
  Network,
  Layers,
  Calendar,
  AlertCircle,
  Download,
  Radio,
  ArrowRightLeft,
  ExternalLink,
  Upload,
} from 'lucide-react'
import { Sparkles, Settings, Hammer } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { updateProject, deleteProject } from '../actions'
import FacilitiesTab from './FacilitiesTab'
import CablesTab from './CablesTab'
import CircuitsTab from './CircuitsTab'
import CoresTab from './CoresTab'
import MigrationsTab, {
  type MigrationRow,
  type MigrationCircuitRow,
  type CoreAssignmentForMigration,
} from './MigrationsTab'
import { HighlightProvider } from './HighlightContext'
import { seedTestData } from './seed-actions'
import TopologyCanvas from './TopologyCanvas'
import CollapsibleLayout from './CollapsibleLayout'
import ProgressStepBar, { type ProgressStep } from './ProgressStepBar'
import RealtimeSync from './RealtimeSync'
import { loadRelocationCanvasData } from './canvas-data'
import VerifyTab from './VerifyTab'
import { runVerification } from '@/lib/relocation-verify'
import {
  RELOCATION_CATEGORY_LABEL,
  RELOCATION_CATEGORY_SLUG,
  RELOCATION_CATEGORY_VALUES,
  isRelocationCategory,
  type RelocationCategory,
} from '@/lib/relocation'
import { RelocationWorkerPicker } from '../RelocationWorkerPicker'
import PhasesTab, { type PhaseRow, type PhaseTaskRow } from './PhasesTab'
import ExportTab from './ExportTab'
import SpliceTab, { type SpliceRow } from './SpliceTab'

// 지장이설 프로젝트 상세 — 메인 작업 화면.
// 사양 § 7: 시설·케이블·회선·코어배정·직선도·차수·검증·내보내기 8 탭.
// Step B: facilities/cables/circuits/cores 4 탭 콘텐츠 활성화.
// 나머지 4 탭은 placeholder (Phase 3+).

type TabId =
  | 'facilities'
  | 'cables'
  | 'circuits'
  | 'cores'
  | 'migrations'
  | 'splice'
  | 'phases'
  | 'verify'
  | 'export'

const TABS: { id: TabId; label: string; icon: typeof Cable }[] = [
  { id: 'facilities', label: '시설', icon: Network },
  { id: 'cables', label: '케이블', icon: Cable },
  { id: 'circuits', label: '회선', icon: Radio },
  { id: 'cores', label: '코어배정', icon: Layers },
  { id: 'migrations', label: '철거·이설', icon: ArrowRightLeft },
  { id: 'splice', label: '직선도', icon: Layers },
  { id: 'phases', label: '차수', icon: Calendar },
  { id: 'verify', label: '검증', icon: AlertCircle },
  { id: 'export', label: '내보내기', icon: Download },
]

function isTabId(v: string): v is TabId {
  return TABS.some((t) => t.id === v)
}

type ProjectRow = {
  id: string
  company_id: string
  title: string
  category: string
  client: string
  region: string | null
  surveyed_at: string | null
  designer_id: string | null
  status: string
  notes: string | null
  created_at: string
  updated_at: string
  // 청약 카테고리 전용 (다른 카테고리에선 null)
  subscription_id: string | null
  subscriber_name: string | null
  subscriber_address: string | null
  branch_contact: string | null
  branch_manager: string | null
  subscribed_at: string | null
  desired_open_at: string | null
  order_no: string | null
  expected_completion_at: string | null
  completion_at: string | null
  outside_workers: string | null
  splice_workers: string | null
  subcategory: string | null
  outside_worker_ids: unknown
  splice_worker_ids: unknown
}

type EmployeeMini = { id: string; name: string | null }

export default async function RelocationProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; from?: string }>
}) {
  const { id } = await params
  const { tab: tabRaw, from: fromRaw } = await searchParams
  const tab: TabId = tabRaw && isTabId(tabRaw) ? tabRaw : 'facilities'
  const selectedFromCableId = fromRaw && /^[0-9a-f-]{36}$/i.test(fromRaw) ? fromRaw : null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, name, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | { id: string; company_id: string; name: string; is_active: boolean }
    | null
  if (!me || !me.is_active) {
    redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  }

  const { data: pRow } = await supabase
    .from('relocation_projects')
    .select(
      'id, company_id, title, category, client, region, surveyed_at, designer_id, status, notes, created_at, updated_at, subscription_id, subscriber_name, subscriber_address, branch_contact, branch_manager, subscribed_at, desired_open_at, order_no, expected_completion_at, completion_at, outside_workers, splice_workers, subcategory, outside_worker_ids, splice_worker_ids',
    )
    .eq('id', id)
    .maybeSingle()
  const project = pRow as ProjectRow | null
  if (!project) notFound()

  const projectCategory: RelocationCategory = isRelocationCategory(project.category)
    ? project.category
    : '지장이설'
  const projectCategorySlug = RELOCATION_CATEGORY_SLUG[projectCategory]
  const projectCategoryLabel = RELOCATION_CATEGORY_LABEL[projectCategory]
  const isSubscriptionProject = projectCategory === '청약'

  // 청약 프로젝트 — 외선/접속 작업자 후보 + 현재 배정된 ID 목록
  let outsideCandidates: { id: string; name: string; position: string | null; team: string | null; work_type: string | null }[] = []
  let spliceCandidates: typeof outsideCandidates = []
  if (isSubscriptionProject) {
    const { data: emps } = await supabase
      .from('employees')
      .select('id, name, position, team, work_type')
      .eq('company_id', me.company_id)
      .eq('is_active', true)
      .in('work_type', ['외선팀', '접속팀'])
      .order('name')
    type EmpRow = {
      id: string
      name: string
      position: string | null
      team: string | null
      work_type: string | null
    }
    const allEmps = (emps ?? []) as EmpRow[]
    outsideCandidates = allEmps.filter((e) => e.work_type === '외선팀')
    spliceCandidates = allEmps.filter((e) => e.work_type === '접속팀')
  }
  function safeIdArr(v: unknown): string[] {
    if (!Array.isArray(v)) return []
    return v.filter((x): x is string => typeof x === 'string')
  }
  const outsideInitialIds = safeIdArr(project.outside_worker_ids)
  const spliceInitialIds = safeIdArr(project.splice_worker_ids)

  // 연동된 작업관리 row — 헤더에 "작업관리 보기" 링크 노출
  let linkedWorkId: string | null = null
  if (isSubscriptionProject) {
    const { data: linkedWork } = await supabase
      .from('works')
      .select('id')
      .eq('relocation_project_id', id)
      .maybeSingle()
    linkedWorkId = ((linkedWork as { id: string } | null) ?? null)?.id ?? null
  }

  // 설계자 이름 · 캔버스 공통 데이터 · 접속 · 스플리터 · 차수 · (조건부) 이전 이력 일괄 병렬.
  //   page.tsx 의 router.refresh 체감 속도를 결정 — 직렬이면 합산 4~5초.
  //   designerId 가 없으면 designer 쿼리는 건너뜀(null 반환). migrations 는 탭에서만 필요.
  const [
    designerRow,
    canvasData,
    splRes,
    sptRes,
    phRes,
    migRes,
  ] = await Promise.all([
    project.designer_id
      ? supabase
          .from('employees')
          .select('id, name')
          .eq('id', project.designer_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    loadRelocationCanvasData(id, me.company_id),
    supabase
      .from('relocation_splices')
      .select(
        'id, facility_id, in_cable_id, in_core, out_cable_id, out_core, is_continuous',
      )
      .eq('project_id', id),
    supabase
      .from('relocation_splitters')
      .select('facility_id, input_a_cable_id, input_b_cable_id')
      .eq('project_id', id),
    supabase
      .from('relocation_phases')
      .select(
        'id, phase_no, required_teams, estimated_minutes, status, window_start, window_end',
      )
      .eq('project_id', id)
      .order('phase_no'),
    tab === 'migrations'
      ? supabase
          .from('relocation_migrations')
          .select('id, from_cable_id, to_cable_id, notes, created_at')
          .eq('project_id', id)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: null }),
  ])

  const designerName = ((designerRow.data as EmployeeMini | null)?.name) ?? null
  const {
    facilities,
    cables,
    circuits,
    facilityMasters,
    taskTypes,
    facilityTasks,
    facilityMaterials,
    assignments,
  } = canvasData
  const splices = (splRes.data ?? []) as SpliceRow[]
  const phases = (phRes.data ?? []) as PhaseRow[]

  // 이전 이력 자식 (migrations 결과에 따라 의존성 있어 별도 라운드)
  const migrations = (migRes.data ?? []) as MigrationRow[]
  let migrationCircuits: MigrationCircuitRow[] = []

  // 차수별 작업 (차수 탭) + migration_circuits (migrations 탭) — 부모 결과 의존이라 2라운드.
  //   각각 조건부라 추가 라운드 비용은 해당 탭일 때만.
  let phaseTasks: PhaseTaskRow[] = []
  if (tab === 'phases' && phases.length > 0) {
    const { data: ptRows } = await supabase
      .from('relocation_phase_tasks')
      .select(
        'id, phase_id, facility_id, task_kind, estimated_minutes, simultaneity_group',
      )
      .in(
        'phase_id',
        phases.map((p) => p.id),
      )
    phaseTasks = (ptRows ?? []) as PhaseTaskRow[]
  }

  if (tab === 'migrations' && migrations.length > 0) {
    const migIds = migrations.map((m) => m.id)
    const { data: mcRows } = await supabase
      .from('relocation_migration_circuits')
      .select('migration_id, circuit_id, segment_idx')
      .in('migration_id', migIds)
    migrationCircuits = (mcRows ?? []) as MigrationCircuitRow[]
  }

  // 검증 — 모든 탭에서 실행 (진행 표시줄·검증 탭 배지·검증 탭 콘텐츠 공용)
  const verifyResult = runVerification({
    facilities: facilities.map((f) => ({
      id: f.id,
      closure_type: f.closure_type,
      seq_no: f.seq_no,
      name: f.name,
      closure_spec: f.closure_spec,
      install_status: f.install_status,
    })),
    cables: cables.map((c) => ({
      id: c.id,
      from_facility_id: c.from_facility_id,
      to_facility_id: c.to_facility_id,
      spec: c.spec,
      status: c.status,
      cable_code: c.cable_code,
    })),
    circuits: circuits.map((c) => ({
      id: c.id,
      circuit_id: c.circuit_id,
      kind: c.kind,
    })),
    assignments: assignments.map((a) => ({
      circuit_id: a.circuit_id,
      segment_idx: a.segment_idx,
      cable_id: a.cable_id,
      is_terminal: a.is_terminal,
    })),
    splices: splices.map((s) => ({
      facility_id: s.facility_id,
      in_cable_id: s.in_cable_id,
      in_core: s.in_core,
      out_cable_id: s.out_cable_id,
      out_core: s.out_core,
    })),
    splitters: (sptRes.data ?? []) as {
      facility_id: string
      input_a_cable_id: string | null
      input_b_cable_id: string | null
    }[],
    facilityTasks: facilityTasks.map((t) => ({ facility_id: t.facility_id })),
  })

  // ── 진행 표시줄 단계 + 탭 배지 ──
  // 코어 배정이 하나도 없는 회선 수 — "코어배정" 탭 배지·진행 판정에 사용
  const assignedCircuitIds = new Set(
    assignments.map((a) => a.circuit_id).filter((cid): cid is string => !!cid),
  )
  const unassignedCircuitCount = circuits.filter(
    (c) => !assignedCircuitIds.has(c.id),
  ).length

  const steps: ProgressStep[] = [
    {
      tab: 'facilities',
      label: '시설',
      done: facilities.length > 0,
      detail: facilities.length > 0 ? `시설 ${facilities.length}개` : undefined,
    },
    {
      tab: 'cables',
      label: '케이블',
      done: cables.length > 0,
      detail: cables.length > 0 ? `케이블 ${cables.length}개` : undefined,
    },
    {
      tab: 'cores',
      label: '회선·코어',
      done: circuits.length > 0 && unassignedCircuitCount === 0,
      detail:
        circuits.length > 0
          ? unassignedCircuitCount > 0
            ? `미배정 ${unassignedCircuitCount}`
            : `회선 ${circuits.length}`
          : undefined,
    },
    {
      tab: 'verify',
      label: '검증',
      done: cables.length > 0 && verifyResult.redCount === 0,
      warn: verifyResult.redCount > 0,
      detail:
        verifyResult.redCount > 0
          ? `오류 ${verifyResult.redCount}`
          : verifyResult.yellowCount > 0
            ? `주의 ${verifyResult.yellowCount}`
            : undefined,
    },
    {
      tab: 'phases',
      label: '차수',
      done: phases.length > 0,
      detail: phases.length > 0 ? `${phases.length}차수` : undefined,
    },
    {
      tab: 'export',
      label: '내보내기',
      done: project.status === '완료',
    },
  ]

  // 탭 배지 — 클릭하지 않아도 할 일이 보이게
  const tabBadges: Partial<Record<TabId, { count: number; tone: 'red' | 'amber' }>> = {}
  if (verifyResult.redCount > 0) {
    tabBadges.verify = { count: verifyResult.redCount, tone: 'red' }
  } else if (verifyResult.yellowCount > 0) {
    tabBadges.verify = { count: verifyResult.yellowCount, tone: 'amber' }
  }
  if (unassignedCircuitCount > 0) {
    tabBadges.cores = { count: unassignedCircuitCount, tone: 'amber' }
  }

  const topPanel = (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-3 sm:pt-4 space-y-3 lg:space-y-2">
      <header>
          <Link
            href={`/relocation/category/${projectCategorySlug}`}
            className="inline-flex items-center gap-1 text-xs lg:text-[11px] text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {projectCategoryLabel} 목록
          </Link>
          <div className="mt-1 space-y-2 sm:space-y-0 sm:flex sm:items-start sm:justify-between sm:gap-3">
            <div className="min-w-0">
              <h1 className="text-xl lg:text-lg font-bold text-slate-900 tracking-tight break-keep">
                {project.title}
              </h1>
              <p className="mt-0.5 text-xs lg:text-[11px] text-slate-500">
                {projectCategoryLabel} · {project.client} · {project.region ?? '지역 미정'}
                {project.surveyed_at && ` · 계약 ${project.surveyed_at}`}
                {designerName && ` · 설계자 ${designerName}`}
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-2 self-start">
              {linkedWorkId && (
                <Link
                  href={`/works/${linkedWorkId}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
                  title="작업관리에서 일보·진행 현황 보기"
                >
                  <Hammer className="h-4 w-4" />
                  작업관리 보기
                </Link>
              )}
              <Link
                href={`/relocation/${id}/import`}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Upload className="h-4 w-4" />
                데이터 가져오기
              </Link>
              <Link
                href={`/relocation/${id}/canvas`}
                target="_blank"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ExternalLink className="h-4 w-4" />
                넓은 화면으로 열기
              </Link>
              <span className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-sm font-medium text-white">
                {project.status}
              </span>
            </div>
          </div>
        </header>

        {/* 빈 프로젝트에 시드 데이터 채우기 안내 — 지장이설 카테고리에서만 (실제 LGU+ 임포트 구현 전 임시) */}
        {facilities.length === 0 && projectCategory === '지장이설' && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="space-y-2 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-900">테스트 데이터 채우기</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  실제 LGU+ 엑셀 임포트 기능은 별도 구현 예정. 우선 UI 동작 확인을 위해 임의의 미니
                  시나리오(시설 7·케이블 6·회선 4)를 자동 생성할 수 있습니다.
                </p>
              </div>
              <form action={seedTestData} className="shrink-0">
                <input type="hidden" name="project_id" value={project.id} />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
                >
                  <Sparkles className="h-4 w-4" />
                  테스트 데이터 채우기
                </button>
              </form>
            </div>
          </section>
        )}

        <ProjectInfoSettings />
    </div>
  )

  const tabPanel = (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 space-y-5 py-3">
        {/* 탭 바 */}
        <nav className="sticky top-0 z-10 -mx-4 sm:-mx-6 bg-slate-50/80 backdrop-blur border-b border-slate-200">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 flex overflow-x-auto gap-1 py-2">
            {TABS.map((t) => {
              const Icon = t.icon
              const active = tab === t.id
              const badge = tabBadges[t.id]
              return (
                <Link
                  key={t.id}
                  href={`/relocation/${id}?tab=${t.id}`}
                  className={
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium shrink-0 ' +
                    (active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200')
                  }
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                  {badge && (
                    <span
                      className={
                        'inline-flex min-w-[1.1rem] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none ' +
                        (active
                          ? badge.tone === 'red'
                            ? 'bg-white text-rose-600'
                            : 'bg-white text-amber-600'
                          : badge.tone === 'red'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-amber-100 text-amber-700')
                      }
                    >
                      {badge.count}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        </nav>

        {/* 탭 콘텐츠 — 시설 목록은 「시설」 탭과 캔버스 좌측 사이드바에 있으므로 별도 패널 제거 */}
        <section>
          <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4 sm:p-6 min-w-0">
            {tab === 'facilities' && (
              <FacilitiesTab projectId={project.id} facilities={facilities} />
            )}
            {tab === 'cables' && (
              <CablesTab projectId={project.id} cables={cables} facilities={facilities} />
            )}
            {tab === 'circuits' && (
              <CircuitsTab projectId={project.id} circuits={circuits} />
            )}
            {tab === 'cores' && (
              <CoresTab
                projectId={project.id}
                assignments={assignments}
                circuits={circuits}
                cables={cables.map((c) => {
                  const from = facilities.find((f) => f.id === c.from_facility_id)
                  const to = facilities.find((f) => f.id === c.to_facility_id)
                  const fromName = from?.name ?? '?'
                  const toName = to?.name ?? '?'
                  return {
                    id: c.id,
                    cable_code: c.cable_code,
                    spec: c.spec,
                    segment_label: `${fromName} ~ ${toName} · ${c.spec}`,
                  }
                })}
              />
            )}
            {tab === 'migrations' && (
              <MigrationsTab
                projectId={project.id}
                cables={cables.map((c) => ({
                  id: c.id,
                  cable_code: c.cable_code,
                  spec: c.spec,
                  status: c.status,
                  from_facility_id: c.from_facility_id,
                  to_facility_id: c.to_facility_id,
                }))}
                facilities={facilities.map((f) => ({
                  id: f.id,
                  closure_type: f.closure_type,
                  seq_no: f.seq_no,
                  name: f.name,
                }))}
                assignments={assignments.map(
                  (a): CoreAssignmentForMigration => ({
                    cable_id: a.cable_id,
                    circuit_id: a.circuit_id,
                    segment_idx: a.segment_idx,
                    core_range_start: a.core_range_start,
                    core_range_end: a.core_range_end,
                  }),
                )}
                circuits={circuits.map((c) => ({
                  id: c.id,
                  circuit_id: c.circuit_id,
                  subscriber_name: c.subscriber_name,
                  kind: c.kind,
                }))}
                migrations={migrations}
                migrationCircuits={migrationCircuits}
                selectedFromCableId={selectedFromCableId}
              />
            )}
            {tab === 'verify' && (
              <VerifyTab result={verifyResult} facilityCount={facilities.length} />
            )}
            {tab === 'phases' && (
              <PhasesTab
                projectId={project.id}
                phases={phases}
                phaseTasks={phaseTasks}
                facilities={facilities.map((f) => ({
                  id: f.id,
                  closure_type: f.closure_type,
                  seq_no: f.seq_no,
                  name: f.name,
                  work_window_start: f.work_window_start,
                  work_window_end: f.work_window_end,
                }))}
              />
            )}
            {tab === 'export' && (
              <ExportTab
                projectId={project.id}
                facilities={facilities.map((f) => ({
                  id: f.id,
                  closure_type: f.closure_type,
                  seq_no: f.seq_no,
                  name: f.name,
                }))}
                cables={cables.map((c) => ({
                  from_facility_id: c.from_facility_id,
                  to_facility_id: c.to_facility_id,
                  spec: c.spec,
                  status: c.status,
                  cable_code: c.cable_code,
                  installation_type: c.installation_type,
                  total_length: c.total_length,
                }))}
                facilityTasks={facilityTasks.map((t) => ({
                  facility_id: t.facility_id,
                  task_type_id: t.task_type_id,
                  quantity: t.quantity,
                }))}
                facilityMaterials={facilityMaterials.map((m) => ({
                  facility_id: m.facility_id,
                  name: m.name,
                  spec: m.spec,
                  unit: m.unit,
                  quantity: m.quantity,
                }))}
                taskTypes={taskTypes.map((t) => ({
                  id: t.id,
                  name: t.name,
                  unit_label: t.unit_label,
                }))}
                circuitCount={circuits.length}
                coreAssignmentCount={assignments.length}
              />
            )}
            {tab === 'splice' && (
              <SpliceTab
                projectId={project.id}
                facilities={facilities.map((f) => ({
                  id: f.id,
                  closure_type: f.closure_type,
                  seq_no: f.seq_no,
                  name: f.name,
                }))}
                cables={cables.map((c) => ({
                  id: c.id,
                  from_facility_id: c.from_facility_id,
                  to_facility_id: c.to_facility_id,
                  cable_code: c.cable_code,
                  spec: c.spec,
                }))}
                splices={splices}
              />
            )}
          </div>
        </section>
    </div>
  )

  // 프로젝트 정보·설정 — 2026-05-25 owner 요청으로 하단 → 상단 이동
  //   function 선언은 함수 본문 안에서 hoisted → topPanel JSX 가 먼저 와도 OK
  function ProjectInfoSettings() {
    if (!project) return null // 안전 가드 — 페이지가 이미 notFound 처리, 닫힌 클로저 TS 좁히기용
    return (
        <details className="rounded-2xl bg-white shadow-sm border border-slate-200">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl px-6 py-4 lg:px-4 lg:py-2.5 text-base lg:text-sm font-semibold tracking-tight text-slate-900 hover:bg-slate-50">
            <Settings className="h-4 w-4 lg:h-3.5 lg:w-3.5 text-slate-500" />
            프로젝트 정보·설정
          </summary>
          <div className="space-y-4 lg:space-y-2 px-6 pb-6 lg:px-4 lg:pb-3">

          {/* lg+ 에서 descendant 글자·padding 일괄 축소 (arbitrary variant) */}
          <form
            action={updateProject}
            className="space-y-3 lg:space-y-1.5
              lg:[&_label]:text-[11px]
              lg:[&_input]:text-xs lg:[&_input]:py-1 lg:[&_input]:px-2 lg:[&_input]:mt-0.5
              lg:[&_select]:text-xs lg:[&_select]:py-1 lg:[&_select]:px-2 lg:[&_select]:mt-0.5
              lg:[&_textarea]:text-xs lg:[&_textarea]:py-1 lg:[&_textarea]:px-2 lg:[&_textarea]:mt-0.5
              lg:[&_p]:text-[10px]
              lg:[&_.grid]:gap-2"
          >
            <input type="hidden" name="id" value={project.id} />

            <div>
              <label className="block text-sm font-medium text-slate-700">공사 분류</label>
              <select
                name="category"
                defaultValue={projectCategory}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
              >
                {RELOCATION_CATEGORY_VALUES.map((c) => (
                  <option key={c} value={c}>
                    {RELOCATION_CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                {isSubscriptionProject ? '청약명' : '제목'}
              </label>
              <input
                type="text"
                name="title"
                required
                defaultValue={project.title}
                maxLength={200}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
              />
            </div>

            {isSubscriptionProject && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">청약ID</label>
                    <input
                      type="text"
                      name="subscription_id"
                      defaultValue={project.subscription_id ?? ''}
                      maxLength={100}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">공사번호</label>
                    <input
                      type="text"
                      name="order_no"
                      defaultValue={project.order_no ?? ''}
                      maxLength={100}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">가입자명</label>
                    <input
                      type="text"
                      name="subscriber_name"
                      defaultValue={project.subscriber_name ?? ''}
                      maxLength={100}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">지역</label>
                    <select
                      name="region"
                      defaultValue={project.region ?? ''}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                    >
                      <option value="">(선택 없음)</option>
                      <option value="시흥시">시흥시</option>
                      <option value="남동구">남동구</option>
                      <option value="기타">기타</option>
                      {project.region &&
                        !['시흥시', '남동구', '기타'].includes(project.region) && (
                          <option value={project.region}>{project.region} (기존)</option>
                        )}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">가입자 주소</label>
                  <input
                    type="text"
                    name="subscriber_address"
                    defaultValue={project.subscriber_address ?? ''}
                    maxLength={300}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">하위국 담당자</label>
                    <input
                      type="text"
                      name="branch_manager"
                      defaultValue={project.branch_manager ?? ''}
                      maxLength={100}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">하위국 연락처</label>
                    <input
                      type="text"
                      name="branch_contact"
                      defaultValue={project.branch_contact ?? ''}
                      maxLength={100}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">청약일</label>
                    <input
                      type="date"
                      name="subscribed_at"
                      defaultValue={project.subscribed_at ?? ''}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">개통희망일</label>
                    <input
                      type="date"
                      name="desired_open_at"
                      defaultValue={project.desired_open_at ?? ''}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    청약 분류 <span className="text-rose-600">*</span>
                  </label>
                  <select
                    name="subcategory"
                    required
                    defaultValue={project.subcategory ?? ''}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                  >
                    <option value="" disabled>
                      선택하세요
                    </option>
                    {['소호', 'FTTH', '모바일', '전용회선', '다회선', '아파트'].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">공사계약일</label>
                    <input
                      type="date"
                      name="surveyed_at"
                      defaultValue={project.surveyed_at ?? ''}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">준공예정일</label>
                    <input
                      type="date"
                      name="expected_completion_at"
                      defaultValue={project.expected_completion_at ?? ''}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">작업완료일</label>
                    <input
                      type="date"
                      name="completion_at"
                      defaultValue={project.completion_at ?? ''}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">작업자배정</label>
                  <div className="mt-1 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 p-2 bg-orange-50/40">
                      <label className="block text-xs text-orange-700 font-semibold">
                        외선 ({outsideCandidates.length}명 가능)
                      </label>
                      <div className="mt-1">
                        <RelocationWorkerPicker
                          name="outside_worker_ids"
                          label="외선"
                          candidates={outsideCandidates}
                          initialIds={outsideInitialIds}
                        />
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-2 bg-blue-50/40">
                      <label className="block text-xs text-blue-700 font-semibold">
                        접속 ({spliceCandidates.length}명 가능)
                      </label>
                      <div className="mt-1">
                        <RelocationWorkerPicker
                          name="splice_worker_ids"
                          label="접속"
                          candidates={spliceCandidates}
                          initialIds={spliceInitialIds}
                        />
                      </div>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    저장 시 작업관리(/works)에 자동 동기화돼 배정 작업자에게 일보 작성 진입점이
                    노출됩니다.
                  </p>
                </div>
              </>
            )}

            {/* 계획·지장이설 카테고리: 지역 + 공사계약일 */}
            {!isSubscriptionProject && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">지역</label>
                  <select
                    name="region"
                    defaultValue={project.region ?? ''}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                  >
                    <option value="">(선택 없음)</option>
                    <option value="시흥시">시흥시</option>
                    <option value="남동구">남동구</option>
                    <option value="기타">기타</option>
                    {project.region &&
                      !['시흥시', '남동구', '기타'].includes(project.region) && (
                        <option value={project.region}>{project.region} (기존)</option>
                      )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">공사계약일</label>
                  <input
                    type="date"
                    name="surveyed_at"
                    defaultValue={project.surveyed_at ?? ''}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700">상태</label>
              <select
                name="status"
                defaultValue={project.status}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
              >
                <option value="설계중">설계중</option>
                <option value="검증중">검증중</option>
                <option value="확정">확정</option>
                <option value="시공중">시공중</option>
                <option value="완료">완료</option>
                <option value="취소">취소</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">비고</label>
              <textarea
                name="notes"
                rows={3}
                defaultValue={project.notes ?? ''}
                maxLength={1000}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
              />
            </div>

            <input type="hidden" name="designer_id" value={project.designer_id ?? ''} />

            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                저장
              </button>
            </div>
          </form>

          <details className="pt-3 border-t border-slate-200">
            <summary className="cursor-pointer text-sm text-rose-600 hover:underline">
              프로젝트 삭제
            </summary>
            <form action={deleteProject} className="mt-3 space-y-3">
              <input type="hidden" name="id" value={project.id} />
              <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
                ⚠ 삭제하면 시설·케이블·회선·코어배정·차수까지 모두 함께 삭제됩니다 (cascade).
                되돌릴 수 없습니다.
              </p>
              <button
                type="submit"
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
              >
                영구 삭제
              </button>
            </form>
          </details>
          </div>
        </details>
    )
  }

  const canvasPanel = (
    <div className="px-4 sm:px-6 my-2">
      <TopologyCanvas
        projectId={project.id}
        facilities={facilities.map((f) => ({
          id: f.id,
          closure_type: f.closure_type,
          seq_no: f.seq_no,
          name: f.name,
          facility_code: f.facility_code ?? null,
          closure_spec: f.closure_spec,
          install_address: f.install_address,
          notes: f.notes,
          inspection_request: f.inspection_request ?? null,
          parent_facility_id: f.parent_facility_id,
          is_marked: f.is_marked,
          mark_note: f.mark_note ?? null,
          work_window_start: f.work_window_start,
          work_window_end: f.work_window_end,
          x_hint: f.x_hint ?? null,
          y_hint: f.y_hint ?? null,
          lat: f.lat ?? null,
          lng: f.lng ?? null,
          created_at: f.created_at ?? null,
          install_status: f.install_status ?? 'new',
          label_dx: f.label_dx ?? 0,
          label_dy: f.label_dy ?? 0,
          install_order: f.install_order ?? null,
          created_by: f.created_by ?? null,
        }))}
        cables={cables.map((c) => ({
          id: c.id,
          from_facility_id: c.from_facility_id,
          to_facility_id: c.to_facility_id,
          spec: c.spec,
          status: c.status,
          cable_code: c.cable_code,
          installation_type: c.installation_type,
          waypoints: Array.isArray(c.waypoints) ? c.waypoints : [],
          mapWaypoints: Array.isArray(c.map_waypoints) ? c.map_waypoints : [],
          total_length: c.total_length,
          end_distance: c.end_distance,
          created_by: c.created_by ?? null,
        }))}
        editable={true}
        facilityMasters={facilityMasters}
        taskTypes={taskTypes}
        facilityTasks={facilityTasks}
        facilityMaterials={facilityMaterials}
        circuits={circuits}
        coreAssignments={assignments}
        myEmployeeId={me.id}
        tabPanel={tabPanel}
        tabPanelDefaultOpen={!!tabRaw}
      />
    </div>
  )

  return (
    <main className="min-h-screen pb-6">
      <HighlightProvider>
        <RealtimeSync projectId={id} selfEmployeeId={me.id} selfName={me.name} />
        <div className="mx-auto max-w-6xl px-4 pt-3 sm:px-6">
          <ProgressStepBar projectId={id} steps={steps} currentTab={tab} />
        </div>
        <CollapsibleLayout topPanel={topPanel} canvas={canvasPanel} />
      </HighlightProvider>
    </main>
  )
}
