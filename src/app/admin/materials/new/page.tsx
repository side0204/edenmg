import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createMaterial } from '../actions'
import { MaterialForm, type MaterialFormValues } from '../MaterialForm'

export default async function NewMaterialPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('permission, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | { permission: 'worker' | 'team_member' | 'team_leader' | 'admin'; is_active: boolean }
    | null
  if (!me || !me.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  if (me.permission !== 'admin') {
    redirect('/?err=' + encodeURIComponent('관리자 권한이 필요합니다'))
  }

  const initial: MaterialFormValues = { id: null, name: '', spec: '', unit: '' }

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-5">
        <header>
          <Link
            href="/admin/materials"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            자재 마스터
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">자재 등록</h1>
        </header>

        <MaterialForm initial={initial} action={createMaterial} submitLabel="등록" />
      </div>
    </main>
  )
}
