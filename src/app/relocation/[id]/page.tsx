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
} from 'lucide-react'
import { Sparkles } from 'lucide-react'
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
import LeftPanel from './LeftPanel'
import { HighlightProvider } from './HighlightContext'
import { seedTestData } from './seed-actions'
import TopologyCanvas from './TopologyCanvas'
import CollapsibleLayout from './CollapsibleLayout'
import { loadRelocationCanvasData } from './canvas-data'
import VerifyTab from './VerifyTab'
import { runVerification, type VerifyResult } from '@/lib/relocation-verify'
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
  { id: 'migrations', label: '이전', icon: ArrowRightLeft },
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
  client: string
  region: string | null
  surveyed_at: string | null
  designer_id: string | null
  status: string
  notes: string | null
  created_at: string
  updated_at: string
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
    .select('id, company_id, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; company_id: string; is_active: boolean } | null
  if (!me || !me.is_active) {
    redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  }

  const { data: pRow } = await supabase
    .from('relocation_projects')
    .select(
      'id, company_id, title, client, region, surveyed_at, designer_id, status, notes, created_at, updated_at',
    )
    .eq('id', id)
    .maybeSingle()
  const project = pRow as ProjectRow | null
  if (!project) notFound()

  // 설계자 이름
  let designerName: string | null = null
  if (project.designer_id) {
    const { data: e } = await supabase
      .from('employees')
      .select('id, name')
      .eq('id', project.designer_id)
      .maybeSingle()
    designerName = ((e as EmployeeMini | null)?.name) ?? null
  }

  // 캔버스·탭 공통 데이터 (시설·케이블·회선·시설마스터·공종·코어배정).
  // 전체화면 캔버스 라우트와 동일 — canvas-data.ts 로 일원화.
  const {
    facilities,
    cables,
    circuits,
    facilityMasters,
    taskTypes,
    facilityTasks,
    facilityMaterials,
    assignments,
  } = await loadRelocationCanvasData(id, me.company_id)

  // 이전 이력 (migrations 탭 전용)
  let migrations: MigrationRow[] = []
  let migrationCircuits: MigrationCircuitRow[] = []
  if (tab === 'migrations') {
    const { data: mRows } = await supabase
      .from('relocation_migrations')
      .select('id, from_cable_id, to_cable_id, notes, created_at')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
    migrations = (mRows ?? []) as MigrationRow[]

    if (migrations.length > 0) {
      const migIds = migrations.map((m) => m.id)
      const { data: mcRows } = await supabase
        .from('relocation_migration_circuits')
        .select('migration_id, circuit_id, segment_idx')
        .in('migration_id', migIds)
      migrationCircuits = (mcRows ?? []) as MigrationCircuitRow[]
    }
  }

  // 검증 결과 (verify 탭 전용) — 접속·스플리터는 별도 조회, 나머지는 캔버스 데이터 재사용
  let verifyResult: VerifyResult | null = null
  if (tab === 'verify') {
    const { data: splRows } = await supabase
      .from('relocation_splices')
      .select('facility_id')
      .eq('project_id', id)
    const { data: sptRows } = await supabase
      .from('relocation_splitters')
      .select('facility_id, input_a_cable_id, input_b_cable_id')
      .eq('project_id', id)

    verifyResult = runVerification({
      facilities: facilities.map((f) => ({
        id: f.id,
        closure_type: f.closure_type,
        seq_no: f.seq_no,
        name: f.name,
        closure_spec: f.closure_spec,
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
      })),
      splices: (splRows ?? []) as { facility_id: string }[],
      splitters: (sptRows ?? []) as {
        facility_id: string
        input_a_cable_id: string | null
        input_b_cable_id: string | null
      }[],
      facilityTasks: facilityTasks.map((t) => ({ facility_id: t.facility_id })),
    })
  }

  // 차수 (phases 탭 전용)
  let phases: PhaseRow[] = []
  let phaseTasks: PhaseTaskRow[] = []
  if (tab === 'phases') {
    const { data: phRows } = await supabase
      .from('relocation_phases')
      .select(
        'id, phase_no, required_teams, estimated_minutes, status, window_start, window_end',
      )
      .eq('project_id', id)
      .order('phase_no')
    phases = (phRows ?? []) as PhaseRow[]

    if (phases.length > 0) {
      const { data: ptRows } = await supabase
        .from('relocation_phase_tasks')
        .select('id, phase_id, facility_id, task_kind, estimated_minutes')
        .in(
          'phase_id',
          phases.map((p) => p.id),
        )
      phaseTasks = (ptRows ?? []) as PhaseTaskRow[]
    }
  }

  // 접속 (직선도 탭 전용)
  let splices: SpliceRow[] = []
  if (tab === 'splice') {
    const { data: spRows } = await supabase
      .from('relocation_splices')
      .select(
        'id, facility_id, in_cable_id, in_core, out_cable_id, out_core, is_continuous',
      )
      .eq('project_id', id)
    splices = (spRows ?? []) as SpliceRow[]
  }

  const topPanel = (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-4 sm:pt-6 space-y-5">
      <header>
          <Link
            href="/relocation"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            지장이설 목록
          </Link>
          <div className="mt-1 space-y-2 sm:space-y-0 sm:flex sm:items-start sm:justify-between sm:gap-3">
            <div className="min-w-0">
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight break-keep">
                {project.title}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {project.client} · {project.region ?? '지역 미정'}
                {project.surveyed_at && ` · 계약 ${project.surveyed_at}`}
                {designerName && ` · 설계자 ${designerName}`}
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-2 self-start">
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

        {/* 빈 프로젝트에 시드 데이터 채우기 안내 (실제 LGU+ 임포트 구현 전 임시) */}
        {facilities.length === 0 && (
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

    </div>
  )

  const canvasPanel = (
    <div className="px-4 sm:px-6 my-2">
      <TopologyCanvas
        projectId={project.id}
        facilities={facilities.map((f) => ({
          id: f.id,
          closure_type: f.closure_type,
          seq_no: f.seq_no,
          name: f.name,
          closure_spec: f.closure_spec,
          install_address: f.install_address,
          notes: f.notes,
          x_hint: f.x_hint ?? null,
          y_hint: f.y_hint ?? null,
          lat: f.lat ?? null,
          lng: f.lng ?? null,
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
          total_length: c.total_length,
          end_distance: c.end_distance,
        }))}
        editable={true}
        facilityMasters={facilityMasters}
        taskTypes={taskTypes}
        facilityTasks={facilityTasks}
        facilityMaterials={facilityMaterials}
        circuits={circuits}
        coreAssignments={assignments}
      />
    </div>
  )

  const bottomPanel = (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 space-y-5">
        {/* 탭 바 */}
        <nav className="sticky top-0 z-10 -mx-4 sm:-mx-6 bg-slate-50/80 backdrop-blur border-b border-slate-200">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 flex overflow-x-auto gap-1 py-2">
            {TABS.map((t) => {
              const Icon = t.icon
              const active = tab === t.id
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
                </Link>
              )
            })}
          </div>
        </nav>

        {/* 좌측 패널 + 탭 콘텐츠 — 데스크톱은 grid, 모바일은 stack */}
        <section className="grid gap-4 lg:grid-cols-[16rem_1fr]">
          <div className="lg:sticky lg:top-16 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
            <LeftPanel facilities={facilities} />
          </div>

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
            {tab === 'verify' && verifyResult && (
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

        {/* 프로젝트 메타 편집 + 삭제 */}
        <section className="rounded-2xl bg-white shadow-sm border border-slate-200 p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 tracking-tight">프로젝트 정보</h2>

          <form action={updateProject} className="space-y-3">
            <input type="hidden" name="id" value={project.id} />

            <div>
              <label className="block text-sm font-medium text-slate-700">제목</label>
              <input
                type="text"
                name="title"
                required
                defaultValue={project.title}
                maxLength={200}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">지역</label>
                <input
                  type="text"
                  name="region"
                  defaultValue={project.region ?? ''}
                  maxLength={100}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                />
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
        </section>
    </div>
  )

  return (
    <main className="min-h-screen pb-6">
      <HighlightProvider>
        <CollapsibleLayout
          topPanel={topPanel}
          canvas={canvasPanel}
          bottomPanel={bottomPanel}
        />
      </HighlightProvider>
    </main>
  )
}
