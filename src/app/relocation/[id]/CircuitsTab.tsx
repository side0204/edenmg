import { Plus, Pencil, Trash2, Layers } from 'lucide-react'
import {
  CIRCUIT_KIND_LABEL,
  CIRCUIT_KIND_VALUES,
  CIRCUIT_STATUS_COLOR,
  CIRCUIT_STATUS_VALUES,
  type CircuitKind,
  type CircuitStatus,
} from '@/lib/relocation'
import { createCircuit, updateCircuit, deleteCircuit } from './circuit-actions'

export type CircuitRow = {
  id: string
  circuit_id: string
  subscriber_name: string | null
  kind: CircuitKind
  status: CircuitStatus
  notes: string | null
}

export default function CircuitsTab({
  projectId,
  circuits,
}: {
  projectId: string
  circuits: CircuitRow[]
}) {
  return (
    <div className="space-y-6">
      {/* 신규 등록 — 헤더 클릭으로 접기/펼치기 */}
      <details
        open
        className="group border border-slate-200 rounded-xl bg-slate-50 [&[open]>summary>.chev]:rotate-180"
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">
          <Plus className="h-4 w-4" />
          <span className="flex-1">회선 추가</span>
          <span className="chev text-slate-400 transition-transform">▾</span>
        </summary>
        <form action={createCircuit} className="grid gap-3 sm:grid-cols-2 px-4 pb-4">
          <input type="hidden" name="project_id" value={projectId} />

          <div>
            <label className="block text-xs font-medium text-slate-600">
              회선번호 <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              name="circuit_id"
              required
              maxLength={100}
              placeholder="예: 5632751"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600">
              회선 종류 <span className="text-rose-600">*</span>
            </label>
            <select
              name="kind"
              required
              defaultValue="1코어"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {CIRCUIT_KIND_VALUES.map((k) => (
                <option key={k} value={k}>
                  {CIRCUIT_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600">설치장소명</label>
            <input
              type="text"
              name="subscriber_name"
              maxLength={200}
              placeholder="예: 필동 충무영상센터"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600">상태</label>
            <select
              name="status"
              defaultValue="OK"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {CIRCUIT_STATUS_VALUES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
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

          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              회선 추가
            </button>
          </div>
        </form>
      </details>

      {/* 회선 목록 */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">등록된 회선 ({circuits.length}건)</h3>
        {circuits.length === 0 ? (
          <p className="text-sm text-slate-500 italic px-2 py-4">등록된 회선이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white overflow-hidden">
            {circuits.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <CircuitRowItem projectId={projectId} circuit={c} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}


function CircuitRowItem({
  projectId,
  circuit,
}: {
  projectId: string
  circuit: CircuitRow
}) {
  return (
    <details className="group">
      <summary className="cursor-pointer flex items-start justify-between gap-3 list-none">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900 flex items-center gap-2 flex-wrap">
            <Layers className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-mono text-xs text-slate-700">{circuit.circuit_id}</span>
            <span className="text-xs text-slate-500">{CIRCUIT_KIND_LABEL[circuit.kind]}</span>
            <span
              className={
                'inline-block text-[10px] font-medium px-1.5 py-0.5 rounded border ' +
                CIRCUIT_STATUS_COLOR[circuit.status]
              }
            >
              {circuit.status}
            </span>
          </p>
          {circuit.subscriber_name && (
            <p className="text-xs text-slate-500 mt-0.5">{circuit.subscriber_name}</p>
          )}
        </div>
        <span className="text-xs text-slate-400 group-open:rotate-90 transition-transform">
          <Pencil className="h-3.5 w-3.5" />
        </span>
      </summary>

      <div className="mt-3 ml-2 pl-3 border-l-2 border-slate-200 space-y-3">
        <form action={updateCircuit} className="grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="id" value={circuit.id} />
          <input type="hidden" name="project_id" value={projectId} />

          <div>
            <label className="block text-[11px] text-slate-500">회선번호</label>
            <input
              type="text"
              name="circuit_id"
              required
              defaultValue={circuit.circuit_id}
              maxLength={100}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-500">종류</label>
            <select
              name="kind"
              defaultValue={circuit.kind}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              {CIRCUIT_KIND_VALUES.map((k) => (
                <option key={k} value={k}>
                  {CIRCUIT_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[11px] text-slate-500">설치장소명</label>
            <input
              type="text"
              name="subscriber_name"
              defaultValue={circuit.subscriber_name ?? ''}
              maxLength={200}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-500">상태</label>
            <select
              name="status"
              defaultValue={circuit.status}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              {CIRCUIT_STATUS_VALUES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500">비고</label>
            <input
              type="text"
              name="notes"
              defaultValue={circuit.notes ?? ''}
              maxLength={1000}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
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

        <form action={deleteCircuit}>
          <input type="hidden" name="id" value={circuit.id} />
          <input type="hidden" name="project_id" value={projectId} />
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            삭제 (관련 코어 배정도 삭제됨)
          </button>
        </form>
      </div>
    </details>
  )
}
