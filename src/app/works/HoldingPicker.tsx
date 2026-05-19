'use client'

import { useState } from 'react'
import { Package, X } from 'lucide-react'
import { formatMaterialLabel, formatQty, type StockSourceType } from '@/lib/stock'

export type HoldingOption = {
  id: string
  work_id: string
  work_name: string
  work_order_id: string | null
  quantity_remaining: number
  source_type: StockSourceType
  supplier: string | null
  material: {
    id: string
    name: string
    spec: string | null
    unit: string | null
    default_spec: string | null
    default_supplier: string | null
    supplier_code: string | null
  }
}

type Props = {
  holdings: HoldingOption[]
  onSelect: (h: HoldingOption) => void
  // 작업 단위로 필터 (현재 일보가 속한 작업의 holding 만 보여줄지)
  filterWorkId?: string | null
}

export default function HoldingPicker({ holdings, onSelect, filterWorkId }: Props) {
  const [open, setOpen] = useState(false)
  const filtered = filterWorkId ? holdings.filter((h) => h.work_id === filterWorkId) : holdings

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
      >
        <Package className="h-3.5 w-3.5" />
        내 자재에서 선택 ({filtered.length})
      </button>

      <div
        className={
          'fixed inset-0 z-40 ' + (open ? 'pointer-events-auto' : 'pointer-events-none hidden')
        }
      >
        <div
          className="absolute inset-0 bg-black/40"
          onClick={() => setOpen(false)}
          aria-hidden
        />
        <div className="absolute inset-x-0 bottom-0 top-12 rounded-t-3xl bg-white shadow-2xl flex flex-col">
          <header className="border-b border-slate-200 p-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">내 자재</h2>
              <p className="text-xs text-slate-500">
                {filtered.length}건
                {filterWorkId && <span className="ml-1">· 이 작업에 출고된 자재만</span>}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"
              aria-label="닫기"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-4">
            {filtered.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">
                {filterWorkId
                  ? '이 작업에 출고받은 자재가 없습니다.'
                  : '보유 자재가 없습니다.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {filtered.map((h) => {
                  const label = formatMaterialLabel(h.material)
                  return (
                    <li
                      key={h.id}
                      role="button"
                      tabIndex={0}
                      onPointerDown={(e) => {
                        e.preventDefault()
                        onSelect(h)
                        setOpen(false)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onSelect(h)
                          setOpen(false)
                        }
                      }}
                      className="cursor-pointer rounded-xl border border-slate-200 bg-white p-3 hover:border-emerald-400 hover:bg-emerald-50/40"
                    >
                      <p className="font-medium text-slate-900">{label}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        잔량 {formatQty(h.quantity_remaining, h.material.unit)} ·{' '}
                        {h.source_type}
                        {h.work_order_id && ` · ${h.work_order_id}`}
                        {!filterWorkId && ` · ${h.work_name}`}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
