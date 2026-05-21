import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { ChevronLeft, Users, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatFacilityCode, type ClosureType } from '@/lib/relocation'
import { formatMinutes } from '@/lib/relocation-phase-planner'
import PrintButton from '../../../PrintButton'

// 작업 지시서 — 차수별 현장 문서 (§ 6-4).
//   동시작업 그룹별로 시설·공종을 묶어 출력. 같은 그룹은 새벽에 함께 작업.
//   per-team·짝 작업자 연락처는 후속 (팀-작업자 배정 기능 후).

type PhaseRow = {
  id: string
  phase_no: number
  required_teams: number
  estimated_minutes: number | null
  planned_at: string | null
  window_start: string
  window_end: string
}

function hhmm(t: string): string {
  return t.length >= 5 ? t.slice(0, 5) : t
}

export default async function WorkInstructionPage({
  params,
}: {
  params: Promise<{ id: string; phaseNo: string }>
}) {
  const { id, phaseNo } = await params
  const phaseNum = Number.parseInt(phaseNo, 10)
  if (!Number.isFinite(phaseNum) || phaseNum < 1) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: projRow } = await supabase
    .from('relocation_projects')
    .select('id, title, client')
    .eq('id', id)
    .maybeSingle()
  if (!projRow) notFound()
  const project = projRow as { id: string; title: string; client: string }

  const { data: phRow } = await supabase
    .from('relocation_phases')
    .select(
      'id, phase_no, required_teams, estimated_minutes, planned_at, window_start, window_end',
    )
    .eq('project_id', id)
    .eq('phase_no', phaseNum)
    .maybeSingle()
  if (!phRow) notFound()
  const phase = phRow as PhaseRow

  const { data: ptRows } = await supabase
    .from('relocation_phase_tasks')
    .select('facility_id, task_kind, estimated_minutes, simultaneity_group')
    .eq('phase_id', phase.id)
  const tasks = (ptRows ?? []) as {
    facility_id: string
    task_kind: string
    estimated_minutes: number | null
    simultaneity_group: string | null
  }[]

  const { data: facRows } = await supabase
    .from('relocation_facilities')
    .select('id, closure_type, seq_no, name, install_address')
    .eq('project_id', id)
  const facilityById = new Map(
    ((facRows ?? []) as {
      id: string
      closure_type: ClosureType
      seq_no: number
      name: string
      install_address: string | null
    }[]).map((f) => [f.id, f]),
  )

  const { data: ftRows } = await supabase
    .from('relocation_facility_tasks')
    .select('facility_id, task_type_id, quantity')
    .eq('project_id', id)
  const { data: ttRows } = await supabase
    .from('relocation_task_type_master')
    .select('id, name, unit_label')
  const taskTypeById = new Map(
    ((ttRows ?? []) as { id: string; name: string; unit_label: string }[]).map(
      (t) => [t.id, t],
    ),
  )
  const worksByFacility = new Map<string, string[]>()
  for (const ft of (ftRows ?? []) as {
    facility_id: string
    task_type_id: string
    quantity: number
  }[]) {
    const tt = taskTypeById.get(ft.task_type_id)
    const label = `${tt?.name ?? '공종'} ${ft.quantity}${tt?.unit_label ?? ''}`
    const arr = worksByFacility.get(ft.facility_id)
    if (arr) arr.push(label)
    else worksByFacility.set(ft.facility_id, [label])
  }

  // 동시작업 그룹별 묶기 — null = 단독 작업
  const groupMap = new Map<string, typeof tasks>()
  const solo: typeof tasks = []
  for (const t of tasks) {
    if (t.simultaneity_group) {
      const arr = groupMap.get(t.simultaneity_group)
      if (arr) arr.push(t)
      else groupMap.set(t.simultaneity_group, [t])
    } else {
      solo.push(t)
    }
  }
  const groups = [...groupMap.values()]

  function FacilityBlock({
    t,
  }: {
    t: { facility_id: string; task_kind: string; estimated_minutes: number | null }
  }) {
    const f = facilityById.get(t.facility_id)
    const works = worksByFacility.get(t.facility_id) ?? []
    return (
      <div className="border border-slate-300 rounded-lg p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">
              <span className="font-mono text-xs text-slate-500">
                {f ? formatFacilityCode(f.closure_type, f.seq_no) : '?'}
              </span>{' '}
              {f?.name ?? '(삭제된 시설)'}
            </p>
            {f?.install_address && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                <MapPin className="h-3 w-3" />
                {f.install_address}
              </p>
            )}
          </div>
          <span className="shrink-0 text-xs text-slate-600">
            {t.task_kind.replace('_', '·')} · {formatMinutes(t.estimated_minutes ?? 0)}
          </span>
        </div>
        <div className="mt-2 text-xs text-slate-700">
          <span className="text-slate-400">공종: </span>
          {works.length > 0 ? works.join(' · ') : '공종 미입력'}
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100 print:bg-white py-6 print:py-0">
      <div className="mx-auto max-w-3xl px-4 print:max-w-none print:px-0">
        {/* 화면 전용 헤더 */}
        <div className="flex items-center justify-between gap-2 mb-4 print:hidden">
          <Link
            href={`/relocation/${id}?tab=phases`}
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            차수로 돌아가기
          </Link>
          <PrintButton />
        </div>

        {/* 지시서 본문 */}
        <div className="bg-white rounded-xl print:rounded-none border border-slate-200 print:border-0 p-6 print:p-0 space-y-5">
          <header className="border-b-2 border-slate-800 pb-3">
            <h1 className="text-2xl font-bold text-slate-900">
              {phase.phase_no}차수 작업 지시서
            </h1>
            <p className="mt-1 text-sm text-slate-600">{project.title}</p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-700">
              <span>발주처 {project.client}</span>
              <span>
                시공시간 {hhmm(phase.window_start)}~{hhmm(phase.window_end)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                투입 {phase.required_teams}팀
              </span>
              <span>예상 {formatMinutes(phase.estimated_minutes ?? 0)}</span>
              {phase.planned_at && <span>시공일 {phase.planned_at}</span>}
            </div>
          </header>

          {tasks.length === 0 ? (
            <p className="text-sm text-slate-500 italic py-6 text-center">
              이 차수에 배정된 작업이 없습니다.
            </p>
          ) : (
            <>
              {groups.map((g, i) => (
                <section key={i} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-900">
                      동시작업 그룹 {i + 1}
                    </h2>
                    <span className="text-xs text-slate-500">
                      ({g.length}개 시설)
                    </span>
                  </div>
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    ⚠ 같은 그룹의 시설은 절체 시 <strong>동시에 함께 작업</strong>해야
                    합니다. 작업 중 그룹 내 작업자끼리 연락을 유지하세요.
                  </p>
                  <div className="space-y-2">
                    {g.map((t) => (
                      <FacilityBlock key={t.facility_id} t={t} />
                    ))}
                  </div>
                </section>
              ))}

              {solo.length > 0 && (
                <section className="space-y-2">
                  <h2 className="text-sm font-bold text-slate-900">단독 작업</h2>
                  <div className="space-y-2">
                    {solo.map((t) => (
                      <FacilityBlock key={t.facility_id} t={t} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          <footer className="border-t border-slate-200 pt-3 text-xs text-slate-400">
            edenMG 지장이설 — 작업 지시서. 동시작업 그룹은 절체 대상 케이블로 연결된
            시설입니다. 짝 작업자 연락처·팀 배정은 후속 단계에서 추가됩니다.
          </footer>
        </div>
      </div>
    </main>
  )
}
