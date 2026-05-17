'use client'

import { useState, useTransition } from 'react'
import { matchSite, type ActiveSite } from './geo'

type GeoState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready'
      lat: number
      lng: number
      matched: ReturnType<typeof matchSite>
    }

// 출근 또는 퇴근 한쪽을 처리하는 폼. mode 에 따라 라벨·action 만 다름.
export function AttendanceForm({
  mode,
  action,
  sites,
}: {
  mode: 'in' | 'out'
  action: (formData: FormData) => void
  sites: ActiveSite[]
}) {
  const [geo, setGeo] = useState<GeoState>({ kind: 'idle' })
  const [submitting, startSubmit] = useTransition()

  const acquire = () => {
    setGeo({ kind: 'loading' })
    if (!('geolocation' in navigator)) {
      setGeo({ kind: 'error', message: '이 브라우저는 위치 정보를 지원하지 않습니다.' })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        const matched = matchSite(lat, lng, sites)
        setGeo({ kind: 'ready', lat, lng, matched })
      },
      (err) => {
        setGeo({
          kind: 'error',
          message: `위치를 가져오지 못했습니다 (${err.message}). 브라우저 위치 권한을 확인하세요.`,
        })
      },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  const verb = mode === 'in' ? '출근' : '퇴근'

  if (geo.kind === 'idle') {
    return (
      <button
        type="button"
        onClick={acquire}
        className={mainButtonClass(mode)}
      >
        {verb}하기
      </button>
    )
  }

  if (geo.kind === 'loading') {
    return (
      <button type="button" disabled className={mainButtonClass(mode, true)}>
        위치 확인 중…
      </button>
    )
  }

  if (geo.kind === 'error') {
    return (
      <div className="space-y-2">
        <button type="button" disabled className={mainButtonClass(mode, true)}>
          {verb} 불가
        </button>
        <p className="text-sm text-red-600">{geo.message}</p>
        <button
          type="button"
          onClick={acquire}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          다시 시도
        </button>
      </div>
    )
  }

  // geo.kind === 'ready' — 좌표 확보됨. 매칭 결과 노출 + 확정 버튼.
  return (
    <form
      action={(fd) => {
        fd.set('lat', String(geo.lat))
        fd.set('lng', String(geo.lng))
        if (geo.matched) {
          fd.set('site_id', geo.matched.site.id)
          fd.set('outside_reason', '')
        } else {
          fd.set('site_id', '')
          // outside_reason 은 폼의 input 으로부터 자동
        }
        startSubmit(() => action(fd))
      }}
      className="space-y-3"
    >
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm">
        <p className="text-slate-700">
          위치: <span className="font-mono text-xs">{geo.lat.toFixed(5)}, {geo.lng.toFixed(5)}</span>
        </p>
        {geo.matched ? (
          <p className="mt-1 text-emerald-700">
            ✓ <span className="font-medium">{geo.matched.site.name}</span> 반경 안 ({Math.round(geo.matched.distanceM)}m)
          </p>
        ) : (
          <p className="mt-1 text-amber-700">
            ⚠ 반경 안의 활성 현장이 없습니다. 사유를 입력하세요.
          </p>
        )}
      </div>

      {!geo.matched && (
        <input
          name="outside_reason"
          required
          maxLength={200}
          placeholder="예: 외근 이동 중 / 자재 수령 / 사무실 행정"
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
        />
      )}

      <button
        type="submit"
        disabled={submitting}
        className={mainButtonClass(mode, submitting)}
      >
        {submitting ? '기록 중…' : `${verb} 확정`}
      </button>
      <button
        type="button"
        onClick={() => setGeo({ kind: 'idle' })}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        취소
      </button>
    </form>
  )
}

function mainButtonClass(mode: 'in' | 'out', muted = false) {
  const base = 'w-full rounded-2xl px-4 py-6 text-2xl font-bold text-white shadow-sm'
  if (muted) return `${base} bg-slate-400`
  return mode === 'in'
    ? `${base} bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800`
    : `${base} bg-slate-900 hover:bg-slate-800 active:bg-slate-700`
}
