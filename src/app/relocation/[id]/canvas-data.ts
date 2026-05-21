import { createClient } from '@/lib/supabase/server'
import type { FacilityRow } from './FacilitiesTab'
import type { CableRow } from './CablesTab'
import type { CircuitRow } from './CircuitsTab'
import type { CoreAssignmentRow } from './CoresTab'
import type {
  FacilityMasterMini,
  TaskTypeOption,
  FacilityTaskRow,
  FacilityMaterialRow,
} from './TopologyCanvas'

// 지장이설 캔버스(TopologyCanvas)가 필요로 하는 데이터 일괄 로더.
//   프로젝트 상세 페이지(page.tsx)와 전체화면 캔버스 라우트(canvas/page.tsx)가
//   동일한 8개 쿼리를 쓰므로 한 곳에 모아 둔다.

export type RelocationCanvasData = {
  facilities: FacilityRow[]
  cables: CableRow[]
  circuits: CircuitRow[]
  facilityMasters: FacilityMasterMini[]
  taskTypes: TaskTypeOption[]
  facilityTasks: FacilityTaskRow[]
  facilityMaterials: FacilityMaterialRow[]
  assignments: CoreAssignmentRow[]
}

export async function loadRelocationCanvasData(
  projectId: string,
  companyId: string,
): Promise<RelocationCanvasData> {
  const supabase = await createClient()

  // 시설 (좌측 패널 + 시설 탭 + 케이블/코어 dropdown + 캔버스)
  const { data: fRows } = await supabase
    .from('relocation_facilities')
    .select(
      'id, closure_type, seq_no, name, install_address, closure_spec, parent_facility_id, is_marked, mark_note, notes, x_hint, y_hint, lat, lng, work_window_start, work_window_end, created_at, install_status',
    )
    .eq('project_id', projectId)
    .order('closure_type')
    .order('seq_no')

  // 케이블
  const { data: cRows } = await supabase
    .from('relocation_cables')
    .select(
      'id, from_facility_id, to_facility_id, spec, status, cable_code, installation_type, waypoints, total_length, end_distance, notes',
    )
    .eq('project_id', projectId)
    .order('cable_code')

  // 회선
  const { data: circRows } = await supabase
    .from('relocation_circuits')
    .select('id, circuit_id, subscriber_name, kind, status, notes')
    .eq('project_id', projectId)
    .order('circuit_id')

  // 회사 공통 시설 마스터 (캔버스 시설명 자동완성용)
  const { data: fmRows } = await supabase
    .from('connection_facilities')
    .select('id, facility_type, name, code, spec_enum, address')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('name')

  // 공종 마스터 (회사 단위) — 캔버스 접속함체 패널의 공종 드롭다운
  const { data: ttRows } = await supabase
    .from('relocation_task_type_master')
    .select('id, name, unit_label, standard_minutes_per_unit')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('position')

  // 시설별 공종량 + 사용 자재 (기별명세서용)
  const { data: ftRows } = await supabase
    .from('relocation_facility_tasks')
    .select('id, facility_id, task_type_id, quantity')
    .eq('project_id', projectId)

  const { data: fmtRows } = await supabase
    .from('relocation_facility_materials')
    .select('id, facility_id, name, spec, unit, quantity')
    .eq('project_id', projectId)

  // 코어 배정 — 케이블 정보 패널·고장점 검색에 필요
  const { data: aRows } = await supabase
    .from('relocation_core_assignments')
    .select(
      'id, circuit_id, segment_idx, cable_id, core_range_start, core_range_end, lifecycle, status, is_terminal, is_auto_assigned, notes',
    )
    .eq('project_id', projectId)
    .order('cable_id')
    .order('core_range_start')

  return {
    facilities: (fRows ?? []) as FacilityRow[],
    cables: (cRows ?? []) as CableRow[],
    circuits: (circRows ?? []) as CircuitRow[],
    facilityMasters: (fmRows ?? []) as FacilityMasterMini[],
    taskTypes: (ttRows ?? []) as TaskTypeOption[],
    facilityTasks: (ftRows ?? []) as FacilityTaskRow[],
    facilityMaterials: (fmtRows ?? []) as FacilityMaterialRow[],
    assignments: (aRows ?? []) as CoreAssignmentRow[],
  }
}
