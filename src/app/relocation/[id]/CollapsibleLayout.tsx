'use client'

import { useState } from 'react'
import { Minimize2, Maximize2, ChevronUp, ChevronDown } from 'lucide-react'

// 캔버스 작업 집중 모드 — 상단(헤더·시드 카드)과 하단(탭 바·정보 폼)을 접어
// 캔버스에만 집중할 수 있게 한다. owner 요청 (2026-05-20).
//
// 단일 토글:
//   - 「집중 모드」 ON  : 상단 + 하단 모두 접힘 (캔버스만 화면)
//   - 「펼치기」    OFF : 원래 상태로 복귀
//
// 추가로 상단·하단 개별 토글도 작은 chip 으로 제공 — 캔버스 사이 작은 stripe.
export default function CollapsibleLayout({
  topPanel,
  canvas,
  bottomPanel,
  bottomDefaultCollapsed = true,
}: {
  topPanel: React.ReactNode
  canvas: React.ReactNode
  bottomPanel?: React.ReactNode
  // 하단 패널(탭 콘텐츠) 기본 접힘 여부.
  //   URL 에 ?tab= 이 있으면(탭·진행단계 클릭) 펼친 채로 시작 — 매번 다시 펼치는 수고 제거.
  bottomDefaultCollapsed?: boolean
}) {
  const hasBottomPanel = bottomPanel != null && bottomPanel !== false
  // 기본값 접힘 — 설계 화면 진입 시 캔버스에 바로 집중 (owner 요청).
  //   도식·지도 모드 공통 (CollapsibleLayout 이 두 모드를 모두 감쌈).
  const [topCollapsed, setTopCollapsed] = useState(true)
  const [bottomCollapsed, setBottomCollapsed] = useState(bottomDefaultCollapsed)

  const focused = topCollapsed && (!hasBottomPanel || bottomCollapsed)
  const toggleFocus = () => {
    if (focused) {
      setTopCollapsed(false)
      if (hasBottomPanel) setBottomCollapsed(false)
    } else {
      setTopCollapsed(true)
      if (hasBottomPanel) setBottomCollapsed(true)
    }
  }

  return (
    <>
      {!topCollapsed && topPanel}

      {/* 상단 토글 stripe — 상단 패널과 캔버스 사이. 클릭하면 상단 접기/펼치기 */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <button
          type="button"
          onClick={() => setTopCollapsed((v) => !v)}
          className="w-full inline-flex items-center justify-center gap-1 py-1 text-[11px] font-medium text-slate-400 hover:text-slate-700 hover:bg-slate-100/70 rounded transition"
          title={topCollapsed ? '상단 영역 펼치기' : '상단 영역 접기'}
        >
          {topCollapsed ? (
            <>
              <ChevronDown className="h-3 w-3" />
              상단 펼치기
            </>
          ) : (
            <>
              <ChevronUp className="h-3 w-3" />
              상단 접기
            </>
          )}
        </button>
      </div>

      {canvas}

      {hasBottomPanel && (
        <>
          {/* 하단 토글 stripe — 캔버스와 하단 패널 사이 */}
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setBottomCollapsed((v) => !v)}
              className="w-full inline-flex items-center justify-center gap-1 py-1 text-[11px] font-medium text-slate-400 hover:text-slate-700 hover:bg-slate-100/70 rounded transition"
              title={bottomCollapsed ? '하단 영역 펼치기' : '하단 영역 접기'}
            >
              {bottomCollapsed ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  하단 펼치기
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  하단 접기
                </>
              )}
            </button>
          </div>
          {!bottomCollapsed && bottomPanel}
        </>
      )}

      {/* 집중 모드 floating 토글 — 페이지 어디서나 한 번 클릭으로 상하 동시 접기/펼치기.
          z-30 — fullscreen 캔버스 (z-40) 보다 낮아 fullscreen 진입 시 가려짐 (의도). */}
      <button
        type="button"
        onClick={toggleFocus}
        className="fixed bottom-4 right-4 z-30 inline-flex items-center gap-1.5 rounded-full shadow-lg bg-slate-900 text-white px-4 py-2 text-xs font-medium hover:bg-slate-800"
        title={focused ? '상하 패널 모두 펼치기' : '상하 패널 모두 접고 캔버스에 집중'}
      >
        {focused ? (
          <>
            <Maximize2 className="h-3.5 w-3.5" />
            펼치기
          </>
        ) : (
          <>
            <Minimize2 className="h-3.5 w-3.5" />
            집중 모드
          </>
        )}
      </button>
    </>
  )
}
