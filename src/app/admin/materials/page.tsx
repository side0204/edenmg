import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, Package, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { EmptyState } from '@/components/EmptyState'
import { toggleMaterialActive } from './actions'

type MaterialRow = {
  id: string
  name: string
  spec: string | null
  unit: string | null
  is_active: boolean
}

export default async function MaterialsPage() {
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
        permission: 'worker' | 'foreman' | 'admin' | 'ceo'
        is_active: boolean
      }
    | null
  if (!me || !me.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  if (me.permission !== 'admin' && me.permission !== 'ceo') {
    redirect('/?err=' + encodeURIComponent('관리자 권한이 필요합니다'))
  }

  const { data, error: listError } = await supabase
    .from('materials')
    .select('id, name, spec, unit, is_active')
    .order('is_active', { ascending: false })
    .order('name')

  const rows = (data ?? []) as MaterialRow[]

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-center justify-between gap-3">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
            >
              <ChevronLeft className="h-4 w-4" />
              홈
            </Link>
            <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">자재 마스터</h1>
            <p className="mt-1 text-sm text-slate-500">
              회사 자재 목록 · {rows.length}건 (접속일보 작성 시 검색 후 선택)
            </p>
          </div>
          <Link
            href="/admin/materials/new"
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            자재 등록
          </Link>
        </header>

        {listError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
            목록을 불러오지 못했습니다: {listError.message}
          </p>
        )}

        {rows.length === 0 && !listError ? (
          <EmptyState
            icon={Package}
            title="등록된 자재 없음"
            description="자주 사용하는 자재를 등록해두면 접속일보 작성 시 빠르게 선택할 수 있습니다. 비규격 자재는 일보에서 직접 입력 가능."
            cta={
              <Link
                href="/admin/materials/new"
                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
                자재 등록
              </Link>
            }
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((m) => (
              <li
                key={m.id}
                className={
                  'flex items-center gap-3 rounded-xl border bg-white p-3 ' +
                  (m.is_active ? 'border-slate-200' : 'border-slate-200 opacity-70')
                }
              >
                <Link href={`/admin/materials/${m.id}`} className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900 truncate">{m.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500 truncate">
                    {[m.spec, m.unit].filter(Boolean).join(' · ') || '규격·단위 미지정'}
                  </p>
                </Link>
                {!m.is_active && (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    비활성
                  </span>
                )}
                <form action={toggleMaterialActive}>
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="target" value={m.is_active ? 'false' : 'true'} />
                  <button
                    type="submit"
                    className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {m.is_active ? '비활성화' : '활성화'}
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
