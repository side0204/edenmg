'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Maximize2, X, TriangleAlert, MapPinned } from 'lucide-react'
import {
  CLOSURE_TYPE_COLOR,
  CLOSURE_TYPE_LABEL,
  CLOSURE_CATEGORY_LABEL,
  groupClosureTypesByCategory,
  formatFacilityCode,
  cableSpecColor,
  type ClosureType,
  type ClosureCategory,
  type CableStatus,
} from '@/lib/relocation'
import type { CableSpec } from '@/lib/connection'
import { loadKakaoMaps } from '@/lib/kakao-loader'
import {
  createFacilityAtLatLng,
  updateFacilityLatLng,
  bulkPlaceFacilities,
} from './facility-actions'

// 카카오맵 지도 모드 — 실제 GPS 좌표로 시설물을 배치·검토.
//   - 시설(lat/lng 있음): 드래그 가능한 마커 + 이름 라벨
//   - 케이블: 양 끝 시설에 GPS 가 있으면 폴리라인
//   - 「시설 추가」 ON → 지도 클릭으로 새 시설 배치
//   - 「미배치 시설」 → 도식 모드에서 만든 GPS 없는 시설을 지도에 배치

export type MapFacility = {
  id: string
  closure_type: ClosureType
  seq_no: number
  name: string
  lat: number | null
  lng: number | null
}

export type MapCable = {
  id: string
  from_facility_id: string
  to_facility_id: string
  spec: string
  status: CableStatus
}

// GPS 있는 시설이 없을 때 지도 시작 위치 — 주소를 좌표로 변환해 사용.
// 변환 실패 시 폴백 좌표(서울시청).
const DEFAULT_ADDRESS = '경기도 시흥시 미산로 62'
const FALLBACK_LAT = 37.5665
const FALLBACK_LNG = 126.978

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;',
  )
}

function hasGps(f: MapFacility): f is MapFacility & { lat: number; lng: number } {
  return f.lat != null && f.lng != null
}

// 주소 → 좌표 (Kakao Geocoder). 실패 시 null.
function geocodeAddress(address: string): Promise<kakao.maps.LatLng | null> {
  return new Promise((resolve) => {
    try {
      const geocoder = new kakao.maps.services.Geocoder()
      geocoder.addressSearch(address, (result, status) => {
        if (status === 'OK' && result.length > 0) {
          resolve(new kakao.maps.LatLng(Number(result[0].y), Number(result[0].x)))
        } else {
          resolve(null)
        }
      })
    } catch {
      resolve(null)
    }
  })
}

type MapOverlay = { setMap(map: kakao.maps.Map | null): void }

export default function MapCanvas({
  projectId,
  facilities,
  cables,
}: {
  projectId: string
  facilities: MapFacility[]
  cables: MapCable[]
}) {
  const router = useRouter()

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<kakao.maps.Map | null>(null)
  const overlaysRef = useRef<MapOverlay[]>([])

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [addMode, setAddMode] = useState(false)
  const [placingId, setPlacingId] = useState<string | null>(null)
  const [showUnplaced, setShowUnplaced] = useState(false)
  const [pendingClick, setPendingClick] = useState<{ lat: number; lng: number } | null>(null)
  const [addName, setAddName] = useState('')
  const [addType, setAddType] = useState<ClosureType>('국사')
  const [busy, setBusy] = useState(false)

  // 카카오 이벤트 핸들러(한 번만 등록)에서 최신 모드를 읽기 위한 ref
  const addModeRef = useRef(addMode)
  const placingIdRef = useRef(placingId)
  const facilitiesRef = useRef(facilities)
  useEffect(() => {
    addModeRef.current = addMode
  }, [addMode])
  useEffect(() => {
    placingIdRef.current = placingId
  }, [placingId])
  useEffect(() => {
    facilitiesRef.current = facilities
  }, [facilities])

  const unplaced = facilities.filter((f) => f.lat == null || f.lng == null)
  const placingFacility = placingId
    ? facilities.find((f) => f.id === placingId) ?? null
    : null

  // 시설 위치 저장 (마커 드래그 끝 / 미배치 시설 배치)
  const saveLatLng = useCallback(
    async (facilityId: string, lat: number, lng: number) => {
      const r = await updateFacilityLatLng({
        project_id: projectId,
        facility_id: facilityId,
        lat,
        lng,
      })
      if (!r.ok) {
        toast.error(r.error)
        router.refresh() // 실패 시 마커를 원래 위치로 되돌림
        return
      }
      toast.success('시설 위치를 저장했습니다')
      router.refresh()
    },
    [projectId, router],
  )

  // 지도 클릭 — 미배치 시설 배치 중이면 그 시설을, 추가 모드면 새 시설 폼을
  const handleMapClick = useCallback(
    async (lat: number, lng: number) => {
      const placing = placingIdRef.current
      if (placing) {
        setBusy(true)
        const r = await updateFacilityLatLng({
          project_id: projectId,
          facility_id: placing,
          lat,
          lng,
        })
        setBusy(false)
        if (!r.ok) {
          toast.error(r.error)
          return
        }
        toast.success('시설 위치를 지정했습니다')
        setPlacingId(null)
        router.refresh()
        return
      }
      if (addModeRef.current) {
        setPendingClick({ lat, lng })
      }
    },
    [projectId, router],
  )

  // SDK 로드 + 지도 1회 생성
  useEffect(() => {
    let cancelled = false
    loadKakaoMaps()
      .then(async () => {
        if (cancelled || !containerRef.current || mapRef.current) return
        const withGps = facilitiesRef.current.filter(hasGps)

        // 시작 중심·확대 단계 결정
        let center: kakao.maps.LatLng
        let level = 5
        if (withGps.length > 0) {
          center = new kakao.maps.LatLng(withGps[0].lat, withGps[0].lng)
        } else {
          // GPS 시설이 없으면 기본 주소를 좌표로 변환해 그곳에서 시작
          const geo = await geocodeAddress(DEFAULT_ADDRESS)
          if (cancelled || !containerRef.current || mapRef.current) return
          center = geo ?? new kakao.maps.LatLng(FALLBACK_LAT, FALLBACK_LNG)
          level = 4
        }

        const map = new kakao.maps.Map(containerRef.current, { center, level })
        mapRef.current = map
        if (withGps.length > 1) {
          const bounds = new kakao.maps.LatLngBounds()
          for (const f of withGps) {
            bounds.extend(new kakao.maps.LatLng(f.lat, f.lng))
          }
          map.setBounds(bounds)
        }
        kakao.maps.event.addListener(map, 'click', (e) => {
          if (!e) return
          void handleMapClick(e.latLng.getLat(), e.latLng.getLng())
        })
        setStatus('ready')
        // 컨테이너가 늦게 잡힐 때 대비
        setTimeout(() => mapRef.current?.relayout(), 120)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setErrorMsg(err instanceof Error ? err.message : '지도를 불러오지 못했습니다')
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [handleMapClick])

  // 시설·케이블 변경 시 마커·폴리라인 다시 그림
  useEffect(() => {
    if (status !== 'ready') return
    const map = mapRef.current
    if (!map) return

    for (const o of overlaysRef.current) o.setMap(null)
    overlaysRef.current = []

    const facById = new Map(facilities.map((f) => [f.id, f]))

    // 케이블 (마커 아래)
    for (const c of cables) {
      const a = facById.get(c.from_facility_id)
      const b = facById.get(c.to_facility_id)
      if (!a || !b) continue
      if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) continue
      const line = new kakao.maps.Polyline({
        path: [
          new kakao.maps.LatLng(a.lat, a.lng),
          new kakao.maps.LatLng(b.lat, b.lng),
        ],
        strokeWeight: c.status === 'new' ? 5 : 3,
        strokeColor: cableSpecColor(c.spec as CableSpec),
        strokeOpacity: c.status === 'removing' ? 0.4 : 0.9,
        strokeStyle: 'solid',
        map,
      })
      overlaysRef.current.push(line)
    }

    // 시설 마커 + 라벨
    for (const f of facilities) {
      if (f.lat == null || f.lng == null) continue
      const pos = new kakao.maps.LatLng(f.lat, f.lng)
      const marker = new kakao.maps.Marker({ position: pos, draggable: true, map })
      const code = formatFacilityCode(f.closure_type, f.seq_no)
      const color = CLOSURE_TYPE_COLOR[f.closure_type]
      const label = new kakao.maps.CustomOverlay({
        position: pos,
        yAnchor: 0,
        zIndex: 3,
        content:
          `<div style="transform:translateY(6px);white-space:nowrap;` +
          `font-family:system-ui,sans-serif;font-size:11px;font-weight:700;line-height:1;` +
          `padding:3px 7px;border-radius:9px;background:#fff;border:1.5px solid ${color};` +
          `color:${color};box-shadow:0 1px 4px rgba(0,0,0,.25)">` +
          `${escapeHtml(code)} ${escapeHtml(f.name)}</div>`,
        map,
      })
      const fid = f.id
      kakao.maps.event.addListener(marker, 'drag', () => {
        label.setPosition(marker.getPosition())
      })
      kakao.maps.event.addListener(marker, 'dragend', () => {
        const p = marker.getPosition()
        void saveLatLng(fid, p.getLat(), p.getLng())
      })
      overlaysRef.current.push(marker, label)
    }
  }, [status, facilities, cables, saveLatLng])

  // 언마운트 정리
  useEffect(() => {
    return () => {
      for (const o of overlaysRef.current) o.setMap(null)
      overlaysRef.current = []
      mapRef.current = null
    }
  }, [])

  function fitToFacilities() {
    const map = mapRef.current
    if (!map) return
    const withGps = facilities.filter((f) => f.lat != null && f.lng != null)
    if (withGps.length === 0) {
      toast.info('지도에 표시된 시설이 없습니다')
      return
    }
    const bounds = new kakao.maps.LatLngBounds()
    for (const f of withGps) {
      bounds.extend(new kakao.maps.LatLng(f.lat as number, f.lng as number))
    }
    map.setBounds(bounds)
  }

  async function submitAdd() {
    if (!pendingClick || busy) return
    const name = addName.trim()
    if (!name) {
      toast.error('시설 이름을 입력하세요')
      return
    }
    setBusy(true)
    const r = await createFacilityAtLatLng({
      project_id: projectId,
      closure_type: addType,
      name,
      lat: pendingClick.lat,
      lng: pendingClick.lng,
    })
    setBusy(false)
    if (!r.ok) {
      toast.error(r.error)
      return
    }
    toast.success(`${name} 시설을 추가했습니다`)
    setPendingClick(null)
    setAddName('')
    setAddMode(false)
    router.refresh()
  }

  // 도식 모드에서 만든 GPS 없는 시설들을 지도 중심 기준 격자로 한 번에 배치
  async function placeAllUnplaced() {
    const map = mapRef.current
    if (!map || busy || unplaced.length === 0) return
    const c = map.getCenter()
    const centerLat = c.getLat()
    const centerLng = c.getLng()
    const n = unplaced.length
    const cols = Math.ceil(Math.sqrt(n))
    const rows = Math.ceil(n / cols)
    const gap = 0.0012 // 약 130m 간격
    const items = unplaced.map((f, i) => {
      const r = Math.floor(i / cols)
      const col = i % cols
      return {
        id: f.id,
        lat: centerLat - (r - (rows - 1) / 2) * gap,
        lng: centerLng + (col - (cols - 1) / 2) * gap,
      }
    })
    setBusy(true)
    const res = await bulkPlaceFacilities(projectId, items)
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(
      `시설 ${res.count}개를 지도에 펼쳤습니다. 마커를 드래그해 실제 위치로 옮기세요.`,
    )
    setShowUnplaced(false)
    router.refresh()
  }

  const grouped = groupClosureTypesByCategory()

  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
      {/* 툴바 — 지도 위쪽 별도 막대 (오버레이 아님 → 카카오맵과 z-index 충돌 없음) */}
      {status !== 'error' && (
        <div className="border-b border-slate-200 bg-white px-2 py-2 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setAddMode((v) => !v)
                setPlacingId(null)
              }}
              disabled={status !== 'ready'}
              className={
                'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 ' +
                (addMode
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50')
              }
            >
              <Plus className="h-3.5 w-3.5" />
              시설 추가
            </button>
            <button
              type="button"
              onClick={fitToFacilities}
              disabled={status !== 'ready'}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              전체 보기
            </button>
            {unplaced.length > 0 && (
              <button
                type="button"
                onClick={() => setShowUnplaced((v) => !v)}
                disabled={status !== 'ready'}
                className={
                  'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-50 ' +
                  (showUnplaced
                    ? 'bg-amber-500 text-white'
                    : 'bg-white text-amber-700 border border-amber-300 hover:bg-amber-50')
                }
              >
                <MapPinned className="h-3.5 w-3.5" />
                미배치 시설 {unplaced.length}
              </button>
            )}
            {(addMode || placingId) && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white">
                {placingFacility
                  ? `지도를 클릭해 「${placingFacility.name}」 위치 지정`
                  : '지도를 클릭해 새 시설 위치 지정'}
                <button
                  type="button"
                  onClick={() => {
                    setAddMode(false)
                    setPlacingId(null)
                  }}
                  className="text-slate-300 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
          </div>

          {/* 미배치 시설 패널 — 펼치면 일반 흐름 (오버레이 아님) */}
          {showUnplaced && unplaced.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <button
                type="button"
                onClick={placeAllUnplaced}
                disabled={busy || status !== 'ready'}
                className="w-full rounded-md bg-emerald-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300"
              >
                {busy
                  ? '배치 중…'
                  : `도식 시설 ${unplaced.length}개를 지도 중앙에 펼치기`}
              </button>
              <p className="px-0.5 pt-1.5 pb-1 text-[10px] text-slate-500 leading-snug">
                펼친 뒤 마커를 드래그해 실제 위치로 옮기세요. 또는 아래에서 하나씩
                「배치」 누른 뒤 지도를 클릭하세요.
              </p>
              <ul className="max-h-44 space-y-1 overflow-y-auto">
                {unplaced.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2 py-1"
                  >
                    <span className="min-w-0 truncate text-[11px] text-slate-700">
                      <span className="font-mono text-slate-500">
                        {formatFacilityCode(f.closure_type, f.seq_no)}
                      </span>{' '}
                      {f.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setPlacingId(f.id)
                        setAddMode(false)
                        setShowUnplaced(false)
                      }}
                      className="shrink-0 rounded-md bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-slate-800"
                    >
                      배치
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* 지도 영역 */}
      <div className="relative">
        <div
          ref={containerRef}
          className="w-full isolate"
          style={{ height: '70vh', minHeight: 420 }}
        />
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
            <p className="text-sm text-slate-500">지도를 불러오는 중…</p>
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50 p-6">
            <div className="max-w-md rounded-xl border border-rose-200 bg-rose-50 p-4 text-center">
              <TriangleAlert className="mx-auto h-6 w-6 text-rose-500" />
              <p className="mt-2 text-sm font-semibold text-rose-800">
                카카오맵을 불러오지 못했습니다
              </p>
              <p className="mt-1 text-xs text-rose-700">{errorMsg}</p>
              <p className="mt-2 text-[11px] text-rose-600 leading-relaxed">
                환경변수 등록·dev 서버 재시작·도메인 등록을 확인하세요.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 새 시설 추가 폼 — 화면 기준 고정 모달 (z-index 충돌 없음) */}
      {pendingClick && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-4 shadow-xl">
            <h3 className="text-sm font-bold text-slate-900">새 시설 추가</h3>
            <p className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-500">
              위치 {pendingClick.lat.toFixed(6)}, {pendingClick.lng.toFixed(6)}
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-600">
                시설 이름 <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                maxLength={200}
                autoFocus
                placeholder="예: 필동간이국사"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">
                시설 종류 <span className="text-rose-600">*</span>
              </label>
              <select
                value={addType}
                onChange={(e) => setAddType(e.target.value as ClosureType)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {(Object.entries(grouped) as [ClosureCategory, ClosureType[]][]).map(
                  ([cat, types]) => (
                    <optgroup key={cat} label={CLOSURE_CATEGORY_LABEL[cat]}>
                      {types.map((t) => (
                        <option key={t} value={t}>
                          {CLOSURE_TYPE_LABEL[t]}
                        </option>
                      ))}
                    </optgroup>
                  ),
                )}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPendingClick(null)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitAdd}
                disabled={busy}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:bg-slate-300"
              >
                {busy ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
