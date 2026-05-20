'use client'

import { useRef, useState } from 'react'
import { Search, X, MapPin, Loader2 } from 'lucide-react'

// 지도 모드 주소·건물명 검색창.
//   - 주소(지번·도로명) = Kakao Geocoder.addressSearch
//   - 장소·건물·아파트·상호 = Kakao Places.keywordSearch
//   두 검색을 동시에 돌려 합친 뒤, 결과 클릭 시 지도를 그 위치로 이동한다.
//
// SDK(libraries=services) 가 이미 로드된 상태에서만 렌더된다 (status='ready' 게이트).

type Hit = {
  key: string
  label: string
  sub: string
  lat: number
  lng: number
  kind: 'place' | 'address'
}

export default function MapSearchBox({
  onPick,
}: {
  onPick: (lat: number, lng: number, label: string) => void
}) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [searching, setSearching] = useState(false)

  const geocoderRef = useRef<kakao.maps.services.Geocoder | null>(null)
  const placesRef = useRef<kakao.maps.services.Places | null>(null)

  async function runSearch() {
    const q = query.trim()
    if (!q || searching) return
    setSearching(true)
    setHits(null)

    if (!geocoderRef.current) geocoderRef.current = new kakao.maps.services.Geocoder()
    if (!placesRef.current) placesRef.current = new kakao.maps.services.Places()

    // 장소·건물 검색
    const placePromise = new Promise<Hit[]>((resolve) => {
      placesRef.current!.keywordSearch(q, (data, status) => {
        if (status !== 'OK' || !Array.isArray(data)) {
          resolve([])
          return
        }
        resolve(
          data.slice(0, 12).map((d) => ({
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

    // 주소 검색
    const addrPromise = new Promise<Hit[]>((resolve) => {
      geocoderRef.current!.addressSearch(q, (data, status) => {
        if (status !== 'OK' || !Array.isArray(data)) {
          resolve([])
          return
        }
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

    // 주소 결과 먼저, 그 다음 장소. 좌표 거의 같은 항목은 중복 제거.
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

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void runSearch()
              }
            }}
            placeholder="주소·건물·아파트·상호 검색"
            className="w-full rounded-md border border-slate-300 pl-3 pr-7 h-8 text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setHits(null)
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              title="지우기"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => void runSearch()}
          disabled={searching || !query.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 h-8 text-xs font-medium text-white hover:bg-slate-800 disabled:bg-slate-300"
        >
          {searching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          검색
        </button>
      </div>

      {hits !== null && (
        <div className="absolute z-50 mt-1 w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden">
          {hits.length === 0 ? (
            <p className="px-3 py-3 text-xs text-slate-400">검색 결과가 없습니다.</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {hits.map((h) => (
                <li key={h.key}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(h.lat, h.lng, h.label)
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
                      <span className="block text-sm text-slate-900 truncate">
                        {h.label}
                      </span>
                      <span className="block text-[11px] text-slate-500 truncate">
                        {h.sub}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
