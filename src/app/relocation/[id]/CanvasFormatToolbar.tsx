'use client'

import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Bold, Italic, Palette, Minus, Plus } from 'lucide-react'
import { updateFacilityLabelStyle } from './facility-actions'
import { updateCableLineStyle } from './cable-actions'

// 캔버스 상단 floating 「서식」 툴바 — 시설 OR 케이블 선택 시 노출.
//   엑셀의 서식 메뉴와 유사한 인라인 UX. 도식·지도 모드 공통.
//
// 시설 선택 시 표시:
//   - 폰트 family (Pretendard·monospace·serif)
//   - 글자 크기 배율 (-/+ 버튼 또는 select)
//   - B (굵게) · I (기울임) 토글
//   - 색 (color input)
//   - 초기화 (기본값 복귀)
//
// 케이블 선택 시 표시:
//   - 두께 1~5 (얇음~매우굵음) — 5단계 toggle group
//   - 초기화

// 캔버스에 표시되는 「현재 스타일」 — null/undefined 키는 기본값 적용.
export type FacilityLabelStyle = {
  font_size_scale?: number
  color?: string
  font_family?: string
  bold?: boolean
  italic?: boolean
}

export type CableLineStyle = {
  width_scale?: number
}

// 서버 액션에 보내는 「부분 갱신」 — null 은 그 키를 삭제(기본값 복귀)하라는 신호.
type FacilityLabelStylePatch = {
  font_size_scale?: number | null
  color?: string | null
  font_family?: string | null
  bold?: boolean | null
  italic?: boolean | null
}

type CableLineStylePatch = {
  width_scale?: number | null
}

export type CanvasFormatTarget =
  | {
      kind: 'facility'
      projectId: string
      facilityId: string
      name: string
      style: FacilityLabelStyle
    }
  | {
      kind: 'cable'
      projectId: string
      cableId: string
      cableCode: string
      style: CableLineStyle
    }

const FONT_FAMILY_OPTIONS = [
  { value: 'Pretendard', label: '본문 (Pretendard)' },
  { value: 'monospace', label: '고정폭 (monospace)' },
  { value: 'serif', label: '명조 (serif)' },
]

const FONT_SIZE_STEPS = [0.6, 0.75, 0.9, 1.0, 1.15, 1.3, 1.5, 1.75, 2.0, 2.5, 3.0]

const WIDTH_LABELS: Record<number, string> = {
  1: '얇음',
  2: '얇은보통',
  3: '보통',
  4: '굵음',
  5: '매우굵음',
}

export default function CanvasFormatToolbar({
  target,
  onChanged,
}: {
  target: CanvasFormatTarget | null
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const lastTargetKey = useRef<string | null>(null)

  // 타겟 바뀌면 busy 리셋 (이전 타겟의 in-flight 상태가 새 타겟에 보이지 않게)
  useEffect(() => {
    const key = target
      ? target.kind === 'facility'
        ? `f:${target.facilityId}`
        : `c:${target.cableId}`
      : null
    if (key !== lastTargetKey.current) {
      lastTargetKey.current = key
      setBusy(false)
    }
  }, [target])

  if (!target) return null

  async function applyFacilityStyle(patch: FacilityLabelStylePatch) {
    if (target?.kind !== 'facility') return
    setBusy(true)
    const result = await updateFacilityLabelStyle({
      project_id: target.projectId,
      facility_id: target.facilityId,
      style: patch,
    })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onChanged()
  }

  async function applyCableStyle(patch: CableLineStylePatch) {
    if (target?.kind !== 'cable') return
    setBusy(true)
    const result = await updateCableLineStyle({
      project_id: target.projectId,
      cable_id: target.cableId,
      style: patch,
    })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onChanged()
  }

  // 시설 라벨 서식 툴바
  if (target.kind === 'facility') {
    const { style } = target
    const scale = style.font_size_scale ?? 1
    const color = style.color ?? '#0f172a'
    const family = style.font_family ?? 'Pretendard'
    const bold = !!style.bold
    const italic = !!style.italic

    const nudgeScale = (dir: 1 | -1) => {
      const idx = FONT_SIZE_STEPS.findIndex((v) => Math.abs(v - scale) < 0.05)
      const cur = idx >= 0 ? idx : FONT_SIZE_STEPS.findIndex((v) => v >= scale)
      const next = Math.max(0, Math.min(FONT_SIZE_STEPS.length - 1, cur + dir))
      void applyFacilityStyle({ font_size_scale: FONT_SIZE_STEPS[next] })
    }

    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1.5 shadow-md text-xs">
        <span className="font-bold text-slate-700 mr-1 max-w-[160px] truncate" title={target.name}>
          📝 {target.name || '(이름 없음)'}
        </span>
        <span className="h-5 border-l border-slate-200" />
        {/* 폰트 family */}
        <select
          value={family}
          onChange={(e) => applyFacilityStyle({ font_family: e.target.value })}
          disabled={busy}
          className="rounded border border-slate-300 px-1.5 py-0.5 text-xs"
          title="폰트"
        >
          {FONT_FAMILY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {/* 크기 */}
        <div className="inline-flex items-center rounded border border-slate-300 overflow-hidden">
          <button
            type="button"
            onClick={() => nudgeScale(-1)}
            disabled={busy}
            className="px-1.5 py-0.5 hover:bg-slate-100 disabled:opacity-40"
            title="글자 크기 줄이기"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="px-1.5 py-0.5 text-[11px] font-mono font-semibold text-slate-700 min-w-[36px] text-center">
            {(scale * 100).toFixed(0)}%
          </span>
          <button
            type="button"
            onClick={() => nudgeScale(1)}
            disabled={busy}
            className="px-1.5 py-0.5 hover:bg-slate-100 disabled:opacity-40"
            title="글자 크기 키우기"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
        {/* B / I */}
        <button
          type="button"
          onClick={() => applyFacilityStyle({ bold: !bold })}
          disabled={busy}
          className={
            'rounded px-1.5 py-1 ' +
            (bold ? 'bg-slate-900 text-white' : 'border border-slate-300 hover:bg-slate-50')
          }
          title="굵게"
        >
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => applyFacilityStyle({ italic: !italic })}
          disabled={busy}
          className={
            'rounded px-1.5 py-1 ' +
            (italic ? 'bg-slate-900 text-white' : 'border border-slate-300 hover:bg-slate-50')
          }
          title="기울임"
        >
          <Italic className="h-3.5 w-3.5" />
        </button>
        {/* 색 */}
        <label
          className="inline-flex items-center gap-1 rounded border border-slate-300 px-1.5 py-0.5 cursor-pointer hover:bg-slate-50"
          title="글자색"
        >
          <Palette className="h-3.5 w-3.5 text-slate-500" />
          <input
            type="color"
            value={color}
            onChange={(e) => applyFacilityStyle({ color: e.target.value })}
            disabled={busy}
            className="w-5 h-5 border-0 bg-transparent p-0 cursor-pointer"
          />
        </label>
        <span className="h-5 border-l border-slate-200" />
        <button
          type="button"
          onClick={() =>
            applyFacilityStyle({
              font_size_scale: null,
              color: null,
              font_family: null,
              bold: null,
              italic: null,
            })
          }
          disabled={busy}
          className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          title="기본 서식 복구"
        >
          초기화
        </button>
      </div>
    )
  }

  // 케이블 두께 툴바
  const widthScale = target.style.width_scale ?? 3
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1.5 shadow-md text-xs">
      <span className="font-bold text-slate-700 mr-1 max-w-[160px] truncate" title={target.cableCode}>
        🔗 {target.cableCode}
      </span>
      <span className="h-5 border-l border-slate-200" />
      <span className="text-[11px] font-medium text-slate-600">두께</span>
      <div className="inline-flex items-center rounded border border-slate-300 overflow-hidden">
        {[1, 2, 3, 4, 5].map((ws) => {
          const active = widthScale === ws
          return (
            <button
              key={ws}
              type="button"
              onClick={() => applyCableStyle({ width_scale: ws })}
              disabled={busy}
              className={
                'px-2 py-1 text-[11px] font-bold border-l border-slate-200 first:border-l-0 disabled:opacity-40 ' +
                (active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50')
              }
              title={`${WIDTH_LABELS[ws]} (${ws})`}
            >
              {ws}
            </button>
          )
        })}
      </div>
      <span className="text-[11px] font-medium text-slate-500 min-w-[64px]">
        {WIDTH_LABELS[widthScale]}
      </span>
      <span className="h-5 border-l border-slate-200" />
      <button
        type="button"
        onClick={() => applyCableStyle({ width_scale: null })}
        disabled={busy}
        className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        title="기본 두께 복구"
      >
        초기화
      </button>
    </div>
  )
}
