'use client'

import { useEffect, useRef, useState } from 'react'
import { MapPin, Search, Loader2, Check } from 'lucide-react'
import { loadKakaoMaps } from '@/lib/kakao-loader'

// 국사 주소 입력 + 좌표 찾기(카카오 지오코딩).
//   주소를 입력하고 「좌표 찾기」 → 주소/건물 검색 결과에서 선택하면
//   address + lat/lng 가 채워진다. 좌표가 있어야 길찾기가 정확.
//   좌표 없이 주소만 남겨도 OK (길찾기는 주소 검색 URL 로 폴백).

type Hit = {
  key: string
  label: string
  sub: string
  lat: number
  lng: number
  kind: 'place' | 'address'
}

type Props = {
  address: string
  lat: number | null
  lng: number | null
  onChange: (next: { address: string; lat: number | null; lng: number | null }) => void
}

export default function AddressGeocodeField({ address, lat, lng, onChange }: Props) {
  const [sdkReady, setSdkReady] = useState(false)
  const [searching, setSearching] = useState(false)
  const [hits, setHits] = useState<Hit[] | null>(null)
  const geocoderRef = useRef<kakao.maps.services.Geocoder | null>(null)
  const placesRef = useRef<kakao.maps.services.Places | null>(null)

  useEffect(() => {
    let cancelled = false
    loadKakaoMaps()
      .then(() => {
        if (!cancelled) setSdkReady(true)
      })
      .catch(() => {
        // 지도 SDK 실패 — 주소 텍스트만 입력 가능 (좌표 없이도 저장 OK)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function runSearch() {
    const q = address.trim()
    if (!q || searching || !sdkReady) return
    setSearching(true)
    setHits(null)

    if (!geocoderRef.current) geocoderRef.current = new kakao.maps.services.Geocoder()
    if (!placesRef.current) placesRef.current = new kakao.maps.services.Places()

    const placePromise = new Promise<Hit[]>((resolve) => {
      placesRef.current!.keywordSearch(q, (data, status) => {
        if (status !== 'OK' || !Array.isArray(data)) return resolve([])
        resolve(
          data.slice(0, 10).map((d) => ({
            key: 'p-' + d.id,
            label: d.place_name,
            sub: d.road_address_name || d.address_name,
            lat: Number(d.y),
            lng: Number(d.x),
            kind: 'place' as const,
          })),
        )
      })
    })

    const addrPromise = new Promise<Hit[]>((resolve) => {
      geocoderRef.current!.addressSearch(q, (data, status) => {
        if (status !== 'OK' || !Array.isArray(data)) return resolve([])
        resolve(
          data.slice(0, 6).map((d, i) => ({
            key: 'a-' + i + '-' + d.address_name,
            label: d.address_name,
            sub: '주소',
            lat: Number(d.y),
            lng: Number(d.x),
            kind: 'address' as const,
          })),
        )
      })
    })

    const [places, addrs] = await Promise.all([placePromise, addrPromise])
    const merged: Hit[] = []
    const seen = new Set<string>()
    for (const h of [...addrs, ...places]) {
      if (!Number.isFinite(h.lat) || !Number.isFinite(h.lng)) continue
      const dedup = h.lat.toFixed(5) + ',' + h.lng.toFixed(5)
      if (seen.has(dedup)) continue
      seen.add(dedup)
      merged.push(h)
    }
    setHits(merged)
    setSearching(false)
  }

  const hasCoords = lat != null && lng != null

  return (
    <div className="space-y-1">
      <div className="relative">
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={address}
            onChange={(e) => onChange({ address: e.target.value, lat, lng })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void runSearch()
              }
            }}
            placeholder="국사 주소 (도로명·지번·건물명)"
            className="flex-1 min-w-0 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void runSearch()}
            disabled={searching || !address.trim() || !sdkReady}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:bg-slate-300"
            title={sdkReady ? '주소로 좌표 찾기' : '지도 SDK 로딩 중'}
          >
            {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            좌표 찾기
          </button>
        </div>

        {hits !== null && (
          <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden">
            {hits.length === 0 ? (
              <p className="px-3 py-3 text-xs text-slate-400">검색 결과가 없습니다.</p>
            ) : (
              <ul className="max-h-64 overflow-y-auto">
                {hits.map((h) => (
                  <li key={h.key}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange({ address: h.label, lat: h.lat, lng: h.lng })
                        setHits(null)
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-start gap-2"
                    >
                      <MapPin
                        className={
                          'h-3.5 w-3.5 mt-0.5 shrink-0 ' +
                          (h.kind === 'address' ? 'text-emerald-600' : 'text-blue-600')
                        }
                      />
                      <span className="min-w-0">
                        <span className="block text-sm text-slate-900 truncate">{h.label}</span>
                        <span className="block text-[11px] text-slate-500 truncate">{h.sub}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] flex items-center gap-1">
        {hasCoords ? (
          <span className="inline-flex items-center gap-1 text-emerald-600">
            <Check className="h-3 w-3" /> 좌표 확인됨 — 길찾기 가능
          </span>
        ) : (
          <span className="text-slate-400">
            좌표 없음 — 「좌표 찾기」로 위치를 지정하면 길찾기가 정확합니다.
          </span>
        )}
      </p>
    </div>
  )
}
