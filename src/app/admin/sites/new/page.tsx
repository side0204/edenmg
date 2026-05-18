import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createSite } from '../actions'
import { fetchManagerCandidates } from '../managers'
import { SiteForm, type SiteFormValues } from '../SiteForm'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

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

export default async function NewSitePage() {
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
  if (!me || (me.permission !== 'admin')) {
    notFound()
  }

  const managers = await fetchManagerCandidates(supabase)

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-5">
        <header>
          <Link href="/admin/sites" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
            <ChevronLeft className="h-4 w-4" />
            현장 목록
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">현장 등록</h1>
        </header>


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

