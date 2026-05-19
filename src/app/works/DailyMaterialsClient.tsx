'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import HoldingPicker, { type HoldingOption } from './HoldingPicker'
import { addDailyReportMaterial } from './daily-material-actions'

type Master = { id: string; name: string; spec: string | null; unit: string | null }

type Props = {
  reportId: string
  workId: string
  holdings: HoldingOption[]
  masters: Master[]
}

export default function DailyMaterialsClient({ reportId, workId, holdings, masters }: Props) {
  const [mode, setMode] = useState<'holding' | 'master' | 'custom'>('holding')
  const [picked, setPicked] = useState<HoldingOption | null>(null)
  const [pickedMaster, setPickedMaster] = useState<Master | null>(null)
  const [name, setName] = useState('')
  const [spec, setSpec] = useState('')
  const [unit, setUnit] = useState('')
  const [qty, setQty] = useState('')
  const [notes, setNotes] = useState('')

  function reset() {
    setPicked(null)
    setPickedMaster(null)
    setName('')
    setSpec('')
    setUnit('')
    setQty('')
    setNotes('')
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 text-xs">
        <ModeTab active={mode === 'holding'} onClick={() => setMode('holding')} label={`내 자재 (${holdings.length})`} />
        <ModeTab active={mode === 'master'} onClick={() => setMode('master')} label="마스터" />
        <ModeTab active={mode === 'custom'} onClick={() => setMode('custom')} label="직접입력" />
      </div>

      <form
        action={addDailyReportMaterial}
        onSubmit={() => {
          // 서버 액션 후 새로고침 — useRouter 미사용 (server action 내 revalidatePath)
          setTimeout(reset, 100)
        }}
        className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/40 p-3"
      >
        <input type="hidden" name="report_id" value={reportId} />
        <input type="hidden" name="work_id" value={workId} />

        {mode === 'holding' && (
          <>
            <input type="hidden" name="holding_id" value={picked?.id ?? ''} />
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-700">
                {picked ? (
                  <>
                    <span className="font-medium">{picked.material.name}</span>
                    {picked.material.spec && <span className="text-slate-500"> ({picked.material.spec})</span>}
                    <span className="ml-1 text-xs text-slate-500">
                      잔량 {picked.quantity_remaining}
                      {picked.material.unit ?? ''}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-400">자재 선택...</span>
                )}
              </span>
              <HoldingPicker
                holdings={holdings}
                filterWorkId={workId}
                onSelect={(h) => setPicked(h)}
              />
            </div>
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
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder="자재명"
              maxLength={100}
              className={inputClass}
            />
            <input
              name="custom_spec"
              value={spec}
              onChange={(e) => setSpec(e.currentTarget.value)}
              placeholder="규격"
              maxLength={100}
              className={inputClass}
            />
            <input
              name="custom_unit"
              value={unit}
              onChange={(e) => setUnit(e.currentTarget.value)}
              placeholder="단위"
              maxLength={20}
              className={inputClass}
            />
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
            className={inputClass}
          />
          <input
            name="notes"
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
            placeholder="메모"
            maxLength={200}
            className={inputClass}
          />
        </div>

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
