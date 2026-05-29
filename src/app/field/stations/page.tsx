import { redirect } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import FieldTabs from '../FieldTabs'
import StationsView, {
  type StationData,
  type StationSectionData,
  type StationPhotoData,
} from './StationsView'

// 현장관리 — 국사현황. 국사별 정보 항목(상면도·장비랙·OFD랙·추가정보)과 사진 관리.

export default async function StationsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, is_active, permission')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | { id: string; company_id: string; is_active: boolean; permission: string }
    | null
  if (!me || !me.is_active) {
    redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  }
  const meIsAdmin = me.permission === 'admin'

  const { data: stationRows } = await supabase
    .from('field_stations')
    .select('id, name, address, lat, lng, created_by, created_at')
    .eq('company_id', me.company_id)
    .order('name', { ascending: true })
    .limit(1000)
  const stations = (stationRows ?? []) as Array<{
    id: string
    name: string
    address: string | null
    lat: number | null
    lng: number | null
    created_by: string | null
    created_at: string
  }>

  const stationIds = stations.map((s) => s.id)

  let sectionRows: Array<{
    id: string
    station_id: string
    label: string
    body: string | null
    sort_order: number
  }> = []
  let photoRows: Array<{
    id: string
    section_id: string
    station_id: string
    path: string
    caption: string | null
    taken_at: string | null
    gps_lat: number | null
    gps_lng: number | null
    uploaded_by: string | null
    created_at: string
  }> = []

  if (stationIds.length > 0) {
    const { data: secs } = await supabase
      .from('field_station_sections')
      .select('id, station_id, label, body, sort_order')
      .in('station_id', stationIds)
      .order('sort_order', { ascending: true })
    sectionRows = (secs ?? []) as typeof sectionRows

    const { data: phs } = await supabase
      .from('field_station_photos')
      .select('id, section_id, station_id, path, caption, taken_at, gps_lat, gps_lng, uploaded_by, created_at')
      .in('station_id', stationIds)
      .order('created_at', { ascending: true })
    photoRows = (phs ?? []) as typeof photoRows
  }

  // 업로더 이름 매핑
  const empIds = new Set<string>()
  for (const p of photoRows) if (p.uploaded_by) empIds.add(p.uploaded_by)
  const nameById = new Map<string, string>()
  if (empIds.size > 0) {
    const { data: empRows } = await supabase
      .from('employees')
      .select('id, name')
      .in('id', Array.from(empIds))
    for (const r of (empRows ?? []) as { id: string; name: string }[]) {
      nameById.set(r.id, r.name)
    }
  }

  const photosBySection = new Map<string, StationPhotoData[]>()
  for (const p of photoRows) {
    const arr = photosBySection.get(p.section_id) ?? []
    arr.push({
      id: p.id,
      sectionId: p.section_id,
      path: p.path,
      caption: p.caption,
      takenAt: p.taken_at,
      gpsLat: p.gps_lat,
      gpsLng: p.gps_lng,
      uploadedBy: p.uploaded_by,
      uploadedByName: p.uploaded_by ? nameById.get(p.uploaded_by) ?? null : null,
      createdAt: p.created_at,
    })
    photosBySection.set(p.section_id, arr)
  }

  const sectionsByStation = new Map<string, StationSectionData[]>()
  for (const s of sectionRows) {
    const arr = sectionsByStation.get(s.station_id) ?? []
    arr.push({
      id: s.id,
      stationId: s.station_id,
      label: s.label,
      body: s.body,
      sortOrder: s.sort_order,
      photos: photosBySection.get(s.id) ?? [],
    })
    sectionsByStation.set(s.station_id, arr)
  }

  const data: StationData[] = stations.map((s) => ({
    id: s.id,
    name: s.name,
    address: s.address,
    lat: s.lat,
    lng: s.lng,
    createdBy: s.created_by,
    createdAt: s.created_at,
    sections: sectionsByStation.get(s.id) ?? [],
  }))

  return (
    <main className="px-3 sm:px-4 py-3 space-y-3">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
          <Building2 className="h-6 w-6 text-rose-600" />
          국사현황
        </h1>
        <p className="text-xs text-slate-500">
          국사별 상면도·장비랙·OFD랙 정보와 사진을 관리합니다. 주소를 입력하면 외부 네비로 길찾기할 수 있어요.
        </p>
      </header>

      <FieldTabs />

      <StationsView stations={data} meId={me.id} meIsAdmin={meIsAdmin} />
    </main>
  )
}
