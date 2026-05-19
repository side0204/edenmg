import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import ImportStockClient from './ImportClient'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

export default async function StockImportPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, permission, is_active, can_manage_stock')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | { id: string; permission: Permission; is_active: boolean; can_manage_stock: boolean }
    | null
  if (!me?.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  if (me.permission !== 'admin' && !me.can_manage_stock) {
    redirect('/?err=' + encodeURIComponent('자재 관리 권한이 필요합니다'))
  }

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-5">
        <header>
          <Link
            href="/stock"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" /> 자재 관리
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">보유자재 CSV 등록</h1>
          <p className="mt-1 text-sm text-slate-500">
            이미 가지고 있는 자재를 CSV 한 번에 등록. 자재 마스터도 자동 생성됩니다.
          </p>
        </header>

        <ImportStockClient />
      </div>
    </main>
  )
}
