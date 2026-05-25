'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2, Layers, ArrowRight } from 'lucide-react'
import { formatFacilityCode, type ClosureType } from '@/lib/relocation'
import type { CableSpec } from '@/lib/connection'
import { createSplice, deleteSplice } from './splice-actions'
import SpliceDiagram from './SpliceDiagram'

// 직선도(접속) 탭 — 함체 안에서 입력 케이블 코어 ↔ 출력 케이블 코어 접속 매핑.

export type SpliceFacility = {
  id: string
  closure_type: ClosureType
  seq_no: number
  name: string
}

export type SpliceCable = {
  id: string
  from_facility_id: string
  to_facility_id: string
  cable_code: string
  spec: CableSpec
}

export type SpliceRow = {
  id: string
  facility_id: string
  in_cable_id: string
  in_core: number
  out_cable_id: string
  out_core: number
  is_continuous: boolean
}

export default function SpliceTab({
  projectId,
  facilities,
  cables,
  splices,
}: {
  projectId: string
  facilities: SpliceFacility[]
  cables: SpliceCable[]
  splices: SpliceRow[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [facilityId, setFacilityId] = useState('')

  // 추가 폼
  const [inCable, setInCable] = useState('')
  const [inCore, setInCore] = useState('')
  const [outCable, setOutCable] = useState('')
  const [outCore, setOutCore] = useState('')
  const [isContinuous, setIsContinuous] = useState(true)

  const facilityById = useMemo(
    () => new Map(facilities.map((f) => [f.id, f])),
    [facilities],
  )

  function cableLabel(id: string): string {
    const c = cables.find((x) => x.id === id)
    if (!c) return '(삭제된 케이블)'
    const from = facilityById.get(c.from_facility_id)?.name ?? '?'
    const to = facilityById.get(c.to_facility_id)?.name ?? '?'
    return `${from} ~ ${to} · ${c.spec}`
  }

  // 선택한 함체에 연결된 케이블
  const connectedCables = useMemo(
    () =>
      facilityId
        ? cables.filter(
            (c) =>
              c.from_facility_id === facilityId || c.to_facility_id === facilityId,
          )
        : [],
    [cables, facilityId],
  )

  const facilitySplices = useMemo(
    () => splices.filter((s) => s.facility_id === facilityId),
    [splices, facilityId],
  )

  function resetForm() {
    setInCable('')
    setInCore('')
    setOutCable('')
    setOutCore('')
    setIsContinuous(true)
  }

  async function onAdd() {
    if (busy) return
    if (!inCable || !outCable) {
      toast.error('입력·출력 케이블을 선택하세요')
      return
    }
    const ic = Number.parseInt(inCore, 10)
    const oc = Number.parseInt(outCore, 10)
    if (!Number.isFinite(ic) || ic < 1) {
      toast.error('입력 코어 번호를 입력하세요')
      return
    }
    if (!Number.isFinite(oc) || oc < 1) {
      toast.error('출력 코어 번호를 입력하세요')
      return
    }
    setBusy(true)
    const r = await createSplice({
      project_id: projectId,
      facility_id: facilityId,
      in_cable_id: inCable,
      in_core: ic,
      out_cable_id: outCable,
      out_core: oc,
      is_continuous: isContinuous,
    })
    setBusy(false)
    if (!r.ok) {
      toast.error(r.error)
      return
    }
    toast.success('접속을 등록했습니다')
    resetForm()
    router.refresh()
  }

  async function onRemove(id: string) {
    if (busy) return
    setBusy(true)
    const r = await deleteSplice(projectId, id)
    setBusy(false)
    if (!r.ok) {
      toast.error(r.error)
      return
    }
    toast.success('접속을 삭제했습니다')
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="flex items-center gap-1 text-sm font-semibold text-slate-700">
          <Layers className="h-4 w-4" />
          접속 입력 (직선도)
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          함체 안에서 입력 케이블의 코어가 출력 케이블의 어느 코어로 접속되는지
          입력합니다. 검증 룰·차수 동시작업·직선도의 입력 데이터입니다.
        </p>

        <div className="mt-3">
          <label className="block text-xs font-medium text-slate-600">함체·시설 선택</label>
          <select
            value={facilityId}
            onChange={(e) => {
              setFacilityId(e.target.value)
              resetForm()
            }}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">시설을 선택하세요</option>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {formatFacilityCode(f.closure_type, f.seq_no)} {f.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      {!facilityId ? (
        <p className="text-sm text-slate-400 italic px-2 py-4 text-center">
          위에서 함체·시설을 선택하면 접속을 입력할 수 있습니다.
        </p>
      ) : (
        <>
          {/* 접속 목록 */}
          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-slate-700">
              접속 ({facilitySplices.length})
            </h4>
            {facilitySplices.length === 0 ? (
              <p className="text-sm text-slate-400 italic px-2 py-3">
                이 시설에 등록된 접속이 없습니다.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white overflow-hidden">
                {facilitySplices.map((s) => (
                  <li
                    key={s.id}
                    className="px-4 py-2.5 flex items-center gap-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 flex-wrap text-slate-800">
                        <span className="truncate">{cableLabel(s.in_cable_id)}</span>
                        <span className="font-mono font-semibold text-slate-900">
                          코어 {s.in_core}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                        <span className="truncate">{cableLabel(s.out_cable_id)}</span>
                        <span className="font-mono font-semibold text-slate-900">
                          코어 {s.out_core}
                        </span>
                        {!s.is_continuous && (
                          <span className="rounded border border-amber-300 bg-amber-50 px-1 text-[10px] text-amber-700">
                            비연속
                          </span>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemove(s.id)}
                      disabled={busy}
                      title="접속 삭제"
                      className="shrink-0 text-slate-400 hover:text-rose-600 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 직선도 */}
          {facilitySplices.length > 0 && (
            <section className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-700">직선도</h4>
              <SpliceDiagram splices={facilitySplices} cableLabel={cableLabel} />
            </section>
          )}

          {/* 접속 추가 — 헤더 클릭으로 접기/펼치기 */}
          <details
            open
            className="group border border-slate-200 rounded-xl bg-white [&[open]>summary>.chev]:rotate-180"
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Plus className="h-4 w-4" />
              <span className="flex-1">접속 추가</span>
              <span className="chev text-slate-400 transition-transform">▾</span>
            </summary>
            <div className="px-4 pb-4">
            {connectedCables.length === 0 ? (
              <p className="text-sm text-slate-500 italic">
                이 시설에 연결된 케이블이 없습니다. 케이블을 먼저 등록하세요.
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-600">
                      입력 케이블 <span className="text-rose-600">*</span>
                    </label>
                    <select
                      value={inCable}
                      onChange={(e) => setInCable(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">선택</option>
                      {connectedCables.map((c) => (
                        <option key={c.id} value={c.id}>
                          {cableLabel(c.id)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600">
                      입력 코어 <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={576}
                      value={inCore}
                      onChange={(e) => setInCore(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600">
                      출력 케이블 <span className="text-rose-600">*</span>
                    </label>
                    <select
                      value={outCable}
                      onChange={(e) => setOutCable(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">선택</option>
                      {connectedCables.map((c) => (
                        <option key={c.id} value={c.id}>
                          {cableLabel(c.id)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600">
                      출력 코어 <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={576}
                      value={outCore}
                      onChange={(e) => setOutCore(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isContinuous}
                    onChange={(e) => setIsContinuous(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                  <span className="text-sm text-slate-700">연속 코어</span>
                  <span className="text-[11px] text-slate-400">
                    양쪽 모두 연속된 코어면 체크 (작업시간 산출에 사용)
                  </span>
                </label>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={onAdd}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:bg-slate-300"
                  >
                    <Plus className="h-4 w-4" />
                    {busy ? '등록 중…' : '접속 추가'}
                  </button>
                </div>
              </>
            )}
            </div>
          </details>
        </>
      )}
    </div>
  )
}
