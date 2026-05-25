import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { HighlightProvider } from '../HighlightContext'
import TopologyCanvas from '../TopologyCanvas'
import { loadRelocationCanvasData } from '../canvas-data'

// 지장이설 캔버스 전체화면 라우트 — 앱 메뉴(BottomNav 등) 없이 캔버스만.
//   프로젝트 페이지의 「넓은 화면으로 열기」 가 새 탭으로 연다.
//   fixed inset-0 로 화면을 꽉 채워 BottomNav·body 하단 패딩까지 덮는다.

type ProjectMini = {
  id: string
  title: string
  client: string
  category: string | null
  subscription_id: string | null
  subscriber_name: string | null
}

export default async function RelocationCanvasPage({
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
    .select('id, company_id, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; company_id: string; is_active: boolean } | null
  if (!me || !me.is_active) {
    redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  }

  const { data: pRow } = await supabase
    .from('relocation_projects')
    .select('id, title, client, category, subscription_id, subscriber_name')
    .eq('id', id)
    .maybeSingle()
  const project = pRow as ProjectMini | null
  if (!project) notFound()

  const {
    facilities,
    cables,
    circuits,
    facilityMasters,
    taskTypes,
    facilityTasks,
    facilityMaterials,
    assignments,
  } = await loadRelocationCanvasData(id, me.company_id)

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-bold text-slate-900">{project.title}</h1>
          <p className="truncate text-[11px] text-slate-500">
            {project.client} · 캔버스
          </p>
        </div>
        <Link
          href={`/relocation/${id}`}
          className="shrink-0 inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          프로젝트로 돌아가기
        </Link>
      </header>
      <div className="p-3">
        <HighlightProvider>
          <TopologyCanvas
            initialCanvasSize="tall"
            projectId={project.id}
            projectCategory={
              project.category === '청약' ||
              project.category === '계획' ||
              project.category === '지장이설'
                ? project.category
                : null
            }
            subscriptionId={project.subscription_id ?? null}
            subscriberName={project.subscriber_name ?? null}
            facilities={facilities.map((f) => ({
              id: f.id,
              closure_type: f.closure_type,
              seq_no: f.seq_no,
              name: f.name,
              facility_code: f.facility_code ?? null,
              closure_spec: f.closure_spec,
              install_address: f.install_address,
              notes: f.notes,
              inspection_request: f.inspection_request ?? null,
              parent_facility_id: f.parent_facility_id,
              is_marked: f.is_marked,
              mark_note: f.mark_note ?? null,
              work_window_start: f.work_window_start,
              work_window_end: f.work_window_end,
              x_hint: f.x_hint ?? null,
              y_hint: f.y_hint ?? null,
              lat: f.lat ?? null,
              lng: f.lng ?? null,
              created_at: f.created_at ?? null,
              install_status: f.install_status ?? 'new',
              label_dx: f.label_dx ?? 0,
              label_dy: f.label_dy ?? 0,
              label_dx_map: f.label_dx_map ?? 0,
              label_dy_map: f.label_dy_map ?? 0,
              install_order: f.install_order ?? null,
              created_by: f.created_by ?? null,
            }))}
            cables={cables.map((c) => ({
              id: c.id,
              from_facility_id: c.from_facility_id,
              to_facility_id: c.to_facility_id,
              spec: c.spec,
              status: c.status,
              cable_code: c.cable_code,
              installation_type: c.installation_type,
              waypoints: Array.isArray(c.waypoints) ? c.waypoints : [],
              mapWaypoints: Array.isArray(c.map_waypoints) ? c.map_waypoints : [],
              total_length: c.total_length,
              end_distance: c.end_distance,
              created_by: c.created_by ?? null,
            }))}
            editable={true}
            facilityMasters={facilityMasters}
            taskTypes={taskTypes}
            facilityTasks={facilityTasks}
            facilityMaterials={facilityMaterials}
            circuits={circuits}
            coreAssignments={assignments}
            myEmployeeId={me.id}
          />
        </HighlightProvider>
      </div>
    </main>
  )
}
