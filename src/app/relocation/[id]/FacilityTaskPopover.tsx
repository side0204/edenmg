'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { X, Save, Loader2, GripHorizontal, Plus } from 'lucide-react'
import { addFacilityTaskFromPopover } from './facility-task-actions'
import FacilityPhotoInput from './FacilityPhotoInput'

// 청약 카테고리 도식 모드 — 시설물 위 floating 「작업내역 입력」 창.
//   사용코어입력 popover 와 동일한 패턴. 드래그 가능, 큰 글자.
//
// 입력 방법 (owner 2026-05-25):
//   A. 저장된 공종 선택 — 회사 단위 공종 마스터 드롭다운. (공종코드, 공종명) 표시.
//   B. 직접 입력 — 공종코드 + 공종명 + 단위 입력. server 가 마스터에 자동 등록 후 사용.
//   같은 회사 안 (코드 또는 이름) 중복 시 기존 행 재사용.
//
// 검증 (owner 2026-05-25):
//   공종이 「코어접속」 일 때 — 시설에 연결된 케이블 모두 worker 코어 입력 필요.
//   없으면 「출발~도착 선번 입력 확인 후 다시 확정」 에러 (server 가 발생).

type TaskTypeOption = {
  id: string
  name: string
  code: string | null
  unit_label: string
}

export type FacilityTaskPopoverProps = {
  projectId: string
  facilityId: string
  facilityCode: string
  facilityName: string
  taskTypes: TaskTypeOption[]
  // 프로젝트의 작업번호 후보 — 청약에 여러 작업번호가 있을 때 선택.
  //   비어있으면 작업번호 입력란 자체 미노출 (단일·미부여 프로젝트).
  orderNos: string[]
  // SVG viewport unit per client pixel — 드래그 거리 보정용
  svgScale: number
  onSaved: () => void
  onClose: () => void
}

export default function FacilityTaskPopover({
  projectId,
  facilityId,
  facilityCode,
  facilityName,
  taskTypes,
  orderNos,
  svgScale,
  onSaved,
  onClose,
}: FacilityTaskPopoverProps) {
  const [mode, setMode] = useState<'pick' | 'manual'>('pick')
  const [pickedId, setPickedId] = useState<string>('')
  const [manualCode, setManualCode] = useState('')
  const [manualName, setManualName] = useState('')
  const [manualUnit, setManualUnit] = useState('식')
  const [quantity, setQuantity] = useState('1')
  const [busy, setBusy] = useState(false)
  // 작업번호 — 단일이면 자동 선택, 여러 개면 사용자가 고름
  const [orderNo, setOrderNo] = useState<string>(
    orderNos.length === 1 ? orderNos[0] : '',
  )

  // 드래그
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{
    startX: number
    startY: number
    baseX: number
    baseY: number
    scale: number
  } | null>(null)

  function onHeaderPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: offset.x,
      baseY: offset.y,
      scale: svgScale || 1,
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {}
  }
  function onHeaderPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    if (!d) return
    setOffset({
      x: d.baseX + (e.clientX - d.startX) * d.scale,
      y: d.baseY + (e.clientY - d.startY) * d.scale,
    })
  }
  function onHeaderPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
  }

  const pickedOption = useMemo(
    () => taskTypes.find((t) => t.id === pickedId) ?? null,
    [taskTypes, pickedId],
  )
  const needsOrderNo = orderNos.length > 0
  const valid =
    quantity.length > 0 &&
    Number.isInteger(Number(quantity)) &&
    Number(quantity) >= 1 &&
    (mode === 'pick' ? !!pickedId : manualName.trim().length > 0) &&
    (!needsOrderNo || !!orderNo)

  async function onSave() {
    if (!valid || busy) return
    setBusy(true)
    const result = await addFacilityTaskFromPopover({
      project_id: projectId,
      facility_id: facilityId,
      task_type_id: mode === 'pick' ? pickedId : null,
      manual_code: mode === 'manual' ? manualCode.trim() || null : null,
      manual_name: mode === 'manual' ? manualName.trim() || null : null,
      manual_unit: mode === 'manual' ? manualUnit.trim() || null : null,
      quantity: Number(quantity),
      order_no: orderNo || null,
    })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    const label =
      mode === 'pick' && pickedOption
        ? pickedOption.name
        : manualName.trim()
    toast.success(`「${label}」 ${quantity} ${manualUnit || pickedOption?.unit_label || ''} 저장`)
    setQuantity('1')
    setManualCode('')
    setManualName('')
    onSaved()
  }

  // wheel 이벤트 — popover 안 스크롤이 SVG 의 zoom 으로 새지 않도록 차단.
  //   캔버스 SVG 에 native addEventListener('wheel', ..., {passive:false}) 가 붙어 있어
  //   React onWheel 의 stopPropagation 만으론 막을 수 없음.
  //   여기서 native wheel listener 로 stopPropagation — DOM 버블링 자체를 끊는다.
  //   passive: false 가 필요 (passive 면 stopPropagation 못 함).
  const wrapperRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const handler = (e: WheelEvent) => e.stopPropagation()
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  return (
    <div
      ref={wrapperRef}
      style={{
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        width: '100%',
        height: '100%',
      }}
    >
      <div className="w-full h-full overflow-hidden rounded-xl border-[3px] border-emerald-500 bg-white shadow-2xl flex flex-col">
        <div
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
          onPointerCancel={onHeaderPointerUp}
          className="flex items-center justify-between border-b border-slate-200 bg-emerald-50 px-4 py-3 shrink-0"
          style={{ cursor: 'move', touchAction: 'none' }}
        >
          <div className="min-w-0 flex items-center gap-2">
            <GripHorizontal className="h-5 w-5 text-slate-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-2xl font-extrabold text-emerald-700 leading-tight">
                작업내역 입력
              </p>
              <p className="text-lg font-semibold text-slate-700 truncate">
                {facilityCode} · {facilityName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
            className="shrink-0 text-slate-500 hover:text-slate-900 ml-2"
            aria-label="닫기"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
          {/* 작업번호 선택 — 청약에 작업번호가 있을 때만 노출.
              1개면 자동 prefill, 2개 이상이면 사용자가 골라야 함 */}
          {orderNos.length > 0 && (
            <div>
              <label className="block text-lg font-semibold text-slate-700 mb-1">
                작업번호 <span className="text-rose-600">*</span>
              </label>
              {orderNos.length === 1 ? (
                <>
                  <input type="hidden" value={orderNo} />
                  <p className="inline-flex items-center rounded-md bg-slate-100 px-3 py-2 text-lg font-mono font-bold text-slate-900">
                    {orderNos[0]}
                  </p>
                </>
              ) : (
                <select
                  value={orderNo}
                  onChange={(e) => setOrderNo(e.target.value)}
                  disabled={busy}
                  className="w-full rounded-md border-2 border-slate-300 px-3 py-2.5 text-lg font-mono font-bold bg-white focus:outline-none focus:ring-2 focus:border-emerald-500 focus:ring-emerald-300 disabled:bg-slate-100"
                >
                  <option value="">— 선택 —</option>
                  {orderNos.map((no) => (
                    <option key={no} value={no}>
                      {no}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* 모드 토글 */}
          <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setMode('pick')}
              disabled={busy}
              className={
                'flex-1 rounded px-3 py-2 text-lg font-bold ' +
                (mode === 'pick'
                  ? 'bg-white text-emerald-700 shadow'
                  : 'text-slate-500')
              }
            >
              저장된 공종 선택
            </button>
            <button
              type="button"
              onClick={() => setMode('manual')}
              disabled={busy}
              className={
                'flex-1 rounded px-3 py-2 text-lg font-bold ' +
                (mode === 'manual'
                  ? 'bg-white text-emerald-700 shadow'
                  : 'text-slate-500')
              }
            >
              직접 입력
            </button>
          </div>

          {mode === 'pick' ? (
            <div>
              <label className="block text-lg font-semibold text-slate-700 mb-1">
                공종 선택
              </label>
              <select
                value={pickedId}
                onChange={(e) => setPickedId(e.target.value)}
                disabled={busy}
                className="w-full rounded-md border-2 border-slate-300 px-3 py-2.5 text-lg bg-white focus:outline-none focus:ring-2 focus:border-emerald-500 focus:ring-emerald-300 disabled:bg-slate-100"
              >
                <option value="">— 선택 —</option>
                {taskTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code ? `[${t.code}] ` : ''}
                    {t.name} ({t.unit_label})
                  </option>
                ))}
              </select>
              {taskTypes.length === 0 && (
                <p className="mt-1 text-base text-slate-500">
                  저장된 공종이 없습니다 — 「직접 입력」으로 만드세요
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="block text-lg font-semibold text-slate-700 mb-1">
                    공종코드
                  </span>
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    maxLength={50}
                    placeholder="예: A001"
                    disabled={busy}
                    className="w-full rounded-md border-2 border-slate-300 px-3 py-2.5 text-lg font-mono font-bold focus:outline-none focus:ring-2 focus:border-emerald-500 focus:ring-emerald-300 disabled:bg-slate-100"
                  />
                </label>
                <label className="block">
                  <span className="block text-lg font-semibold text-slate-700 mb-1">
                    단위
                  </span>
                  <input
                    type="text"
                    value={manualUnit}
                    onChange={(e) => setManualUnit(e.target.value)}
                    maxLength={20}
                    placeholder="식 / 개 / m 등"
                    disabled={busy}
                    className="w-full rounded-md border-2 border-slate-300 px-3 py-2.5 text-lg font-semibold focus:outline-none focus:ring-2 focus:border-emerald-500 focus:ring-emerald-300 disabled:bg-slate-100"
                  />
                </label>
              </div>
              <label className="block">
                <span className="block text-lg font-semibold text-slate-700 mb-1">
                  공종명
                </span>
                <input
                  type="text"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  maxLength={100}
                  placeholder="예: 코어접속, 함체작업"
                  disabled={busy}
                  className="w-full rounded-md border-2 border-slate-300 px-3 py-2.5 text-lg font-semibold focus:outline-none focus:ring-2 focus:border-emerald-500 focus:ring-emerald-300 disabled:bg-slate-100"
                />
              </label>
              <p className="text-base text-slate-500">
                입력 후 회사 공종 마스터에 자동 저장되어, 다음부터 「저장된 공종 선택」 에서 사용 가능합니다.
              </p>
            </div>
          )}

          <label className="block">
            <span className="block text-lg font-semibold text-slate-700 mb-1">
              수량
            </span>
            <input
              type="number"
              min={1}
              max={9999}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={busy}
              className="w-full rounded-md border-2 border-slate-300 px-3 py-2.5 text-2xl font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:border-emerald-500 focus:ring-emerald-300 disabled:bg-slate-100"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && valid) {
                  e.preventDefault()
                  void onSave()
                }
              }}
            />
          </label>

          <button
            type="button"
            onClick={onSave}
            disabled={!valid || busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 hover:bg-emerald-700 px-4 py-3 text-xl font-extrabold text-white disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            {busy ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : mode === 'manual' ? (
              <Plus className="h-6 w-6" />
            ) : (
              <Save className="h-6 w-6" />
            )}
            확정
          </button>

          {/* 작업사진 입력 — 확정 버튼 아래. 카테고리 선택 후 카메라/갤러리 */}
          <FacilityPhotoInput
            projectId={projectId}
            facilityId={facilityId}
            onUploaded={onSaved}
            compact
          />
        </div>
      </div>
    </div>
  )
}
