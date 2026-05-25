import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, UserCheck, UserMinus, Users, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { EmptyState } from '@/components/EmptyState'
import {
  approveSignup,
  rejectSignup,
  resignEmployee,
  toggleCanDeleteWorks,
  toggleCanManageWorks,
  toggleCanViewStats,
  updateVehiclePlate,
} from './actions'
import WorkplaceToggle from './WorkplaceToggle'
import { toggleCanManageStock } from '../../stock/actions'
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
  vehicle_plate: string | null
  workplace_type: '본사' | '현장' | string
  can_manage_works: boolean
  can_delete_works: boolean
  can_view_stats: boolean
  can_manage_stock: boolean
  is_active: boolean
  invited_at: string | null
  accepted_at: string | null
  resigned_at: string | null
  created_at: string
}

// Asia/Seoul 기준 오늘 (YYYY-MM-DD) — date input default.
function todayInSeoul(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
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

  // 활성 직원 + 퇴사자 카운트 병렬 — 둘 다 me.permission 검증 후 독립 쿼리
  const [listRes, resignedCountRes] = await Promise.all([
    supabase
      .from('employees')
      .select(
        'id, name, email, phone, permission, position, team, work_type, vehicle_plate, workplace_type, can_manage_works, can_delete_works, can_view_stats, can_manage_stock, is_active, invited_at, accepted_at, resigned_at, created_at',
      )
      .is('resigned_at', null) // 퇴사자는 /admin/employees/resigned 별도 페이지
      .order('created_at', { ascending: false }),
    supabase
      .from('employees')
      .select('id', { count: 'exact', head: true })
      .not('resigned_at', 'is', null),
  ])
  const { data, error: listError } = listRes
  const resignedCount = resignedCountRes.count

  const all = (data ?? []) as EmployeeRow[]
  // 가입 대기 = accepted_at IS NULL AND auth_user_id 있음 (트리거가 만든 신규 row)
  //   accepted_at NULL + is_active=false 가 표식
  const pending = all.filter((e) => !e.is_active && !e.accepted_at)
  const rows = all.filter((e) => e.is_active || e.accepted_at)

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <header>
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
            <ChevronLeft className="h-4 w-4" />
            홈
          </Link>
          <div className="mt-1 space-y-3 sm:space-y-0 sm:flex sm:items-start sm:justify-between sm:gap-3">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">직원 관리</h1>
              <p className="mt-1 text-sm text-slate-500">
                회원가입 → 관리자 승인 흐름. 가입 신청자가 권한을 받으면 활성화됩니다.
              </p>
            </div>
            <Link
              href="/admin/employees/resigned"
              className="sm:shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <UserMinus className="h-4 w-4" />
              퇴사자
              {resignedCount ? (
                <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                  {resignedCount}
                </span>
              ) : null}
            </Link>
          </div>
        </header>

        {listError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
            목록을 불러오지 못했습니다: {listError.message}
          </p>
        )}

        {/* 가입 대기 섹션 */}
        {pending.length > 0 && (
          <section className="rounded-2xl border border-amber-300 bg-amber-50/60 p-4 space-y-3">
            <h2 className="flex items-center gap-2 text-base font-semibold text-amber-800 tracking-tight">
              <UserCheck className="h-5 w-5" />
              가입 승인 대기
              <span className="ml-auto rounded-full bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-900">
                {pending.length}
              </span>
            </h2>
            <ul className="space-y-3">
              {pending.map((emp) => (
                <li key={emp.id} className="rounded-xl bg-white border border-amber-200 p-3 space-y-3">
                  <div>
                    <p className="font-medium text-slate-900">
                      {emp.name}
                      {emp.work_type && (
                        <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
                          {emp.work_type}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {emp.email}
                      {emp.phone && ` · ${emp.phone}`}
                      {emp.vehicle_plate && ` · 차량 ${emp.vehicle_plate}`}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      신청일시: {emp.invited_at ? new Date(emp.invited_at).toLocaleString('ko-KR') : '-'}
                    </p>
                  </div>

                  <form action={approveSignup} className="space-y-2 border-t border-slate-100 pt-3">
                    <input type="hidden" name="id" value={emp.id} />

                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="block text-xs font-medium text-slate-700">근무지</span>
                        <select
                          name="workplace_type"
                          defaultValue="본사"
                          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        >
                          <option value="본사">본사</option>
                          <option value="현장">현장</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="block text-xs font-medium text-slate-700">권한</span>
                        <select
                          name="permission"
                          defaultValue="worker"
                          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        >
                          {PERMISSION_VALUES.map((p) => (
                            <option key={p} value={p}>
                              {PERMISSION_LABEL[p]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 text-xs">
                      <ToggleCheckbox name="can_manage_works" label="작업관리" />
                      <ToggleCheckbox name="can_delete_works" label="작업삭제" />
                      <ToggleCheckbox name="can_view_stats" label="통계조회" />
                      <ToggleCheckbox name="can_manage_stock" label="자재관리" />
                    </div>
                    <p className="text-[10px] text-slate-500">
                      현장 = 사무탭·업무용 차량·결재 카드 숨김 (작업·자재만 사용)
                    </p>

                    <div className="flex gap-2 pt-1">
                      <button
                        type="submit"
                        className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700"
                      >
                        승인하기
                      </button>
                    </div>
                  </form>

                  <form action={rejectSignup}>
                    <input type="hidden" name="id" value={emp.id} />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                    >
                      <X className="h-3 w-3" />
                      거부 (계정 영구 삭제)
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
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
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusColor}`}
                    >
                      {status}
                    </span>
                    {emp.is_active && (
                      <WorkplaceToggle id={emp.id} current={emp.workplace_type ?? '본사'} />
                    )}
                  </div>
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

                  <FieldGroup label="직무">
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

                {/* 차량번호 — 접속팀 필수, 외선팀 선택, 그 외 미표시 */}
                {(emp.work_type === '접속팀' || emp.work_type === '외선팀') && (
                  <form
                    action={updateVehiclePlate}
                    className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"
                  >
                    <input type="hidden" name="id" value={emp.id} />
                    <span className="text-xs font-medium text-slate-700 shrink-0">
                      차량번호
                      {emp.work_type === '접속팀' && (
                        <span className="ml-0.5 text-rose-600">*</span>
                      )}
                    </span>
                    <input
                      name="vehicle_plate"
                      defaultValue={emp.vehicle_plate ?? ''}
                      maxLength={30}
                      placeholder="예: 12가 3456"
                      className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
                    />
                    <button
                      type="submit"
                      className="shrink-0 rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800"
                    >
                      저장
                    </button>
                  </form>
                )}

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

                <div className="flex items-center justify-between gap-3 rounded-lg bg-violet-50/40 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-violet-700">자재 관리 권한</p>
                    <p className="text-[11px] text-violet-600/80">
                      입고·출고·자재 마스터 CUD·CSV import. 관리자는 자동.
                    </p>
                  </div>
                  <form action={toggleCanManageStock}>
                    <input type="hidden" name="id" value={emp.id} />
                    <input
                      type="hidden"
                      name="target"
                      value={emp.can_manage_stock ? 'false' : 'true'}
                    />
                    <button
                      type="submit"
                      className={
                        'shrink-0 rounded-full px-3 py-1 text-xs font-bold ' +
                        (emp.can_manage_stock
                          ? 'bg-violet-100 text-violet-800 hover:bg-violet-200'
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-300')
                      }
                    >
                      {emp.can_manage_stock ? '✓ 부여됨' : '미부여'}
                    </button>
                  </form>
                </div>

                {/* 퇴사 처리 — 본인 제외. 데이터는 보존되며 로그인만 차단됨. */}
                {!isSelf && (
                  <details className="rounded-lg border border-rose-200 bg-rose-50/40">
                    <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-rose-700 flex items-center gap-1.5">
                      <UserMinus className="h-3.5 w-3.5" />
                      퇴사 처리
                    </summary>
                    <form
                      action={resignEmployee}
                      className="px-3 pb-3 pt-1 space-y-2 border-t border-rose-200"
                    >
                      <input type="hidden" name="id" value={emp.id} />
                      <p className="text-[11px] text-rose-700/80">
                        로그인이 차단되고 퇴사자 페이지로 이동합니다. 기존 근태·일보·작업 이력은
                        보존되며 통계에 그대로 표시됩니다. 사용 중 차량·대기 휴가는 따로 정리해
                        주세요.
                      </p>
                      <label className="block">
                        <span className="block text-[11px] font-medium text-rose-700">퇴사일</span>
                        <input
                          type="date"
                          name="resigned_at"
                          defaultValue={todayInSeoul()}
                          className="mt-1 w-full rounded-md border border-rose-300 bg-white px-2 py-1.5 text-sm"
                        />
                      </label>
                      <button
                        type="submit"
                        className="w-full rounded-md bg-rose-600 px-3 py-2 text-sm font-bold text-white hover:bg-rose-700"
                      >
                        퇴사 처리
                      </button>
                    </form>
                  </details>
                )}
              </li>
            )
          })}

        </ul>
        {rows.length === 0 && pending.length === 0 && !listError && (
          <EmptyState
            icon={Users}
            title="등록된 직원 없음"
            description="직원이 가입하면 여기서 권한을 부여해 승인하세요."
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

function ToggleCheckbox({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5">
      <input type="checkbox" name={name} className="rounded" />
      <span>{label}</span>
    </label>
  )
}
