import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, UserPlus, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { EmptyState } from '@/components/EmptyState'
import {
  toggleCanDeleteWorks,
  toggleCanManageWorks,
  toggleCanViewStats,
} from './actions'
import { FieldSelect } from './FieldSelect'
import {
  PERMISSION_LABEL,
  PERMISSION_VALUES,
  POSITION_VALUES,
  TEAM_VALUES,
  WORK_TYPE_VALUES,
  type Permission,
} from './fields'

type EmployeeRow = {
  id: string
  name: string
  email: string
  phone: string | null
  permission: Permission
  position: string | null
  team: string | null
  work_type: string | null
  can_manage_works: boolean
  can_delete_works: boolean
  can_view_stats: boolean
  is_active: boolean
  invited_at: string | null
  accepted_at: string | null
  created_at: string
}

export default async function EmployeesPage() {
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
  if (!me || (me.permission !== 'admin')) {
    notFound()
  }

  const { data, error: listError } = await supabase
    .from('employees')
    .select('id, name, email, phone, permission, position, team, work_type, can_manage_works, can_delete_works, can_view_stats, is_active, invited_at, accepted_at, created_at')
    .order('created_at', { ascending: false })

  const rows = (data ?? []) as EmployeeRow[]

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-center justify-between gap-3">
          <div>
            <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
              <ChevronLeft className="h-4 w-4" />
              홈
            </Link>
            <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">직원 관리</h1>
          </div>
          <Link
            href="/admin/employees/invite"
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <UserPlus className="h-4 w-4" />
            초대
          </Link>
        </header>

        {listError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
            목록을 불러오지 못했습니다: {listError.message}
          </p>
        )}

        <ul className="space-y-3">
          {rows.map((emp) => {
            const status =
              emp.is_active && emp.accepted_at
                ? '활성'
                : emp.accepted_at
                  ? '비활성'
                  : '초대 미수락'
            const statusColor =
              status === '활성'
                ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                : status === '비활성'
                  ? 'text-slate-500 bg-slate-100 border-slate-200'
                  : 'text-amber-700 bg-amber-50 border-amber-200'
            const isSelf = emp.id === me.id

            return (
              <li
                key={emp.id}
                className="rounded-xl bg-white border border-slate-200 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">
                      {emp.name}
                      {isSelf && (
                        <span className="ml-2 text-[10px] font-normal text-slate-400">(본인)</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 truncate">{emp.email}</p>
                    {emp.phone && <p className="text-xs text-slate-400">{emp.phone}</p>}
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${statusColor}`}
                  >
                    {status}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <FieldGroup label="권한">
                    {isSelf ? (
                      <ReadonlyValue>{PERMISSION_LABEL[emp.permission]}</ReadonlyValue>
                    ) : (
                      <FieldSelect
                        id={emp.id}
                        field="permission"
                        current={emp.permission}
                        options={PERMISSION_VALUES}
                      />
                    )}
                  </FieldGroup>

                  <FieldGroup label="직급">
                    <FieldSelect
                      id={emp.id}
                      field="position"
                      current={emp.position}
                      options={POSITION_VALUES}
                      allowEmpty
                      placeholder="미지정"
                    />
                  </FieldGroup>

                  <FieldGroup label="팀">
                    <FieldSelect
                      id={emp.id}
                      field="team"
                      current={emp.team}
                      options={TEAM_VALUES}
                      allowEmpty
                      placeholder="미지정"
                    />
                  </FieldGroup>

                  <FieldGroup label="분야">
                    <FieldSelect
                      id={emp.id}
                      field="work_type"
                      current={emp.work_type}
                      options={WORK_TYPE_VALUES}
                      allowEmpty
                      placeholder="미지정"
                    />
                  </FieldGroup>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-700">작업관리 권한</p>
                    <p className="text-[11px] text-slate-500">
                      작업 등록·수정·배정 가능 (admin/ceo 는 자동 부여)
                    </p>
                  </div>
                  <form action={toggleCanManageWorks}>
                    <input type="hidden" name="id" value={emp.id} />
                    <input type="hidden" name="next" value={emp.can_manage_works ? '0' : '1'} />
                    <button
                      type="submit"
                      className={
                        'shrink-0 rounded-full px-3 py-1 text-xs font-bold ' +
                        (emp.can_manage_works
                          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-300')
                      }
                    >
                      {emp.can_manage_works ? '✓ 부여됨' : '미부여'}
                    </button>
                  </form>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-lg bg-rose-50/40 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-rose-700">작업 삭제 권한</p>
                    <p className="text-[11px] text-rose-600/80">
                      배정·일보·작업구간 cascade 삭제. 신중히 부여 (admin/ceo 는 자동)
                    </p>
                  </div>
                  <form action={toggleCanDeleteWorks}>
                    <input type="hidden" name="id" value={emp.id} />
                    <input type="hidden" name="next" value={emp.can_delete_works ? '0' : '1'} />
                    <button
                      type="submit"
                      className={
                        'shrink-0 rounded-full px-3 py-1 text-xs font-bold ' +
                        (emp.can_delete_works
                          ? 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-300')
                      }
                    >
                      {emp.can_delete_works ? '✓ 부여됨' : '미부여'}
                    </button>
                  </form>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-lg bg-blue-50/40 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-blue-700">통계 조회 권한</p>
                    <p className="text-[11px] text-blue-600/80">
                      회사 전체 통계 조회. 미부여 시 본인 작성 일보 기반 통계만 노출 (admin/ceo
                      는 자동)
                    </p>
                  </div>
                  <form action={toggleCanViewStats}>
                    <input type="hidden" name="id" value={emp.id} />
                    <input type="hidden" name="next" value={emp.can_view_stats ? '0' : '1'} />
                    <button
                      type="submit"
                      className={
                        'shrink-0 rounded-full px-3 py-1 text-xs font-bold ' +
                        (emp.can_view_stats
                          ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-300')
                      }
                    >
                      {emp.can_view_stats ? '✓ 부여됨' : '미부여'}
                    </button>
                  </form>
                </div>
              </li>
            )
          })}

        </ul>
        {rows.length === 0 && !listError && (
          <EmptyState
            icon={Users}
            title="등록된 직원 없음"
            description="직원을 초대하면 이메일 링크로 가입됩니다."
            cta={
              <Link
                href="/admin/employees/invite"
                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                <UserPlus className="h-4 w-4" />
                직원 초대
              </Link>
            }
          />
        )}
      </div>
    </main>
  )
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">
        {label}
      </span>
      {children}
    </label>
  )
}

function ReadonlyValue({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-500">
      {children}
    </span>
  )
}
