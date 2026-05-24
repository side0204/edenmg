'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// 실사(sketch) 오버레이 — 캔버스/지도 위 그림판처럼 펜으로 자유롭게 그림.
//   지도 모드: 점은 GPS 좌표로 저장 → pan/zoom 시 자동 재투영 (지도와 함께 이동).
//   거리뷰 모드: 점은 화면 픽셀로 저장 → panorama 가 움직여도 그림은 그 자리 (메모용).
//
// 휘발 — 페이지 새로고침/이동 시 사라짐. 저장은 별도 「화면 저장」 기능 (Phase 2).
//
// 그리기 ON 시 부모가 지도 pan/zoom 을 setDraggable(false)/setZoomable(false) 로 잠가야 함.

export type SketchPoint =
  // 지도 모드 — GPS 좌표 (lat/lng). 화면 좌표는 매 렌더 시 투영으로 계산.
  | { kind: 'gps'; lat: number; lng: number }
  // 거리뷰 모드 — 컨테이너 내부 픽셀 좌표 (panorama 자체 좌표계 없음).
  | { kind: 'pixel'; x: number; y: number }

export type SketchStroke = {
  id: string
  color: string
  width: number
  points: SketchPoint[]
}

export type SketchPen = {
  color: string
  width: number
}

type Props = {
  // 그리기 활성 여부 — false 면 그려진 stroke 만 표시 (입력 비활성, pointer-events:none)
  enabled: boolean
  // 펜 설정
  pen: SketchPen
  // strokes 상태 (controlled)
  strokes: SketchStroke[]
  onStrokesChange: (next: SketchStroke[]) => void
  // 좌표 변환 모드:
  //   - 'gps' 면 kakaoMap 필수 (containerPointFromCoords / coordsFromContainerPoint 사용)
  //   - 'pixel' 이면 그대로 컨테이너 픽셀 좌표 사용
  coords: 'gps' | 'pixel'
  // 지도 모드용 — 카카오맵 인스턴스 + epoch (pan/zoom 시 재투영 트리거)
  kakaoMap?: kakao.maps.Map | null
  mapEpoch?: number
}

let __strokeSeq = 0
function nextStrokeId(): string {
  __strokeSeq += 1
  return `s-${Date.now()}-${__strokeSeq}`
}

export default function SketchOverlay({
  enabled,
  pen,
  strokes,
  onStrokesChange,
  coords,
  kakaoMap,
  mapEpoch,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const drawingRef = useRef<SketchStroke | null>(null)
  // 현재 그리는 중인 stroke — 상태로도 가져야 polyline 이 즉시 보임
  const [drawing, setDrawing] = useState<SketchStroke | null>(null)
  // 컨테이너 내부 픽셀 좌표로 변환 — SVG getBoundingClientRect 기준
  const toLocalPx = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const svg = svgRef.current
      if (!svg) return null
      const rect = svg.getBoundingClientRect()
      return { x: clientX - rect.left, y: clientY - rect.top }
    },
    [],
  )

  // 픽셀 → SketchPoint 변환 (모드에 맞춰)
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

  // SketchPoint → 현재 화면 픽셀 (렌더용)
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

  // mapEpoch 가 바뀌면 (지도 pan/zoom) 강제 리렌더 — 좌표 재투영
  // pointToPx 는 매 렌더마다 호출되므로 별도 effect 불필요. 단지 의존성으로 충분.
  useEffect(() => {
    // 의도적 빈 effect — mapEpoch 가 deps 에 있어 변경 시 리렌더 트리거
  }, [mapEpoch])

  // 그리기 시작
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!enabled) return
    if (e.button !== 0 && e.pointerType === 'mouse') return // 마우스는 좌클릭만
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
    const cur = drawingRef.current
    if (!cur) return
    const px = toLocalPx(e.clientX, e.clientY)
    if (!px) return
    const pt = pxToPoint(px)
    if (!pt) return
    // 너무 조밀한 점은 건너뜀 (성능 + 매끈한 선)
    const last = cur.points[cur.points.length - 1]
    const lastPx = pointToPx(last)
    if (lastPx) {
      const dx = px.x - lastPx.x
      const dy = px.y - lastPx.y
      if (dx * dx + dy * dy < 4) return // 2px 안은 무시
    }
    cur.points.push(pt)
    // shallow copy 로 리렌더 트리거
    setDrawing({ ...cur, points: cur.points.slice() })
  }

  const onPointerUp = () => {
    const cur = drawingRef.current
    if (!cur) return
    drawingRef.current = null
    // 점 1개뿐이면 (탭만 한 경우) dot 으로 보이게 — 그대로 push
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
      // 단일 점 — 작은 원
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

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 w-full h-full"
      style={{
        // 그리기 활성 시만 pointer 캡처 — 그 외엔 통과 (지도·시설 클릭 가능)
        pointerEvents: enabled ? 'auto' : 'none',
        // 그리기 모드 커서 = 십자
        cursor: enabled ? 'crosshair' : 'default',
        // 모든 패널·시설·케이블 위 — sketchMode 활성 시만 pointer 캡처.
        //   비활성 시는 pointer-events:none 으로 통과해서 패널 클릭 가능.
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
    </svg>
  )
}
