'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MapPin, Trash2, Scale, FileText, Link2, TriangleAlert } from 'lucide-react'
import { formatFacilityCode } from '@/lib/relocation'
import {
  formatMinutes,
  windowMinutes,
  windowsOverlap,
} from '@/lib/relocation-phase-planner'
import {
  rebalancePhases,
  updatePhaseTeams,
  updatePhaseWindow,
  movePhaseTask,
  deletePhase,
} from './phase-actions'
import type { PhaseRow, PhaseTaskRow, PhaseFacility } from './PhasesTab'

// 차수 보드 — 차수별 팀 수 조정 + 자동 재조정 + 시설 수동 이동 + 빈 차수 삭제.

export default function PhaseBoard({
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
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const facilityById = new Map(facilities.map((f) => [f.id, f]))
  const tasksByPhase = new Map<string, PhaseTaskRow[]>()
  for (const t of phaseTasks) {
    const arr = tasksByPhase.get(t.phase_id)
    if (arr) arr.push(t)
    else tasksByPhase.set(t.phase_id, [t])
  }

  async function run(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    okMsg: string,
  ) {
    if (busy) return
    setBusy(true)
    const r = await fn()
    setBusy(false)
    if (!r.ok) {
      toast.error(r.error ?? '처리에 실패했습니다')
      return
    }
    toast.success(okMsg)
    router.refresh()
  }

  function onRebalance() {
    if (
      !confirm(
        '차수별로 설정한 팀 수에 맞춰 작업을 다시 배치합니다.\n수동으로 옮긴 내용은 다시 계산됩니다.',
      )
    ) {
      return
    }
    run(() => rebalancePhases(projectId), '차수를 재조정했습니다')
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onRebalance}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
        >
          <Scale className="h-4 w-4" />
          차수 재조정
        </button>
      </div>

      <ul className="space-y-3">
        {phases.map((ph) => {
          const winMin = windowMinutes(ph.window_start, ph.window_end)
          const capacity = ph.required_teams * winMin
          const tasks = tasksByPhase.get(ph.id) ?? []
          const used = tasks.reduce((a, t) => a + (t.estimated_minutes ?? 0), 0)
          const pct = capacity > 0 ? Math.min(100, Math.round((used / capacity) * 100)) : 0
          const over = used > capacity
          // 동시작업 그룹 — 차수 안에서 1·2… 번호 부여
          const simGroupNo = new Map<string, number>()
          for (const t of tasks) {
            if (t.simultaneity_group && !simGroupNo.has(t.simultaneity_group)) {
              simGroupNo.set(t.simultaneity_group, simGroupNo.size + 1)
            }
          }

          return (
            <li
              key={ph.id}
              className="rounded-xl border border-slate-200 bg-white overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-slate-100">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-sm font-bold text-slate-900">{ph.phase_no}차수</p>
                  <div className="flex items-center gap-2">
                    {tasks.length > 0 && (
                      <Link
                        href={`/relocation/${projectId}/phases/${ph.phase_no}/instructions`}
                        target="_blank"
                        className="inline-flex items-center gap-0.5 rounded-md border border-slate-300 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <FileText className="h-3 w-3" />
                        작업 지시서
                      </Link>
                    )}
                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      투입 팀
                      <select
                        value={ph.required_teams}
                        disabled={busy}
                        onChange={(e) =>
                          run(
                            () =>
                              updatePhaseTeams(projectId, ph.id, Number(e.target.value)),
                            '투입 팀 수를 변경했습니다',
                          )
                        }
                        className="rounded-md border border-slate-300 px-1.5 py-0.5 text-xs"
                      >
                        {[1, 2, 3, 4].map((n) => (
                          <option key={n} value={n}>
                            {n}팀
                          </option>
                        ))}
                      </select>
                    </label>
                    {tasks.length === 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!confirm('이 빈 차수를 삭제하시겠습니까?')) return
                          run(
                            () => deletePhase(projectId, ph.id),
                            '차수를 삭제했습니다',
                          )
                        }}
                        disabled={busy}
                        className="inline-flex items-center gap-0.5 rounded-md border border-rose-300 px-1.5 py-0.5 text-[11px] text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        빈 차수 삭제
                      </button>
                    )}
                  </div>
                </div>

                {/* 시공 시간대 */}
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                  <span>시간대</span>
                  <input
                    type="time"
                    value={ph.window_start.slice(0, 5)}
                    disabled={busy}
                    onChange={(e) =>
                      run(
                        () =>
                          updatePhaseWindow(
                            projectId,
                            ph.id,
                            e.target.value,
                            ph.window_end.slice(0, 5),
                          ),
                        '시공 시간대를 변경했습니다',
                      )
                    }
                    className="rounded-md border border-slate-300 px-1.5 py-0.5 text-xs"
                  />
                  <span>~</span>
                  <input
                    type="time"
                    value={ph.window_end.slice(0, 5)}
                    disabled={busy}
                    onChange={(e) =>
                      run(
                        () =>
                          updatePhaseWindow(
                            projectId,
                            ph.id,
                            ph.window_start.slice(0, 5),
                            e.target.value,
                          ),
                        '시공 시간대를 변경했습니다',
                      )
                    }
                    className="rounded-md border border-slate-300 px-1.5 py-0.5 text-xs"
                  />
                  <span className="text-slate-400">({formatMinutes(winMin)})</span>
                </div>

                {/* 용량 바 */}
                <div className="mt-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      예상 {formatMinutes(used)} / 가용 {formatMinutes(capacity)}
                    </span>
                    <span className={over ? 'font-semibold text-rose-600' : ''}>
                      {pct}%{over ? ' 초과' : ''}
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={'h-full ' + (over ? 'bg-rose-500' : 'bg-indigo-500')}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {over && (
                    <p className="mt-1 text-[11px] text-rose-600">
                      용량 초과 — 팀 수를 늘리거나 작업을 다른 차수로 옮기세요.
                    </p>
                  )}
                </div>
              </div>

              {/* 차수 작업 */}
              <ul className="divide-y divide-slate-50">
                {tasks.length === 0 ? (
                  <li className="px-4 py-2 text-xs text-slate-400 italic">작업 없음</li>
                ) : (
                  tasks.map((t) => {
                    const f = facilityById.get(t.facility_id)
                    const windowConflict =
                      !!f?.work_window_start &&
                      !!f?.work_window_end &&
                      !windowsOverlap(
                        f.work_window_start,
                        f.work_window_end,
                        ph.window_start,
                        ph.window_end,
                      )
                    return (
                      <li
                        key={t.id}
                        className="px-4 py-2 flex items-center gap-2 text-xs"
                      >
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="font-mono text-slate-500">
                          {f ? formatFacilityCode(f.closure_type, f.seq_no) : '?'}
                        </span>
                        <span className="flex-1 min-w-0 truncate text-slate-800">
                          {f?.name ?? '(삭제된 시설)'}
                        </span>
                        {t.simultaneity_group && (
                          <span
                            title="동시작업 그룹 — 같은 차수에서 함께 작업"
                            className="shrink-0 inline-flex items-center gap-0.5 rounded border border-indigo-200 bg-indigo-50 px-1 py-0.5 text-[10px] font-medium text-indigo-700"
                          >
                            <Link2 className="h-2.5 w-2.5" />
                            묶음 {simGroupNo.get(t.simultaneity_group)}
                          </span>
                        )}
                        {windowConflict && f && (
                          <span
                            title={`작업 가능 시간대 ${f.work_window_start?.slice(0, 5)}~${f.work_window_end?.slice(0, 5)} 가 이 차수 시간대와 겹치지 않습니다`}
                            className="shrink-0 inline-flex items-center gap-0.5 rounded border border-rose-300 bg-rose-50 px-1 py-0.5 text-[10px] font-medium text-rose-700"
                          >
                            <TriangleAlert className="h-2.5 w-2.5" />
                            시간대 불가
                          </span>
                        )}
                        <span className="shrink-0 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500">
                          {t.task_kind.replace('_', '·')}
                        </span>
                        <span className="shrink-0 font-medium text-slate-700">
                          {formatMinutes(t.estimated_minutes ?? 0)}
                        </span>
                        <select
                          value={ph.id}
                          disabled={busy}
                          title="다른 차수로 이동"
                          onChange={(e) =>
                            run(
                              () => movePhaseTask(projectId, t.id, e.target.value),
                              '작업을 옮겼습니다',
                            )
                          }
                          className="shrink-0 rounded-md border border-slate-300 px-1 py-0.5 text-[10px]"
                        >
                          {phases.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.phase_no}차수
                            </option>
                          ))}
                        </select>
                      </li>
                    )
                  })
                )}
              </ul>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
