'use client'

import { useEffect, useRef, useState } from 'react'
import { X, ChevronRight, ChevronLeft, Camera, Undo2, Trash2 } from 'lucide-react'
import SketchOverlay, {
  type SketchStroke,
  type SketchPen,
} from './SketchOverlay'

// 카카오맵 거리뷰(Roadview) 패널 — 캔버스 우측 컬럼. 지도 모드 전용.
//   - position: { lat, lng } — 표시할 좌표. 가까운 거리뷰 panorama 검색해 표시.
//   - 카카오 SDK 는 지도 모드 진입 시 이미 로드돼 있음 (useKakaoMap).
//   - 50m 반경 안 panorama 가 없으면 안내 메시지.
//
// 좌측 가장자리에 폭 조절 핸들 — 작은 화면 vs 큰 화면 대응.

type Props = {
  // 표시할 좌표 — null 이면 안내 메시지만 표시
  position: { lat: number; lng: number } | null
  // 헤더 부제목 — 어느 시설의 거리뷰인지
  title?: string | null
  onClose: () => void
  collapsed: boolean
  onToggleCollapse: () => void
  // 실사 그리기 — sketchMode true 면 panorama 위에 펜 캡처. 좌표는 패널 픽셀 고정.
  sketchMode: boolean
  sketchPen: SketchPen
  strokes: SketchStroke[]
  onStrokesChange: (next: SketchStroke[]) => void
}

const MIN_W = 280
const MAX_W = 720
const DEFAULT_W = 420

export default function RoadviewPanel({
  position,
  title,
  onClose,
  collapsed,
  onToggleCollapse,
  sketchMode,
  sketchPen,
  strokes,
  onStrokesChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const roadviewRef = useRef<kakao.maps.Roadview | null>(null)
  const clientRef = useRef<kakao.maps.RoadviewClient | null>(null)
  const [noPano, setNoPano] = useState(false)
  const [width, setWidth] = useState(DEFAULT_W)
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null)

  // Roadview 인스턴스 — 컨테이너 마운트 후 1회 생성 (collapsed 토글 시 unmount 됨)
  useEffect(() => {
    if (collapsed) return
    const c = containerRef.current
    if (!c) return
    if (typeof window === 'undefined') return
    const kk = window.kakao
    if (!kk?.maps?.Roadview) return
    if (roadviewRef.current) return
    roadviewRef.current = new kk.maps.Roadview(c)
    clientRef.current = new kk.maps.RoadviewClient()
    return () => {
      // 패널 unmount 시 인스턴스 정리 (다음 mount 시 재생성)
      roadviewRef.current = null
      clientRef.current = null
    }
  }, [collapsed])

  // position 바뀔 때 — 가까운 panorama 검색 → setPanoId
  useEffect(() => {
    if (collapsed) return
    if (!position) return
    const rv = roadviewRef.current
    const client = clientRef.current
    if (!rv || !client) return
    const ll = new kakao.maps.LatLng(position.lat, position.lng)
    client.getNearestPanoId(ll, 50, (panoId) => {
      if (panoId == null || (panoId as unknown as number) === 0) {
        setNoPano(true)
        return
      }
      setNoPano(false)
      rv.setPanoId(panoId, ll)
    })
  }, [position?.lat, position?.lng, collapsed])

  // 폭 드래그 (좌측 가장자리)
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const r = resizeRef.current
      if (!r) return
      const dx = r.startX - e.clientX // 좌측으로 드래그하면 폭 증가
      const next = Math.max(MIN_W, Math.min(MAX_W, r.startW + dx))
      setWidth(next)
    }
    const onUp = () => {
      resizeRef.current = null
      document.body.style.cursor = ''
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  if (collapsed) {
    return (
      <div className="w-9 shrink-0 border-l border-slate-300 bg-emerald-50 flex flex-col items-center py-2 gap-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          title="거리뷰 패널 펼치기"
          className="text-emerald-700 hover:text-emerald-900"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div
          className="text-[10px] font-semibold text-emerald-700 [writing-mode:vertical-rl]"
          style={{ transform: 'rotate(180deg)' }}
        >
          거리뷰
        </div>
      </div>
    )
  }

  return (
    <div
      className="relative shrink-0 border-l border-slate-300 bg-white flex flex-col min-h-0"
      style={{ width }}
    >
      {/* 좌측 폭 조절 핸들 */}
      <div
        className="absolute -left-1 top-0 bottom-0 w-2 cursor-ew-resize z-20"
        onPointerDown={(e) => {
          resizeRef.current = { startX: e.clientX, startW: width }
          document.body.style.cursor = 'ew-resize'
        }}
      />
      <header className="flex items-center justify-between border-b border-slate-200 px-3 h-10 shrink-0">
        <div className="min-w-0 flex items-center gap-1.5">
          <Camera className="h-4 w-4 text-emerald-600 shrink-0" />
          <div className="min-w-0">
            <span className="text-sm font-bold text-slate-900">거리뷰</span>
            {title && (
              <span className="ml-1.5 text-[11px] text-slate-500 truncate">
                · {title}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onToggleCollapse}
            title="패널 접기"
            className="text-slate-400 hover:text-slate-900"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="거리뷰 닫기"
            className="text-slate-400 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>
      <div className="relative flex-1 min-h-0">
        <div ref={containerRef} className="w-full h-full" />
        {!position && (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-500 bg-slate-50 pointer-events-none">
            <p className="text-center px-4">
              지도에서 시설을 클릭하거나 지도 위 파란 선을 클릭하면 그 위치의 거리뷰가 표시됩니다
            </p>
          </div>
        )}
        {noPano && position && (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-rose-600 bg-white/95 pointer-events-none">
            <p className="text-center px-4">
              이 위치 주변 50m 안에 거리뷰가 없습니다
              <br />
              <span className="text-slate-500">(지도 위 파란 선 위치를 클릭해 보세요)</span>
            </p>
          </div>
        )}
        {/* 실사 그리기 오버레이 — sketchMode 일 때 panorama 위 pointer 캡처.
            좌표는 패널 픽셀 고정 (panorama 가 움직이면 그림은 그 자리). */}
        <SketchOverlay
          enabled={sketchMode}
          pen={sketchPen}
          strokes={strokes}
          onStrokesChange={onStrokesChange}
          coords="pixel"
        />
        {/* 실사 도구 (거리뷰 안 인라인) — 색·굵기는 상위 toolbar 공유. 되돌리기·전체 지우기만 노출. */}
        {sketchMode && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 shadow-lg">
            <button
              type="button"
              onClick={() => onStrokesChange(strokes.slice(0, -1))}
              disabled={strokes.length === 0}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 h-7 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              title="마지막 선 되돌리기"
            >
              <Undo2 className="h-3 w-3" />
              되돌리기
            </button>
            <button
              type="button"
              onClick={() => {
                if (strokes.length === 0) return
                if (!confirm('거리뷰 실사 그림을 모두 지웁니다. 계속하시겠습니까?')) return
                onStrokesChange([])
              }}
              disabled={strokes.length === 0}
              className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2 h-7 text-[11px] font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-40"
              title="전체 지우기"
            >
              <Trash2 className="h-3 w-3" />
              지우기
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
