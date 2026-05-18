import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { inviteEmployee } from './actions'
import {
  PERMISSION_LABEL,
  PERMISSION_VALUES,
  POSITION_VALUES,
  TEAM_VALUES,
  WORK_TYPE_VALUES,
  type Permission,
} from '../fields'

export default async function InviteEmployeePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: meRow } = await supabase
    .from('employees')
    .select('permission')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { permission: Permission } | null
  if (!me || (me.permission !== 'admin' && me.permission !== 'ceo')) {
    notFound()
  }

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-5">
        <header>
          <Link href="/admin/employees" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
            <ChevronLeft className="h-4 w-4" />
            직원 목록
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">직원 초대</h1>
          <p className="mt-1 text-sm text-slate-500">
            이메일로 초대 링크를 보냅니다. 사용자가 링크를 클릭해 비밀번호를 설정하면 가입이 완료됩니다.
          </p>
        </header>

        <form
          action={inviteEmployee}
          className="space-y-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200"
        >
          <label className="block">
            <span className="block text-sm font-medium text-slate-700">이름 *</span>
            <input
              name="name"
              required
              maxLength={40}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-slate-700">이메일 *</span>
            <input
              name="email"
              type="email"
              required
              inputMode="email"
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-slate-700">휴대폰</span>
            <input
              name="phone"
              type="tel"
              inputMode="tel"
              placeholder="010-0000-0000"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-slate-700">권한 *</span>
            <select
              name="permission"
              defaultValue="worker"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            >
              {PERMISSION_VALUES.map((v) => (
                <option key={v} value={v}>
                  {PERMISSION_LABEL[v]}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="block text-sm font-medium text-slate-700">직급</span>
              <select
                name="position"
                defaultValue=""
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2.5 text-sm bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                <option value="">미지정</option>
                {POSITION_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-sm font-medium text-slate-700">팀</span>
              <select
                name="team"
                defaultValue=""
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2.5 text-sm bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                <option value="">미지정</option>
                {TEAM_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-sm font-medium text-slate-700">분야</span>
              <select
                name="work_type"
                defaultValue=""
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2.5 text-sm bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                <option value="">미지정</option>
                {WORK_TYPE_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>


          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-base font-medium text-white hover:bg-slate-800 active:bg-slate-700"
          >
            초대 메일 보내기
          </button>
        </form>
      </div>
    </main>
  )
}
