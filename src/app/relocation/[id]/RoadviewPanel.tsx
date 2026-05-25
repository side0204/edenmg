'use client'

import { useEffect, useRef, useState } from 'react'
import { X, ChevronRight, ChevronLeft, Camera } from 'lucide-react'

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
}

const MIN_W = 200       // 모바일에서도 거리뷰 알아볼 수 있는 최소 폭
const MAX_W = 720
const DEFAULT_W = 420
// 모바일 (≤ 640px) 기본 폭 — 화면의 절반 정도. 지도가 가려지지 않도록 작게 시작.
const MOBILE_DEFAULT_W = 240

export default function RoadviewPanel({
  position,
  title,
  onClose,
  collapsed,
  onToggleCollapse,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const roadviewRef = useRef<kakao.maps.Roadview | null>(null)
  const clientRef = useRef<kakao.maps.RoadviewClient | null>(null)
  const [noPano, setNoPano] = useState(false)
  // 초기 폭 — 화면 폭 기반. 모바일은 작게 시작 (지도 가리지 않도록).
  //   useState 초기화 함수에서 한 번만 계산 (SSR 안전: window 가드).
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_W
    const vw = window.innerWidth
    if (vw < 640) {
      // 모바일 — 화면의 약 45% (최소 MOBILE_DEFAULT_W, 최대 viewport - 200)
      return Math.min(Math.max(MOBILE_DEFAULT_W, Math.round(vw * 0.45)), vw - 200)
    }
    return DEFAULT_W
  })
  // 화면 회전·창 크기 변경 시 폭이 viewport - MIN_W 을 넘으면 자동 축소 (지도가 안 보이지 않게)
  // 추가 (owner 2026-05-25): 「공유 중」 배너로 viewport 축소 시 Roadview SDK 가
  //   container 높이 변화를 보정하면서 **viewpoint(pan/tilt) 를 자동으로 흔드는**
  //   현상이 있음 (owner 보고: "마우스로 살짝 위로 끌어올린 것 같이 건물이 위로").
  //   해결: relayout 전후로 viewpoint·position 을 저장·복원해 SDK 자동 조정 무효화.
  useEffect(() => {
    function relayoutRoadview() {
      const rv = roadviewRef.current
      if (!rv) return
      try {
        // 1) 현재 시점·위치 저장
        const vp = typeof rv.getViewpoint === 'function' ? rv.getViewpoint() : null
        // 2) layout 재계산 (SDK 가 이때 viewpoint 를 흔들 수 있음)
        rv.relayout()
        // 3) 다음 프레임에 시점 복원 (relayout 직후 setViewpoint 는 SDK 가 무시하는 경우 있음)
        if (vp) {
          requestAnimationFrame(() => {
            try {
              rv.setViewpoint(vp)
            } catch {}
          })
          // relayout 비동기 케이스 대비 한 번 더
          setTimeout(() => {
            try {
              rv.setViewpoint(vp)
            } catch {}
          }, 200)
        }
      } catch {}
    }
    function onResize() {
      const vw = window.innerWidth
      setWidth((w) => Math.min(w, Math.max(MIN_W, vw - 200)))
      // banner 안정화까지 한 박자 + 한번 더 (한 번이 누락되는 케이스 대비)
      requestAnimationFrame(relayoutRoadview)
      setTimeout(relayoutRoadview, 600)
    }
    window.addEventListener('resize', onResize)
    // 컨테이너 크기 직접 감지 — width state 변화나 부모 layout shift 시 모두 잡힘
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(() => {
        requestAnimationFrame(relayoutRoadview)
      })
      ro.observe(containerRef.current)
    }
    return () => {
      window.removeEventListener('resize', onResize)
      ro?.disconnect()
    }
  }, [])
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
      </div>
    </div>
  )
}
