import { redirect } from 'next/navigation'
import { MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import FieldNotesView, {
  type FieldNoteData,
  type FieldNotePhoto,
  type StationPin,
} from '../relocation/[id]/FieldNotesView'
import { isFieldNoteKind } from '@/lib/field-notes'
import FieldTabs from './FieldTabs'

// 최상위 현장관리 — 회사 전체 노트를 한 지도에서. 공사 무관 독립 노트 +
//   공사에서 「현장관리로 보내기」 한 노트(shared_to_field)를 모두 표시.

export default async function FieldManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ station?: string }>
}) {
  const sp = await searchParams
  const focusStationId = sp.station ?? null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, name, is_active, permission')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | { id: string; company_id: string; name: string; is_active: boolean; permission: string }
    | null
  if (!me || !me.is_active) {
    redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  }
  const meIsAdmin = me.permission === 'admin'

  // 회사 노트 중 독립(project_id null) OR 보내기(shared_to_field) 만
  const { data: noteRows } = await supabase
    .from('relocation_field_notes')
    .select(
      'id, kind, title, body, lat, lng, address, created_by, created_at, project_id, shared_to_field',
    )
    .eq('company_id', me.company_id)
    .or('project_id.is.null,shared_to_field.eq.true')
    .order('created_at', { ascending: false })
    .limit(1000)
  type NoteRow = {
    id: string
    kind: string
    title: string | null
    body: string | null
    lat: number
    lng: number
    address: string | null
    created_by: string | null
    created_at: string
    project_id: string | null
    shared_to_field: boolean
  }
  const notes = (noteRows ?? []) as NoteRow[]

  // 사진
  let photoRows: Array<{
    id: string
    note_id: string
    path: string
    caption: string | null
    taken_at: string | null
    gps_lat: number | null
    gps_lng: number | null
    uploaded_by: string | null
    created_at: string
  }> = []
  if (notes.length > 0) {
    const { data: ph } = await supabase
      .from('relocation_field_note_photos')
      .select('id, note_id, path, caption, taken_at, gps_lat, gps_lng, uploaded_by, created_at')
      .in(
        'note_id',
        notes.map((n) => n.id),
      )
      .order('created_at', { ascending: true })
    photoRows = (ph ?? []) as typeof photoRows
  }

  // 직원 이름 + 출처 공사 제목 매핑
  const empIds = new Set<string>()
  for (const n of notes) if (n.created_by) empIds.add(n.created_by)
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

  const projIds = Array.from(
    new Set(notes.map((n) => n.project_id).filter((v): v is string => !!v)),
  )
  const projTitleById = new Map<string, string>()
  if (projIds.length > 0) {
    const { data: projRows } = await supabase
      .from('relocation_projects')
      .select('id, title')
      .in('id', projIds)
    for (const r of (projRows ?? []) as { id: string; title: string }[]) {
      projTitleById.set(r.id, r.title)
    }
  }

  const photosByNote = new Map<string, FieldNotePhoto[]>()
  for (const p of photoRows) {
    const arr = photosByNote.get(p.note_id) ?? []
    arr.push({
      id: p.id,
      path: p.path,
      caption: p.caption,
      taken_at: p.taken_at,
      gps_lat: p.gps_lat,
      gps_lng: p.gps_lng,
      uploaded_by: p.uploaded_by,
      uploaded_by_name: p.uploaded_by ? nameById.get(p.uploaded_by) ?? null : null,
      created_at: p.created_at,
    })
    photosByNote.set(p.note_id, arr)
  }

  const fieldNotes: FieldNoteData[] = notes
    .filter((n) => isFieldNoteKind(n.kind))
    .map((n) => ({
      id: n.id,
      kind: n.kind as FieldNoteData['kind'],
      title: n.title,
      body: n.body,
      lat: n.lat,
      lng: n.lng,
      address: n.address,
      created_by: n.created_by,
      created_by_name: n.created_by ? nameById.get(n.created_by) ?? null : null,
      created_at: n.created_at,
      photos: photosByNote.get(n.id) ?? [],
      sharedToField: n.shared_to_field,
      projectId: n.project_id,
      projectTitle: n.project_id ? projTitleById.get(n.project_id) ?? null : null,
    }))

  // 국사 핀 — 좌표 있으면 지도에 표시. 좌표 없어도 「지도에서 보기」 진입 시 주소로 이동.
  const { data: stationRows } = await supabase
    .from('field_stations')
    .select('id, name, address, lat, lng')
    .eq('company_id', me.company_id)
    .order('name', { ascending: true })
    .limit(1000)
  const stations = ((stationRows ?? []) as Array<{
    id: string
    name: string
    address: string | null
    lat: number | null
    lng: number | null
  }>).map(
    (s): StationPin => ({
      id: s.id,
      name: s.name,
      address: s.address,
      lat: s.lat,
      lng: s.lng,
    }),
  )

  return (
    <main className="px-3 sm:px-4 py-3 space-y-3">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
          <MapPin className="h-6 w-6 text-rose-600" />
          현장관리
        </h1>
        <p className="text-xs text-slate-500">
          현장 특이점·주의·위험을 지도에 기록하고 외부 네비로 길찾기. 공사에서 「현장관리로 보내기」 한 노트도 함께 표시됩니다.
        </p>
      </header>

      <FieldTabs />

      <FieldNotesView
        projectId={null}
        notes={fieldNotes}
        meId={me.id}
        meIsAdmin={meIsAdmin}
        stations={stations}
        focusStationId={focusStationId}
      />
    </main>
  )
}
