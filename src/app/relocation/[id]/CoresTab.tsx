import { Plus, Pencil, Trash2, Zap, User, Flag } from 'lucide-react'
import {
  CORE_LIFECYCLE_LABEL,
  CORE_LIFECYCLE_VALUES,
  CIRCUIT_STATUS_COLOR,
  CIRCUIT_STATUS_VALUES,
  isCircuitDiverse,
  type CoreLifecycle,
  type CircuitKind,
  type CircuitStatus,
} from '@/lib/relocation'
import {
  createCoreAssignment,
  updateCoreAssignment,
  deleteCoreAssignment,
} from './core-actions'
import AutoAssignButton from './AutoAssignButton'

export type CoreAssignmentRow = {
  id: string
  circuit_id: string | null
  segment_idx: number
  cable_id: string
  core_range_start: number
  core_range_end: number
  lifecycle: CoreLifecycle
  status: CircuitStatus | null
  is_terminal: boolean
  is_auto_assigned: boolean
  notes: string | null
  // 청약: 'designer'(설계 계획·기별 미반영) / 'worker'(실시공·기별 반영). 기존 데이터는 'worker' default.
  entered_role: 'designer' | 'worker'
}

type CableMini = {
  id: string
  cable_code: string
  spec: string
  segment_label: string  // '필동간이국사 ~ 0025A 79M3#1 · 288C' 같이 사전 조립된 구간명
}

type CircuitMini = {
  id: string
  circuit_id: string
  subscriber_name: string | null
  kind: CircuitKind
}

export default function CoresTab({
  projectId,
  assignments,
  circuits,
  cables,
}: {
  projectId: string
  assignments: CoreAssignmentRow[]
  circuits: CircuitMini[]
  cables: CableMini[]
}) {
  const cableMap = new Map(cables.map((c) => [c.id, c]))
  const circuitMap = new Map(circuits.map((c) => [c.id, c]))

  // 드롭다운·요약용: 구간명 우선 (예: '필동간이국사 ~ 0025A 79M3#1 · 288C')
  function cableLabel(id: string): string {
    const c = cableMap.get(id)
    return c ? c.segment_label : '(삭제됨)'
  }

  // 행 표시용: 구간명 + 케이블ID (식별 정밀도)
  function cableDetail(id: string): { segment: string; code: string; spec: string } | null {
    const c = cableMap.get(id)
    if (!c) return null
    return { segment: c.segment_label, code: c.cable_code, spec: c.spec }
  }

  function circuitLabel(id: string | null): string {
    if (!id) return '(미지정)'
    const c = circuitMap.get(id)
    return c ? `${c.circuit_id} ${c.subscriber_name ?? ''}`.trim() : '(삭제됨)'
  }

  return (
    <div className="space-y-6">
      {/* 자동 배정 */}
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1 text-sm font-semibold text-amber-900">
            <Zap className="h-4 w-4" />
            자동 코어 배정
          </h3>
          <p className="mt-0.5 text-xs text-amber-700">
            회선의 양 끝 케이블을{' '}
            <Flag className="inline h-3 w-3 -mt-0.5 text-blue-600" /> 종단으로 표시해두면,
            두 종단을 잇는 경유 케이블에 빈 코어(가장 작은 번호)를 자동으로 채웁니다.
            사람이 입력·수정한 배정은 유지됩니다.
          </p>
        </div>
        <div className="shrink-0">
          <AutoAssignButton projectId={projectId} />
        </div>
      </section>

      {/* 신규 등록 폼 — 헤더 클릭으로 접기/펼치기 */}
      <details
        open
        className="group border border-slate-200 rounded-xl bg-slate-50 [&[open]>summary>.chev]:rotate-180"
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">
          <Plus className="h-4 w-4" />
          <span className="flex-1">코어 배정 추가</span>
          <span className="chev text-slate-400 transition-transform">▾</span>
        </summary>
        <div className="px-4 pb-4">

        {cables.length === 0 ? (
          <p className="text-sm text-slate-500 italic px-2 py-2">
            먼저 케이블을 등록해야 합니다. 케이블 탭에서 추가해주세요.
          </p>
        ) : (
          <form action={createCoreAssignment} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="project_id" value={projectId} />

            <div>
              <label className="block text-xs font-medium text-slate-600">
                케이블 <span className="text-rose-600">*</span>
              </label>
              <select
                name="cable_id"
                required
                defaultValue=""
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  선택
                </option>
                {cables.map((c) => (
                  <option key={c.id} value={c.id}>
                    {cableLabel(c.id)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600">회선</label>
              <select
                name="circuit_id"
                defaultValue=""
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">(미지정)</option>
                {circuits.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.circuit_id} {c.subscriber_name ?? ''}
                    {isCircuitDiverse(c.kind) ? ' [이원화]' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600">
                코어 번호 <span className="text-rose-600">*</span>
              </label>
              <input
                type="number"
                name="core_no"
                required
                min={1}
                max={576}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <p className="mt-0.5 text-[11px] text-slate-500">
                이 케이블에서 회선이 쓰는 코어 1개. 2코어·이원화 회선은 코어마다 한
                행씩 나눠 입력
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600">Lifecycle</label>
              <select
                name="lifecycle"
                defaultValue="new"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {CORE_LIFECYCLE_VALUES.map((l) => (
                  <option key={l} value={l}>
                    {CORE_LIFECYCLE_LABEL[l]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600">상태</label>
              <select
                name="status"
                defaultValue=""
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">(미지정)</option>
                {CIRCUIT_STATUS_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600">세그먼트 번호</label>
              <input
                type="number"
                name="segment_idx"
                defaultValue={0}
                min={0}
                max={9}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <p className="mt-0.5 text-[11px] text-slate-500">
                이원화 회선은 0/1 두 행으로 입력 (서로 다른 케이블)
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600">비고</label>
              <input
                type="text"
                name="notes"
                maxLength={1000}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="is_terminal"
                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                />
                <span className="text-sm font-medium text-slate-700 inline-flex items-center gap-1">
                  <Flag className="h-3.5 w-3.5 text-blue-600" />
                  종단 (회선의 끝)
                </span>
              </label>
              <p className="mt-0.5 text-[11px] text-slate-500 ml-6">
                회선의 출발/도착점이면 체크. 자동 경로 탐색의 입력이 됩니다 (가입자시설·국사·함체 등 모든 시설 가능)
              </p>
            </div>

            <div className="sm:col-span-2 flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
                코어 배정
              </button>
            </div>
          </form>
        )}
        </div>
      </details>

      {/* 배정 목록 */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">
          코어 배정 ({assignments.length}건) · 동일 케이블 내 범위 중복은 DB 가 차단
        </h3>
        {assignments.length === 0 ? (
          <p className="text-sm text-slate-500 italic px-2 py-4">코어 배정이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white overflow-hidden">
            {assignments.map((a) => (
              <li key={a.id} className="px-4 py-3">
                <CoreRowItem
                  projectId={projectId}
                  assignment={a}
                  circuits={circuits}
                  cables={cables}
                  cableLabel={cableLabel}
                  cableDetail={cableDetail}
                  circuitLabel={circuitLabel}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}


function CoreRowItem({
  projectId,
  assignment,
  circuits,
  cables,
  cableLabel,
  cableDetail,
  circuitLabel,
}: {
  projectId: string
  assignment: CoreAssignmentRow
  circuits: CircuitMini[]
  cables: CableMini[]
  cableLabel: (id: string) => string
  cableDetail: (id: string) => { segment: string; code: string; spec: string } | null
  circuitLabel: (id: string | null) => string
}) {
  const detail = cableDetail(assignment.cable_id)
  return (
    <details className="group">
      <summary className="cursor-pointer flex items-start justify-between gap-3 list-none">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900 flex items-center gap-2 flex-wrap">
            {assignment.is_auto_assigned ? (
              <Zap className="h-3.5 w-3.5 text-amber-500" aria-label="자동 배정" />
            ) : (
              <User className="h-3.5 w-3.5 text-slate-400" aria-label="사람 입력" />
            )}
            <span className="font-mono text-xs text-slate-700">
              코어 {assignment.core_range_start}
              {assignment.core_range_end !== assignment.core_range_start
                ? `~${assignment.core_range_end}`
                : ''}
            </span>
            <span className="text-xs text-slate-700">
              {detail ? detail.segment : '(삭제됨)'}
            </span>
            <span className="text-[10px] text-slate-400 border border-slate-300 px-1.5 py-0.5 rounded">
              {CORE_LIFECYCLE_LABEL[assignment.lifecycle]}
            </span>
            {assignment.is_terminal && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-300">
                <Flag className="h-2.5 w-2.5" />
                종단
              </span>
            )}
            {assignment.status && (
              <span
                className={
                  'inline-block text-[10px] font-medium px-1.5 py-0.5 rounded border ' +
                  CIRCUIT_STATUS_COLOR[assignment.status]
                }
              >
                {assignment.status}
              </span>
            )}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            회선: {circuitLabel(assignment.circuit_id)}
            {assignment.segment_idx > 0 && ` · 세그먼트 ${assignment.segment_idx}`}
            {detail && (
              <span className="ml-2 font-mono text-[10px] text-slate-400">
                · {detail.code}
              </span>
            )}
          </p>
        </div>
        <span className="text-xs text-slate-400 group-open:rotate-90 transition-transform">
          <Pencil className="h-3.5 w-3.5" />
        </span>
      </summary>

      <div className="mt-3 ml-2 pl-3 border-l-2 border-slate-200 space-y-3">
        <form action={updateCoreAssignment} className="grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="id" value={assignment.id} />
          <input type="hidden" name="project_id" value={projectId} />

          <div>
            <label className="block text-[11px] text-slate-500">케이블</label>
            <select
              name="cable_id"
              defaultValue={assignment.cable_id}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              {cables.map((c) => (
                <option key={c.id} value={c.id}>
                  {cableLabel(c.id)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500">회선</label>
            <select
              name="circuit_id"
              defaultValue={assignment.circuit_id ?? ''}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">(미지정)</option>
              {circuits.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.circuit_id} {c.subscriber_name ?? ''}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[11px] text-slate-500">코어 번호</label>
            <input
              type="number"
              name="core_no"
              required
              min={1}
              max={576}
              defaultValue={assignment.core_range_start}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-500">Lifecycle</label>
            <select
              name="lifecycle"
              defaultValue={assignment.lifecycle}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              {CORE_LIFECYCLE_VALUES.map((l) => (
                <option key={l} value={l}>
                  {CORE_LIFECYCLE_LABEL[l]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500">상태</label>
            <select
              name="status"
              defaultValue={assignment.status ?? ''}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">(미지정)</option>
              {CIRCUIT_STATUS_VALUES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500">세그먼트</label>
            <input
              type="number"
              name="segment_idx"
              defaultValue={assignment.segment_idx}
              min={0}
              max={9}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-500">비고</label>
            <input
              type="text"
              name="notes"
              defaultValue={assignment.notes ?? ''}
              maxLength={1000}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="is_terminal"
                defaultChecked={assignment.is_terminal}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              <span className="text-xs font-medium text-slate-700 inline-flex items-center gap-1">
                <Flag className="h-3 w-3 text-blue-600" />
                종단 (회선의 끝)
              </span>
            </label>
          </div>

          <div className="sm:col-span-2 flex justify-end gap-2">
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
            >
              <Pencil className="h-3.5 w-3.5" />
              저장
            </button>
          </div>
        </form>

        <form action={deleteCoreAssignment}>
          <input type="hidden" name="id" value={assignment.id} />
          <input type="hidden" name="project_id" value={projectId} />
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            삭제
          </button>
        </form>
      </div>
    </details>
  )
}
