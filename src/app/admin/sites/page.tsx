import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type Permission = 'worker' | 'foreman' | 'admin' | 'ceo'

type SiteRow = {
  id: string
  name: string
  address: string | null
  lat: number | null
  lng: number | null
  radius_m: number
  manager_employee_id: string | null
  start_date: string | null
  end_date: string | null
  is_active: boolean
  created_at: string
}

export default async function SitesPage() {
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

  const { data, error: listError } = await supabase
    .from('sites')
    .select('id, name, address, lat, lng, radius_m, manager_employee_id, start_date, end_date, is_active, created_at')
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: false })

  const rows = (data ?? []) as SiteRow[]

  // 소장 이름 매핑 — sites.manager_employee_id 들을 모아 employees 한 번에 조회.
  const managerIds = Array.from(
    new Set(rows.map((r) => r.manager_employee_id).filter((v): v is string => !!v)),
  )
  const managerNameById = new Map<string, string>()
  if (managerIds.length > 0) {
    const { data: mgrs } = await supabase
      .from('employees')
      .select('id, name')
      .in('id', managerIds)
    for (const m of (mgrs ?? []) as { id: string; name: string }[]) {
      managerNameById.set(m.id, m.name)
    }
  }

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-center justify-between gap-3">
          <div>
            <Link href="/" className="text-xs text-slate-500 hover:text-slate-900">
              ← 홈
            </Link>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">현장 관리</h1>
          </div>
          <Link
            href="/admin/sites/new"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            + 현장 등록
          </Link>
        </header>

        {listError && <Banner kind="err">목록을 불러오지 못했습니다: {listError.message}</Banner>}

        <ul className="space-y-3">
          {rows.map((site) => {
            const hasCoords = site.lat !== null && site.lng !== null
            const periodParts = [site.start_date, site.end_date].filter(Boolean)
            const period = periodParts.length > 0 ? periodParts.join(' ~ ') : null
            return (
              <li
                key={site.id}
                className="rounded-xl bg-white border border-slate-200 hover:border-slate-900 transition-colors"
              >
                <Link href={`/admin/sites/${site.id}`} className="block p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 truncate">{site.name}</p>
                      {site.address && (
                        <p className="mt-0.5 text-xs text-slate-500 truncate">{site.address}</p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${
                        site.is_active
                          ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                          : 'text-slate-500 bg-slate-100 border-slate-200'
                      }`}
                    >
                      {site.is_active ? '활성' : '비활성'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>반경 {site.radius_m}m</span>
                    <span>
                      {hasCoords ? `GPS ${site.lat!.toFixed(4)}, ${site.lng!.toFixed(4)}` : 'GPS 없음'}
                    </span>
                    <span>
                      소장 {site.manager_employee_id ? managerNameById.get(site.manager_employee_id) ?? '?' : '미지정'}
                    </span>
                    {period && <span>{period}</span>}
                  </div>
                </Link>
              </li>
            )
          })}

          {rows.length === 0 && !listError && (
            <li className="rounded-xl bg-white border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              아직 등록된 현장이 없습니다. 우측 상단 <span className="font-medium">+ 현장 등록</span> 으로 시작하세요.
            </li>
          )}
        </ul>
      </div>
    </main>
  )
}

function Banner({ kind, children }: { kind: 'ok' | 'err'; children: React.ReactNode }) {
  const cls =
    kind === 'ok'
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : 'text-red-600 bg-red-50 border-red-200'
  return <p className={`text-sm border rounded-lg p-3 ${cls}`}>{children}</p>
}
