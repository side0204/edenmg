'use client'

import { useRef, useState, useTransition } from 'react'
import type { ReactNode } from 'react'

export type SiteFormValues = {
  id: string | null
  name: string
  address: string | null
  lat: number | null
  lng: number | null
  radius_m: number
  manager_employee_id: string | null
  start_date: string | null  // yyyy-mm-dd
  end_date: string | null
  is_active: boolean
  notes: string | null
}

export type ManagerOption = {
  id: string
  name: string
  permission: string  // 라벨용 ('소장' 등)
}

export function SiteForm({
  defaults,
  managers,
  action,
  submitLabel,
}: {
  defaults: SiteFormValues
  managers: ManagerOption[]
  action: (formData: FormData) => void
  submitLabel: string
}) {
  const latRef = useRef<HTMLInputElement>(null)
  const lngRef = useRef<HTMLInputElement>(null)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [geoLoading, startGeo] = useTransition()

  const fillCurrentLocation = () => {
    setGeoError(null)
    if (!('geolocation' in navigator)) {
      setGeoError('이 브라우저는 위치 정보를 지원하지 않습니다.')
      return
    }
    startGeo(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (latRef.current) latRef.current.value = pos.coords.latitude.toFixed(6)
          if (lngRef.current) lngRef.current.value = pos.coords.longitude.toFixed(6)
        },
        (err) => {
          setGeoError(`위치를 가져오지 못했습니다 (${err.message}). 브라우저 위치 권한을 확인하세요.`)
        },
        { enableHighAccuracy: true, timeout: 10000 },
      )
    })
  }

  return (
    <form
      action={action}
      className="space-y-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200"
    >
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}

      <Field label="현장명 *">
        <input
          name="name"
          required
          maxLength={80}
          defaultValue={defaults.name}
          className={inputClass}
        />
      </Field>

      <Field label="주소">
        <input
          name="address"
          maxLength={200}
          defaultValue={defaults.address ?? ''}
          placeholder="예: 서울 강남구 테헤란로 123"
          className={inputClass}
        />
      </Field>

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-3">
          <Field label="위도 (lat)">
            <input
              ref={latRef}
              name="lat"
              type="number"
              step="any"
              defaultValue={defaults.lat ?? ''}
              placeholder="37.5665"
              inputMode="decimal"
              className={inputClass}
            />
          </Field>
          <Field label="경도 (lng)">
            <input
              ref={lngRef}
              name="lng"
              type="number"
              step="any"
              defaultValue={defaults.lng ?? ''}
              placeholder="126.9780"
              inputMode="decimal"
              className={inputClass}
            />
          </Field>
        </div>
        <button
          type="button"
          onClick={fillCurrentLocation}
          disabled={geoLoading}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {geoLoading ? '위치 가져오는 중…' : '📍 현재 위치로 채우기'}
        </button>
        {geoError && <p className="text-xs text-red-600">{geoError}</p>}
        <p className="text-xs text-slate-400">
          좌표가 비어 있으면 출퇴근 위치 매칭이 불가합니다. 사무실/원격 작업처럼 GPS 매칭이 필요 없으면 비워두세요.
        </p>
      </div>

      <Field label="반경 (m)">
        <input
          name="radius_m"
          type="number"
          min={50}
          max={5000}
          step={50}
          required
          defaultValue={defaults.radius_m}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-slate-400">
          출근 좌표가 이 반경 안이면 자동 매칭. 벗어나면 사유 입력 필수. 기본 500m.
        </p>
      </Field>

      <Field label="현장소장">
        <select
          name="manager_employee_id"
          defaultValue={defaults.manager_employee_id ?? ''}
          className={inputClass}
        >
          <option value="">미지정</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.permission})
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-400">
          소장/관리자/대표 권한 직원만 후보. 직원의 휴가 신청 시 1차 결재자 선택지로도 보입니다.
        </p>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="시작일">
          <input
            name="start_date"
            type="date"
            defaultValue={defaults.start_date ?? ''}
            className={inputClass}
          />
        </Field>
        <Field label="종료일">
          <input
            name="end_date"
            type="date"
            defaultValue={defaults.end_date ?? ''}
            className={inputClass}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={defaults.is_active}
          className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
        />
        <span className="text-sm text-slate-700">활성 (비활성 시 출퇴근·신청에서 안 보임)</span>
      </label>

      <Field label="비고">
        <textarea
          name="notes"
          rows={3}
          maxLength={500}
          defaultValue={defaults.notes ?? ''}
          className={`${inputClass} resize-none`}
        />
      </Field>

      <button
        type="submit"
        className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-base font-medium text-white hover:bg-slate-800 active:bg-slate-700"
      >
        {submitLabel}
      </button>
    </form>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900'
