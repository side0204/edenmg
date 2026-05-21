import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildCsv, csvResponse } from '@/lib/csv'
import {
  CABLE_STATUS_LABEL,
  formatFacilityCode,
  type ClosureType,
  type CableStatus,
} from '@/lib/relocation'

// 지장이설 기별명세서 CSV — Step E.
//   ?project=<id>&type=cable|task|material
//   회사 스코프는 relocation_* RLS 가 강제 (user-context 쿼리).

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('project') ?? ''
  const type = req.nextUrl.searchParams.get('type') ?? 'cable'
  if (!projectId) {
    return new Response('project 파라미터가 필요합니다', { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('로그인이 필요합니다', { status: 401 })

  const { data: projRow } = await supabase
    .from('relocation_projects')
    .select('id, title')
    .eq('id', projectId)
    .maybeSingle()
  if (!projRow) return new Response('프로젝트를 찾을 수 없습니다', { status: 404 })
  const title = (projRow as { title: string }).title

  // 시설 라벨 맵
  const { data: fRows } = await supabase
    .from('relocation_facilities')
    .select('id, closure_type, seq_no, name')
    .eq('project_id', projectId)
  const facilityLabel = new Map<string, string>()
  for (const f of (fRows ?? []) as {
    id: string
    closure_type: ClosureType
    seq_no: number
    name: string
  }[]) {
    facilityLabel.set(f.id, `${formatFacilityCode(f.closure_type, f.seq_no)} ${f.name}`)
  }

  if (type === 'cable') {
    const { data } = await supabase
      .from('relocation_cables')
      .select(
        'from_facility_id, to_facility_id, spec, status, cable_code, installation_type, total_length',
      )
      .eq('project_id', projectId)
      .neq('status', 'existing')
      .order('cable_code')
    const cables = (data ?? []) as {
      from_facility_id: string
      to_facility_id: string
      spec: string
      status: CableStatus
      cable_code: string
      installation_type: string | null
      total_length: number | null
    }[]
    const rows: unknown[][] = cables.map((c) => [
      c.cable_code,
      `${facilityLabel.get(c.from_facility_id) ?? '?'} ~ ${facilityLabel.get(c.to_facility_id) ?? '?'}`,
      c.spec,
      CABLE_STATUS_LABEL[c.status] ?? c.status,
      c.installation_type ?? '',
      c.total_length ?? '',
    ])
    const total = cables.reduce((acc, c) => acc + (c.total_length ?? 0), 0)
    rows.push(['', '', '', '', '총 포설 거리', total])
    const csv = buildCsv(
      ['케이블ID', '구간', '규격', '상태', '설치구분', '거리(m)'],
      rows,
    )
    return csvResponse(csv, `${title}_케이블포설명세.csv`)
  }

  if (type === 'task') {
    const { data: ttRows } = await supabase
      .from('relocation_task_type_master')
      .select('id, name, unit_label')
    const ttById = new Map(
      ((ttRows ?? []) as { id: string; name: string; unit_label: string }[]).map(
        (t) => [t.id, t],
      ),
    )
    const { data } = await supabase
      .from('relocation_facility_tasks')
      .select('facility_id, task_type_id, quantity')
      .eq('project_id', projectId)
    const tasks = (data ?? []) as {
      facility_id: string
      task_type_id: string
      quantity: number
    }[]
    const rows: unknown[][] = tasks
      .map((t) => {
        const tt = ttById.get(t.task_type_id)
        return [
          facilityLabel.get(t.facility_id) ?? '?',
          tt?.name ?? '(삭제된 공종)',
          t.quantity,
          tt?.unit_label ?? '',
        ]
      })
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    const csv = buildCsv(['시설', '공종', '수량', '단위'], rows)
    return csvResponse(csv, `${title}_함체공종명세.csv`)
  }

  if (type === 'material') {
    const { data } = await supabase
      .from('relocation_facility_materials')
      .select('facility_id, name, spec, unit, quantity')
      .eq('project_id', projectId)
    const materials = (data ?? []) as {
      facility_id: string
      name: string
      spec: string | null
      unit: string
      quantity: number
    }[]
    const rows: unknown[][] = materials
      .map((m) => [
        facilityLabel.get(m.facility_id) ?? '?',
        m.name,
        m.spec ?? '',
        m.quantity,
        m.unit,
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    const csv = buildCsv(['시설', '자재명', '규격', '수량', '단위'], rows)
    return csvResponse(csv, `${title}_함체자재명세.csv`)
  }

  return new Response('알 수 없는 type 입니다 (cable|task|material)', { status: 400 })
}
