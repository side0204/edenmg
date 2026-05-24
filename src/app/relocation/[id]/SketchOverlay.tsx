'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// 실사(sketch) 오버레이 — 캔버스/지도 위 그림판처럼 펜으로 자유롭게 그리거나
//   텍스트 박스를 추가. 도구는 tool prop 으로 분기 (pen/text).
//
// 좌표는 항상 화면 픽셀 (캔버스 컨테이너 내부 기준). 지도 pan/zoom 잠금 중에만 사용.
// 휘발 — 페이지 새로고침/이동 시 사라짐. 저장은 별도 「화면 저장」 기능 (Phase 2).

export type SketchPoint =
  // 지도 모드 — GPS 좌표 (kakaoMap projection 으로 픽셀 변환)
  | { kind: 'gps'; lat: number; lng: number }
  // 도식 모드 — 메인 SVG 의 viewBox 안 컨텐츠 좌표 (viewport pan/zoom 변화에 따라옴)
  | { kind: 'svg'; x: number; y: number }
  // 스크린 고정 픽셀 — 캔버스 위쪽 사이드바·도구바 등 컨텐츠가 없는 영역용 폴백
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
  // 좌표 변환 모드:
  //   'gps' — 카카오맵 + GPS 좌표 (kakaoMap 필수)
  //   'svg' — 도식 모드 SVG viewBox 컨텐츠 좌표 (mainSvgEl + svgViewport 필수)
  //   'pixel' — 스크린 고정 픽셀 (폴백)
  coords: 'gps' | 'svg' | 'pixel'
  // 지도 모드용 — kakaoMap projection 으로 GPS ↔ 픽셀
  kakaoMap?: kakao.maps.Map | null
  mapEpoch?: number
  // 도식 모드용 — 메인 SVG element + 현재 viewport. viewport 변경 시 자동 재투영.
  mainSvgEl?: SVGSVGElement | null
  svgViewport?: { x: number; y: number; width: number; height: number }
  // 캔버스(지도/SVG) 컨테이너 — 클릭 위치가 이 영역 안인지 판정 + 영역 기준 픽셀 계산용.
  //   영역 밖(거리뷰·사이드바 등) 그림은 픽셀 고정으로 저장 (지도 pan 영향 X).
  canvasContainerEl?: HTMLElement | null
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
  mainSvgEl,
  svgViewport,
  canvasContainerEl,
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
      const overlay = svgRef.current
      if (!overlay) return null
      const orect = overlay.getBoundingClientRect()
      // overlay-rel px → client px
      const clientX = px.x + orect.left
      const clientY = px.y + orect.top
      // 캔버스(지도/SVG) 영역 안인지 판정 — 밖이면 픽셀 anchor (거리뷰·사이드바)
      if (canvasContainerEl) {
        const crect = canvasContainerEl.getBoundingClientRect()
        const inside =
          clientX >= crect.left &&
          clientX <= crect.right &&
          clientY >= crect.top &&
          clientY <= crect.bottom
        if (!inside) return { kind: 'pixel', x: px.x, y: px.y }
      }
      if (coords === 'svg' && mainSvgEl) {
        // client px → main SVG content coord (CTM 역행렬 — SVG 의 letterbox·viewport 정확 반영)
        const pt = mainSvgEl.createSVGPoint()
        pt.x = clientX
        pt.y = clientY
        const ctm = mainSvgEl.getScreenCTM()
        if (!ctm) return null
        const r = pt.matrixTransform(ctm.inverse())
        return { kind: 'svg', x: r.x, y: r.y }
      }
      const m = kakaoMap
      if (!m) return null
      try {
        // 카카오 projection 은 "지도 컨테이너 기준" 픽셀 요구 → canvasContainer 기준으로 변환
        const crect = canvasContainerEl?.getBoundingClientRect()
        const mapX = crect ? clientX - crect.left : px.x
        const mapY = crect ? clientY - crect.top : px.y
        const ll = m
          .getProjection()
          .coordsFromContainerPoint(new kakao.maps.Point(mapX, mapY))
        return { kind: 'gps', lat: ll.getLat(), lng: ll.getLng() }
      } catch {
        return null
      }
    },
    [coords, kakaoMap, mainSvgEl, canvasContainerEl],
  )

  const pointToPx = useCallback(
    (p: SketchPoint): { x: number; y: number } | null => {
      if (p.kind === 'pixel') return { x: p.x, y: p.y }
      const overlay = svgRef.current
      if (!overlay) return null
      const orect = overlay.getBoundingClientRect()
      if (p.kind === 'svg' && mainSvgEl) {
        // main SVG content coord → client px (CTM) → overlay-rel px
        const pt = mainSvgEl.createSVGPoint()
        pt.x = p.x
        pt.y = p.y
        const ctm = mainSvgEl.getScreenCTM()
        if (!ctm) return null
        const r = pt.matrixTransform(ctm)
        return { x: r.x - orect.left, y: r.y - orect.top }
      }
      if (p.kind !== 'gps') return null
      const m = kakaoMap
      if (!m) return null
      try {
        const pt = m
          .getProjection()
          .containerPointFromCoords(new kakao.maps.LatLng(p.lat, p.lng))
        // pt 는 지도 컨테이너 기준 → client px → overlay-rel px
        const crect = canvasContainerEl?.getBoundingClientRect()
        const clientX = crect ? pt.x + crect.left : pt.x
        const clientY = crect ? pt.y + crect.top : pt.y
        return { x: clientX - orect.left, y: clientY - orect.top }
      } catch {
        return null
      }
    },
    // svgViewport 변화 = pan/zoom = CTM 변화 → 재투영 필요
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kakaoMap, mainSvgEl, canvasContainerEl, svgViewport?.x, svgViewport?.y, svgViewport?.width, svgViewport?.height, mapEpoch],
  )

  useEffect(() => {
    /* mapEpoch 변경 시 리렌더 */
  }, [mapEpoch])

  // 그리기 시작 (pen 도구) / 텍스트 박스 추가 후보 위치 기록 (text 도구)
  //   text 는 onPointerUp 에서 실제 생성 (모바일 touch 좌표 안정성 ↑).
  const pendingTextPosRef = useRef<{ x: number; y: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!enabled) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    // text 도구 — pointerup 까지 대기 (모바일 tap 위치 안정화)
    if (tool === 'text') {
      const px = toLocalPx(e.clientX, e.clientY)
      pendingTextPosRef.current = px
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

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    // text 도구 — pointerdown 시 기록한 위치 사용 (drag 없이 tap 시 거의 동일)
    if (tool === 'text' && pendingTextPosRef.current) {
      const px = toLocalPx(e.clientX, e.clientY) ?? pendingTextPosRef.current
      pendingTextPosRef.current = null
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
        // 편집 시 최소 8자 (≈ 한글 8자 폭) + padding + X 버튼 자리.
        // 글자수가 늘면 박스도 자동 확장 (onChange 가 라이브 갱신).
        const MIN_EDIT_CHARS = 8
        const minEditW = MIN_EDIT_CHARS * t.fontSize * 0.85 + 56
        const estW = isEditing
          ? Math.max(minEditW, maxLineLen * t.fontSize * 0.85 + 56)
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
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
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
                  {/* 모바일 닫기 버튼 — blur 가 모바일에서 잘 안 먹어 명시 X 노출.
                      박스 안쪽 우상단에 배치 (가장자리 박스도 화면 안에 보이게).
                      textarea 외 영역이라 onPointerDown 으로 blur 직전 finish 호출. */}
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const ta = (e.currentTarget.parentElement?.querySelector(
                        'textarea',
                      ) as HTMLTextAreaElement | null)
                      finishEditingText(t.id, ta?.value ?? '')
                    }}
                    aria-label="텍스트 박스 닫기"
                    title="닫기 (Esc)"
                    style={{
                      position: 'absolute',
                      top: 2,
                      right: 2,
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: 'white',
                      border: `1.5px solid ${t.color}`,
                      color: t.color,
                      fontSize: 13,
                      fontWeight: 700,
                      lineHeight: 1,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      padding: 0,
                      zIndex: 2,
                    }}
                  >
                    ×
                  </button>
                </div>
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
        // 모바일 키보드가 박스를 가리지 않도록 화면 안 보이게 스크롤
        try {
          el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
        } catch {
          /* 일부 브라우저 옵션 미지원 — 무시 */
        }
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
        padding: '4px 32px 4px 10px',  // 우측 padding 으로 X 버튼 자리 확보
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
