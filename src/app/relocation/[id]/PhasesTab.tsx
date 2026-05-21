import { CalendarClock } from 'lucide-react'
import type { ClosureType } from '@/lib/relocation'
import { formatMinutes } from '@/lib/relocation-phase-planner'
import PhasePlanButton from './PhasePlanButton'
import PhaseBoard from './PhaseBoard'

// 차수 탭 — 차수 자동 분할(§ 6-3) + 차수별 팀 조정·재조정.
//   page.tsx 가 데이터를 전달. 상호작용(팀 변경·이동·재조정)은 PhaseBoard(client)가 담당.

export type PhaseRow = {
  id: string
  phase_no: number
  required_teams: number
  estimated_minutes: number | null
  status: string
  window_start: string
  window_end: string
}

export type PhaseTaskRow = {
  id: string
  phase_id: string
  facility_id: string
  task_kind: string
  estimated_minutes: number | null
}

export type PhaseFacility = {
  id: string
  closure_type: ClosureType
  seq_no: number
  name: string
}

export default function PhasesTab({
  projectId,
  phases,
  phaseTasks,
  facilities,
}: {
  projectId: string
  phases: PhaseRow[]
  phaseTasks: PhaseTaskRow[]
  facilities: PhaseFacility[]
}) {
  const totalMinutes = phaseTasks.reduce((acc, t) => acc + (t.estimated_minutes ?? 0), 0)

  return (
    <div className="space-y-5">
      {/* 안내 + 실행 버튼 */}
      <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-2 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1 text-sm font-semibold text-indigo-900">
            <CalendarClock className="h-4 w-4" />
            차수 자동 분할
          </h3>
          <p className="mt-0.5 text-xs text-indigo-700">
            시설별 공종량(공종 × 수량) 합계를 작업시간으로 보고, 한 차수(새벽 02~05시,
            팀 수 × 180분) 안에 들어가도록 차수를 나눕니다. 분할 후 차수별 팀 수를
            조정하고 재조정할 수 있습니다.
          </p>
        </div>
        <div className="shrink-0">
          <PhasePlanButton projectId={projectId} hasExisting={phases.length > 0} />
        </div>
      </section>

      {phases.length === 0 ? (
        <div className="text-center py-10">
          <CalendarClock className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">아직 분할된 차수가 없습니다.</p>
          <p className="mt-1 text-xs text-slate-400">
            시설 정보 패널에서 공종·수량을 입력한 뒤 「차수 자동 분할」을 실행하세요.
          </p>
        </div>
      ) : (
        <>
          {/* 요약 */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="text-slate-600">
              총 <span className="font-bold text-slate-900">{phases.length}</span>개 차수
            </span>
            <span className="text-slate-600">
              총 작업시간{' '}
              <span className="font-bold text-slate-900">
                {formatMinutes(totalMinutes)}
              </span>
            </span>
          </section>

          {/* 차수 보드 — 팀 조정·재조정·이동 */}
          <PhaseBoard
            projectId={projectId}
            phases={phases}
            phaseTasks={phaseTasks}
            facilities={facilities}
          />

          <p className="text-xs text-slate-400">
            「투입 팀」을 차수별로 바꾼 뒤 「차수 재조정」을 누르면 용량에 맞춰 작업이
            자동 재배치됩니다. 작업 오른쪽 차수 선택으로 직접 옮길 수도 있습니다.
            동시작업 페어링·작업 지시서는 후속 단계에서 추가됩니다.
          </p>
        </>
      )}
    </div>
  )
}
