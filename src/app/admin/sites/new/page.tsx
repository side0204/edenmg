import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createSite } from '../actions'
import { fetchManagerCandidates } from '../managers'
import { SiteForm, type SiteFormValues } from '../SiteForm'

type Permission = 'worker' | 'foreman' | 'admin' | 'ceo'

const defaults: SiteFormValues = {
  id: null,
  name: '',
  address: null,
  lat: null,
  lng: null,
  radius_m: 500,
  manager_employee_id: null,
  start_date: null,
  end_date: null,
  is_active: true,
  notes: null,
}

export default async function NewSitePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
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

  const managers = await fetchManagerCandidates(supabase)

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-5">
        <header>
          <Link href="/admin/sites" className="text-xs text-slate-500 hover:text-slate-900">
            ← 현장 목록
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">현장 등록</h1>
        </header>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
            {error}
          </p>
        )}

        <SiteForm
          defaults={defaults}
          managers={managers}
          action={createSite}
          submitLabel="현장 등록"
        />
      </div>
    </main>
  )
}

