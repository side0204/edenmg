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
