import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, Lock, UserCog } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { updateMyProfile } from './actions'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

const PERMISSION_LABEL: Record<Permission, string> = {
  worker: '작업자',
  team_member: '팀원',
  team_leader: '팀장',
  admin: '관리자',
}

export default async function MyProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select(
      'name, email, phone, hire_date, vehicle_plate, permission, position, team, work_type, workplace_type, is_active, accepted_at, companies(name)',
    )
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const me = meRow as
    | {
        name: string
        email: string
        phone: string | null
        hire_date: string | null
        vehicle_plate: string | null
        permission: Permission
        position: string | null
        team: string | null
        work_type: string | null
        workplace_type: '본사' | '현장' | string | null
        is_active: boolean
        accepted_at: string | null
        companies: { name: string } | null
      }
    | null

  if (!me) {
    redirect('/?err=' + encodeURIComponent('직원 정보 없음'))
  }

  const showVehiclePlate = me!.work_type === '접속팀' || me!.work_type === '외선팀'
  const vehicleRequired = me!.work_type === '접속팀'

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-5">
        <header>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            설정
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">내 프로필</h1>
          <p className="mt-1 text-sm text-slate-500">
            본인 정보를 직접 수정할 수 있습니다.
          </p>
        </header>

        {/* 회사·권한 정보 (read-only) */}
        <section className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-2 text-sm">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <Lock className="h-3 w-3" />
            관리자 관리 정보 (변경하려면 관리자에게 요청)
          </h2>
          <div className="grid grid-cols-2 gap-y-1.5 gap-x-3">
            <ReadOnlyRow label="회사" value={me!.companies?.name ?? '미지정'} />
            <ReadOnlyRow label="이메일" value={me!.email} />
            <ReadOnlyRow label="권한" value={PERMISSION_LABEL[me!.permission]} />
            <ReadOnlyRow label="본사/현장" value={me!.workplace_type ?? '본사'} />
            <ReadOnlyRow label="직급" value={me!.position ?? '미지정'} />
            <ReadOnlyRow label="팀" value={me!.team ?? '미지정'} />
            <ReadOnlyRow label="직무" value={me!.work_type ?? '미지정'} />
          </div>
        </section>

        {/* 수정 가능 폼 */}
        <form
          action={updateMyProfile}
          className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4"
        >
          <h2 className="flex items-center gap-1.5 text-base font-semibold text-slate-700 tracking-tight">
            <UserCog className="h-4 w-4 text-slate-500" />
            수정 가능
          </h2>

          <label className="block">
            <span className="block text-sm font-medium text-slate-700">이름 *</span>
            <input
              type="text"
              name="name"
              required
              maxLength={30}
              defaultValue={me!.name}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-slate-700">휴대폰</span>
            <input
              type="tel"
              name="phone"
              defaultValue={me!.phone ?? ''}
              maxLength={30}
              placeholder="010-1234-5678"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-slate-700">입사일</span>
            <input
              type="date"
              name="hire_date"
              defaultValue={me!.hire_date ?? ''}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
            <span className="mt-1 block text-[11px] text-amber-700">
              ⚠ 입사일은 연차 자동 계산의 기준입니다. 변경 후 「내 연차 → 관리자에게 갱신 요청」 또는
              관리자가 /admin/annual-leaves 에서 「갱신」 한 번 누르면 회차가 재계산됩니다.
            </span>
          </label>

          {showVehiclePlate && (
            <label className="block">
              <span className="block text-sm font-medium text-slate-700">
                차량번호
                {vehicleRequired && <span className="ml-0.5 text-rose-600">*</span>}
              </span>
              <input
                type="text"
                name="vehicle_plate"
                defaultValue={me!.vehicle_plate ?? ''}
                maxLength={30}
                placeholder="예: 12가 3456"
                required={vehicleRequired}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
              {vehicleRequired && (
                <span className="mt-1 block text-[11px] text-rose-600">
                  접속팀은 차량번호가 필수입니다.
                </span>
              )}
            </label>
          )}

          <button
            type="submit"
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-base font-bold text-white hover:bg-slate-800"
          >
            저장
          </button>
        </form>

        <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500 space-y-1">
          <p>
            <span className="font-medium text-slate-700">비밀번호 변경</span> 은 별도로 제공하지 않습니다.
            로그아웃 후 로그인 화면의 「비밀번호 재설정」 기능을 사용하세요.
          </p>
          <p>
            <span className="font-medium text-slate-700">권한·직급·팀·직무·본사/현장</span> 변경은 관리자에게 요청하세요.
          </p>
        </div>
      </div>
    </main>
  )
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-slate-700 truncate">{value}</p>
    </div>
  )
}
