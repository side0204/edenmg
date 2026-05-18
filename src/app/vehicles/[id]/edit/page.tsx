import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { updateVehicle } from '../../actions'
import { VehicleForm, type VehicleFormValues } from '../../VehicleForm'

type Permission = 'worker' | 'foreman' | 'admin' | 'ceo'

type VehicleRow = {
  id: string
  plate_number: string
  name: string
  is_active: boolean
  notes: string | null
}

export default async function EditVehiclePage({
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

  const { data: vData } = await supabase
    .from('vehicles')
    .select('id, plate_number, name, is_active, notes')
    .eq('id', id)
    .maybeSingle()

  const vehicle = vData as VehicleRow | null
  if (!vehicle) notFound()

  const defaults: VehicleFormValues = {
    id: vehicle.id,
    plate_number: vehicle.plate_number,
    name: vehicle.name,
    is_active: vehicle.is_active,
    notes: vehicle.notes,
  }

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-5">
        <header>
          <Link href="/vehicles" className="text-xs text-slate-500 hover:text-slate-900">
            ← 차량 목록
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">차량 수정</h1>
          <p className="mt-1 text-xs text-slate-500">
            {vehicle.plate_number} · {vehicle.name}
          </p>
        </header>


        <VehicleForm defaults={defaults} action={updateVehicle} submitLabel="변경 저장" />
      </div>
    </main>
  )
}
