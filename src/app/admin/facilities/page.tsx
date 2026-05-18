import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Building2, ChevronLeft, Plus, Server } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { EmptyState } from '@/components/EmptyState'
import type { CableSpec } from '@/lib/connection'
import { toggleFacilityActive } from './actions'

type Row = {
  id: string
  facility_type: 'station' | 'box'
  name: string
  code: string | null
  spec_enum: CableSpec | null
  address: string | null
  lat: number | null
  lng: number | null
  notes: string | null
  is_active: boolean
}

export default async function FacilitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const sp = await searchParams
  const type = sp.type === 'box' ? 'box' : 'station'
  const typeLabel = type === 'box' ? '함체' : '국사'

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, permission, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | {
        id: string
        company_id: string
        permission: 'worker' | 'team_member' | 'team_leader' | 'admin'
        is_active: boolean
      }
    | null
  if (!me || !me.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  if (me.permission !== 'admin') {
    redirect('/?err=' + encodeURIComponent('관리자 권한이 필요합니다'))
  }

  const { data, error: listError } = await supabase
    .from('connection_facilities')
    .select('id, facility_type, name, code, spec_enum, address, lat, lng, notes, is_active')
    .eq('facility_type', type)
    .order('is_active', { ascending: false })
    .order('name')

  const rows = (data ?? []) as Row[]

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
            >
              <ChevronLeft className="h-4 w-4" />
              홈
            </Link>
            <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">
              함체·국사 마스터
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              회사 {typeLabel} 목록 · {rows.length}건. 작업구간 등록 시 자동완성으로 사용
            </p>
          </div>
          <Link
            href={`/admin/facilities/new?type=${type}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            {typeLabel} 등록
          </Link>
        </header>

        {/* 탭 */}
        <div className="flex gap-2">
          <TabLink href="/admin/facilities?type=station" active={type === 'station'} icon={Server}>
            국사
          </TabLink>
          <TabLink href="/admin/facilities?type=box" active={type === 'box'} icon={Building2}>
            함체
          </TabLink>
        </div>

        {listError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
            목록을 불러오지 못했습니다: {listError.message}
          </p>
        )}

        {rows.length === 0 && !listError ? (
          <EmptyState
            icon={type === 'box' ? Building2 : Server}
            title={`등록된 ${typeLabel} 없음`}
            description={`자주 사용하는 ${typeLabel}을 등록해두면 작업구간 등록 시 자동완성·GPS 자동 채움이 됩니다. 등록 안 해도 직접 입력 가능.`}
            cta={
              <Link
                href={`/admin/facilities/new?type=${type}`}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
                {typeLabel} 등록
              </Link>
            }
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((f) => (
              <li
                key={f.id}
                className={
                  'flex items-center gap-3 rounded-xl border bg-white p-3 ' +
                  (f.is_active ? 'border-slate-200' : 'border-slate-200 opacity-70')
                }
              >
                <Link href={`/admin/facilities/${f.id}`} className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900 truncate">
                    {f.name}
                    {f.code && (
                      <span className="ml-1.5 text-xs text-slate-500">({f.code})</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 truncate">
                    {[
                      f.spec_enum,
                      f.address,
                      f.lat !== null && f.lng !== null ? `${f.lat},${f.lng}` : null,
                      f.notes,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '추가 정보 없음'}
                  </p>
                </Link>
                {!f.is_active && (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    비활성
                  </span>
                )}
                <form action={toggleFacilityActive}>
                  <input type="hidden" name="id" value={f.id} />
                  <input type="hidden" name="target" value={f.is_active ? 'false' : 'true'} />
                  <button
                    type="submit"
                    className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {f.is_active ? '비활성화' : '활성화'}
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

function TabLink({
  href,
  active,
  icon: Icon,
  children,
}: {
  href: string
  active: boolean
  icon: typeof Server
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={
        'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium ' +
        (active
          ? 'bg-slate-900 text-white'
          : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50')
      }
    >
      <Icon className="h-4 w-4" />
      {children}
    </Link>
  )
}
