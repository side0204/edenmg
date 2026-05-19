'use client'

import { useState, useMemo, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import {
  CABLE_SPEC_VALUES,
  formatFacilityCode,
  type ClosureType,
  type CableStatus,
} from '@/lib/relocation'
import { CABLE_STATUS_LABEL, CABLE_STATUS_VALUES } from '@/lib/relocation'
import { autoLayoutPositions, NODE_SIZE } from './auto-layout'
import { saveNodePositions } from './position-actions'
import { createCable } from './cable-actions'

type FacilityNode = {
  id: string
  closure_type: ClosureType
  seq_no: number
  name: string
  x_hint: number | null
  y_hint: number | null
}

type CableEdge = {
  id: string
  from_facility_id: string
  to_facility_id: string
  spec: string
  status: CableStatus
  cable_code: string
}

const EXISTING_COLOR = '#111827'
const NEW_COLOR      = '#dc2626'
const SELECTED_COLOR = '#2563eb'  // blue-600 (선택 강조)
const DRAG_THRESHOLD = 4          // px — 클릭/드래그 구분

const EDGE_COLOR: Record<CableStatus, { stroke: string; dash: string; width: number }> = {
  existing:   { stroke: EXISTING_COLOR, dash: 'none', width: 1.5 },
  new:        { stroke: NEW_COLOR,      dash: 'none', width: 2.2 },
  relocating: { stroke: '#f59e0b',      dash: '6 3',  width: 2 },
  removing:   { stroke: NEW_COLOR,      dash: '4 4',  width: 2 },
}


export default function TopologyCanvas({
  projectId,
  facilities,
  cables,
  editable,
}: {
  projectId: string
  facilities: FacilityNode[]
  cables: CableEdge[]
  editable: boolean
}) {
  const initialPositions = useMemo(() => {
    const map = autoLayoutPositions(facilities)
    const obj: Record<string, { x: number; y: number }> = {}
    for (const [id, p] of map.entries()) obj[id] = { x: p.x, y: p.y }
    return obj
  }, [facilities])

  const [positions, setPositions] = useState(initialPositions)
  const [dragging, setDragging] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pendingConnection, setPendingConnection] = useState<
    { fromId: string; toId: string } | null
  >(null)

  // 클릭/드래그 구분용 ref — 이동 거리가 threshold 미만이면 click
  const interactionRef = useRef<{
    id: string
    startX: number
    startY: number
    offsetX: number
    offsetY: number
    hasMoved: boolean
  } | null>(null)

  const svgRef = useRef<SVGSVGElement>(null)

  // 함체 기설/신설 자동 추론
  const facilityIsNew = useMemo(() => {
    const cablesByFacility = new Map<string, CableEdge[]>()
    for (const c of cables) {
      for (const fId of [c.from_facility_id, c.to_facility_id]) {
        if (!cablesByFacility.has(fId)) cablesByFacility.set(fId, [])
        cablesByFacility.get(fId)!.push(c)
      }
    }
    const result = new Map<string, boolean>()
    for (const f of facilities) {
      const conns = cablesByFacility.get(f.id) ?? []
      const hasExisting = conns.some((c) => c.status === 'existing')
      result.set(f.id, !hasExisting)
    }
    return result
  }, [facilities, cables])

  const viewBox = useMemo(() => {
    const xs = Object.values(positions).map((p) => p.x)
    const ys = Object.values(positions).map((p) => p.y)
    const maxX = (xs.length ? Math.max(...xs) : 800) + NODE_SIZE.width + 60
    const maxY = (ys.length ? Math.max(...ys) : 500) + NODE_SIZE.height + 60
    return `0 0 ${Math.max(maxX, 800)} ${Math.max(maxY, 500)}`
  }, [positions])

  const toSvgCoord = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const result = pt.matrixTransform(ctm.inverse())
    return { x: result.x, y: result.y }
  }, [])

  const handleNodeClick = (id: string) => {
    if (selectedId === id) {
      setSelectedId(null)
      return
    }
    if (selectedId === null) {
      setSelectedId(id)
      return
    }
    // 두 번째 클릭 — 연결 시작
    setPendingConnection({ fromId: selectedId, toId: id })
    setSelectedId(null)
  }

  const onPointerDown = (e: React.PointerEvent<SVGGElement>, id: string) => {
    if (!editable) return
    e.stopPropagation()
    const { x, y } = toSvgCoord(e.clientX, e.clientY)
    const pos = positions[id]
    if (!pos) return
    interactionRef.current = {
      id,
      startX: x,
      startY: y,
      offsetX: x - pos.x,
      offsetY: y - pos.y,
      hasMoved: false,
    }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<SVGGElement>) => {
    const ir = interactionRef.current
    if (!ir) return
    const { x, y } = toSvgCoord(e.clientX, e.clientY)
    const dx = x - ir.startX
    const dy = y - ir.startY
    if (!ir.hasMoved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    if (!ir.hasMoved) {
      ir.hasMoved = true
      setDragging(ir.id)
      // 드래그가 시작되면 선택 해제 (의도하지 않은 연결 방지)
      setSelectedId(null)
    }
    setPositions((prev) => ({
      ...prev,
      [ir.id]: {
        x: x - ir.offsetX,
        y: y - ir.offsetY,
      },
    }))
  }

  const onPointerUp = async () => {
    const ir = interactionRef.current
    interactionRef.current = null
    if (!ir) return

    if (ir.hasMoved) {
      // 드래그 → 위치 저장
      setDragging(null)
      const pos = positions[ir.id]
      if (pos) {
        const result = await saveNodePositions(projectId, [
          { id: ir.id, x: pos.x, y: pos.y },
        ])
        if (!result.ok) toast.error(result.error)
      }
    } else {
      // 클릭 → 선택·연결
      handleNodeClick(ir.id)
    }
  }

  const onCanvasClick = () => {
    // 빈 영역 클릭 시 선택 해제
    if (!interactionRef.current) {
      setSelectedId(null)
    }
  }

  const fromFacility = pendingConnection
    ? facilities.find((f) => f.id === pendingConnection.fromId)
    : null
  const toFacility = pendingConnection
    ? facilities.find((f) => f.id === pendingConnection.toId)
    : null

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
      <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-slate-600">
          시설 {facilities.length}개 · 케이블 {cables.length}개
          {editable && (
            selectedId
              ? ' · 다른 시설을 클릭하면 케이블이 연결됩니다 (취소: 빈 영역 클릭)'
              : ' · 시설 클릭 = 케이블 연결 시작, 드래그 = 위치 이동'
          )}
        </p>
        <Legend />
      </div>
      <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
        <svg
          ref={svgRef}
          viewBox={viewBox}
          className="bg-white select-none"
          style={{ minWidth: '100%', display: 'block', cursor: dragging ? 'grabbing' : 'default' }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={onCanvasClick}
        >
          {/* 케이블 (엣지) — 노드보다 먼저 */}
          {cables.map((c) => {
            const from = positions[c.from_facility_id]
            const to = positions[c.to_facility_id]
            if (!from || !to) return null
            const fx = from.x + NODE_SIZE.width / 2
            const fy = from.y + NODE_SIZE.height / 2 - 10
            const tx = to.x + NODE_SIZE.width / 2
            const ty = to.y + NODE_SIZE.height / 2 - 10
            const mx = (fx + tx) / 2
            const my = (fy + ty) / 2
            const style = EDGE_COLOR[c.status]
            return (
              <g key={c.id}>
                <line
                  x1={fx}
                  y1={fy}
                  x2={tx}
                  y2={ty}
                  stroke={style.stroke}
                  strokeWidth={style.width}
                  strokeDasharray={style.dash}
                />
                <text x={mx} y={my - 4} textAnchor="middle" className="fill-slate-700" style={{ fontSize: 9, fontFamily: 'system-ui' }}>
                  {c.spec}
                </text>
                <text x={mx} y={my + 8} textAnchor="middle" className="fill-slate-400" style={{ fontSize: 8, fontFamily: 'monospace' }}>
                  {c.cable_code}
                </text>
              </g>
            )
          })}

          {/* 시설 (노드) */}
          {facilities.map((f) => {
            const pos = positions[f.id]
            if (!pos) return null
            const code = formatFacilityCode(f.closure_type, f.seq_no)
            const isNew = facilityIsNew.get(f.id) ?? false
            const isSelected = selectedId === f.id
            return (
              <g
                key={f.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                style={{ cursor: editable ? (dragging === f.id ? 'grabbing' : 'pointer') : 'default' }}
                onPointerDown={(e) => onPointerDown(e, f.id)}
              >
                {/* 선택 강조 — 도형 뒤 동그란 후광 */}
                {isSelected && (
                  <circle
                    cx={NODE_SIZE.width / 2}
                    cy={NODE_SIZE.height / 2 - 10}
                    r={22}
                    fill={SELECTED_COLOR}
                    fillOpacity={0.18}
                    stroke={SELECTED_COLOR}
                    strokeWidth={2}
                    strokeDasharray="3 3"
                  />
                )}

                <FacilityShape closureType={f.closure_type} isNew={isNew} />

                <text x={NODE_SIZE.width / 2} y={NODE_SIZE.height - 20} textAnchor="middle" className="fill-slate-700" style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 700 }}>
                  {code}
                </text>
                <text x={NODE_SIZE.width / 2} y={NODE_SIZE.height - 8} textAnchor="middle" className="fill-slate-900" style={{ fontSize: 10, fontFamily: 'system-ui' }}>
                  {f.name.length > 12 ? f.name.slice(0, 11) + '…' : f.name}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {pendingConnection && fromFacility && toFacility && (
        <ConnectionModal
          projectId={projectId}
          from={fromFacility}
          to={toFacility}
          onClose={() => setPendingConnection(null)}
        />
      )}
    </div>
  )
}


function FacilityShape({
  closureType,
  isNew,
}: {
  closureType: ClosureType
  isNew: boolean
}) {
  const cx = NODE_SIZE.width / 2
  const cy = NODE_SIZE.height / 2 - 10
  const color = isNew ? NEW_COLOR : EXISTING_COLOR

  if (closureType === '함체_가공형' || closureType === '함체_관로형') {
    const r = 14
    return (
      <g>
        <circle cx={cx} cy={cy} r={r} fill="white" stroke={color} strokeWidth={1.8} />
        <line x1={cx - r * 0.7} y1={cy - r * 0.7} x2={cx + r * 0.7} y2={cy + r * 0.7} stroke={color} strokeWidth={1.5} />
        <line x1={cx - r * 0.7} y1={cy + r * 0.7} x2={cx + r * 0.7} y2={cy - r * 0.7} stroke={color} strokeWidth={1.5} />
      </g>
    )
  }

  if (closureType === '가입자시설') {
    return <circle cx={cx} cy={cy} r={11} fill={NEW_COLOR} stroke={NEW_COLOR} strokeWidth={1} />
  }

  if (closureType === '국사') {
    const w = 38
    const h = 22
    return (
      <g>
        <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} fill={color} stroke={color} strokeWidth={1.5} rx={3} ry={3} />
        <text x={cx} y={cy + 4} textAnchor="middle" fill="white" style={{ fontSize: 10, fontFamily: 'system-ui', fontWeight: 700 }}>
          국사
        </text>
      </g>
    )
  }

  if (closureType === '맨홀') {
    const s = 18
    return (
      <rect x={cx - s / 2} y={cy - s / 2} width={s} height={s} fill="white" stroke={color} strokeWidth={1.8} />
    )
  }

  const w = 32
  const h = 16
  const label =
    closureType === 'MOFD' ? 'MOFD' :
    closureType === 'OJC'  ? 'OJC'  :
    'EQ'
  return (
    <g>
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} fill="white" stroke={color} strokeWidth={1.4} />
      <text x={cx} y={cy + 3} textAnchor="middle" fill={color} style={{ fontSize: 8, fontFamily: 'system-ui', fontWeight: 600 }}>
        {label}
      </text>
    </g>
  )
}


function ConnectionModal({
  projectId,
  from,
  to,
  onClose,
}: {
  projectId: string
  from: FacilityNode
  to: FacilityNode
  onClose: () => void
}) {
  const fromLabel = `${formatFacilityCode(from.closure_type, from.seq_no)} ${from.name}`
  const toLabel = `${formatFacilityCode(to.closure_type, to.seq_no)} ${to.name}`

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-lg font-bold text-slate-900">케이블 연결</h3>
          <p className="text-xs text-slate-500 mt-1">두 시설을 연결할 케이블 정보를 입력하세요.</p>
        </div>

        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <p className="text-slate-600">
            <span className="font-medium text-slate-900">{fromLabel}</span>
            <span className="mx-2 text-slate-400">→</span>
            <span className="font-medium text-slate-900">{toLabel}</span>
          </p>
        </div>

        <form action={createCable} className="space-y-3">
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="from_facility_id" value={from.id} />
          <input type="hidden" name="to_facility_id" value={to.id} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                규격 <span className="text-rose-600">*</span>
              </label>
              <select
                name="spec"
                required
                defaultValue="144C"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {CABLE_SPEC_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">상태</label>
              <select
                name="status"
                defaultValue="new"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {CABLE_STATUS_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {CABLE_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">
              케이블 ID (신설은 비워두면 자동 생성)
            </label>
            <input
              type="text"
              name="cable_code"
              maxLength={100}
              placeholder="기설은 LGU+ 제공 ID. 신설은 비워두면 NEW-XXXX-NNNNNN"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">경로 종류</label>
            <select
              name="route_type"
              defaultValue=""
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">(미지정)</option>
              <option value="가공">가공</option>
              <option value="지중">지중</option>
              <option value="관로">관로</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">비고</label>
            <input
              type="text"
              name="notes"
              maxLength={1000}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              취소
            </button>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              케이블 생성
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


function Legend() {
  const symbolSize = 16
  return (
    <div className="flex items-center gap-3 text-[10px] text-slate-600 flex-wrap">
      <span className="flex items-center gap-1">
        <svg width={symbolSize} height={symbolSize}>
          <circle cx={8} cy={8} r={6} fill="white" stroke={EXISTING_COLOR} strokeWidth={1.5} />
          <line x1={4} y1={4} x2={12} y2={12} stroke={EXISTING_COLOR} strokeWidth={1.2} />
          <line x1={4} y1={12} x2={12} y2={4} stroke={EXISTING_COLOR} strokeWidth={1.2} />
        </svg>
        기설 함체
      </span>
      <span className="flex items-center gap-1">
        <svg width={symbolSize} height={symbolSize}>
          <circle cx={8} cy={8} r={6} fill="white" stroke={NEW_COLOR} strokeWidth={1.5} />
          <line x1={4} y1={4} x2={12} y2={12} stroke={NEW_COLOR} strokeWidth={1.2} />
          <line x1={4} y1={12} x2={12} y2={4} stroke={NEW_COLOR} strokeWidth={1.2} />
        </svg>
        신설 함체
      </span>
      <span className="flex items-center gap-1">
        <svg width={symbolSize} height={symbolSize}>
          <circle cx={8} cy={8} r={5} fill={NEW_COLOR} />
        </svg>
        가입자
      </span>
      <span className="flex items-center gap-1">
        <svg width={symbolSize} height={symbolSize}>
          <rect x={2} y={4} width={12} height={8} fill={EXISTING_COLOR} rx={1.5} />
        </svg>
        국사
      </span>
      <span className="flex items-center gap-1">
        <svg width={symbolSize} height={symbolSize}>
          <rect x={3} y={3} width={10} height={10} fill="white" stroke={EXISTING_COLOR} strokeWidth={1.5} />
        </svg>
        맨홀
      </span>
      <span className="ml-1 flex items-center gap-1">
        <svg width={20} height={4}>
          <line x1={0} y1={2} x2={20} y2={2} stroke={EXISTING_COLOR} strokeWidth={1.5} />
        </svg>
        기설
      </span>
      <span className="flex items-center gap-1">
        <svg width={20} height={4}>
          <line x1={0} y1={2} x2={20} y2={2} stroke={NEW_COLOR} strokeWidth={2.2} />
        </svg>
        신설
      </span>
    </div>
  )
}
