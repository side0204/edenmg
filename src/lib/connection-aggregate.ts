/**
 * 접속일보 자재·공종 집계 헬퍼.
 *
 * 작업별 / 공사번호별 합계 표시용. server-only — Supabase 클라이언트를 인자로 받음.
 *
 * 집계 단위:
 *   - 자재: material_id (마스터 매치) 또는 (custom_name+custom_spec+custom_unit) 키
 *   - 공종: task_type + custom_task_name(기타) 키
 *
 * 결재 상태 필터링 없음 (대기·승인·반려 전부 합산). 필요 시 옵션 추가.
 */

import type { ConnectionTaskType } from './connection'
import type { createClient } from './supabase/server'

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

export type AggregatedMaterial = {
  key: string
  /** 마스터 매치 시 마스터 ID, 직접입력은 null */
  material_id: string | null
  name: string
  spec: string | null
  unit: string | null
  isCustom: boolean
  totalQuantity: number
}

export type AggregatedTask = {
  key: string
  task_type: ConnectionTaskType
  custom_task_name: string | null
  /** 표시용 라벨 ('기타' 면 custom_task_name 으로 대체) */
  label: string
  totalCount: number
}

export type Aggregation = {
  reportCount: number
  materials: AggregatedMaterial[]
  tasks: AggregatedTask[]
}

/**
 * 그룹핑 결과 — 작업통계 페이지처럼 차원별로 합계를 나눠 보여줄 때.
 * key 는 차원에 따라 employee_id / order_id / work_id / YYYY / YYYY-MM / YYYY-MM-DD.
 */
export type AggregationGroup = {
  key: string
  aggregation: Aggregation
}

const EMPTY: Aggregation = { reportCount: 0, materials: [], tasks: [] }

/**
 * workIds 의 모든 접속일보 자재·공종을 합산.
 * 외선·기타 작업의 work_daily_reports 자재(자유 텍스트)는 합산 대상 아님.
 */
export async function aggregateConnectionTotals(
  supabase: SupabaseServer,
  workIds: string[],
): Promise<Aggregation> {
  if (workIds.length === 0) return EMPTY

  // 접속일보 ID 수집
  const { data: reportRows } = await supabase
    .from('connection_reports')
    .select('id')
    .in('work_id', workIds)
  const reportIds = ((reportRows ?? []) as { id: string }[]).map((r) => r.id)
  return aggregateConnectionTotalsByReports(supabase, reportIds)
}

/**
 * 일보 IDs 를 직접 받아서 자재·공종 합산.
 * 작업통계 페이지처럼 그룹별로 일보를 추려 합산할 때 사용.
 */
export async function aggregateConnectionTotalsByReports(
  supabase: SupabaseServer,
  reportIds: string[],
): Promise<Aggregation> {
  if (reportIds.length === 0) return { ...EMPTY }

  // 자재·공종·마스터 병렬 fetch
  const [tasksRes, matsRes] = await Promise.all([
    supabase
      .from('connection_node_tasks')
      .select('task_type, custom_task_name, task_count')
      .in('report_id', reportIds),
    supabase
      .from('connection_node_materials')
      .select('material_id, custom_name, custom_spec, custom_unit, quantity')
      .in('report_id', reportIds),
  ])

  // 마스터 lookup (자재 마스터 매치된 것만)
  const materialIds = Array.from(
    new Set(
      ((matsRes.data ?? []) as { material_id: string | null }[])
        .map((m) => m.material_id)
        .filter((x): x is string => !!x),
    ),
  )
  const masterMap = new Map<string, { name: string; spec: string | null; unit: string | null }>()
  if (materialIds.length > 0) {
    const { data: mastersData } = await supabase
      .from('materials')
      .select('id, name, spec, unit')
      .in('id', materialIds)
    for (const m of (mastersData ?? []) as {
      id: string
      name: string
      spec: string | null
      unit: string | null
    }[]) {
      masterMap.set(m.id, { name: m.name, spec: m.spec, unit: m.unit })
    }
  }

  // 공종 집계
  const taskGroups = new Map<string, AggregatedTask>()
  for (const t of (tasksRes.data ?? []) as {
    task_type: ConnectionTaskType
    custom_task_name: string | null
    task_count: number
  }[]) {
    const key = t.task_type === '기타' ? `기타::${t.custom_task_name ?? ''}` : t.task_type
    const existing = taskGroups.get(key)
    if (existing) {
      existing.totalCount += Number(t.task_count) || 0
    } else {
      taskGroups.set(key, {
        key,
        task_type: t.task_type,
        custom_task_name: t.custom_task_name,
        label: t.task_type === '기타' ? (t.custom_task_name ?? '기타') : t.task_type,
        totalCount: Number(t.task_count) || 0,
      })
    }
  }
  const tasks = Array.from(taskGroups.values()).sort((a, b) => b.totalCount - a.totalCount)

  // 자재 집계
  const matGroups = new Map<string, AggregatedMaterial>()
  for (const m of (matsRes.data ?? []) as {
    material_id: string | null
    custom_name: string | null
    custom_spec: string | null
    custom_unit: string | null
    quantity: number
  }[]) {
    let key: string
    let name: string
    let spec: string | null
    let unit: string | null
    let isCustom: boolean
    if (m.material_id) {
      const master = masterMap.get(m.material_id)
      key = `M:${m.material_id}`
      name = master?.name ?? '?'
      spec = master?.spec ?? null
      unit = master?.unit ?? null
      isCustom = false
    } else {
      const cn = (m.custom_name ?? '').trim()
      const cs = (m.custom_spec ?? '').trim()
      const cu = (m.custom_unit ?? '').trim()
      key = `C:${cn}|${cs}|${cu}`
      name = cn || '?'
      spec = cs || null
      unit = cu || null
      isCustom = true
    }
    const existing = matGroups.get(key)
    if (existing) {
      existing.totalQuantity += Number(m.quantity) || 0
    } else {
      matGroups.set(key, {
        key,
        material_id: m.material_id,
        name,
        spec,
        unit,
        isCustom,
        totalQuantity: Number(m.quantity) || 0,
      })
    }
  }
  const materials = Array.from(matGroups.values()).sort((a, b) => b.totalQuantity - a.totalQuantity)

  return { reportCount: reportIds.length, materials, tasks }
}

/**
 * 그룹별 통계 — 작업통계 페이지에서 차원별로 한 번에 집계.
 * - reportIds 의 모든 tasks·materials 를 한 번에 fetch
 * - getGroupKey(reportId) 로 그룹 결정 → 메모리에서 그룹별 누적
 * - getGroupKey 가 null 반환하면 그 일보는 무시 (예: dim=order 에서 order_id 가 없는 작업)
 *
 * 반환: 그룹키 → Aggregation 매핑 (정렬 없음. 호출자가 라벨 매핑 후 정렬)
 */
export async function aggregateConnectionStats(
  supabase: SupabaseServer,
  reportIds: string[],
  getGroupKey: (reportId: string) => string | null,
): Promise<Map<string, Aggregation>> {
  const result = new Map<string, Aggregation>()
  if (reportIds.length === 0) return result

  type GroupAccum = {
    reports: Set<string>
    tasks: Map<string, AggregatedTask>
    materials: Map<string, AggregatedMaterial>
  }
  const accumByGroup = new Map<string, GroupAccum>()
  const getOrInit = (key: string): GroupAccum => {
    let a = accumByGroup.get(key)
    if (!a) {
      a = { reports: new Set(), tasks: new Map(), materials: new Map() }
      accumByGroup.set(key, a)
    }
    return a
  }

  // 일보 자체 카운트 (tasks·materials 가 0건이어도 reportCount 는 잡혀야 함)
  for (const rid of reportIds) {
    const gk = getGroupKey(rid)
    if (gk == null) continue
    getOrInit(gk).reports.add(rid)
  }

  // 한 번에 tasks + materials fetch
  const [tasksRes, matsRes] = await Promise.all([
    supabase
      .from('connection_node_tasks')
      .select('report_id, task_type, custom_task_name, task_count')
      .in('report_id', reportIds),
    supabase
      .from('connection_node_materials')
      .select('report_id, material_id, custom_name, custom_spec, custom_unit, quantity')
      .in('report_id', reportIds),
  ])

  // 마스터 lookup
  const materialIds = Array.from(
    new Set(
      ((matsRes.data ?? []) as { material_id: string | null }[])
        .map((m) => m.material_id)
        .filter((x): x is string => !!x),
    ),
  )
  const masterMap = new Map<string, { name: string; spec: string | null; unit: string | null }>()
  if (materialIds.length > 0) {
    const { data: mastersData } = await supabase
      .from('materials')
      .select('id, name, spec, unit')
      .in('id', materialIds)
    for (const m of (mastersData ?? []) as {
      id: string
      name: string
      spec: string | null
      unit: string | null
    }[]) {
      masterMap.set(m.id, { name: m.name, spec: m.spec, unit: m.unit })
    }
  }

  // 공종 누적
  for (const t of (tasksRes.data ?? []) as {
    report_id: string
    task_type: ConnectionTaskType
    custom_task_name: string | null
    task_count: number
  }[]) {
    const gk = getGroupKey(t.report_id)
    if (gk == null) continue
    const accum = getOrInit(gk)
    const key = t.task_type === '기타' ? `기타::${t.custom_task_name ?? ''}` : t.task_type
    const existing = accum.tasks.get(key)
    if (existing) {
      existing.totalCount += Number(t.task_count) || 0
    } else {
      accum.tasks.set(key, {
        key,
        task_type: t.task_type,
        custom_task_name: t.custom_task_name,
        label: t.task_type === '기타' ? (t.custom_task_name ?? '기타') : t.task_type,
        totalCount: Number(t.task_count) || 0,
      })
    }
  }

  // 자재 누적
  for (const m of (matsRes.data ?? []) as {
    report_id: string
    material_id: string | null
    custom_name: string | null
    custom_spec: string | null
    custom_unit: string | null
    quantity: number
  }[]) {
    const gk = getGroupKey(m.report_id)
    if (gk == null) continue
    const accum = getOrInit(gk)
    let key: string
    let name: string
    let spec: string | null
    let unit: string | null
    let isCustom: boolean
    if (m.material_id) {
      const master = masterMap.get(m.material_id)
      key = `M:${m.material_id}`
      name = master?.name ?? '?'
      spec = master?.spec ?? null
      unit = master?.unit ?? null
      isCustom = false
    } else {
      const cn = (m.custom_name ?? '').trim()
      const cs = (m.custom_spec ?? '').trim()
      const cu = (m.custom_unit ?? '').trim()
      key = `C:${cn}|${cs}|${cu}`
      name = cn || '?'
      spec = cs || null
      unit = cu || null
      isCustom = true
    }
    const existing = accum.materials.get(key)
    if (existing) {
      existing.totalQuantity += Number(m.quantity) || 0
    } else {
      accum.materials.set(key, {
        key,
        material_id: m.material_id,
        name,
        spec,
        unit,
        isCustom,
        totalQuantity: Number(m.quantity) || 0,
      })
    }
  }

  // 최종 변환 + 그룹별 정렬
  for (const [gk, accum] of accumByGroup.entries()) {
    const tasks = Array.from(accum.tasks.values()).sort((a, b) => b.totalCount - a.totalCount)
    const materials = Array.from(accum.materials.values()).sort(
      (a, b) => b.totalQuantity - a.totalQuantity,
    )
    result.set(gk, { reportCount: accum.reports.size, tasks, materials })
  }
  return result
}

// =====================================================================
// 일보 단위 wide 표 (작업통계 페이지 「표 보기」 모드)
// =====================================================================

export type StatsTableTaskColumn = {
  key: string // task_type or '기타::custom'
  label: string
  totalCount: number
}

export type StatsTableMaterialColumn = {
  key: string // 'M:<material_id>' or 'C:name|spec|unit'
  name: string
  spec: string | null
  unit: string | null
  isCustom: boolean
  totalQuantity: number
}

export type StatsTableRow = {
  reportId: string
  date: string // YYYY-MM-DD
  workerName: string
  orderId: string | null
  workName: string
  /** 공종 컬럼 키 → 그 일보의 수량 합 */
  taskCounts: Map<string, number>
  /** 자재 컬럼 키 → 그 일보의 수량 합 */
  materialQtys: Map<string, number>
}

export type StatsTableData = {
  rows: StatsTableRow[]
  taskColumns: StatsTableTaskColumn[]
  materialColumns: StatsTableMaterialColumn[]
}

/**
 * 일보 단위 wide 표 빌더.
 * - reportMeta: 일보 메타 (이미 회사 스코프·기간 필터·권한 적용된 상태로 전달)
 * - 한 번에 tasks·materials·masters·employees·works 메타 fetch
 * - 일보별 row + 동적 공종·자재 컬럼 (총량 내림차순)
 */
export async function buildStatsTable(
  supabase: SupabaseServer,
  reportMeta: {
    id: string
    work_id: string
    author_employee_id: string
    report_date: string
  }[],
  worksById: Map<string, { name: string; order_id: string | null }>,
): Promise<StatsTableData> {
  if (reportMeta.length === 0) {
    return { rows: [], taskColumns: [], materialColumns: [] }
  }

  const reportIds = reportMeta.map((r) => r.id)
  const workerIds = Array.from(new Set(reportMeta.map((r) => r.author_employee_id)))

  // 병렬 fetch
  const [tasksRes, matsRes, empsRes] = await Promise.all([
    supabase
      .from('connection_node_tasks')
      .select('report_id, task_type, custom_task_name, task_count')
      .in('report_id', reportIds),
    supabase
      .from('connection_node_materials')
      .select('report_id, material_id, custom_name, custom_spec, custom_unit, quantity')
      .in('report_id', reportIds),
    supabase.from('employees').select('id, name').in('id', workerIds),
  ])

  const employeeNameById = new Map<string, string>(
    ((empsRes.data ?? []) as { id: string; name: string }[]).map((e) => [e.id, e.name]),
  )

  // 마스터 lookup
  const materialIds = Array.from(
    new Set(
      ((matsRes.data ?? []) as { material_id: string | null }[])
        .map((m) => m.material_id)
        .filter((x): x is string => !!x),
    ),
  )
  const masterMap = new Map<
    string,
    { name: string; spec: string | null; unit: string | null }
  >()
  if (materialIds.length > 0) {
    const { data: mastersData } = await supabase
      .from('materials')
      .select('id, name, spec, unit')
      .in('id', materialIds)
    for (const m of (mastersData ?? []) as {
      id: string
      name: string
      spec: string | null
      unit: string | null
    }[]) {
      masterMap.set(m.id, { name: m.name, spec: m.spec, unit: m.unit })
    }
  }

  // 공종 컬럼 totals (그리고 일보별 셀 값 누적)
  type TaskCol = {
    key: string
    label: string
    totalCount: number
  }
  const taskColMap = new Map<string, TaskCol>()
  const taskByReport = new Map<string, Map<string, number>>()
  for (const t of (tasksRes.data ?? []) as {
    report_id: string
    task_type: ConnectionTaskType
    custom_task_name: string | null
    task_count: number
  }[]) {
    const key = t.task_type === '기타' ? `기타::${t.custom_task_name ?? ''}` : t.task_type
    const label = t.task_type === '기타' ? (t.custom_task_name ?? '기타') : t.task_type
    const count = Number(t.task_count) || 0
    // 컬럼 누적
    const col = taskColMap.get(key)
    if (col) col.totalCount += count
    else taskColMap.set(key, { key, label, totalCount: count })
    // 일보별 누적
    let cellMap = taskByReport.get(t.report_id)
    if (!cellMap) {
      cellMap = new Map()
      taskByReport.set(t.report_id, cellMap)
    }
    cellMap.set(key, (cellMap.get(key) ?? 0) + count)
  }

  // 자재 컬럼 totals (그리고 일보별 셀 값 누적)
  type MatCol = {
    key: string
    name: string
    spec: string | null
    unit: string | null
    isCustom: boolean
    totalQuantity: number
  }
  const matColMap = new Map<string, MatCol>()
  const matByReport = new Map<string, Map<string, number>>()
  for (const m of (matsRes.data ?? []) as {
    report_id: string
    material_id: string | null
    custom_name: string | null
    custom_spec: string | null
    custom_unit: string | null
    quantity: number
  }[]) {
    let key: string
    let name: string
    let spec: string | null
    let unit: string | null
    let isCustom: boolean
    if (m.material_id) {
      const master = masterMap.get(m.material_id)
      key = `M:${m.material_id}`
      name = master?.name ?? '?'
      spec = master?.spec ?? null
      unit = master?.unit ?? null
      isCustom = false
    } else {
      const cn = (m.custom_name ?? '').trim()
      const cs = (m.custom_spec ?? '').trim()
      const cu = (m.custom_unit ?? '').trim()
      key = `C:${cn}|${cs}|${cu}`
      name = cn || '?'
      spec = cs || null
      unit = cu || null
      isCustom = true
    }
    const qty = Number(m.quantity) || 0
    const col = matColMap.get(key)
    if (col) col.totalQuantity += qty
    else matColMap.set(key, { key, name, spec, unit, isCustom, totalQuantity: qty })
    let cellMap = matByReport.get(m.report_id)
    if (!cellMap) {
      cellMap = new Map()
      matByReport.set(m.report_id, cellMap)
    }
    cellMap.set(key, (cellMap.get(key) ?? 0) + qty)
  }

  // 컬럼 정렬: 총량 내림차순
  const taskColumns: StatsTableTaskColumn[] = Array.from(taskColMap.values()).sort(
    (a, b) => b.totalCount - a.totalCount,
  )
  const materialColumns: StatsTableMaterialColumn[] = Array.from(matColMap.values()).sort(
    (a, b) => b.totalQuantity - a.totalQuantity,
  )

  // 행 빌드 (일자 내림차순)
  const rows: StatsTableRow[] = reportMeta
    .slice()
    .sort((a, b) => (a.report_date < b.report_date ? 1 : a.report_date > b.report_date ? -1 : 0))
    .map((r) => {
      const w = worksById.get(r.work_id)
      return {
        reportId: r.id,
        date: r.report_date,
        workerName: employeeNameById.get(r.author_employee_id) ?? '?',
        orderId: w?.order_id ?? null,
        workName: w?.name ?? '?',
        taskCounts: taskByReport.get(r.id) ?? new Map(),
        materialQtys: matByReport.get(r.id) ?? new Map(),
      }
    })

  return { rows, taskColumns, materialColumns }
}
