'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { MapPin, MapPinOff, Loader2 } from 'lucide-react'
import { upsertWorkerPosition } from './worker-position-actions'

// 청약 프로젝트 — 본인 활성 작업 중일 때 GPS 위치를 주기적으로 서버에 push.
//   - 활성 조건: 이 프로젝트와 연동된 작업의 work_daily_checks 가 오늘 미마감(closed_at IS NULL)
//   - 활성 조건은 서버 action 이 다시 검증 (클라 추측 무시)
//   - 30초마다 watchPosition 의 최신 좌표를 push
//   - 사용자가 「위치 공유 시작」 버튼 누른 뒤에만 권한 요청
//   - 컴포넌트 정리 시 watch 해제 + 마지막 위치는 그대로 유지 (DB)

const PUSH_INTERVAL_MS = 30_000 // 30초마다 1회 push

export default function WorkerPositionTracker({
  projectId,
  initiallyActive,
}: {
  projectId: string
  /** 서버 측에서 본인이 활성 작업 중인지 사전 판정 — false 면 토글 자체 안 보임 */
  initiallyActive: boolean
}) {
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [lastPushAt, setLastPushAt] = useState<string | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const lastCoordsRef = useRef<{ lat: number; lng: number; acc?: number } | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // toggle off → watch + interval 모두 정리
  useEffect(() => {
    if (!enabled) {
      if (watchIdRef.current != null && typeof navigator !== 'undefined') {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.error('이 기기는 위치 정보를 지원하지 않습니다')
      setEnabled(false)
      return
    }
    setBusy(true)
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setBusy(false)
        lastCoordsRef.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          acc: pos.coords.accuracy,
        }
      },
      (err) => {
        setBusy(false)
        const msg =
          err.code === err.PERMISSION_DENIED
            ? '위치 권한이 거부되었습니다 — 브라우저 설정에서 허용해주세요'
            : err.code === err.POSITION_UNAVAILABLE
              ? '위치 정보를 얻을 수 없습니다'
              : '위치 정보 시간 초과'
        toast.error(msg)
        setEnabled(false)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 30_000,
      },
    )
    watchIdRef.current = id

    // 30초 주기로 최신 좌표 push (좌표가 있으면)
    intervalRef.current = setInterval(() => {
      const c = lastCoordsRef.current
      if (!c) return
      void upsertWorkerPosition({
        projectId,
        lat: c.lat,
        lng: c.lng,
        accuracy: c.acc ?? null,
      }).then((r) => {
        if (r.ok) {
          setLastPushAt(r.recordedAt)
        } else if (r.reason === 'not_active') {
          // 작업 종료 처리되었으면 자동 중단
          toast.info('작업 종료 — 위치 공유를 멈춥니다')
          setEnabled(false)
        }
        // db 오류는 조용히 (다음 주기 재시도)
      })
    }, PUSH_INTERVAL_MS)

    // 즉시 1회 push
    setTimeout(() => {
      const c = lastCoordsRef.current
      if (!c) return
      void upsertWorkerPosition({
        projectId,
        lat: c.lat,
        lng: c.lng,
        accuracy: c.acc ?? null,
      }).then((r) => {
        if (r.ok) setLastPushAt(r.recordedAt)
      })
    }, 3_000)

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [enabled, projectId])

  if (!initiallyActive) return null

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setEnabled((v) => !v)}
        className={
          'inline-flex items-center gap-1 rounded-md px-2 h-7 text-[11px] font-medium border ' +
          (enabled
            ? 'bg-emerald-600 text-white border-emerald-600'
            : 'border-slate-300 text-slate-700 hover:bg-slate-50')
        }
        title={
          enabled ? '위치 공유 중 — 30초 간격 자동 갱신' : '작업 중 본인 위치를 지도에 표시'
        }
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : enabled ? (
          <MapPin className="h-3 w-3" />
        ) : (
          <MapPinOff className="h-3 w-3" />
        )}
        {enabled ? '위치 공유 중' : '내 위치 공유'}
      </button>
      {lastPushAt && enabled && (
        <span className="text-[10px] text-slate-500 tabular-nums">
          {new Date(lastPushAt).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      )}
    </div>
  )
}
