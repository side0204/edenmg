import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, UserMinus, RotateCcw } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { EmptyState } from '@/components/EmptyState'
import { unresignEmployee, updateResignedAt } from '../actions'
import { PERMISSION_LABEL, type Permission } from '../fields'

type ResignedRow = {
  id: string
  name: string
  email: string
  phone: string | null
  permission: Permission
  position: string | null
  team: string | null
  work_type: string | null
  workplace_type: string | null
  resigned_at: string
  hire_date: string | null
  created_at: string
}

export default async function ResignedEmployeesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, permission')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const me = meRow as { id: string; permission: Permission } | null
  if (!me || me.permission !== 'admin') {
    notFound()
  }

  const { data, error: listError } = await supabase
    .from('employees')
    .select(
      'id, name, email, phone, permission, position, team, work_type, workplace_type, resigned_at, hire_date, created_at',
    )
    .not('resigned_at', 'is', null)
    .order('resigned_at', { ascending: false })

  const rows = (data ?? []) as ResignedRow[]

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <header>
          <Link
            href="/admin/employees"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            직원 관리
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">퇴사자</h1>
          <p className="mt-1 text-sm text-slate-500">
            로그인이 차단된 상태이며 모든 이력은 보존됩니다. 재입사 시 같은 계정을 그대로 사용합니다.
          </p>
        </header>

        {listError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
            목록을 불러오지 못했습니다: {listError.message}
          </p>
        )}

        {rows.length === 0 && !listError ? (
          <EmptyState
            icon={UserMinus}
            title="퇴사자 없음"
            description="아직 퇴사 처리된 직원이 없습니다."
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((emp) => (
              <li
                key={emp.id}
                className="rounded-xl bg-white border border-slate-200 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">
                      {emp.name}
                      <span className="ml-2 rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        {PERMISSION_LABEL[emp.permission]}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 truncate">{emp.email}</p>
                    <p className="text-xs text-slate-400">
                      {[emp.position, emp.team, emp.work_type, emp.workplace_type]
                        .filter(Boolean)
                        .join(' · ') || '-'}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                    퇴사 {emp.resigned_at}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500">
                  <div>
                    <span className="font-medium text-slate-700">입사일</span>
                    <span className="ml-1">{emp.hire_date ?? '-'}</span>
                  </div>
                  <div>
                    <span className="font-medium text-slate-700">가입일</span>
                    <span className="ml-1">
                      {new Date(emp.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}
                    </span>
                  </div>
                </div>

                <form
                  action={updateResignedAt}
                  className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"
                >
                  <input type="hidden" name="id" value={emp.id} />
                  <span className="text-xs font-medium text-slate-700 shrink-0">퇴사일 수정</span>
                  <input
                    type="date"
                    name="resigned_at"
                    defaultValue={emp.resigned_at}
                    className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
                  />
                  <button
                    type="submit"
                    className="shrink-0 rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800"
                  >
                    저장
                  </button>
                </form>

                <form action={unresignEmployee}>
                  <input type="hidden" name="id" value={emp.id} />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    재입사 처리
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
