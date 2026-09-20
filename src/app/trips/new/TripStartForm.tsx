'use client'

import { useState } from 'react'
import { Check, MapPin } from 'lucide-react'
import { OTHER_TRANSPORT_OPTIONS, TRANSPORT_VALUES, type TransportKind } from '@/lib/trips'
import { startTrip } from '../actions'
import { CompanionPicker, type CompanionCandidate } from './CompanionPicker'

export type VehicleOption = {
  id: string
  label: string
  inUseBy: string | null
  lastEndKm: number | null
  lastLocation: string | null
}

const INPUT =
  'w-full rounded-xl bg-slate-50 px-3.5 py-3 text-base text-slate-900 shadow-[inset_0_0_0_1px_#e2e8f0] placeholder:text-slate-400 focus:outline-none focus:shadow-[inset_0_0_0_1.5px_#0f172a] dark:bg-slate-800 dark:text-slate-100'
const LABEL = 'block text-[13px] font-semibold tracking-tight text-slate-700 dark:text-slate-300'
const HINT = 'ml-1.5 font-medium text-slate-500'

function nowHm(): string {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date())
    .replace(/^24/, '00')
}

export function TripStartForm({
  vehicles,
  candidates,
  recentPlaces,
  myPlate,
  defaultVehicleId,
}: {
  vehicles: VehicleOption[]
  candidates: CompanionCandidate[]
  recentPlaces: string[]
  myPlate: string | null
  defaultVehicleId: string | null
}) {
  const firstFree = vehicles.find((v) => !v.inUseBy)?.id ?? ''
  const [transport, setTransport] = useState<TransportKind>('업무용')
  const [vehicleId, setVehicleId] = useState<string>(defaultVehicleId ?? firstFree)
  const [place, setPlace] = useState('')
  const [departed, setDeparted] = useState<string>(() => nowHm())

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId) ?? null

  return (
    <form
      action={startTrip}
      className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-900/5 dark:bg-slate-900 dark:ring-slate-800"
    >
      <label className="block space-y-1.5">
        <span className={LABEL}>
          업무목적 <span className="text-rose-600">*</span>
        </span>
        <input name="purpose" required maxLength={100} placeholder="예: 함체 신설 자재 반입" className={INPUT} />
      </label>

      <div className="space-y-1.5">
        <label className="block space-y-1.5">
          <span className={LABEL}>
            외근장소 <span className="text-rose-600">*</span>
          </span>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              name="place"
              required
              maxLength={200}
              value={place}
              onChange={(e) => setPlace(e.currentTarget.value)}
              placeholder="예: 시흥 정왕동 함체 신설 현장"
              className={INPUT + ' pl-10'}
            />
          </div>
        </label>
        {recentPlaces.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400">최근</span>
            {recentPlaces.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlace(p)}
                className="rounded-full bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 shadow-[0_0_0_1px_rgba(15,23,42,0.1)] hover:bg-slate-50"
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <span className={LABEL}>
            출발시간 <span className="text-rose-600">*</span>
          </span>
          <input
            name="departed_time"
            type="time"
            required
            value={departed}
            onChange={(e) => setDeparted(e.currentTarget.value)}
            className={INPUT}
          />
        </label>
        <label className="block space-y-1.5">
          <span className={LABEL}>
            도착 예정<span className={HINT}>선택</span>
          </span>
          <input name="expected_time" type="time" className={INPUT} />
        </label>
      </div>

      <div className="space-y-1.5">
        <span className={LABEL}>
          이동수단 <span className="text-rose-600">*</span>
        </span>
        <input type="hidden" name="transport" value={transport} />
        <div className="flex gap-1 rounded-xl bg-slate-100 p-[3px] dark:bg-slate-800">
          {TRANSPORT_VALUES.map((t) => {
            const on = t === transport
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTransport(t)}
                className={
                  'flex-1 rounded-[9px] px-2 py-2.5 text-[13px] font-semibold transition-colors ' +
                  (on ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5' : 'text-slate-500 hover:text-slate-700')
                }
              >
                {t === '업무용' ? '업무용 차량' : t}
              </button>
            )
          })}
        </div>
      </div>

      {transport === '업무용' && (
        <div className="space-y-1.5">
          <span className={LABEL}>
            차량 선택 <span className="text-rose-600">*</span>
          </span>
          <input type="hidden" name="vehicle_id" value={vehicleId} />
          {vehicles.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-4 text-center text-sm text-slate-500">
              등록된 업무용 차량이 없습니다. 자차 또는 기타를 선택하세요.
            </p>
          ) : (
            <div className="space-y-2">
              {vehicles.map((v) => {
                const on = v.id === vehicleId
                const disabled = !!v.inUseBy
                return (
                  <div
                    key={v.id}
                    role="radio"
                    aria-checked={on}
                    aria-disabled={disabled}
                    tabIndex={disabled ? -1 : 0}
                    onClick={() => !disabled && setVehicleId(v.id)}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
                        e.preventDefault()
                        setVehicleId(v.id)
                      }
                    }}
                    className={
                      'flex select-none items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800 ' +
                      (on ? 'shadow-[0_0_0_1.5px_#0f172a]' : 'shadow-[0_0_0_1px_#e2e8f0]') +
                      (disabled ? ' opacity-45' : ' cursor-pointer')
                    }
                  >
                    <div
                      className={
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full ' +
                        (on ? 'bg-slate-900 text-white' : 'bg-white shadow-[inset_0_0_0_1.5px_#cbd5e1]')
                      }
                    >
                      {on && <Check className="h-3 w-3" strokeWidth={3} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{v.label}</p>
                      <p className="text-xs text-slate-500">
                        {v.inUseBy
                          ? `사용 중 — ${v.inUseBy}`
                          : `대기${v.lastLocation ? ` · 최종 반납 ${v.lastLocation}` : ''}${v.lastEndKm !== null ? ` (${v.lastEndKm.toLocaleString()} km)` : ''}`}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {transport === '자차' && (
        <label className="block space-y-1.5">
          <span className={LABEL}>
            자차 차량번호 <span className="text-rose-600">*</span>
          </span>
          <input name="personal_plate" defaultValue={myPlate ?? ''} maxLength={20} placeholder="예: 88다1234" className={INPUT} />
          <p className="text-xs text-slate-500">
            {myPlate ? '프로필의 차량번호가 자동으로 들어갔습니다.' : '프로필에 차량번호가 없어 직접 입력합니다. 설정에서 저장해 두면 다음부터 자동 입력됩니다.'}
          </p>
        </label>
      )}

      {transport === '기타' && (
        <label className="block space-y-1.5">
          <span className={LABEL}>이동 방법</span>
          <select name="other_note" className={INPUT}>
            {OTHER_TRANSPORT_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      )}

      {transport !== '기타' && (
        <label className="block space-y-1.5">
          <span className={LABEL}>
            출발 km<span className={HINT}>선택</span>
          </span>
          <input
            name="start_odometer_km"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            placeholder={
              transport === '업무용' && selectedVehicle?.lastEndKm !== null && selectedVehicle?.lastEndKm !== undefined
                ? `${selectedVehicle.lastEndKm.toLocaleString()} (이전 반납 km)`
                : '계기판 누적 km'
            }
            className={INPUT}
          />
        </label>
      )}

      <div className="space-y-1.5">
        <span className={LABEL}>동행인</span>
        <CompanionPicker candidates={candidates} />
      </div>

      <button
        type="submit"
        className="w-full rounded-[14px] bg-slate-900 px-4 py-[15px] text-base font-bold text-white hover:bg-slate-800 active:bg-slate-700"
      >
        출발하기
      </button>
    </form>
  )
}
