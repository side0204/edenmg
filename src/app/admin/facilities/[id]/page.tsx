import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import type { CableSpec } from '@/lib/connection'
import { updateFacility } from '../actions'
import { FacilityForm } from '../FacilityForm'

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
}

export default async function FacilityEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
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
    | {
        permission: 'worker' | 'team_member' | 'team_leader' | 'admin'
        is_active: boolean
      }
    | null
  if (!me || !me.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  if (me.permission !== 'admin') {
    redirect('/?err=' + encodeURIComponent('관리자 권한이 필요합니다'))
  }

  const { data } = await supabase
    .from('connection_facilities')
    .select('id, facility_type, name, code, spec_enum, address, lat, lng, notes')
    .eq('id', id)
    .maybeSingle()
  const row = data as Row | null
  if (!row) notFound()

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-xl space-y-5">
        <header>
          <Link
            href={`/admin/facilities?type=${row.facility_type}`}
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            목록
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">
            {row.facility_type === 'box' ? '함체' : '국사'} 정보 수정
          </h1>
        </header>

        <FacilityForm
          initial={{
            id: row.id,
            facility_type: row.facility_type,
            name: row.name,
            code: row.code ?? '',
            spec_enum: row.spec_enum ?? '',
            address: row.address ?? '',
            lat: row.lat !== null ? String(row.lat) : '',
            lng: row.lng !== null ? String(row.lng) : '',
            notes: row.notes ?? '',
          }}
          action={updateFacility}
          submitLabel="저장"
          typeLocked
        />
      </div>
    </main>
  )
}
