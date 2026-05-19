import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Ban, RotateCcw } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { EmptyState } from '@/components/EmptyState'
import { reactivateVehicle } from '../actions'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

type RetiredRow = {
  id: string
  plate_number: string
  name: string
  notes: string | null
  retired_at: string
  retire_reason: string | null
}

export default async function RetiredVehiclesPage() {
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
    .from('vehicles')
    .select('id, plate_number, name, notes, retired_at, retire_reason')
    .not('retired_at', 'is', null)
    .order('retired_at', { ascending: false })

  const rows = (data ?? []) as RetiredRow[]

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <header>
          <Link
            href="/vehicles"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            업무용 차량
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">사용 종료 차량</h1>
          <p className="mt-1 text-sm text-slate-500">
            폐차·매각·리스반납·렌트반납 등으로 회사를 떠난 차량입니다. 운행 이력은 보존되며 필요 시
            운영을 재개할 수 있습니다.
          </p>
        </header>

        {listError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
            목록을 불러오지 못했습니다: {listError.message}
          </p>
        )}

        {rows.length === 0 && !listError ? (
          <EmptyState
            icon={Ban}
            title="사용 종료 차량 없음"
            description="아직 사용 종료 처리된 차량이 없습니다."
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((v) => (
              <li
                key={v.id}
                className="rounded-xl bg-white border border-slate-200 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">
                      {v.plate_number} <span className="text-slate-500">·</span> {v.name}
                    </p>
                    {v.notes && (
                      <p className="mt-0.5 text-xs text-slate-500 truncate">{v.notes}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                    종료 {v.retired_at}
                  </span>
                </div>

                <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs space-y-0.5">
                  <p className="font-medium text-slate-700">사용 종료 사유</p>
                  <p className="text-slate-600 break-words">{v.retire_reason ?? '-'}</p>
                </div>

                <form action={reactivateVehicle}>
                  <input type="hidden" name="id" value={v.id} />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    운영 재개
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
