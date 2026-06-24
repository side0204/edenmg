import { ArrowRight, ArrowRightCircle, Trash2, Info, CircleAlert } from 'lucide-react'
import {
  CABLE_STATUS_LABEL,
  CABLE_STATUS_COLOR,
  isCircuitDiverse,
  formatFacilityCode,
  type CableStatus,
  type CircuitKind,
  type ClosureType,
} from '@/lib/relocation'
import type { CableSpec } from '@/lib/connection'
import { createMigration, deleteMigration } from './migration-actions'

// 이전(migration) 탭 — 옛 케이블 → 새 케이블 매핑 워크플로우.
// 사양: docs/RELOCATION_DESIGN_PLAN.md § 2-7 (v0.9).
//
// 영향 회선 자동 추출:
//   - 옛 케이블 (status='removing' OR 'relocating') 의 core_assignments 의 circuit_id 들이 영향 회선.
//   - (circuit_id, segment_idx) pair 단위로 매핑 (이원화 회선의 한쪽 segment 만 이전 가능).
//   - 이미 이전 등록된 (circuit_id, segment_idx) 는 회색 처리 + 체크 불가.

export type CableForMigration = {
  id: string
  cable_code: string
  spec: CableSpec
  status: CableStatus
  from_facility_id: string
  to_facility_id: string
}

export type FacilityForLabel = {
  id: string
  closure_type: ClosureType
  seq_no: number
  name: string
}

export type CoreAssignmentForMigration = {
  cable_id: string
  circuit_id: string | null
  segment_idx: number
  core_range_start: number
  core_range_end: number
}

export type CircuitForMigration = {
  id: string
  circuit_id: string
  subscriber_name: string | null
  kind: CircuitKind
}

export type MigrationRow = {
  id: string
  from_cable_id: string
  to_cable_id: string
  notes: string | null
  created_at: string
}

export type MigrationCircuitRow = {
  migration_id: string
  circuit_id: string
  segment_idx: number
}

export default function MigrationsTab({
  projectId,
  cables,
  facilities,
  assignments,
  circuits,
  migrations,
  migrationCircuits,
  selectedFromCableId,
}: {
  projectId: string
  cables: CableForMigration[]
  facilities: FacilityForLabel[]
  assignments: CoreAssignmentForMigration[]
  circuits: CircuitForMigration[]
  migrations: MigrationRow[]
  migrationCircuits: MigrationCircuitRow[]
  selectedFromCableId: string | null
}) {
  const facilityMap = new Map(facilities.map((f) => [f.id, f]))
  const cableMap = new Map(cables.map((c) => [c.id, c]))
  const circuitMap = new Map(circuits.map((c) => [c.id, c]))

  function cableLabel(c: CableForMigration): string {
    const from = facilityMap.get(c.from_facility_id)
    const to = facilityMap.get(c.to_facility_id)
    const fromName = from ? `${formatFacilityCode(from.closure_type, from.seq_no)} ${from.name}` : '?'
    const toName = to ? `${formatFacilityCode(to.closure_type, to.seq_no)} ${to.name}` : '?'
    return `${c.cable_code} (${c.spec}) · ${fromName} → ${toName}`
  }

  // 철거·이설 케이블 (옛 케이블 후보)
  const oldCables = cables.filter((c) => c.status === 'removing' || c.status === 'relocating')

  // 신설 케이블 (새 케이블 후보)
  const newCables = cables.filter((c) => c.status === 'new')

  // 선택된 옛 케이블의 영향 회선 추출
  // (circuit_id, segment_idx) 단위로 unique
  const selectedCable = selectedFromCableId ? cableMap.get(selectedFromCableId) ?? null : null
  type AffectedCircuit = {
    circuit_id: string
    segment_idx: number
    core_range_start: number
    core_range_end: number
  }
  const affected: AffectedCircuit[] = []
  if (selectedCable) {
    const seen = new Set<string>()
    for (const a of assignments) {
      if (a.cable_id !== selectedCable.id) continue
      if (!a.circuit_id) continue
      const key = `${a.circuit_id}|${a.segment_idx}`
      if (seen.has(key)) continue
      seen.add(key)
      affected.push({
        circuit_id: a.circuit_id,
        segment_idx: a.segment_idx,
        core_range_start: a.core_range_start,
        core_range_end: a.core_range_end,
      })
    }
  }

  // 이미 이전 등록된 (from_cable_id, circuit_id, segment_idx) Set
  // 같은 옛 케이블에서 이미 매핑된 회선/세그먼트는 다시 못 고르도록 비활성.
  const alreadyMigratedKeys = new Set<string>()
  if (selectedFromCableId) {
    const migIdsFromThis = new Set(
      migrations.filter((m) => m.from_cable_id === selectedFromCableId).map((m) => m.id),
    )
    for (const mc of migrationCircuits) {
      if (migIdsFromThis.has(mc.migration_id)) {
        alreadyMigratedKeys.add(`${mc.circuit_id}|${mc.segment_idx}`)
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* 안내 */}
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-1.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <Info className="h-4 w-4 text-slate-600" />
          이전 워크플로우
        </h3>
        <ol className="ml-5 list-decimal text-xs text-slate-600 space-y-0.5">
          <li>케이블 탭에서 옮길 옛 케이블을 <strong className="font-semibold">철거 / 기설 이설</strong> 로 마킹</li>
          <li>아래에서 옛 케이블을 선택 → 영향 회선이 자동 추출됩니다</li>
          <li>옮길 회선을 체크하고 새 케이블을 선택 → 이전 등록</li>
          <li>옛 케이블의 회선이 여러 새 케이블로 나뉘면 이전을 여러 번 등록 (N:M 분할)</li>
        </ol>
        <p className="text-[11px] text-slate-500 mt-1">
          ※ 이전 등록은 audit 만 합니다. 새 케이블의 실제 코어 배정은 코어배정 탭에서 수동 또는
          자동 배정 (Step D 예정) 으로 처리합니다.
        </p>
      </section>

      {/* 옛 케이블 선택 */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">
          옛 케이블 선택 ({oldCables.length}건)
        </h3>
        {oldCables.length === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            철거 / 기설 이설 케이블이 없습니다. 케이블 탭에서 옮길 케이블의 상태를 변경해주세요.
          </div>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {oldCables.map((c) => {
              const active = c.id === selectedFromCableId
              return (
                <li key={c.id}>
                  <a
                    href={`/relocation/${projectId}?tab=migrations&from=${c.id}`}
                    className={
                      'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium border ' +
                      (active
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50')
                    }
                  >
                    <span className="font-mono">{c.cable_code}</span>
                    <span
                      className={
                        'inline-block text-[10px] font-medium px-1.5 py-0.5 rounded border ' +
                        CABLE_STATUS_COLOR[c.status]
                      }
                    >
                      {CABLE_STATUS_LABEL[c.status]}
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* 매핑 폼 */}
      {selectedCable && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">선택된 옛 케이블</h3>
            <p className="mt-1 text-xs text-slate-600 break-keep">{cableLabel(selectedCable)}</p>
          </div>

          <form action={createMigration} className="space-y-4">
            <input type="hidden" name="project_id" value={projectId} />
            <input type="hidden" name="from_cable_id" value={selectedCable.id} />

            {/* 영향 회선 체크박스 */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-700">
                영향 회선 자동 추출 ({affected.length}건)
              </p>
              {affected.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
                  <CircleAlert className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    이 옛 케이블에 매핑된 회선이 없습니다. 코어배정 탭에서 기설 코어를 회선에
                    연결해주세요 (lifecycle = 기설).
                  </div>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg bg-white overflow-hidden">
                  {affected.map((a) => {
                    const circuit = circuitMap.get(a.circuit_id)
                    const key = `${a.circuit_id}|${a.segment_idx}`
                    const already = alreadyMigratedKeys.has(key)
                    return (
                      <li key={key} className="px-3 py-2">
                        <label
                          className={
                            'flex items-start gap-2.5 cursor-pointer ' +
                            (already ? 'opacity-60 cursor-not-allowed' : '')
                          }
                        >
                          <input
                            type="checkbox"
                            name="circuit_keys"
                            value={key}
                            disabled={already}
                            defaultChecked={!already}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-900 flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs">
                                {circuit?.circuit_id ?? '(삭제됨)'}
                              </span>
                              <span className="text-xs text-slate-600">
                                {circuit?.subscriber_name ?? ''}
                              </span>
                              {circuit && isCircuitDiverse(circuit.kind) && (
                                <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded border bg-violet-50 text-violet-700 border-violet-300">
                                  이원화 · seg {a.segment_idx}
                                </span>
                              )}
                              {already && (
                                <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded border bg-slate-100 text-slate-500 border-slate-300">
                                  이미 이전됨
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              코어 {a.core_range_start}
                              {a.core_range_end !== a.core_range_start
                                ? `~${a.core_range_end}`
                                : ''}
                            </p>
                          </div>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* 새 케이블 선택 */}
            <div>
              <label className="block text-xs font-medium text-slate-700">
                새 케이블 <span className="text-rose-600">*</span>
              </label>
              {newCables.length === 0 ? (
                <p className="mt-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  신설 케이블이 없습니다. 케이블 탭에서 새 케이블을 먼저 등록해주세요.
                </p>
              ) : (
                <select
                  name="to_cable_id"
                  required
                  defaultValue=""
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="" disabled>
                    선택
                  </option>
                  {newCables.map((c) => (
                    <option key={c.id} value={c.id}>
                      {cableLabel(c)}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">비고</label>
              <input
                type="text"
                name="notes"
                maxLength={1000}
                placeholder="예: 1차 절체 - 함체 보강 후 절체"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={affected.length === 0 || newCables.length === 0}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed"
              >
                <ArrowRightCircle className="h-4 w-4" />
                이전 등록
              </button>
            </div>
          </form>
        </section>
      )}

      {/* 등록된 이전 이력 */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">
          이전 이력 ({migrations.length}건)
        </h3>
        {migrations.length === 0 ? (
          <p className="text-sm text-slate-500 italic px-2 py-4">
            아직 이전 이력이 없습니다.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white overflow-hidden">
            {migrations.map((m) => {
              const from = cableMap.get(m.from_cable_id)
              const to = cableMap.get(m.to_cable_id)
              const childCircuits = migrationCircuits.filter((mc) => mc.migration_id === m.id)
              return (
                <li key={m.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className="font-mono text-xs text-slate-700">
                      {from?.cable_code ?? '(삭제됨)'}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400 mt-0.5" />
                    <span className="font-mono text-xs text-slate-700">
                      {to?.cable_code ?? '(삭제됨)'}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      · {new Date(m.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
                    </span>
                  </div>
                  <div className="ml-2 text-xs text-slate-600 space-y-0.5">
                    {childCircuits.length === 0 ? (
                      <p className="italic text-slate-400">(회선 매핑 없음)</p>
                    ) : (
                      childCircuits.map((mc) => {
                        const c = circuitMap.get(mc.circuit_id)
                        return (
                          <p key={`${mc.circuit_id}|${mc.segment_idx}`}>
                            <span className="font-mono">{c?.circuit_id ?? '(삭제됨)'}</span>
                            {c?.subscriber_name && ` · ${c.subscriber_name}`}
                            {c && isCircuitDiverse(c.kind) && ` · seg ${mc.segment_idx}`}
                          </p>
                        )
                      })
                    )}
                    {m.notes && (
                      <p className="mt-1 italic text-slate-500">비고: {m.notes}</p>
                    )}
                  </div>
                  <form action={deleteMigration} className="flex justify-end">
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="project_id" value={projectId} />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      삭제
                    </button>
                  </form>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
