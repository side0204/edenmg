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
} from 'lucide-react'
import { Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { updateProject, deleteProject } from '../actions'
import FacilitiesTab, { type FacilityRow } from './FacilitiesTab'
import CablesTab, { type CableRow } from './CablesTab'
import CircuitsTab, { type CircuitRow } from './CircuitsTab'
import CoresTab, { type CoreAssignmentRow } from './CoresTab'
import LeftPanel from './LeftPanel'
import { seedTestData } from './seed-actions'
import TopologyCanvas from './TopologyCanvas'

// 지장이설 프로젝트 상세 — 메인 작업 화면.
// 사양 § 7: 시설·케이블·회선·코어배정·직선도·차수·검증·내보내기 8 탭.
// Step B: facilities/cables/circuits/cores 4 탭 콘텐츠 활성화.
// 나머지 4 탭은 placeholder (Phase 3+).

type TabId =
  | 'facilities'
  | 'cables'
  | 'circuits'
  | 'cores'
  | 'splice'
  | 'phases'
  | 'verify'
  | 'export'

const TABS: { id: TabId; label: string; icon: typeof Cable }[] = [
  { id: 'facilities', label: '시설', icon: Network },
  { id: 'cables', label: '케이블', icon: Cable },
  { id: 'circuits', label: '회선', icon: Radio },
  { id: 'cores', label: '코어배정', icon: Layers },
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
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab: tabRaw } = await searchParams
  const tab: TabId = tabRaw && isTabId(tabRaw) ? tabRaw : 'facilities'

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

  // 시설 (좌측 패널 + 시설 탭 + 케이블/코어 dropdown + 캔버스에 공통 사용)
  const { data: fRows } = await supabase
    .from('relocation_facilities')
    .select(
      'id, closure_type, seq_no, name, install_address, closure_spec, parent_facility_id, is_marked, notes, x_hint, y_hint',
    )
    .eq('project_id', id)
    .order('closure_type')
    .order('seq_no')
  const facilities = (fRows ?? []) as FacilityRow[]

  // 케이블 (탭 + 코어 dropdown)
  const { data: cRows } = await supabase
    .from('relocation_cables')
    .select(
      'id, from_facility_id, to_facility_id, spec, status, cable_code, route_type, notes',
    )
    .eq('project_id', id)
    .order('cable_code')
  const cables = (cRows ?? []) as CableRow[]

  // 회선 (탭 + 코어 dropdown) — cores 탭에서만 사용해도 항상 fetch (작아서 OK)
  const { data: circRows } = await supabase
    .from('relocation_circuits')
    .select('id, circuit_id, subscriber_name, kind, status, notes')
    .eq('project_id', id)
    .order('circuit_id')
  const circuits = (circRows ?? []) as CircuitRow[]

  // 코어 배정 (cores 탭에서만 필요)
  let assignments: CoreAssignmentRow[] = []
  if (tab === 'cores') {
    const { data: aRows } = await supabase
      .from('relocation_core_assignments')
      .select(
        'id, circuit_id, segment_idx, cable_id, core_range_start, core_range_end, lifecycle, status, is_auto_assigned, notes',
      )
      .eq('project_id', id)
      .order('cable_id')
      .order('core_range_start')
    assignments = (aRows ?? []) as CoreAssignmentRow[]
  }

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
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
                {project.surveyed_at && ` · 답사 ${project.surveyed_at}`}
                {designerName && ` · 설계자 ${designerName}`}
              </p>
            </div>
            <span className="shrink-0 inline-flex items-center self-start rounded-full bg-slate-900 px-3 py-1 text-sm font-medium text-white">
              {project.status}
            </span>
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

        {/* 시각 캔버스 (Phase 3 시작 — C1) — 시설·케이블 토폴로지 시각화 + 노드 드래그 */}
        {facilities.length > 0 && (
          <TopologyCanvas
            projectId={project.id}
            facilities={facilities.map((f) => ({
              id: f.id,
              closure_type: f.closure_type,
              seq_no: f.seq_no,
              name: f.name,
              x_hint: f.x_hint ?? null,
              y_hint: f.y_hint ?? null,
            }))}
            cables={cables.map((c) => ({
              id: c.id,
              from_facility_id: c.from_facility_id,
              to_facility_id: c.to_facility_id,
              spec: c.spec,
              status: c.status,
              cable_code: c.cable_code,
            }))}
            editable={true}
          />
        )}

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
            {(tab === 'splice' || tab === 'phases' || tab === 'verify' || tab === 'export') && (
              <TabPlaceholder tab={tab} />
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
                <label className="block text-sm font-medium text-slate-700">현장답사일</label>
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
    </main>
  )
}


function TabPlaceholder({ tab }: { tab: TabId }) {
  const label = TABS.find((t) => t.id === tab)?.label ?? tab
  return (
    <div className="text-center py-12">
      <p className="text-sm text-slate-500">
        <strong className="font-semibold">{label}</strong> 탭 — Phase 3 에서 구현 예정
      </p>
      <p className="mt-2 text-xs text-slate-400">
        검증 룰·차수 자동 분할·SVG 시각화·엑셀 출력은 다음 단계에서 추가됩니다.
      </p>
    </div>
  )
}
