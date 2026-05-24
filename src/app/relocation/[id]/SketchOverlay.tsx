'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// 실사(sketch) 오버레이 — 캔버스/지도 위 그림판처럼 펜으로 자유롭게 그리거나
//   텍스트 박스를 추가. 도구는 tool prop 으로 분기 (pen/text).
//
// 좌표는 항상 화면 픽셀 (캔버스 컨테이너 내부 기준). 지도 pan/zoom 잠금 중에만 사용.
// 휘발 — 페이지 새로고침/이동 시 사라짐. 저장은 별도 「화면 저장」 기능 (Phase 2).

export type SketchPoint =
  // 지도 모드 (legacy) — GPS 좌표. 현재는 'pixel' 단일 모드.
  | { kind: 'gps'; lat: number; lng: number }
  | { kind: 'pixel'; x: number; y: number }

export type SketchStroke = {
  id: string
  color: string
  width: number
  points: SketchPoint[]
}

// 텍스트 박스 — 캔버스 위 한 줄 텍스트 (multi-line 은 박스 여러 개로).
//   색은 펜 색 공유, fontSize 는 펜 굵기 × 6 매핑.
export type SketchText = {
  id: string
  x: number  // 컨테이너 픽셀 (좌상단 anchor)
  y: number
  color: string
  fontSize: number  // px
  text: string
}

export type SketchPen = {
  color: string
  width: number
}

export type SketchTool = 'pen' | 'text'

type Props = {
  // 그리기 활성 여부 — false 면 그려진 항목만 표시 (pointer-events:none)
  enabled: boolean
  // 도구 — 'pen' (자유 그리기) / 'text' (클릭 위치에 텍스트 박스)
  tool: SketchTool
  // 펜 설정 (색 + 굵기). 텍스트 박스도 같은 색 사용, fontSize 는 width×6.
  pen: SketchPen
  // strokes / texts 상태 (controlled)
  strokes: SketchStroke[]
  onStrokesChange: (next: SketchStroke[]) => void
  texts: SketchText[]
  onTextsChange: (next: SketchText[]) => void
  // 좌표 변환 모드 — 'pixel' 만 지원 (legacy 'gps' 는 단일 표면 통합으로 폐기)
  coords: 'gps' | 'pixel'
  // legacy — 지도 모드용. coords='gps' 일 때만 사용.
  kakaoMap?: kakao.maps.Map | null
  mapEpoch?: number
}

let __strokeSeq = 0
function nextStrokeId(): string {
  __strokeSeq += 1
  return `s-${Date.now()}-${__strokeSeq}`
}
let __textSeq = 0
function nextTextId(): string {
  __textSeq += 1
  return `t-${Date.now()}-${__textSeq}`
}

// 펜 굵기 → 텍스트 폰트 크기 매핑
function widthToFontSize(w: number): number {
  return Math.max(12, w * 6)
}

export default function SketchOverlay({
  enabled,
  tool,
  pen,
  strokes,
  onStrokesChange,
  texts,
  onTextsChange,
  coords,
  kakaoMap,
  mapEpoch,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const drawingRef = useRef<SketchStroke | null>(null)
  const [drawing, setDrawing] = useState<SketchStroke | null>(null)
  // 편집 중인 텍스트 박스 id — null 이면 모두 표시 전용
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  // 텍스트 박스 드래그 — 임계값 이상 움직이면 이동, 이하면 click 으로 편집 시작.
  //   originX/Y = 드래그 시작 시 박스의 x/y · clientStartX/Y = 시작 시 클릭 좌표
  const textDragRef = useRef<{
    id: string
    originX: number
    originY: number
    clientStartX: number
    clientStartY: number
    moved: boolean
  } | null>(null)
  // 최신 texts 참조용 — pointer 핸들러 closure 가 stale 안 되게
  const textsRef = useRef(texts)
  useEffect(() => {
    textsRef.current = texts
  }, [texts])

  // 컨테이너 내부 픽셀 좌표로 변환
  const toLocalPx = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const svg = svgRef.current
      if (!svg) return null
      const rect = svg.getBoundingClientRect()
      return { x: clientX - rect.left, y: clientY - rect.top }
    },
    [],
  )

  const pxToPoint = useCallback(
    (px: { x: number; y: number }): SketchPoint | null => {
      if (coords === 'pixel') return { kind: 'pixel', x: px.x, y: px.y }
      const m = kakaoMap
      if (!m) return null
      try {
        const ll = m
          .getProjection()
          .coordsFromContainerPoint(new kakao.maps.Point(px.x, px.y))
        return { kind: 'gps', lat: ll.getLat(), lng: ll.getLng() }
      } catch {
        return null
      }
    },
    [coords, kakaoMap],
  )

  const pointToPx = useCallback(
    (p: SketchPoint): { x: number; y: number } | null => {
      if (p.kind === 'pixel') return { x: p.x, y: p.y }
      const m = kakaoMap
      if (!m) return null
      try {
        const pt = m
          .getProjection()
          .containerPointFromCoords(new kakao.maps.LatLng(p.lat, p.lng))
        return { x: pt.x, y: pt.y }
      } catch {
        return null
      }
    },
    [kakaoMap],
  )

  useEffect(() => {
    /* mapEpoch 변경 시 리렌더 */
  }, [mapEpoch])

  // 그리기 시작 (pen 도구)
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!enabled) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    // text 도구 — 클릭 위치에 새 텍스트 박스 추가 + 즉시 편집 모드
    if (tool === 'text') {
      const px = toLocalPx(e.clientX, e.clientY)
      if (!px) return
      const t: SketchText = {
        id: nextTextId(),
        x: px.x,
        y: px.y,
        color: pen.color,
        fontSize: widthToFontSize(pen.width),
        text: '',
      }
      onTextsChange([...texts, t])
      setEditingTextId(t.id)
      return
    }
    // pen 도구 — stroke 시작
    const px = toLocalPx(e.clientX, e.clientY)
    if (!px) return
    const pt = pxToPoint(px)
    if (!pt) return
    const stroke: SketchStroke = {
      id: nextStrokeId(),
      color: pen.color,
      width: pen.width,
      points: [pt],
    }
    drawingRef.current = stroke
    setDrawing(stroke)
    svgRef.current?.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!enabled) return
    if (tool !== 'pen') return
    const cur = drawingRef.current
    if (!cur) return
    const px = toLocalPx(e.clientX, e.clientY)
    if (!px) return
    const pt = pxToPoint(px)
    if (!pt) return
    const last = cur.points[cur.points.length - 1]
    const lastPx = pointToPx(last)
    if (lastPx) {
      const dx = px.x - lastPx.x
      const dy = px.y - lastPx.y
      if (dx * dx + dy * dy < 4) return
    }
    cur.points.push(pt)
    setDrawing({ ...cur, points: cur.points.slice() })
  }

  const onPointerUp = () => {
    const cur = drawingRef.current
    if (!cur) return
    drawingRef.current = null
    onStrokesChange([...strokes, cur])
    setDrawing(null)
  }

  // 점 배열 → SVG path d 속성
  const buildPath = (pts: SketchPoint[]): string => {
    if (pts.length === 0) return ''
    const screenPts = pts
      .map(pointToPx)
      .filter((p): p is { x: number; y: number } => p !== null)
    if (screenPts.length === 0) return ''
    if (screenPts.length === 1) {
      const p = screenPts[0]
      return `M ${p.x} ${p.y} l 0.01 0`
    }
    const head = screenPts[0]
    let d = `M ${head.x} ${head.y}`
    for (let i = 1; i < screenPts.length; i++) {
      const p = screenPts[i]
      d += ` L ${p.x} ${p.y}`
    }
    return d
  }

  // 텍스트 박스 편집 마무리 — 빈 문자열이면 삭제
  const finishEditingText = (id: string, value: string) => {
    const trimmed = value.replace(/\s+$/, '')
    if (trimmed.length === 0) {
      onTextsChange(texts.filter((t) => t.id !== id))
    } else {
      onTextsChange(texts.map((t) => (t.id === id ? { ...t, text: trimmed } : t)))
    }
    setEditingTextId(null)
  }

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 w-full h-full"
      style={{
        pointerEvents: enabled ? 'auto' : 'none',
        cursor: enabled ? (tool === 'text' ? 'text' : 'crosshair') : 'default',
        zIndex: 45,
        touchAction: enabled ? 'none' : 'auto',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {strokes.map((s) => (
        <path
          key={s.id}
          d={buildPath(s.points)}
          stroke={s.color}
          strokeWidth={s.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          style={{ pointerEvents: 'none' }}
        />
      ))}
      {drawing && (
        <path
          d={buildPath(drawing.points)}
          stroke={drawing.color}
          strokeWidth={drawing.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          style={{ pointerEvents: 'none' }}
        />
      )}
      {/* 텍스트 박스 — SVG 안 HTML (foreignObject). 편집 중인 박스는 textarea, 그 외엔 정적 표시.
          - 여러 줄 입력 (Enter = 새 줄, Escape/외부 클릭 = 종료)
          - 정적 모드 드래그 = 이동 (4px 이상), 제자리 클릭 = 편집 시작
          - autoFocus 는 SVG 안에서 신뢰 안 함 → useEffect 로 명시 focus */}
      {texts.map((t) => {
        const isEditing = editingTextId === t.id
        // 줄별 길이로 가장 긴 줄 추정. 빈 줄은 0 카운트.
        const lines = t.text.split('\n')
        const maxLineLen = lines.reduce((m, l) => Math.max(m, l.length), 0)
        // 폭 — 한글 폭 ≈ fontSize × 1.0, 영문 ≈ 0.6. 안전치 0.85.
        // 편집 시 최소 280 (Enter 안내 들어가는 여유), 표시 시 최소 40.
        const estW = isEditing
          ? Math.max(280, maxLineLen * t.fontSize * 0.85 + 40)
          : Math.max(40, maxLineLen * t.fontSize * 0.85 + 24)
        // 높이 — 줄 수 × (fontSize × line-height 1.25) + padding
        const lineH = t.fontSize * 1.25
        const innerH = Math.max(1, lines.length) * lineH
        const h = innerH + 24
        return (
          <foreignObject
            key={t.id}
            x={t.x}
            y={t.y}
            width={estW}
            height={h}
            style={{ overflow: 'visible' }}
          >
            <div
              style={{
                fontFamily:
                  'Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
                fontSize: t.fontSize,
                color: t.color,
                fontWeight: 700,
                lineHeight: 1.25,
                width: '100%',
                height: '100%',
                userSelect: isEditing ? 'text' : 'none',
                pointerEvents: enabled ? 'auto' : 'none',
              }}
            >
              {isEditing ? (
                <SketchTextEditor
                  initialText={t.text}
                  color={t.color}
                  onChange={(value) => {
                    // 라이브 갱신 — 줄 수/길이 변화에 따라 foreignObject 크기 즉시 확장
                    onTextsChange(
                      textsRef.current.map((x) =>
                        x.id === t.id ? { ...x, text: value } : x,
                      ),
                    )
                  }}
                  onFinish={(value) => finishEditingText(t.id, value)}
                />
              ) : (
                <div
                  onPointerDown={(e) => {
                    if (!enabled) return
                    if (e.button !== 0 && e.pointerType === 'mouse') return
                    e.stopPropagation()
                    // 드래그 시작 후보 — 임계값 이상 움직이면 이동, 이하면 클릭=편집
                    textDragRef.current = {
                      id: t.id,
                      originX: t.x,
                      originY: t.y,
                      clientStartX: e.clientX,
                      clientStartY: e.clientY,
                      moved: false,
                    }
                    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
                  }}
                  onPointerMove={(e) => {
                    const drag = textDragRef.current
                    if (!drag || drag.id !== t.id) return
                    const dx = e.clientX - drag.clientStartX
                    const dy = e.clientY - drag.clientStartY
                    if (!drag.moved && Math.hypot(dx, dy) < 4) return
                    drag.moved = true
                    e.stopPropagation()
                    const newX = drag.originX + dx
                    const newY = drag.originY + dy
                    onTextsChange(
                      textsRef.current.map((x) =>
                        x.id === t.id ? { ...x, x: newX, y: newY } : x,
                      ),
                    )
                  }}
                  onPointerUp={(e) => {
                    const drag = textDragRef.current
                    if (!drag || drag.id !== t.id) return
                    textDragRef.current = null
                    if (!drag.moved) {
                      // 이동 없이 클릭 — 편집 시작
                      e.stopPropagation()
                      setEditingTextId(t.id)
                    }
                  }}
                  onContextMenu={(e) => {
                    if (!enabled) return
                    e.preventDefault()
                    if (confirm(`텍스트 "${t.text}" 를 삭제하시겠습니까?`)) {
                      onTextsChange(textsRef.current.filter((x) => x.id !== t.id))
                    }
                  }}
                  title={enabled ? '드래그 = 이동, 클릭 = 편집, 우클릭 = 삭제' : undefined}
                  style={{
                    display: 'inline-block',
                    background: 'rgba(255,255,255,0.85)',
                    padding: '4px 10px',
                    borderRadius: 4,
                    border: `1.5px solid ${t.color}`,
                    cursor: enabled ? 'grab' : 'default',
                    whiteSpace: 'pre-wrap', // 여러 줄 줄바꿈 유지
                    boxSizing: 'border-box',
                    touchAction: 'none', // 드래그 중 페이지 스크롤 방지
                  }}
                >
                  {t.text}
                </div>
              )}
            </div>
          </foreignObject>
        )
      })}
    </svg>
  )
}

// 텍스트 편집 textarea — SVG foreignObject 안에서 mount 시 명시 focus.
//   autoFocus 가 SVG 안에서 일관 동작 안 함 → useEffect + ref.focus() 패턴.
//   여러 줄 입력: Enter = 새 줄. 종료: Escape 또는 외부 클릭(blur).
function SketchTextEditor({
  initialText,
  color,
  onChange,
  onFinish,
}: {
  initialText: string
  color: string
  onChange: (value: string) => void
  onFinish: (value: string) => void
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      const el = ref.current
      if (el) {
        el.focus()
        el.select()
      }
    })
    return () => window.cancelAnimationFrame(id)
  }, [])
  return (
    <textarea
      ref={ref}
      defaultValue={initialText}
      onInput={(e) => onChange((e.currentTarget as HTMLTextAreaElement).value)}
      onBlur={(e) => onFinish(e.currentTarget.value)}
      onKeyDown={(e) => {
        // Enter = 새 줄 (textarea 기본). Escape 만 종료.
        if (e.key === 'Escape') {
          e.preventDefault()
          ;(e.currentTarget as HTMLTextAreaElement).blur()
        }
        e.stopPropagation()
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        fontFamily: 'inherit',
        fontSize: 'inherit',
        color: 'inherit',
        fontWeight: 'inherit',
        lineHeight: 'inherit',
        background: 'rgba(255,255,255,0.95)',
        border: `2px dashed ${color}`,
        borderRadius: 4,
        padding: '4px 10px',
        outline: 'none',
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        display: 'block',
        resize: 'none', // 박스 크기는 줄 수로 자동 (수동 resize 비활성)
        overflow: 'hidden',
        whiteSpace: 'pre-wrap',
      }}
    />
  )
}
