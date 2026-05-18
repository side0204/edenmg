import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { updateSite } from '../actions'
import { fetchManagerCandidates } from '../managers'
import { SiteForm, type SiteFormValues } from '../SiteForm'

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
  notes: string | null
}

export default async function EditSitePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
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

  const { data: siteData } = await supabase
    .from('sites')
    .select('id, name, address, lat, lng, radius_m, manager_employee_id, start_date, end_date, is_active, notes')
    .eq('id', id)
    .maybeSingle()

  const site = siteData as SiteRow | null
  if (!site) notFound()

  const managers = await fetchManagerCandidates(supabase)

  const defaults: SiteFormValues = {
    id: site.id,
    name: site.name,
    address: site.address,
    lat: site.lat,
    lng: site.lng,
    radius_m: site.radius_m,
    manager_employee_id: site.manager_employee_id,
    start_date: site.start_date,
    end_date: site.end_date,
    is_active: site.is_active,
    notes: site.notes,
  }

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-5">
        <header>
          <Link href="/admin/sites" className="text-xs text-slate-500 hover:text-slate-900">
            ← 현장 목록
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">현장 수정</h1>
          <p className="mt-1 text-xs text-slate-500">{site.name}</p>
        </header>


        <SiteForm
          defaults={defaults}
          managers={managers}
          action={updateSite}
          submitLabel="변경 저장"
        />
      </div>
    </main>
  )
}
