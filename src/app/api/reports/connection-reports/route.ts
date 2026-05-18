import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildCsv, csvResponse, monthRangeKST } from '@/lib/csv'
import { PLAN_NODE_TYPE_LABEL, calcCoreCount } from '@/lib/connection'

/**
 * 접속일보 CSV 출력 API.
 * 모드:
 *   - summary  : 일보별 한 줄
 *   - segment  : segment(cable) 단위 한 줄 + 접속코어수
 *   - tasks    : 노드 공종별 한 줄
 *   - materials: 노드 자재별 한 줄
 *
 * 파라미터:
 *   - mode     : summary | segment | tasks | materials (필수)
 *   - month    : YYYY-MM (필수) — 일보 report_date 가 이 월에 속한 것만
 *   - work_id  : 선택 — 특정 작업만
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('mode') ?? 'summary'
  const month = url.searchParams.get('month') ?? ''
  const workId = url.searchParams.get('work_id') ?? ''

  if (!['summary', 'segment', 'tasks', 'materials'].includes(mode)) {
    return new Response('mode 가 잘못되었습니다 (summary/segment/tasks/materials)', { status: 400 })
  }
  const range = monthRangeKST(month)
  if (!range) {
    return new Response('month 형식이 잘못되었습니다 (YYYY-MM)', { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('unauthorized', { status: 401 })

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, permission, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | {
        id: string
        company_id: string
        permission: 'worker' | 'foreman' | 'admin' | 'ceo'
        is_active: boolean
      }
    | null
  if (!me || !me.is_active) return new Response('inactive', { status: 403 })

  const isAdmin = me.permission === 'admin' || me.permission === 'ceo'
  const isForeman = me.permission === 'foreman'
  if (!isAdmin && !isForeman) {
    return new Response('forbidden', { status: 403 })
  }

  // 회사 스코프의 접속일보 fetch (RLS 가 한 번 더 막아주지만 명시적 스코프)
  // 월 범위는 report_date 기준 (date 컬럼).
  const startDate = monthFirstDay(month)
  const endDate = monthFirstDayNext(month)
  if (!startDate || !endDate) return new Response('month 파싱 실패', { status: 400 })

  // 일보 + 작업 + 작성자 정보 한 번에
  let q = supabase
    .from('connection_reports')
    .select(
      `id, work_id, author_employee_id, report_date, notes, progress, status, reviewed_by, reviewed_at, review_comment,
       works!inner ( id, name, company_id, assignee_employee_id ),
       author:employees!connection_reports_author_employee_id_fkey ( id, name, permission, position, team, work_type )`,
    )
    .gte('report_date', startDate)
    .lt('report_date', endDate)
    .order('report_date', { ascending: true })

  if (workId) q = q.eq('work_id', workId)

  const { data: reportsData, error: rErr } = await q
  if (rErr) {
    return new Response('조회 실패: ' + rErr.message, { status: 500 })
  }

  type ReportFull = {
    id: string
    work_id: string
    author_employee_id: string
    report_date: string
    notes: string | null
    progress: string
    status: string
    reviewed_by: string | null
    reviewed_at: string | null
    review_comment: string | null
    works: { id: string; name: string; company_id: string; assignee_employee_id: string | null }
    author: {
      id: string
      name: string
      permission: string
      position: string | null
      team: string | null
      work_type: string | null
    } | null
  }

  let reports = (reportsData ?? []) as unknown as ReportFull[]
  // 회사 스코프 강제
  reports = reports.filter((r) => r.works?.company_id === me.company_id)
  // foreman 은 본인 담당 작업만
  if (!isAdmin && isForeman) {
    reports = reports.filter((r) => r.works?.assignee_employee_id === me.id)
  }

  if (reports.length === 0) {
    return csvResponse(buildCsv(headerForMode(mode), []), filenameForMode(mode, month))
  }

  const reportIds = reports.map((r) => r.id)

  // ===== summary =====
  if (mode === 'summary') {
    // 처리자 이름 매핑
    const reviewerIds = Array.from(
      new Set(reports.map((r) => r.reviewed_by).filter((x): x is string => !!x)),
    )
    const reviewerMap = new Map<string, string>()
    if (reviewerIds.length > 0) {
      const { data: revs } = await supabase
        .from('employees')
        .select('id, name')
        .in('id', reviewerIds)
      for (const r of (revs ?? []) as { id: string; name: string }[]) {
        reviewerMap.set(r.id, r.name)
      }
    }
    const rows = reports.map((r) => [
      r.report_date,
      r.author?.name ?? '',
      r.author?.permission ?? '',
      r.author?.position ?? '',
      r.author?.team ?? '',
      r.author?.work_type ?? '',
      r.works?.name ?? '',
      r.progress,
      r.status,
      r.reviewed_by ? (reviewerMap.get(r.reviewed_by) ?? '') : '',
      r.reviewed_at ?? '',
      r.review_comment ?? '',
      r.notes ?? '',
    ])
    return csvResponse(buildCsv(headerForMode('summary'), rows), filenameForMode('summary', month))
  }

  // 공통: segments + plan_nodes
  const { data: segsData } = await supabase
    .from('connection_report_segments')
    .select(
      'id, report_id, plan_node_id, cable_spec, line_numbers, is_completed, segment_notes',
    )
    .in('report_id', reportIds)
  const segments = (segsData ?? []) as {
    id: string
    report_id: string
    plan_node_id: string
    cable_spec: string
    line_numbers: string
    is_completed: boolean
    segment_notes: string | null
  }[]

  const allNodeIds = Array.from(
    new Set([
      ...segments.map((s) => s.plan_node_id),
      // tasks/materials 의 plan_node_id 도 같이
    ]),
  )

  // tasks + materials 필요 (mode 에 따라)
  let tasksList: {
    id: string
    report_id: string
    plan_node_id: string
    task_type: string
    custom_task_name: string | null
    task_count: number
    notes: string | null
  }[] = []
  let materialsList: {
    id: string
    report_id: string
    plan_node_id: string
    material_id: string | null
    custom_name: string | null
    custom_spec: string | null
    custom_unit: string | null
    quantity: number
    notes: string | null
  }[] = []
  if (mode === 'tasks' || mode === 'segment' || mode === 'materials') {
    if (mode === 'tasks') {
      const { data } = await supabase
        .from('connection_node_tasks')
        .select(
          'id, report_id, plan_node_id, task_type, custom_task_name, task_count, notes',
        )
        .in('report_id', reportIds)
      tasksList = (data ?? []) as typeof tasksList
      for (const t of tasksList) allNodeIds.push(t.plan_node_id)
    }
    if (mode === 'materials') {
      const { data } = await supabase
        .from('connection_node_materials')
        .select(
          'id, report_id, plan_node_id, material_id, custom_name, custom_spec, custom_unit, quantity, notes',
        )
        .in('report_id', reportIds)
      materialsList = (data ?? []) as typeof materialsList
      for (const m of materialsList) allNodeIds.push(m.plan_node_id)
    }
  }

  // plan_nodes 한 번에 (parent 노드 정보까지 필요할 수 있어서 chain 전체 가져옴)
  const uniqueNodeIds = Array.from(new Set(allNodeIds))
  let nodeMap = new Map<
    string,
    {
      id: string
      chain_id: string
      parent_id: string | null
      node_type: string
      name: string
      code: string | null
      spec: string | null
      spec_enum: string | null
      lat: number | null
      lng: number | null
      added_during_report_id: string | null
    }
  >()
  let chainNameMap = new Map<string, string | null>()
  if (uniqueNodeIds.length > 0) {
    const { data: nodesData } = await supabase
      .from('connection_plan_nodes')
      .select(
        'id, chain_id, parent_id, node_type, name, code, spec, spec_enum, lat, lng, added_during_report_id',
      )
      .in('id', uniqueNodeIds)
    const nodes = (nodesData ?? []) as {
      id: string
      chain_id: string
      parent_id: string | null
      node_type: string
      name: string
      code: string | null
      spec: string | null
      spec_enum: string | null
      lat: number | null
      lng: number | null
      added_during_report_id: string | null
    }[]
    nodeMap = new Map(nodes.map((n) => [n.id, n]))
    // parent node 도 가져와야 segment 의 "출발노드" 표시 가능 → chain_id 로 chain 전체 fetch
    const chainIds = Array.from(new Set(nodes.map((n) => n.chain_id)))
    if (chainIds.length > 0) {
      const { data: chainData } = await supabase
        .from('connection_chains')
        .select('id, name')
        .in('id', chainIds)
      chainNameMap = new Map<string, string | null>(
        ((chainData ?? []) as { id: string; name: string | null }[]).map((c) => [c.id, c.name]),
      )
      // parent 노드도 가져옴
      const parentIds = Array.from(
        new Set(nodes.map((n) => n.parent_id).filter((x): x is string => !!x)),
      )
      const missing = parentIds.filter((p) => !nodeMap.has(p))
      if (missing.length > 0) {
        const { data: parents } = await supabase
          .from('connection_plan_nodes')
          .select(
            'id, chain_id, parent_id, node_type, name, code, spec, spec_enum, lat, lng, added_during_report_id',
          )
          .in('id', missing)
        for (const p of (parents ?? []) as Parameters<typeof nodeMap.set>[1][]) {
          nodeMap.set(p.id, p)
        }
      }
    }
  }

  const reportMap = new Map(reports.map((r) => [r.id, r]))

  // ===== segment =====
  if (mode === 'segment') {
    const rows = segments.map((s) => {
      const r = reportMap.get(s.report_id)
      const node = nodeMap.get(s.plan_node_id)
      const parent = node?.parent_id ? nodeMap.get(node.parent_id) : null
      const gps = node?.lat && node?.lng ? `${node.lat},${node.lng}` : ''
      const coreCount = calcCoreCount(s.line_numbers) ?? ''
      const isAdHoc = node?.added_during_report_id ? 'Y' : 'N'
      return [
        r?.report_date ?? '',
        r?.author?.name ?? '',
        r?.works?.name ?? '',
        chainNameMap.get(node?.chain_id ?? '') ?? '',
        parent?.name ?? '',
        node?.name ?? '',
        node ? PLAN_NODE_TYPE_LABEL[node.node_type as keyof typeof PLAN_NODE_TYPE_LABEL] : '',
        node?.code ?? '',
        node?.spec_enum ?? node?.spec ?? '',
        gps,
        s.cable_spec,
        s.line_numbers,
        coreCount,
        s.is_completed ? '완료' : '진행중',
        isAdHoc,
        s.segment_notes ?? '',
        r?.progress ?? '',
        r?.status ?? '',
      ]
    })
    return csvResponse(buildCsv(headerForMode('segment'), rows), filenameForMode('segment', month))
  }

  // ===== tasks =====
  if (mode === 'tasks') {
    const rows = tasksList.map((t) => {
      const r = reportMap.get(t.report_id)
      const node = nodeMap.get(t.plan_node_id)
      return [
        r?.report_date ?? '',
        r?.author?.name ?? '',
        r?.works?.name ?? '',
        chainNameMap.get(node?.chain_id ?? '') ?? '',
        node?.name ?? '',
        node ? PLAN_NODE_TYPE_LABEL[node.node_type as keyof typeof PLAN_NODE_TYPE_LABEL] : '',
        node?.code ?? '',
        t.task_type,
        t.custom_task_name ?? '',
        t.task_count,
        t.notes ?? '',
      ]
    })
    return csvResponse(buildCsv(headerForMode('tasks'), rows), filenameForMode('tasks', month))
  }

  // ===== materials =====
  // 마스터 자재명 매핑
  const masterIds = Array.from(
    new Set(materialsList.map((m) => m.material_id).filter((x): x is string => !!x)),
  )
  const masterMap = new Map<string, { name: string; spec: string | null; unit: string | null }>()
  if (masterIds.length > 0) {
    const { data: ms } = await supabase
      .from('materials')
      .select('id, name, spec, unit')
      .in('id', masterIds)
    for (const m of (ms ?? []) as {
      id: string
      name: string
      spec: string | null
      unit: string | null
    }[]) {
      masterMap.set(m.id, { name: m.name, spec: m.spec, unit: m.unit })
    }
  }

  const rows = materialsList.map((m) => {
    const r = reportMap.get(m.report_id)
    const node = nodeMap.get(m.plan_node_id)
    const master = m.material_id ? masterMap.get(m.material_id) : null
    return [
      r?.report_date ?? '',
      r?.author?.name ?? '',
      r?.works?.name ?? '',
      chainNameMap.get(node?.chain_id ?? '') ?? '',
      node?.name ?? '',
      node ? PLAN_NODE_TYPE_LABEL[node.node_type as keyof typeof PLAN_NODE_TYPE_LABEL] : '',
      node?.code ?? '',
      master?.name ?? m.custom_name ?? '',
      master?.spec ?? m.custom_spec ?? '',
      master?.unit ?? m.custom_unit ?? '',
      m.quantity,
      master ? 'Y' : 'N',
      m.notes ?? '',
    ]
  })
  return csvResponse(buildCsv(headerForMode('materials'), rows), filenameForMode('materials', month))
}

function headerForMode(mode: string): string[] {
  if (mode === 'summary') {
    return [
      '일자',
      '작성자',
      '권한',
      '직급',
      '팀',
      '분야',
      '작업명',
      '진행률',
      '상태',
      '처리자',
      '처리시각',
      '처리의견',
      '비고',
    ]
  }
  if (mode === 'segment') {
    return [
      '일자',
      '작성자',
      '작업명',
      'chain명',
      '출발노드',
      '도착노드',
      '도착노드타입',
      '함체ID',
      '함체규격',
      'GPS',
      '케이블규격',
      '사용선번',
      '접속코어수',
      '완료여부',
      '계획외추가',
      'segment메모',
      '일보진행률',
      '일보상태',
    ]
  }
  if (mode === 'tasks') {
    return [
      '일자',
      '작성자',
      '작업명',
      'chain명',
      '노드명',
      '노드타입',
      '함체ID',
      '공종',
      '공종(기타)',
      '공종수',
      '메모',
    ]
  }
  return [
    '일자',
    '작성자',
    '작업명',
    'chain명',
    '노드명',
    '노드타입',
    '함체ID',
    '자재명',
    '규격',
    '단위',
    '수량',
    '마스터여부',
    '메모',
  ]
}

function filenameForMode(mode: string, month: string): string {
  const suffix =
    mode === 'summary'
      ? '일보별'
      : mode === 'segment'
        ? '세그먼트별'
        : mode === 'tasks'
          ? '공종별'
          : '자재별'
  return `접속일보_${suffix}_${month}.csv`
}

function monthFirstDay(month: string): string | null {
  return /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : null
}
function monthFirstDayNext(month: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  if (!m) return null
  const year = Number(m[1])
  const mon = Number(m[2])
  const nextYear = mon === 12 ? year + 1 : year
  const nextMon = mon === 12 ? 1 : mon + 1
  return `${nextYear}-${String(nextMon).padStart(2, '0')}-01`
}
