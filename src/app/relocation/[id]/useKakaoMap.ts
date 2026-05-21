'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { loadKakaoMaps } from '@/lib/kakao-loader'

// 지장이설 캔버스 「지도 모드」 — 카카오맵 인스턴스 + SVG 오버레이 동기화 훅.
//
// 핵심: TopologyCanvas 의 SVG 를 카카오맵 위에 투명 오버레이로 깔고,
//   각 시설을 GPS 좌표 → 화면 픽셀로 투영해 지도를 따라가게 한다.
//   - epoch: 지도가 움직일 때마다 증가 (rAF throttle). effectivePositions useMemo 재계산 트리거.
//
// SVG 는 지도 모드에서 viewBox 를 생략해 자연 좌표계(1 user unit = 1 CSS px)를 쓴다.
// 따라서 컨테이너 크기를 별도로 측정할 필요가 없다 — containerPointFromCoords 가 주는
// 픽셀이 그대로 SVG 좌표가 된다. ResizeObserver 는 카카오맵 relayout 용으로만 쓴다.
//
// 컨테이너는 RefObject 가 아니라 콜백 ref(`setContainer`)로 넘긴다 — 훅이 RefObject 를
// 반환하면 React Compiler 의 ref 규칙이 반환 객체 전체를 ref 로 오인하기 때문.
//
// enabled=false (도식 모드) 면 SDK 를 로드하지 않는다. 지도 모드 첫 진입에 1회 생성,
// 이후 도식↔지도 토글은 relayout 만 한다 (인스턴스 재사용).

export type KakaoMapStatus = 'loading' | 'ready' | 'error'

export type KakaoMapView = {
  setContainer: (el: HTMLDivElement | null) => void
  map: kakao.maps.Map | null
  status: KakaoMapStatus
  error: string
  epoch: number
}

// 지도 기본 초기 위치 — 모든 프로젝트 공통. 시설 좌표가 없는(빈) 프로젝트에서 이 위치를 보여준다.
//   주소를 지오코딩해 정확 좌표로 이동하고, 실패 시 FALLBACK(미산로 도로 인근)을 쓴다.
//   시설이 있는 프로젝트는 ready 후 TopologyCanvas 의 fitMapToFacilities 가 다시 fit 한다.
const DEFAULT_CENTER_ADDRESS = '경기도 시흥시 미산로 62'
const DEFAULT_CENTER_FALLBACK = { lat: 37.4242637, lng: 126.7929056 }

export function useKakaoMap(enabled: boolean): KakaoMapView {
  const [container, setContainerState] = useState<HTMLDivElement | null>(null)
  const setContainer = useCallback((el: HTMLDivElement | null) => {
    setContainerState(el)
  }, [])

  const mapInstanceRef = useRef<kakao.maps.Map | null>(null)

  const [map, setMap] = useState<kakao.maps.Map | null>(null)
  const [status, setStatus] = useState<KakaoMapStatus>('loading')
  const [error, setError] = useState('')
  const [epoch, setEpoch] = useState(0)

  // 지도 이동/확대 시 epoch 를 올려 오버레이를 재계산. rAF 로 프레임당 1회로 묶음.
  const rafRef = useRef<number | null>(null)
  const bumpEpoch = useCallback(() => {
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      setEpoch((e) => (e + 1) % 1_000_000)
    })
  }, [])

  // SDK 로드 + 지도 생성 (지도 모드 첫 진입 시 1회). 재진입 시 relayout.
  useEffect(() => {
    if (!enabled || !container) return
    let cancelled = false

    const existing = mapInstanceRef.current
    if (existing) {
      // 이미 생성됨 — 다시 보일 때 컨테이너 크기 재반영
      requestAnimationFrame(() => {
        if (cancelled) return
        existing.relayout()
        bumpEpoch()
      })
      return () => {
        cancelled = true
      }
    }

    setStatus('loading')
    loadKakaoMaps()
      .then(() => {
        if (cancelled) return
        const m = new kakao.maps.Map(container, {
          center: new kakao.maps.LatLng(
            DEFAULT_CENTER_FALLBACK.lat,
            DEFAULT_CENTER_FALLBACK.lng,
          ),
          level: 3,
        })
        mapInstanceRef.current = m
        kakao.maps.event.addListener(m, 'bounds_changed', bumpEpoch)
        kakao.maps.event.addListener(m, 'zoom_changed', bumpEpoch)
        kakao.maps.event.addListener(m, 'idle', bumpEpoch)

        // 지도 준비 완료 처리. ready 를 지오코딩 이후로 미뤄 fitMapToFacilities 와의
        //   경합을 피한다 — ready 후에야 TopologyCanvas 가 시설 범위로 fit 하기 때문.
        const finish = () => {
          if (cancelled) return
          setMap(m)
          setStatus('ready')
          // 컨테이너 레이아웃이 늦게 잡힐 때 대비
          setTimeout(() => {
            if (cancelled) return
            m.relayout()
            bumpEpoch()
          }, 120)
        }

        // 기본 초기 위치 = 미산로 62. 주소→좌표 변환 성공 시 정확 위치로 이동.
        try {
          const geocoder = new kakao.maps.services.Geocoder()
          geocoder.addressSearch(DEFAULT_CENTER_ADDRESS, (result, status) => {
            if (cancelled) return
            if (status === 'OK' && Array.isArray(result) && result.length > 0) {
              m.setCenter(
                new kakao.maps.LatLng(Number(result[0].y), Number(result[0].x)),
              )
            }
            finish()
          })
        } catch {
          finish()
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : '지도를 불러오지 못했습니다')
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [enabled, container, bumpEpoch])

  // 컨테이너 크기 변화 추적 — 카카오맵 relayout + 오버레이 재투영
  useEffect(() => {
    if (!container) return
    const ro = new ResizeObserver(() => {
      const m = mapInstanceRef.current
      if (m) {
        m.relayout()
        bumpEpoch()
      }
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [container, bumpEpoch])

  // 언마운트 정리
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return { setContainer, map, status, error, epoch }
}
