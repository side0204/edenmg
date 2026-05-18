import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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
  if (!me || (me.permission !== 'admin' && me.permission !== 'ceo')) {
    notFound()
  }

  const { data, error: listError } = await supabase
    .from('employees')
    .select('id, name, email, phone, permission, position, team, work_type, is_active, invited_at, accepted_at, created_at')
    .order('created_at', { ascending: false })

  const rows = (data ?? []) as EmployeeRow[]

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-center justify-between gap-3">
          <div>
            <Link href="/" className="text-xs text-slate-500 hover:text-slate-900">
              ← 홈
            </Link>
            <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">직원 관리</h1>
          </div>
          <Link
            href="/admin/employees/invite"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            + 초대
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
              </li>
            )
          })}

          {rows.length === 0 && !listError && (
            <li className="rounded-xl bg-white border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              아직 등록된 직원이 없습니다.
            </li>
          )}
        </ul>
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
