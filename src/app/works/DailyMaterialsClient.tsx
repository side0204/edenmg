'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Plus } from 'lucide-react'
import HoldingPicker, { type HoldingOption } from './HoldingPicker'
import { addDailyReportMaterial } from './daily-material-actions'
import { ACQUISITION_REASON_VALUES, formatQty } from '@/lib/stock'

type Master = { id: string; name: string; spec: string | null; unit: string | null }

type Props = {
  reportId: string
  workId: string
  // 작성자가 보유한 모든 holding (모든 작업 포함)
  holdings: HoldingOption[]
  masters: Master[]
}

export default function DailyMaterialsClient({ reportId, workId, holdings, masters }: Props) {
  const [mode, setMode] = useState<'holding' | 'master' | 'custom'>('holding')
  const [picked, setPicked] = useState<HoldingOption | null>(null)
  const [pickedMaster, setPickedMaster] = useState<Master | null>(null)
  const [qty, setQty] = useState('')

  const qtyNum = Number(qty)
  const isOver = !!picked && Number.isFinite(qtyNum) && qtyNum > picked.quantity_remaining
  const isOtherWork = !!picked && picked.work_id !== workId

  // 작업 외 holding 인 경우 사후신고 여부 (지입+저비용) — 이 정보는 holding 에 없음 (Phase 1.5 에서 lot.materials.low_value 전달 필요).
  // v2: HoldingOption 에 low_value/source_type 이미 있음 (source_type 있음). low_value 는 prop 으로 받자.
  // 일단 client 는 안내만 띄움 — 실제 분기는 server.
  const needsApproval = isOtherWork // 정확한 분기는 server. 일단 사용자에겐 보수적으로 안내.

  const filteredHoldings = useMemo(() => holdings, [holdings])

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 text-xs">
        <ModeTab active={mode === 'holding'} onClick={() => setMode('holding')} label={`내 자재 (${filteredHoldings.length})`} />
        <ModeTab active={mode === 'master'} onClick={() => setMode('master')} label="마스터" />
        <ModeTab active={mode === 'custom'} onClick={() => setMode('custom')} label="직접입력" />
      </div>

      <form
        action={addDailyReportMaterial}
        className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/40 p-3"
      >
        <input type="hidden" name="report_id" value={reportId} />
        <input type="hidden" name="work_id" value={workId} />

        {mode === 'holding' && (
          <>
            <input type="hidden" name="holding_id" value={picked?.id ?? ''} />
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1 text-sm text-slate-700">
                {picked ? (
                  <>
                    <span className="font-medium">{picked.material.name}</span>
                    {picked.material.spec && <span className="text-slate-500"> ({picked.material.spec})</span>}
                    <span className="ml-1 text-xs text-slate-500">
                      잔량 {formatQty(picked.quantity_remaining, picked.material.unit)}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-400">자재 선택...</span>
                )}
              </span>
              <HoldingPicker holdings={filteredHoldings} onSelect={(h) => setPicked(h)} />
            </div>

            {/* 작업 외 사용 안내 */}
            {isOtherWork && (
              <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                ⚠ 이 자재는 다른 작업({picked!.work_order_id ?? picked!.work_name})에 출고된 자재입니다.
                지입+저비용이면 즉시 사용(사후신고), 그 외엔 자재담당자 승인 대기로 등록됩니다.
              </p>
            )}
          </>
        )}

        {mode === 'master' && (
          <>
            <input type="hidden" name="material_id" value={pickedMaster?.id ?? ''} />
            <select
              value={pickedMaster?.id ?? ''}
              onChange={(e) => {
                const id = e.currentTarget.value
                setPickedMaster(masters.find((m) => m.id === id) ?? null)
              }}
              className={inputClass}
            >
              <option value="">자재 선택</option>
              {masters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.spec ? ` (${m.spec})` : ''}
                  {m.unit ? ` · ${m.unit}` : ''}
                </option>
              ))}
            </select>
          </>
        )}

        {mode === 'custom' && (
          <div className="grid grid-cols-3 gap-1.5">
            <input
              name="custom_name"
              placeholder="자재명"
              maxLength={100}
              className={inputClass}
            />
            <input name="custom_spec" placeholder="규격" maxLength={100} className={inputClass} />
            <input name="custom_unit" placeholder="단위" maxLength={20} className={inputClass} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-1.5">
          <input
            name="quantity"
            type="number"
            step="0.001"
            min="0.001"
            required
            value={qty}
            onChange={(e) => setQty(e.currentTarget.value)}
            placeholder="수량 *"
            className={isOver ? inputClassErr : inputClass}
          />
          <input
            name="notes"
            placeholder="메모"
            maxLength={200}
            className={inputClass}
          />
        </div>

        {/* 초과 사용 사유 */}
        {mode === 'holding' && isOver && picked && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 p-2 space-y-1">
            <p className="flex items-center gap-1 text-xs font-medium text-rose-700">
              <AlertTriangle className="h-3 w-3" />
              잔량({formatQty(picked.quantity_remaining, picked.material.unit)}) 초과 ·{' '}
              {(qtyNum - picked.quantity_remaining).toFixed(3).replace(/\.?0+$/, '')}
              {picked.material.unit ?? ''} 초과 사용
            </p>
            <input
              name="over_reason"
              required
              maxLength={200}
              placeholder="초과 사용 사유 * (현장 실제 사용량 등)"
              className={inputClass}
            />
          </div>
        )}

        {/* 미출고 자재 — 취득사유 */}
        {(mode === 'master' || mode === 'custom') && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2 space-y-1.5">
            <p className="text-[11px] font-medium text-amber-800">
              출고받지 않은 자재 — 취득사유 필수
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              <select
                name="acquisition_reason_type"
                required
                defaultValue=""
                className={inputClass + ' col-span-1'}
              >
                <option value="">유형 *</option>
                {ACQUISITION_REASON_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <input
                name="acquisition_reason"
                required
                maxLength={200}
                placeholder="상세 사유 * (예: 강남 마트 구매)"
                className={inputClass + ' col-span-2'}
              />
            </div>
          </div>
        )}

        {needsApproval && mode === 'holding' && (
          <p className="text-[11px] text-slate-500">
            ※ 자재담당자 승인이 필요한 경우 일보에는 「승인 대기」 로 등록됩니다.
          </p>
        )}

        <button
          type="submit"
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <Plus className="h-3.5 w-3.5" />
          자재 추가
        </button>
      </form>
    </div>
  )
}

function ModeTab({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-full px-2.5 py-1 ' +
        (active ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700')
      }
    >
      {label}
    </button>
  )
}

const inputClass =
  'w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900'
const inputClassErr =
  'w-full rounded-md border border-rose-500 px-2 py-1.5 text-sm bg-rose-50 focus:border-rose-700 focus:outline-none focus:ring-1 focus:ring-rose-700'
