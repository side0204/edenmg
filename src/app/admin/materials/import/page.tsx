import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import ImportMaterialsClient from './ImportClient'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

export default async function MaterialsImportPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('permission, is_active, can_manage_stock')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | { permission: Permission; is_active: boolean; can_manage_stock: boolean }
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
            href="/admin/materials"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" /> 자재 마스터
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">자재 마스터 CSV 등록</h1>
          <p className="mt-1 text-sm text-slate-500">
            여러 자재를 한 번에 등록. 발주처+코드 매칭으로 기존 자재는 갱신됩니다.
          </p>
        </header>

        <ImportMaterialsClient />
      </div>
    </main>
  )
}
