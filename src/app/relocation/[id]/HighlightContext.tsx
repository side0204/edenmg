'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

// 고장점 검색 결과를 캔버스에 하이라이트하기 위한 공유 상태.
// FaultSearchTab(쓰기) 과 TopologyCanvas(읽기) 는 서로 다른 패널(탭/캔버스)에
// 있으므로 page 의 CollapsibleLayout 을 감싸는 Provider 로 연결한다.

export type CanvasHighlight = {
  facilityIds: string[]
  cableIds: string[]
  // gaps: 끊긴 중간경로 — 케이블·코어 배정이 삭제돼 직접 연결이 없는 구간.
  //   캔버스에 점선 + 방향 화살표(추정 경로)로 표시.
  gaps: { fromId: string; toId: string }[]
  // fault: 고장점이 떨어진 케이블 + from_facility 기준 위치 비율(0~1)
  fault: { cableId: string; fraction: number } | null
} | null

type HighlightCtxValue = {
  highlight: CanvasHighlight
  setHighlight: (h: CanvasHighlight) => void
}

const HighlightCtx = createContext<HighlightCtxValue | null>(null)

export function HighlightProvider({ children }: { children: ReactNode }) {
  const [highlight, setHighlight] = useState<CanvasHighlight>(null)
  return (
    <HighlightCtx.Provider value={{ highlight, setHighlight }}>
      {children}
    </HighlightCtx.Provider>
  )
}

// Provider 밖에서 호출돼도 안전 — 빈 동작 폴백.
export function useHighlight(): HighlightCtxValue {
  return useContext(HighlightCtx) ?? { highlight: null, setHighlight: () => {} }
}
