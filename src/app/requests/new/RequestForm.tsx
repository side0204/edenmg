'use client'

import { useState } from 'react'
import {
  ATTACHMENT_ALLOWED_TYPES,
  LEAVE_TYPE_LABEL,
  LEAVE_TYPE_META,
  LEAVE_TYPE_VALUES,
  type LeaveType,
} from '@/lib/leave'
import { submitRequest } from '../actions'

export type ForemanOption = { id: string; name: string; permission_label: string }

export function RequestForm({ foremen, defaultDate }: { foremen: ForemanOption[]; defaultDate: string }) {
  const [type, setType] = useState<LeaveType>('연차')
  const [startDate, setStartDate] = useState(defaultDate)
  const [endDate, setEndDate] = useState(defaultDate)
  const meta = LEAVE_TYPE_META[type]

  // 단일일 종류로 바꾸면 종료일도 시작일에 맞춰서 lock.
  const handleType = (next: LeaveType) => {
    setType(next)
    if (!LEAVE_TYPE_META[next].multiDay) {
      setEndDate(startDate)
    }
  }

  const handleStartDate = (next: string) => {
    setStartDate(next)
    if (!meta.multiDay) setEndDate(next)
    else if (endDate < next) setEndDate(next)
  }

  return (
    <form
      action={submitRequest}
      className="space-y-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200"
    >
      <Field label="신청 종류 *">
        <select
          name="type"
          value={type}
          onChange={(e) => handleType(e.currentTarget.value as LeaveType)}
          className={inputClass}
        >
          {LEAVE_TYPE_VALUES.map((v) => (
            <option key={v} value={v}>
              {LEAVE_TYPE_LABEL[v]}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="시작일 *">
          <input
            name="start_date"
            type="date"
            required
            value={startDate}
            onChange={(e) => handleStartDate(e.currentTarget.value)}
            className={inputClass}
          />
        </Field>
        <Field label="종료일 *">
          <input
            name="end_date"
            type="date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.currentTarget.value)}
            disabled={!meta.multiDay}
            className={`${inputClass} disabled:bg-slate-100 disabled:text-slate-400`}
          />
        </Field>
      </div>

      {meta.needsTime && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="시작 시간 *">
            <input name="start_time" type="time" required className={inputClass} />
          </Field>
          <Field label="종료 시간 *">
            <input name="end_time" type="time" required className={inputClass} />
          </Field>
        </div>
      )}

      <Field label="사유 *">
        <textarea
          name="reason"
          rows={3}
          required
          maxLength={500}
          placeholder="예: 가족 행사 / 정기검진 / 자재 인수 외근"
          className={`${inputClass} resize-none`}
        />
      </Field>

      <Field label="1차 결재자 (현장소장)">
        <select name="assigned_foreman_id" defaultValue="" className={inputClass}>
          <option value="">바로 관리자/대표 결재</option>
          {foremen.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} ({f.permission_label})
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-400">
          미지정 시 관리자/대표 단계로 바로 올라갑니다. 평소 1차 결재 받는 소장이 있으면 선택하세요.
        </p>
      </Field>

      {ATTACHMENT_ALLOWED_TYPES.includes(type) && (
        <Field label="증빙 첨부 (선택)">
          <input
            name="attachment"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
            className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-50"
          />
          <p className="mt-1 text-xs text-slate-400">
            진단서·소견서 등을 첨부하면 결재가 빨라집니다. 이미지·PDF, 10MB 이하.
          </p>
        </Field>
      )}

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="is_urgent"
          className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
        />
        <span className="text-sm text-slate-700">긴급</span>
      </label>

      <button
        type="submit"
        className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-base font-medium text-white hover:bg-slate-800 active:bg-slate-700"
      >
        신청 제출
      </button>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900'
