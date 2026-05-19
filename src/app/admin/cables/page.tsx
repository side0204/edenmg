import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Cable, ChevronLeft, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { EmptyState } from '@/components/EmptyState'
import type { CableSpec } from '@/lib/connection'
import { toggleCableActive } from './actions'

type CableRow = {
  id: string
  code: string
  spec_enum: CableSpec | null
  notes: string | null
  is_active: boolean
}

export default async function CablesPage() {
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
    .from('cables')
    .select('id, code, spec_enum, notes, is_active')
    .order('is_active', { ascending: false })
    .order('code')

  const rows = (data ?? []) as CableRow[]

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
            >
              <ChevronLeft className="h-4 w-4" />
              홈
            </Link>
            <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">케이블 마스터</h1>
            <p className="mt-1 text-sm text-slate-500">
              회사 케이블 목록 · {rows.length}건. 접속일보 작성 시 케이블ID 검색·자동 채움에 사용
            </p>
          </div>
          <Link
            href="/admin/cables/new"
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            케이블 등록
          </Link>
        </header>

        {listError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
            목록을 불러오지 못했습니다: {listError.message}
          </p>
        )}

        {rows.length === 0 && !listError ? (
          <EmptyState
            icon={Cable}
            title="등록된 케이블 없음"
            description="자주 사용하는 케이블을 등록해두면 일보 작성 시 케이블ID 만으로 규격이 자동 채워집니다. 등록 안 해도 일보에서 직접 입력 가능."
            cta={
              <Link
                href="/admin/cables/new"
                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
                케이블 등록
              </Link>
            }
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((c) => (
              <li
                key={c.id}
                className={
                  'flex items-center gap-3 rounded-xl border bg-white p-3 ' +
                  (c.is_active ? 'border-slate-200' : 'border-slate-200 opacity-70')
                }
              >
                <Link href={`/admin/cables/${c.id}`} className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900 truncate">{c.code}</p>
                  <p className="mt-0.5 text-xs text-slate-500 truncate">
                    {[c.spec_enum, c.notes].filter(Boolean).join(' · ') || '규격·메모 미지정'}
                  </p>
                </Link>
                {!c.is_active && (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    비활성
                  </span>
                )}
                <form action={toggleCableActive}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="target" value={c.is_active ? 'false' : 'true'} />
                  <button
                    type="submit"
                    className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {c.is_active ? '비활성화' : '활성화'}
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
