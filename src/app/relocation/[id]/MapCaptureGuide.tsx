'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Camera,
} from 'lucide-react'

// 지장이설 지도 모드 — 분할 캡처 가이드.
//
// 카카오맵 타일은 브라우저 보안(CORS)으로 앱에서 이미지로 못 뽑는다.
// 대신 OS 스크린샷(Win+Shift+S)으로 찍되, 앱이 지도를 정확한 격자 위치로
// 자동 이동시켜 매번 같은 영역·같은 크기로 찍히게 한다 → 정렬이 쉬워진다.
//
// 동작:
//   1. 시설 GPS 경계(bbox)를 캡처 프레임 크기로 나눠 격자(타일) 계산.
//   2. 타일마다 지도를 그 타일이 프레임 한가운데 오도록 setCenter.
//   3. 사용자는 프레임(밝은 영역)을 Win+Shift+S 로 캡처 → 다음.
//   4. 타일은 살짝 겹쳐서, 겹치는 부분을 맞춰 격자로 배치하면 한 장이 된다.

type LatLngLit = { lat: number; lng: number }

const MARGIN = 14          // 프레임 상·하·좌·우 여백(px)
const OVERLAP = 0.12       // 타일 간 겹침 비율
const BRACKET_LEN = 26     // 코너 브래킷 길이(px)
const BRACKET_THICK = 4    // 코너 브래킷 두께(px)
const BRACKET_COLOR = '#fbbf24'

export default function MapCaptureGuide({
  map,
  facilities,
  captureBarSlot,
  onClose,
}: {
  map: kakao.maps.Map
  facilities: { lat: number | null; lng: number | null }[]
  // 컨트롤 바를 portal 로 렌더할 캔버스 아래 영역 — 지도를 가리지 않게.
  captureBarSlot: HTMLElement | null
  onClose: () => void
}) {
  // 오버레이(= 지도 컨테이너) 크기 측정
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setSize({ w: r.width, h: r.height })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 캡처 프레임 — 사방 여백만 뺀 직사각형. 컨트롤 바는 캔버스 밖(아래)이라
  //   프레임이 캔버스를 거의 가득 채운다.
  const frame = useMemo(() => {
    const x = MARGIN
    const y = MARGIN
    const w = Math.max(0, size.w - MARGIN * 2)
    const h = Math.max(0, size.h - MARGIN * 2)
    return { x, y, w, h }
  }, [size])

  // 시설 GPS 경계
  const bbox = useMemo(() => {
    const pts = facilities.filter(
      (f): f is LatLngLit => f.lat != null && f.lng != null,
    )
    if (pts.length === 0) return null
    let minLat = Infinity
    let maxLat = -Infinity
    let minLng = Infinity
    let maxLng = -Infinity
    for (const p of pts) {
      if (p.lat < minLat) minLat = p.lat
      if (p.lat > maxLat) maxLat = p.lat
      if (p.lng < minLng) minLng = p.lng
      if (p.lng > maxLng) maxLng = p.lng
    }
    return { minLat, maxLat, minLng, maxLng }
  }, [facilities])

  // 줌 레벨 — 작을수록 확대 (카카오 규약). 사용자가 ±로 조절.
  const [level, setLevel] = useState<number>(() => map.getLevel())

  // 격자 — 타일별 setCenter 목표 좌표 (프레임 한가운데 보정 포함)
  const [grid, setGrid] = useState<{
    cols: number
    rows: number
    centers: LatLngLit[] // row-major
  } | null>(null)
  const [tileIndex, setTileIndex] = useState(0)

  // 캡처 중 지도 잠금 — 드래그·휠 줌 비활성. 이동은 우리 버튼으로만.
  useEffect(() => {
    map.setDraggable(false)
    map.setZoomable(false)
    return () => {
      map.setDraggable(true)
      map.setZoomable(true)
    }
  }, [map])

  // 레벨·프레임·시설 변경 시 격자 재계산
  useEffect(() => {
    if (!bbox || frame.w < 60 || frame.h < 60 || size.w < 1 || size.h < 1) {
      return
    }
    map.setLevel(level)
    const b = map.getBounds()
    const sw = b.getSouthWest()
    const ne = b.getNorthEast()
    const contSpanLng = ne.getLng() - sw.getLng()
    const contSpanLat = ne.getLat() - sw.getLat()
    if (contSpanLng <= 0 || contSpanLat <= 0) return

    // 프레임 한 칸이 담는 지리 범위
    const frameSpanLng = (contSpanLng * frame.w) / size.w
    const frameSpanLat = (contSpanLat * frame.h) / size.h

    // 시설이 가장자리에 닿지 않게 프레임의 10% 만큼 패딩
    const padLng = frameSpanLng * 0.1
    const padLat = frameSpanLat * 0.1
    const spanLng = bbox.maxLng - bbox.minLng + padLng * 2
    const spanLat = bbox.maxLat - bbox.minLat + padLat * 2

    const stepLng = frameSpanLng * (1 - OVERLAP)
    const stepLat = frameSpanLat * (1 - OVERLAP)
    const cols =
      spanLng <= frameSpanLng
        ? 1
        : 1 + Math.ceil((spanLng - frameSpanLng) / stepLng)
    const rows =
      spanLat <= frameSpanLat
        ? 1
        : 1 + Math.ceil((spanLat - frameSpanLat) / stepLat)

    // 격자 전체를 bbox 위에 가운데 정렬
    const coverLng = frameSpanLng + (cols - 1) * stepLng
    const coverLat = frameSpanLat + (rows - 1) * stepLat
    const firstCenterLng =
      bbox.minLng - padLng - (coverLng - spanLng) / 2 + frameSpanLng / 2
    const firstCenterLat =
      bbox.maxLat + padLat + (coverLat - spanLat) / 2 - frameSpanLat / 2

    // 프레임 중심 ≠ 컨테이너 중심(하단 컨트롤 바 때문) — setCenter 보정.
    //   setCenter 는 좌표를 컨테이너 한가운데 두므로, 타일 중심이 프레임
    //   한가운데 오도록 그 차이만큼 좌표를 옮긴다.
    const dxPx = frame.x + frame.w / 2 - size.w / 2
    const dyPx = frame.y + frame.h / 2 - size.h / 2
    const lngPerPx = contSpanLng / size.w
    const latPerPx = contSpanLat / size.h

    const centers: LatLngLit[] = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tileLng = firstCenterLng + c * stepLng
        const tileLat = firstCenterLat - r * stepLat
        centers.push({
          lat: tileLat + dyPx * latPerPx,
          lng: tileLng - dxPx * lngPerPx,
        })
      }
    }
    setGrid({ cols, rows, centers })
    setTileIndex(0)
  }, [bbox, frame, size, level, map])

  // 타일 이동 — 현재 타일 중심으로 지도 setCenter
  useEffect(() => {
    if (!grid) return
    const c = grid.centers[tileIndex]
    if (!c) return
    map.setCenter(new kakao.maps.LatLng(c.lat, c.lng))
  }, [grid, tileIndex, map])

  const total = grid ? grid.centers.length : 0
  const cur = grid
    ? { row: Math.floor(tileIndex / grid.cols) + 1, col: (tileIndex % grid.cols) + 1 }
    : null
  const isLast = total > 0 && tileIndex >= total - 1

  // 시설이 지도에 하나도 배치 안 됐을 때
  if (!bbox) {
    return (
      <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50">
        <div className="max-w-xs rounded-xl bg-white p-4 text-center shadow-xl">
          <Camera className="mx-auto h-6 w-6 text-slate-400" />
          <p className="mt-2 text-sm font-semibold text-slate-800">
            지도에 배치된 시설이 없습니다
          </p>
          <p className="mt-1 text-xs text-slate-500">
            시설을 지도에 배치한 뒤 다시 시도하세요.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-3 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            닫기
          </button>
        </div>
      </div>
    )
  }

  const fx = frame.x
  const fy = frame.y
  const fw = frame.w
  const fh = frame.h
  const fr = fx + fw // 프레임 우측 x
  const fb = fy + fh // 프레임 하단 y

  // 코너 브래킷 — 딤(어두운) 영역 안에 그려 캡처 영역엔 안 들어감
  const bracketBars: { left: number; top: number; w: number; h: number }[] = [
    // 좌상
    { left: fx, top: fy - BRACKET_THICK, w: BRACKET_LEN, h: BRACKET_THICK },
    { left: fx - BRACKET_THICK, top: fy, w: BRACKET_THICK, h: BRACKET_LEN },
    // 우상
    { left: fr - BRACKET_LEN, top: fy - BRACKET_THICK, w: BRACKET_LEN, h: BRACKET_THICK },
    { left: fr, top: fy, w: BRACKET_THICK, h: BRACKET_LEN },
    // 좌하
    { left: fx, top: fb, w: BRACKET_LEN, h: BRACKET_THICK },
    { left: fx - BRACKET_THICK, top: fb - BRACKET_LEN, w: BRACKET_THICK, h: BRACKET_LEN },
    // 우하
    { left: fr - BRACKET_LEN, top: fb, w: BRACKET_LEN, h: BRACKET_THICK },
    { left: fr, top: fb - BRACKET_LEN, w: BRACKET_THICK, h: BRACKET_LEN },
  ]

  return (
    <div ref={rootRef} className="absolute inset-0 z-30" style={{ pointerEvents: 'none' }}>
      {grid && fw > 60 && fh > 60 && (
        <>
          {/* 딤 마스크 4분할 — 프레임 바깥 어둡게. pointer-events 로 지도 조작 차단 */}
          <div
            className="absolute bg-black/55"
            style={{ left: 0, top: 0, width: size.w, height: fy, pointerEvents: 'auto' }}
          />
          <div
            className="absolute bg-black/55"
            style={{ left: 0, top: fb, width: size.w, height: size.h - fb, pointerEvents: 'auto' }}
          />
          <div
            className="absolute bg-black/55"
            style={{ left: 0, top: fy, width: fx, height: fh, pointerEvents: 'auto' }}
          />
          <div
            className="absolute bg-black/55"
            style={{ left: fr, top: fy, width: size.w - fr, height: fh, pointerEvents: 'auto' }}
          />
          {/* 프레임 내부 투명 차단막 — 캡처 중 시설 클릭·지도 조작 방지 */}
          <div
            className="absolute"
            style={{ left: fx, top: fy, width: fw, height: fh, pointerEvents: 'auto' }}
          />

          {/* 코너 브래킷 — 캡처 모서리 표시 */}
          {bracketBars.map((b, i) => (
            <div
              key={i}
              className="absolute rounded-sm"
              style={{
                left: b.left,
                top: b.top,
                width: b.w,
                height: b.h,
                backgroundColor: BRACKET_COLOR,
              }}
            />
          ))}

          {/* 컨트롤 바 — 캔버스 아래 별도 영역(portal). 지도를 가리지 않는다. */}
          {captureBarSlot &&
            createPortal(
              <div className="px-3 py-2">
                <div className="mx-auto w-full max-w-3xl">
                  {/* 1행 — 제목 · 줌 · 끝내기 */}
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-800">
                      <Camera className="h-3.5 w-3.5" />
                      분할 캡처
                    </span>
                    <span className="text-[11px] text-slate-500">
                      총 {total}장 · {grid.cols}열 × {grid.rows}행
                    </span>
                    <div className="ml-auto inline-flex items-center overflow-hidden rounded-md border border-slate-300">
                      <button
                        type="button"
                        onClick={() => setLevel((l) => Math.min(14, l + 1))}
                        className="inline-flex h-7 items-center gap-0.5 px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                        title="지도 축소 (장수 줄이기)"
                      >
                        <ZoomOut className="h-3.5 w-3.5" />
                        축소
                      </button>
                      <button
                        type="button"
                        onClick={() => setLevel((l) => Math.max(1, l - 1))}
                        className="inline-flex h-7 items-center gap-0.5 border-l border-slate-300 px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                        title="지도 확대 (더 선명·장수 늘기)"
                      >
                        <ZoomIn className="h-3.5 w-3.5" />
                        확대
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={onClose}
                      className="inline-flex h-7 items-center gap-0.5 rounded-md border border-slate-300 px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      끝내기
                    </button>
                  </div>

                  {/* 2행 — 타일 네비게이션 */}
                  <div className="mt-1.5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setTileIndex((i) => Math.max(0, i - 1))}
                      disabled={tileIndex <= 0}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      이전
                    </button>
                    <div className="flex-1 text-center">
                      <span className="text-sm font-bold text-slate-900">
                        {cur?.row}행 {cur?.col}열
                      </span>
                      <span className="ml-1.5 text-xs text-slate-500">
                        {tileIndex + 1} / {total}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTileIndex((i) => Math.min(total - 1, i + 1))}
                      disabled={isLast}
                      className="inline-flex h-8 items-center gap-1 rounded-md bg-slate-900 px-2.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40"
                    >
                      다음
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  {/* 3행 — 안내 */}
                  <p className="mt-1 text-center text-[10.5px] leading-snug text-slate-500">
                    {isLast
                      ? `마지막 장입니다. 캡처한 ${total}장을 ${grid.cols}열 × ${grid.rows}행 격자로 배치하세요 (타일은 살짝 겹칩니다).`
                      : '밝은 영역을 Win+Shift+S 로 캡처한 뒤 [다음 ▶]. 모서리 ⌐ 표시에 맞추세요.'}
                  </p>
                </div>
              </div>,
              captureBarSlot,
            )}
        </>
      )}
    </div>
  )
}
