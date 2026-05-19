'use client'

import { useState } from 'react'
import {
  VEHICLE_PLATE_OPTIONAL_WORK_TYPES,
  VEHICLE_PLATE_REQUIRED_WORK_TYPES,
  WORK_TYPE_VALUES,
} from '@/app/admin/employees/fields'
import { signupRequest } from './actions'

export default function SignupForm() {
  const [workType, setWorkType] = useState('')
  const plateMode = VEHICLE_PLATE_REQUIRED_WORK_TYPES.has(workType)
    ? 'required'
    : VEHICLE_PLATE_OPTIONAL_WORK_TYPES.has(workType)
      ? 'optional'
      : 'hidden'

  return (
    <form
      action={signupRequest}
      className="space-y-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200"
    >
      <Field label="이름 *">
        <input
          name="name"
          required
          maxLength={50}
          autoComplete="name"
          className={inputClass}
        />
      </Field>

      <Field label="이메일 *">
        <input
          name="email"
          type="email"
          required
          maxLength={150}
          autoComplete="email"
          className={inputClass}
        />
      </Field>

      <Field label="비밀번호 *">
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="8자 이상"
          className={inputClass}
        />
      </Field>

      <Field label="전화번호">
        <input
          name="phone"
          type="tel"
          maxLength={30}
          autoComplete="tel"
          placeholder="010-1234-5678"
          className={inputClass}
        />
      </Field>

      <Field label="직무 *">
        <select
          name="work_type"
          required
          value={workType}
          onChange={(e) => setWorkType(e.currentTarget.value)}
          className={inputClass}
        >
          <option value="">직무 선택</option>
          {WORK_TYPE_VALUES.map((wt) => (
            <option key={wt} value={wt}>
              {wt}
            </option>
          ))}
        </select>
      </Field>

      {plateMode !== 'hidden' && (
        <Field
          label={plateMode === 'required' ? '운행 차량번호 *' : '운행 차량번호 (선택)'}
        >
          <input
            name="vehicle_plate"
            required={plateMode === 'required'}
            maxLength={30}
            placeholder="예: 12가 3456"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate-500">
            {plateMode === 'required'
              ? '접속팀은 운행 차량 정보를 반드시 입력하세요.'
              : '외선팀은 운행 차량이 있을 때만 입력하세요.'}
          </p>
        </Field>
      )}

      <button
        type="submit"
        className="w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-bold text-white hover:bg-slate-800"
      >
        가입 신청
      </button>
      <p className="text-center text-xs text-slate-500">
        신청 후 관리자 승인이 완료되어야 로그인할 수 있습니다.
      </p>
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
