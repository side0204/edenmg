'use client'

import { useState, useMemo, useRef, useCallback, useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Plus,
  X,
  BookOpen,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Expand,
  Shrink,
  Crosshair,
  MoreHorizontal,
  Map as MapIcon,
  Layers,
  Network,
  TriangleAlert,
  MapPin,
  Search,
  Camera,
  List,
  PanelTop,
  ImageDown,
  Download,
  Sparkles,
  Trash2,
  Undo2,
  Pencil,
  Type,
  Save,
} from 'lucide-react'
import {
  CABLE_SPEC_VALUES,
  CLOSURE_TYPE_LABEL,
  CLOSURE_TYPE_VALUES,
  CLOSURE_TYPE_COLOR,
  CLOSURE_CATEGORY_LABEL,
  groupClosureTypesByCategory,
  CLOSURE_TYPE_CATEGORY,
  cableSpecColor,
  cableSpecCoreCount,
  installationTypeDash,
  CABLE_INSTALLATION_TYPE_VALUES,
  FACILITY_INSTALL_STATUS_VALUES,
  FACILITY_INSTALL_STATUS_LABEL,
  formatFacilityCode,
  facilityIdLabel,
  isInstallNumbered,
  hasInstallStatus,
  computeInstallNumbers,
  findCutoverCables,
  haversineMeters,
  type ClosureType,
  type ClosureCategory,
  type CableStatus,
  type CableSpec,
  type CableInstallationType,
  type CoreLifecycle,
  type FacilityInstallStatus,
} from '@/lib/relocation'
import { CABLE_STATUS_LABEL, CABLE_STATUS_VALUES } from '@/lib/relocation'
import { autoLayoutPositions, NODE_SIZE } from './auto-layout'
import { snapPositionsToCableDirections } from './cable-snap-layout'
import { graphAwareLayout } from './graph-layout'
import { saveNodePositions, saveCableWaypoints } from './position-actions'
import { createCableFromCanvas } from './cable-actions'
import { seedTestFacilities, clearTestFacilities } from './test-actions'
import {
  createFacilityAtPosition,
  createFacilityAtLatLng,
  createInspectionFacility,
  updateFacilityLatLng,
  bulkPlaceFacilities,
  saveFacilityLabelOffset,
} from './facility-actions'
import LegendPanel from './LegendPanel'
import RoadviewPanel from './RoadviewPanel'
import SketchOverlay from './SketchOverlay'
import FieldInspectionSaveDialog from './FieldInspectionSaveDialog'
import CableInfoPanel from './CableInfoPanel'
import SubscriptionCablePopover from './SubscriptionCablePopover'
import FacilityTaskPopover from './FacilityTaskPopover'
import FacilityInfoPanel, {
  type TaskTypeOption,
  type FacilityTaskItem,
  type FacilityMaterialItem,
} from './FacilityInfoPanel'
import { useHighlight } from './HighlightContext'
import FaultSearchPanel, {
  type FaultSearchCircuit,
} from './FaultSearchPanel'
import { useKakaoMap } from './useKakaoMap'
import MapSearchBox from './MapSearchBox'
import MapCaptureGuide from './MapCaptureGuide'
import MapAutoCapture from './MapAutoCapture'
import { exportSchematicPng } from './export-schematic'

export type FacilityMasterMini = {
  id: string
  facility_type: string  // 'station' | 'box'
  name: string
  code: string | null
  spec_enum: string | null
  address: string | null
}

// 시설별 공종량·자재 — facility_id 로 캔버스에서 필터링해 패널에 전달
export type FacilityTaskRow = FacilityTaskItem & { facility_id: string }
export type FacilityMaterialRow = FacilityMaterialItem & { facility_id: string }
export type { TaskTypeOption }

// 코어 배정 — 케이블 정보 패널의 회선·코어 인라인 입력 + 고장점 검색에 공통 사용.
//   FaultSearchAssignment 의 상위 타입 (id·lifecycle·is_terminal 추가).
export type CanvasCoreAssignment = {
  id: string
  circuit_id: string | null
  segment_idx: number
  cable_id: string
  core_range_start: number
  core_range_end: number
  lifecycle: CoreLifecycle
  is_terminal: boolean
  // 입력 주체 — 'designer'(설계 계획·기별 미반영) / 'worker'(실시공·기별 반영)
  entered_role: 'designer' | 'worker'
}

type FacilityNode = {
  id: string
  closure_type: ClosureType
  seq_no: number
  name: string
  facility_code: string | null
  closure_spec: CableSpec | null
  install_address: string | null
  notes: string | null
  inspection_request: string | null
  parent_facility_id: string | null
  is_marked: boolean
  mark_note: string | null
  work_window_start: string | null
  work_window_end: string | null
  x_hint: number | null
  y_hint: number | null
  lat: number | null
  lng: number | null
  created_at: string | null
  install_status: string
  label_dx: number
  label_dy: number
  label_dx_map: number
  label_dy_map: number
  install_order: number | null
  created_by: string | null  // employees.id — 본인 작업분 필터링용
}

// 경로점 — x/y 는 도식 캔버스 좌표, lat/lng 는 지도 모드 GPS 좌표(Phase 4),
//   pole_name/dist 는 정산용 (전주명·구간거리)
type Waypoint = {
  x: number
  y: number
  lat?: number | null
  lng?: number | null
  pole_name?: string | null
  dist?: number | null
}

type CableEdge = {
  id: string
  from_facility_id: string
  to_facility_id: string
  spec: string
  status: CableStatus
  cable_code: string
  installation_type: CableInstallationType | null
  waypoints: Waypoint[]      // 도식 모드 경로점 (x/y)
  mapWaypoints: Waypoint[]   // 지도 모드 경로점 (lat/lng)
  total_length: number | null
  end_distance: number | null
  created_by: string | null  // employees.id — 본인 작업분 필터링용
}

// 시설 신규 배치 대기 — 도식 모드는 캔버스 픽셀(xy), 지도 모드는 GPS 좌표(latlng)
type PendingPlacement =
  | { closureType: ClosureType; kind: 'xy'; x: number; y: number }
  | { closureType: ClosureType; kind: 'latlng'; lat: number; lng: number }

const EXISTING_COLOR = '#111827'
const NEW_COLOR      = '#dc2626'
const SELECTED_COLOR = '#2563eb'  // blue-600 (선택 강조)
const LINKED_COLOR   = '#f59e0b'  // amber-500 (선택 시설에 연결된 케이블 강조)
const ROUTE_COLOR    = '#7c3aed'  // violet-600 (고장점 검색 경로 강조)
const ROUTE_GAP_COLOR = '#d97706' // amber-600 (끊긴 중간경로 — 추정 연결)
const FAULT_COLOR    = '#dc2626'  // red-600 (고장점 위치 마커)
const DRAG_THRESHOLD = 4          // px — 클릭/드래그 구분
const SNAP_THRESHOLD = 14         // px — 좌클릭 드래그 시 다른 시설과 수직·수평 정렬 스냅 거리
const LABEL_LEADER_THRESHOLD = 26 // px — 라벨이 이만큼 멀어지면 시설과 연결선 표시
const CABLE_SHIFT_GAP = 26        // px — segment-level overlap 시 케이블 평행 이동 폭 (인접 케이블 사이 거리 ≈ 52px). same-pair 다중은 라우팅 단계에서 다른 candidate path 로 이미 분리.
// 시설 라벨 흰색 외곽선 — 지도 모드에서 배경 지도 글자와 구분 (지도 제작사 표준 기법).
//   두껍다고 느껴지면 줄이고, 잘 안 보이면 올린다.
//   작은 글자에 3px 은 외곽선이 글자를 잠식해 뭉개 보임 → 2.5 로 (얇고 또렷하게).
const LABEL_HALO_WIDTH = 2.5      // px
// 캔버스 SVG 라벨 서체 — 앱 본문과 같은 Pretendard.
//   system-ui/monospace(OS 기본) 보다 획이 가늘고 또렷해 지도 위 시인성이 좋다.
//   variable 폰트라 500 안팎의 중간 굵기를 정확히 쓸 수 있다 — "얇으면서 진한" 느낌.
const LABEL_FONT = "'Pretendard Variable', Pretendard, system-ui, sans-serif"
// 라벨 자간 — 약간 넓혀 글자가 서로 붙지 않게 (외곽선 번짐 방지 + 가독성).
//   0.02em 은 작은 글자에서 눈에 안 띔 → 0.06em 으로. 더 넓게/좁게는 이 값만 조정.
const LABEL_TRACKING = '0.14em'
// 시설 라벨 글자 변형 — 너비 0.75배(가로 압축)·높이 1.2배(세로 신장). 조밀한 장체.
const LABEL_SCALE_X = 0.75
const LABEL_SCALE_Y = 1.4

// 지도 모드 — fit 시 setBounds 가 잡는 기본 줌에서 추가 확대 단계 (LEVEL 낮을수록 확대).
const MAP_FIT_ZOOM_IN_STEPS = 2
// 지도 모드 — 시설 노드 배율. 배율 = MAP_NODE_SCALE_STEP ^ (기본 단계 + 줌 축소 단계).
//   MAP_NODE_BASE_SCALE_STEPS: 기준 줌에서도 항상 적용되는 기본 축소 단계.
//   지도를 기준 줌보다 축소(level 증가)하면 MAP_NODE_SCALE_MAX_STEPS 단계까지 추가로 작아지고,
//   그 이상은 최소 배율로 고정 — 너무 작아져 클릭/식별이 어려워지는 것 방지.
//   배율이 너무 작/크다고 느껴지면 STEP 을 1 에 가깝게(덜 축소) 하거나 단계 수를 조정한다.
const MAP_NODE_SCALE_STEP = 0.82       // 1 단계당 시설 배율
const MAP_NODE_BASE_SCALE_STEPS = 2    // 기준 줌에서의 기본 축소 단계
const MAP_NODE_SCALE_MAX_STEPS = 2     // 줌 축소를 따라가는 추가 단계 상한

// Phase 2.5 (2026-05-23) — Manhattan(직각) 라우팅 helper.
//   양 끝 anchor 의 side 정보로 케이블 경로점을 자동 생성.
//   - 카디널(N/S/E/W) anchor: 그 변에 수직 출구 (E/W → 수평, N/S → 수직) 유지하며 직각 꺾기.
//   - 'D' (대각선) anchor: Manhattan 적용 안 함 (직선 라우팅) → 빈 배열 반환.
//   - 둘 다 카디널: L자 (1 점) 또는 ㄷ자/ㅗ자 (2 점) 라우팅.
//   - 한쪽만 카디널: L자 (1 점) — 중심 쪽은 자유로 진입.
//   - 둘 다 중심: 빈 배열 (직선).
type ManhattanSide = 'N' | 'S' | 'E' | 'W' | 'D'
function manhattanRoute(
  from: { x: number; y: number; side?: ManhattanSide },
  to: { x: number; y: number; side?: ManhattanSide },
): { x: number; y: number }[] {
  // 대각선 anchor 면 직선
  if (from.side === 'D' || to.side === 'D') return []
  const fs = from.side
  const ts = to.side
  // 둘 다 중심 (anchor 없음) — V/H 정렬이면 직선, 아니면 L자 (1 waypoint).
  //   owner 요청 (2026-05-23): 모든 케이블이 V/H 만 보여야 함. 그리드 셀끼리 정렬되지 않은
  //   사이클 edge 도 L자로 꺾어 V/H 만 사용.
  if (!fs && !ts) {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const adx = Math.abs(dx)
    const ady = Math.abs(dy)
    if (adx < 5 || ady < 5) return [] // 거의 정렬 → 직선 OK
    // L자: 거리 긴 축을 먼저, 짧은 축을 나중에 (꺾임 1 번)
    if (adx >= ady) {
      return [{ x: to.x, y: from.y }] // H 먼저, 그 다음 V
    }
    return [{ x: from.x, y: to.y }] // V 먼저, 그 다음 H
  }

  const fromH = fs === 'E' || fs === 'W'
  const fromV = fs === 'N' || fs === 'S'
  const toH = ts === 'E' || ts === 'W'
  const toV = ts === 'N' || ts === 'S'

  // 한쪽만 카디널, 다른 쪽은 중심
  if (fs && !ts) {
    if (fromH) return [{ x: to.x, y: from.y }]
    return [{ x: from.x, y: to.y }]
  }
  if (!fs && ts) {
    if (toH) return [{ x: from.x, y: to.y }]
    return [{ x: to.x, y: from.y }]
  }

  // 둘 다 카디널
  if (fromH && toH) {
    // 둘 다 수평 출구
    if (fs === ts) {
      // 같은 변 (E-E or W-W): U-turn 라우팅
      const STUB = 40
      const farX =
        fs === 'E' ? Math.max(from.x, to.x) + STUB : Math.min(from.x, to.x) - STUB
      return [
        { x: farX, y: from.y },
        { x: farX, y: to.y },
      ]
    }
    // 반대 변 (E-W or W-E): H-V-H 중점 꺾기
    const midX = (from.x + to.x) / 2
    return [
      { x: midX, y: from.y },
      { x: midX, y: to.y },
    ]
  }
  if (fromV && toV) {
    // 둘 다 수직 출구
    if (fs === ts) {
      const STUB = 40
      const farY =
        fs === 'S' ? Math.max(from.y, to.y) + STUB : Math.min(from.y, to.y) - STUB
      return [
        { x: from.x, y: farY },
        { x: to.x, y: farY },
      ]
    }
    const midY = (from.y + to.y) / 2
    return [
      { x: from.x, y: midY },
      { x: to.x, y: midY },
    ]
  }
  // 한쪽 H, 한쪽 V (수직 출구) → L자 1 waypoint
  if (fromH) {
    // from 수평, to 수직 — 엘보 (to.x, from.y)
    return [{ x: to.x, y: from.y }]
  }
  // from 수직, to 수평 — 엘보 (from.x, to.y)
  return [{ x: from.x, y: to.y }]
}

// polyline 의 arc-length 비율(0~1) 위치 점 — 고장점 마커용
function pointAlongPolyline(
  pts: { x: number; y: number }[],
  fraction: number,
): { x: number; y: number } {
  if (pts.length === 0) return { x: 0, y: 0 }
  if (pts.length === 1) return pts[0]
  const segLens: number[] = []
  let total = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const d = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y)
    segLens.push(d)
    total += d
  }
  if (total === 0) return pts[0]
  let target = Math.min(1, Math.max(0, fraction)) * total
  for (let i = 0; i < segLens.length; i++) {
    if (target <= segLens[i]) {
      const t = segLens[i] === 0 ? 0 : target / segLens[i]
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * t,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * t,
      }
    }
    target -= segLens[i]
  }
  return pts[pts.length - 1]
}

// SVG 텍스트 폭 추정 — 한글·CJK(전각) ≈ 1.0×fontSize, ASCII ≈ 0.58×fontSize.
//   설치 순번 배지를 시설명 앞에 정확히 붙이기 위한 근사값.
function estimateTextWidth(text: string, fontSize: number): number {
  let w = 0
  for (const ch of text) {
    w += fontSize * (ch.charCodeAt(0) > 0x1100 ? 1.0 : 0.58)
  }
  return w
}

// 케이블 라인 스타일 산출 — LGU+ 표준 범례 적용 (2026-05-20)
//   - 색(stroke): 기설 = 검정 / 그 외 = 케이블 규격 (cableSpecColor — 1C~12C 빨강 / 13C~36C 청록 / ...)
//   - dash: 설치 구분 (installationTypeDash — 가공/구내/해저 solid · 입상 dotted · 지중 dashed)
//   - width·opacity: 상태 (기설 가장 두껍게 · 신설 두껍게 · 철거 흐리게)
function edgeStyle(
  spec: string,
  status: CableStatus,
  installationType: CableInstallationType | null,
): { stroke: string; dash: string; width: number; opacity: number } {
  // 기설 케이블은 규격 색 대신 일괄 검정 (owner 결정 2026-05-21)
  const stroke =
    status === 'existing'
      ? '#111827'
      : cableSpecColor(spec as Parameters<typeof cableSpecColor>[0])
  const dash = installationTypeDash(installationType)
  let width = 1.8
  let opacity = 1
  if (status === 'existing') width = 3.4
  else if (status === 'new') width = 2.6
  else if (status === 'relocating') width = 2.2
  else if (status === 'removing') {
    width = 1.4
    opacity = 0.45
  }
  return { stroke, dash, width, opacity }
}

// 시설 색 — 도면(FacilityShape)과 동일.
//   접속함체: 기설=검정·신설=빨강.
//   RN/IJP: 기설=검정·신설=종류별 표준 색.
//   그 외: 종류별 표준 색.
function facilityDiagramColor(closureType: ClosureType, installStatus: string): string {
  if (CLOSURE_TYPE_CATEGORY[closureType] === '접속함체') {
    return installStatus === 'existing' ? '#111827' : '#dc2626'
  }
  if (hasInstallStatus(closureType)) {
    // RN/IJP — 기설이면 검정, 신설이면 종류별 표준 색
    return installStatus === 'existing' ? '#111827' : CLOSURE_TYPE_COLOR[closureType]
  }
  return CLOSURE_TYPE_COLOR[closureType]
}

// 폭발형 별(starburst) 꼭짓점 — 절단 절체 케이블 표시.
//   접속함체 원형과 확실히 구분되도록 뾰족한 폭발 모양. 바깥 꼭짓점 길이를
//   번갈아(길게·짧게) 둬 폭발 느낌을 준다.
function burstPoints(cx: number, cy: number): string {
  const spikes = 10
  const outer = 11
  const outerShort = 7.5
  const inner = 4.5
  const step = Math.PI / spikes
  const pts: string[] = []
  let a = -Math.PI / 2
  for (let i = 0; i < spikes * 2; i++) {
    const r =
      i % 2 === 1 ? inner : (i / 2) % 2 === 0 ? outer : outerShort
    pts.push(
      `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`,
    )
    a += step
  }
  return pts.join(' ')
}


// 케이블 연결 시 자동 정렬 — 시설을 허브(접속함체) 둘레 8슬롯에 배치.
//   슬롯 우선순위: 수평·수직 4방향(우·좌·상·하) → 대각 4방향(좌상·우상·좌하·우하).
//   허브 케이블이 1~2조면 일직선(2번째는 1번째 반대편), 3조 이상은 우선순위 순.
const AUTO_PLACE_DISTANCE = 180 // 허브 ↔ 위성 노드 간격(px)
// 슬롯 0~7 의 그리드 방향 (x: 우 +, y: 아래 +)
const SLOT_VECTORS: { x: number; y: number }[] = [
  { x: 1, y: 0 }, // 0 우
  { x: -1, y: 0 }, // 1 좌
  { x: 0, y: -1 }, // 2 상
  { x: 0, y: 1 }, // 3 하
  { x: -1, y: -1 }, // 4 좌상
  { x: 1, y: -1 }, // 5 우상
  { x: -1, y: 1 }, // 6 좌하
  { x: 1, y: 1 }, // 7 우하
]
const SLOT_OPPOSITE = [1, 0, 3, 2, 7, 6, 5, 4]

// 허브 기준 방향 벡터 → 가장 가까운 8방위 슬롯 인덱스
function nearestSlot(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 0
  let s = Math.round(Math.atan2(dy, dx) / (Math.PI / 4))
  s = ((s % 8) + 8) % 8 // 0우 1우하 2하 3좌하 4좌 5좌상 6상 7우상
  return [0, 7, 3, 6, 1, 4, 2, 5][s]
}

// 우선순위(0..7) 순으로 비어 있는 첫 슬롯
function firstFreeSlot(occupied: Set<number>): number {
  for (let i = 0; i < 8; i++) if (!occupied.has(i)) return i
  return 0
}


export default function TopologyCanvas({
  projectId,
  projectCategory,
  subscriptionId,
  subscriberName,
  projectDesignerId,
  facilities,
  cables,
  editable,
  facilityMasters,
  taskTypes,
  facilityTasks,
  facilityMaterials,
  circuits,
  coreAssignments,
  myEmployeeId,
  initialCanvasSize,
  tabPanel,
  tabPanelDefaultOpen,
}: {
  projectId: string
  // 공사 분류 — '청약' 일 때 도식 모드에서 케이블 클릭 시 사용코어 입력 popover 노출.
  //   '계획'/'지장이설'/null/undefined 는 기존 흐름.
  projectCategory?: '청약' | '계획' | '지장이설' | null
  // 청약ID — popover 가 회선 생성에 사용. category='청약' 일 때만 의미 있음.
  subscriptionId?: string | null
  // 가입자명 — 회선의 subscriber_name 으로 자동 채움.
  subscriberName?: string | null
  // 프로젝트의 설계자 employee.id — popover 의 entered_role 기본값 판정
  //   (current user.id === designerId 면 'designer', 아니면 'worker')
  projectDesignerId?: string | null
  facilities: FacilityNode[]
  cables: CableEdge[]
  editable: boolean
  facilityMasters?: FacilityMasterMini[]
  taskTypes?: TaskTypeOption[]
  facilityTasks?: FacilityTaskRow[]
  facilityMaterials?: FacilityMaterialRow[]
  circuits?: FaultSearchCircuit[]
  coreAssignments?: CanvasCoreAssignment[]
  // 본인 employees.id — 케이블 정렬·그래프 자동 배치 시 본인 작업분만 적용용.
  //   다중 작업 시 다른 사람 시설 위치가 안 틀어지게.
  myEmployeeId?: string | null
  // 캔버스 표시 영역 시작 크기 — 전용 캔버스 라우트는 'tall' 로 크게 연다.
  initialCanvasSize?: 'compact' | 'normal' | 'tall' | 'fullscreen'
  // 지장이설 탭 메뉴(시설·케이블·회선·...) — 캔버스 위 오버레이로 표시.
  //   page.tsx 에서 탭 내비+콘텐츠를 넘긴다. 전용 캔버스 라우트는 안 넘김.
  tabPanel?: ReactNode
  tabPanelDefaultOpen?: boolean
}) {
  const router = useRouter()

  // 도식(schematic) / 지도(map) 모드.
  //   지도 모드 = 카카오맵을 SVG 캔버스 뒤 배경으로 깔고, 시설을 GPS 좌표로 투영해 배치.
  //   도식 모드는 기존 동작 그대로 — 모든 분기는 `mode === 'map'` 별도 경로.
  //   기본값 = 지도 (owner 요청 2026-05-22) — 설계 진입 시 바로 지도가 열린다.
  const [mode, setMode] = useState<'schematic' | 'map'>('map')
  const {
    setContainer: mapSetContainer,
    map: kakaoMap,
    status: mapStatus,
    error: mapError,
    epoch: mapEpoch,
  } = useKakaoMap(mode === 'map')

  // 지도 모드 (Phase 2) — 시설 배치·드래그.
  //   mapDragPos: 지도에서 시설을 드래그하는 동안의 임시 픽셀 override.
  //     드롭 후 lat/lng 저장 → 다음 지도 이동 때 정리되어 GPS 투영으로 복귀.
  //   placingId: 「배치」를 누른 미배치 시설 — 다음 지도 클릭으로 위치 지정.
  const [mapDragPos, setMapDragPos] = useState<Record<string, { x: number; y: number }>>({})
  const [placingId, setPlacingId] = useState<string | null>(null)
  const [showUnplaced, setShowUnplaced] = useState(false)
  // 지도 모드 검색창 보임/숨김 — 툴바의 「검색」 토글로 제어
  const [searchVisible, setSearchVisible] = useState(true)
  // 지도 모드 타일 종류 — 일반 도로지도 / 위성+도로명 라벨 (HYBRID).
  //   순수 SKYVIEW(도로명 없음) 는 시설 식별이 어려워 미노출. 필요 시 추후 확장.
  const [mapTypeId, setMapTypeId] = useState<'roadmap' | 'hybrid'>('roadmap')
  // 캔버스 시각 추가 확대 — 카카오 SDK 의 level 1 클램프 우회 (CSS transform scale).
  //   1 = 끄기, 1.25/1.5/2.0 단계. 편집은 그대로 가능하되 좌표가 미세하게 어긋날 수 있어
  //   새 시설 배치·드래그 좌표는 따로 scale 보정. 카카오 내부 pan 속도는 그대로라 사용감만 다름.
  const [extraZoom, setExtraZoom] = useState(1)
  const extraZoomActive = extraZoom > 1
  // 배경 흐림 강도 — 지도/위성 두 모드 공통. 0 = 원본 / 100 = 회색조 최대.
  //   슬라이더로 드래그 조정. grayscale·brightness·contrast 세 값을 같은 비율로 보간해
  //   하나의 직관 컨트롤로 묶음. 기본 70 (이전 always-on 과 유사한 강도).
  const [dimLevel, setDimLevel] = useState(70)
  // 지도 모드 분할 캡처 가이드 활성 여부
  const [captureActive, setCaptureActive] = useState(false)
  // 분할 캡처 컨트롤 바를 portal 로 렌더할 캔버스 아래 영역 (지도를 안 가리게)
  const [captureBarSlot, setCaptureBarSlot] = useState<HTMLDivElement | null>(null)
  // 지도 자동 캡처(화면 공유) 활성 여부
  const [autoCaptureActive, setAutoCaptureActive] = useState(false)
  // 자동 캡처 진행 중 — 시설 라벨을 화면에서 숨긴다 (캡처 후 또렷한 벡터로 다시 그림).
  const [labelsHiddenForCapture, setLabelsHiddenForCapture] = useState(false)
  // 캡처할 지도 영역 — 화면 공유 프레임에서 잘라낼 사각형 측정용
  const canvasAreaRef = useRef<HTMLDivElement | null>(null)
  // SketchOverlay 에 전달용 — ref 와 state 동시 갱신 (state 변화로 SketchOverlay 가 dep 갱신)
  const [canvasAreaEl, setCanvasAreaEl] = useState<HTMLDivElement | null>(null)
  const setCanvasAreaRef = useCallback((el: HTMLDivElement | null) => {
    canvasAreaRef.current = el
    setCanvasAreaEl(el)
  }, [])
  // 탭 메뉴(시설·케이블·회선·...) 오버레이 — 툴바 「탭 메뉴」 토글. ?tab= 있으면 기본 열림.
  const [tabPanelOpen, setTabPanelOpen] = useState(tabPanelDefaultOpen ?? false)

  // 지도 모드 시설 노드 줌 연동의 기준 줌 — fit 직후의 지도 level.
  //   이 level 보다 축소(level 증가)하면 시설 도형이 함께 작아진다.
  const [mapBaseLevel, setMapBaseLevel] = useState<number | null>(null)
  const placingIdRef = useRef<string | null>(null)
  useEffect(() => {
    placingIdRef.current = placingId
  }, [placingId])

  // 거리뷰 패널 열림 — 카카오 click 리스너(클로저 고정)에서 읽기 위한 ref
  const roadviewOpenRef = useRef(false)

  // addTool 의 최신값 — 카카오 클릭 리스너(클로저 고정)에서 읽기 위한 ref
  const addToolRef = useRef<ClosureType | null>(null)

  // 고장점 검색 하이라이트 (FaultSearchTab 이 context 로 전달)
  const { highlight } = useHighlight()
  const highlightFacilitySet = useMemo(
    () => new Set(highlight?.facilityIds ?? []),
    [highlight],
  )
  const highlightCableSet = useMemo(
    () => new Set(highlight?.cableIds ?? []),
    [highlight],
  )

  const initialPositions = useMemo(() => {
    const map = autoLayoutPositions(facilities)
    const obj: Record<string, { x: number; y: number }> = {}
    for (const [id, p] of map.entries()) obj[id] = { x: p.x, y: p.y }
    return obj
  }, [facilities])

  // positions = **사용자 드래그 override 만** 보관.
  // initialPositions (서버의 x_hint/y_hint 또는 auto layout) 과 합쳐 effectivePositions 로 사용.
  // → facilities 가 외부에서 변경되어도 (예: router.refresh 후 새 시설) 그 시설은
  //   initialPositions 에서 좌표를 얻으므로 캔버스에 즉시 표시됨.
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [dragging, setDragging] = useState<string | null>(null)
  // 좌클릭 드래그 중 활성 정렬 가이드 — 다른 시설과 x/y 가 맞을 때 점선 표시
  const [snapGuide, setSnapGuide] = useState<{ x: number | null; y: number | null } | null>(null)
  // 시설명 라벨 드래그 offset — 로컬 override (서버 저장 전 부드러운 드래그용)
  const [labelOffsets, setLabelOffsets] = useState<
    Record<string, { dx: number; dy: number }>
  >({})
  const labelDragRef = useRef<{
    id: string
    startX: number
    startY: number
    startDx: number
    startDy: number
    hasMoved: boolean
  } | null>(null)

  // 케이블 경로 편집 — 선택된 케이블의 중간 waypoint 를 드래그/추가/삭제.
  //   selectedCableId: 현재 경로 편집 중인 케이블
  //   cableWaypoints: 로컬 override (서버 저장 전 부드러운 드래그용 — positions 와 같은 패턴)
  const [selectedCableId, setSelectedCableId] = useState<string | null>(null)
  // 청약 popover 가시 상태 — selectedCableId 와 별개로 X 닫기 가능.
  //   selectedCableId 변경 시 자동으로 따라가지만, popover X 누르면 popover 만 닫힘.
  //   (owner 2026-05-25 — popover 닫기로 정보 패널까지 사라지지 않게)
  const [subscriptionPopoverCableId, setSubscriptionPopoverCableId] = useState<
    string | null
  >(null)
  useEffect(() => {
    // 선택 케이블 바뀌면 popover 도 동기화 — 새 케이블 클릭 시 자동으로 popover 열림.
    setSubscriptionPopoverCableId(selectedCableId)
  }, [selectedCableId])
  const [cableWaypoints, setCableWaypoints] = useState<Record<string, Waypoint[]>>({})
  const waypointDragRef = useRef<{
    cableId: string
    index: number
    startX: number
    startY: number
    offsetX: number
    offsetY: number
    hasMoved: boolean
  } | null>(null)

  const effectivePositions = useMemo(() => {
    const result: Record<string, { x: number; y: number }> = {}
    if (mode === 'map') {
      // 지도 모드 — 각 시설의 GPS 좌표를 화면 픽셀로 투영.
      //   containerPointFromCoords 는 시설 「중심」 픽셀을 준다. 노드 transform 은
      //   좌상단 기준이므로 NODE_SIZE 절반을 빼 도식 모드의 중심 계산과 맞춘다.
      const m = kakaoMap
      if (!m) return result
      const proj = m.getProjection()
      for (const f of facilities) {
        // 드래그 중인 시설은 임시 픽셀 override 우선
        const override = mapDragPos[f.id]
        if (override) {
          result[f.id] = override
          continue
        }
        if (f.lat == null || f.lng == null) continue
        const pt = proj.containerPointFromCoords(new kakao.maps.LatLng(f.lat, f.lng))
        result[f.id] = {
          x: pt.x - NODE_SIZE.width / 2,
          y: pt.y - NODE_SIZE.height / 2 + 10,
        }
      }
      return result
    }
    for (const f of facilities) {
      result[f.id] = positions[f.id] ?? initialPositions[f.id] ?? { x: 0, y: 0 }
    }
    return result
    // mapEpoch = 지도 이동 카운터. getProjection() 이 가변 상태를 읽어 린터가
    // 의존성 필요성을 못 보므로 명시적으로 포함 (지도 pan/zoom 시 재투영 필수).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, facilities, positions, initialPositions, kakaoMap, mapEpoch, mapDragPos])

  // 지도 모드 시설 노드 배율 — 기본 축소 단계 + 기준 줌보다 축소한 만큼 추가 축소.
  //   도식 모드는 항상 1 (축소 없음). 확대(level 감소)는 추가 축소 없이 기본 배율 유지.
  //   추가 축소는 MAP_NODE_SCALE_MAX_STEPS 단계까지, 이후는 최소 배율로 고정.
  //   사용자 추가 확대(extraZoom>1) 적용 시 1/extraZoom 역보정 — 시설 도형 시각 크기 고정.
  const mapNodeScale = useMemo(() => {
    if (mode !== 'map') return 1
    let extra = 0
    if (kakaoMap && mapBaseLevel != null) {
      const delta = kakaoMap.getLevel() - mapBaseLevel  // > 0 = 기준보다 축소
      if (delta > 0) extra = Math.min(delta, MAP_NODE_SCALE_MAX_STEPS)
    }
    const base = MAP_NODE_SCALE_STEP ** (MAP_NODE_BASE_SCALE_STEPS + extra)
    return base / extraZoom
    // mapEpoch = 지도 줌/이동 카운터. getLevel() 은 가변 상태라 명시 의존성 필요.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, kakaoMap, mapBaseLevel, mapEpoch, extraZoom])

  const cableById = useMemo(() => new Map(cables.map((c) => [c.id, c])), [cables])

  // 케이블 waypoints — 로컬 override 우선, 없으면 서버 props.
  //   도식 모드는 waypoints(x/y), 지도 모드는 mapWaypoints(lat/lng) — 완전 분리.
  const effectiveWaypoints = useCallback(
    (cableId: string): Waypoint[] => {
      const override = cableWaypoints[cableId]
      if (override) return override
      const c = cableById.get(cableId)
      if (!c) return []
      return (mode === 'map' ? c.mapWaypoints : c.waypoints) ?? []
    },
    [cableWaypoints, cableById, mode],
  )

  // 모드 전환 시 경로점 로컬 override 비움 — 모드마다 경로점 컬럼이 다르므로.
  useEffect(() => {
    setCableWaypoints({})
  }, [mode])

  // cableOffsetInfo (segment-level overlap 기반) 은 라우팅 후 (rawCablePaths 정의 후) 계산.
  //   여기에선 useMemo 직접 접근만. 정의는 cableAnchors 다음 (line ~1900) 으로 이동.

  // 시설별 연결된 케이블 수 (노드 배지 — 동일 시설 연결 직관 확인)
  const facilityCableCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of cables) {
      m.set(c.from_facility_id, (m.get(c.from_facility_id) ?? 0) + 1)
      m.set(c.to_facility_id, (m.get(c.to_facility_id) ?? 0) + 1)
    }
    return m
  }, [cables])

  // 설치 순번 — 모든 시설 종류의 시설명 앞 녹색 원 배지 번호.
  //   설계자가 정보 패널에서 지정한 install_order 우선, 없으면 생성 순서로 자동 배정.
  //   단, 기설 케이블 한 조만 연결된 시설은 제외 (작업 지점이 아님). 신설 한 조는 포함.
  const installNoByFacility = useMemo(() => {
    // 시설별 연결 케이블 목록
    const byFacility = new Map<string, CableEdge[]>()
    for (const c of cables) {
      for (const fid of [c.from_facility_id, c.to_facility_id]) {
        const arr = byFacility.get(fid)
        if (arr) arr.push(c)
        else byFacility.set(fid, [c])
      }
    }
    const eligible = facilities.filter((f) => {
      if (!isInstallNumbered(f.closure_type)) return false
      const conns = byFacility.get(f.id) ?? []
      // 기설 케이블 한 조만 연결된 시설은 제외
      if (conns.length === 1 && conns[0].status === 'existing') return false
      return true
    })
    return computeInstallNumbers(
      eligible.map((f) => ({
        id: f.id,
        install_order: f.install_order,
        created_at: f.created_at,
      })),
    )
  }, [facilities, cables])

  // 절단 절체 — 기설 케이블이 신설 접속함체에 연결된 경우.
  //   기설 케이블을 잘라(절단) 새 함체로 인입·접속(절체)해야 한다.
  const cutover = useMemo(
    () => findCutoverCables(cables, facilities),
    [cables, facilities],
  )

  // 자동 캡처용 시설 라벨 데이터 — 캡처 후 또렷한 벡터로 다시 그릴 때 사용.
  //   MapAutoCapture 에 안정적 참조로 넘긴다 (매 렌더 새 배열이면 내부 useMemo 가 깨짐).
  //   지도 자동 캡처라 지도 모드 전용 라벨 offset 사용 (도식·지도 분리됨).
  const captureFacilities = useMemo(
    () =>
      facilities.map((f) => ({
        lat: f.lat,
        lng: f.lng,
        code: f.facility_code || formatFacilityCode(f.closure_type, f.seq_no),
        name: f.name,
        isNew:
          CLOSURE_TYPE_CATEGORY[f.closure_type] === '접속함체' &&
          f.install_status === 'new',
        installNo: installNoByFacility.get(f.id) ?? null,
        labelDx: f.label_dx_map,
        labelDy: f.label_dy_map,
      })),
    [facilities, installNoByFacility],
  )

  // 케이블별 회선·코어 배정 수 (케이블 라벨 배지)
  const coreCountByCable = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of coreAssignments ?? []) {
      m.set(a.cable_id, (m.get(a.cable_id) ?? 0) + 1)
    }
    return m
  }, [coreAssignments])

  // Phase 5 (2026-05-23) — 케이블별 사용 코어 라벨 문자열.
  //   "1~24" (연속) · "5,8,15,17" (불연속) · "1~6,12~18" (혼합) 자동 포맷.
  //   접속함체 결선도 표현용. 도식 모드에서 케이블 spec 위쪽에 표시.
  // 청약 모드 (owner 2026-05-25): 설계자/작업자 entered_role 별로 분리 라벨.
  //   기존 단일 coresByCable 외에 coresByCableByRole 도 노출.
  const coresByCable = useMemo(() => {
    const collect = new Map<string, number[]>()
    for (const a of coreAssignments ?? []) {
      if (!collect.has(a.cable_id)) collect.set(a.cable_id, [])
      collect.get(a.cable_id)!.push(a.core_range_start)
    }
    const result = new Map<string, string>()
    for (const [cableId, cores] of collect.entries()) {
      const sorted = [...new Set(cores)].sort((a, b) => a - b)
      if (sorted.length === 0) continue
      const parts: string[] = []
      let runStart = sorted[0]
      let runEnd = sorted[0]
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === runEnd + 1) {
          runEnd = sorted[i]
        } else {
          parts.push(runStart === runEnd ? `${runStart}` : `${runStart}~${runEnd}`)
          runStart = sorted[i]
          runEnd = sorted[i]
        }
      }
      parts.push(runStart === runEnd ? `${runStart}` : `${runStart}~${runEnd}`)
      result.set(cableId, parts.join(','))
    }
    return result
  }, [coreAssignments])

  // 청약 — 역할별 라벨 (designer / worker). 케이블 위에 두 줄로 표시.
  //   lifecycle='new' (신설) 만 케이블 라벨에 표시. 'preexisting'(기설) 은 정보패널만.
  //   (owner 결정 2026-05-25 — 기설은 캔버스 잡음 줄임)
  const coresByCableByRole = useMemo(() => {
    const collectD = new Map<string, number[]>()
    const collectW = new Map<string, number[]>()
    for (const a of coreAssignments ?? []) {
      if (a.lifecycle === 'preexisting') continue // 기설은 캔버스 라벨 제외
      const target = a.entered_role === 'designer' ? collectD : collectW
      if (!target.has(a.cable_id)) target.set(a.cable_id, [])
      target.get(a.cable_id)!.push(a.core_range_start)
    }
    function format(cores: number[]): string {
      const sorted = [...new Set(cores)].sort((a, b) => a - b)
      if (sorted.length === 0) return ''
      const parts: string[] = []
      let runStart = sorted[0]
      let runEnd = sorted[0]
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === runEnd + 1) {
          runEnd = sorted[i]
        } else {
          parts.push(runStart === runEnd ? `${runStart}` : `${runStart}~${runEnd}`)
          runStart = sorted[i]
          runEnd = sorted[i]
        }
      }
      parts.push(runStart === runEnd ? `${runStart}` : `${runStart}~${runEnd}`)
      return parts.join(',')
    }
    const result = new Map<string, { designer: string; worker: string }>()
    const allIds = new Set([...collectD.keys(), ...collectW.keys()])
    for (const cableId of allIds) {
      result.set(cableId, {
        designer: format(collectD.get(cableId) ?? []),
        worker: format(collectW.get(cableId) ?? []),
      })
    }
    return result
  }, [coreAssignments])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  // 시설 「작업내역입력」 popover — 청약 모드 전용. 시설 선택과 별도 토글.
  //   시설 선택 시 popover 열림. popover 안 클릭으로 잘못 닫히는 것 방지 위해
  //   selectedId 가 null 로 바뀌어도(deselect) popover 는 자체 X 버튼으로만 닫힘.
  //   다른 시설로 바뀌면 popover 도 그 시설로 이동.
  const [facilityTaskPopoverId, setFacilityTaskPopoverId] = useState<string | null>(null)
  useEffect(() => {
    if (selectedId) setFacilityTaskPopoverId(selectedId)
  }, [selectedId])
  const [pendingConnection, setPendingConnection] = useState<
    { fromId: string; toId: string } | null
  >(null)

  // 추가 모드 상태 — 도구 패널 chip 클릭으로 ON. 캔버스/지도 클릭 시 그 위치에 시설 임시 배치.
  const [addTool, setAddTool] = useState<ClosureType | null>(null)
  const [pendingPlacement, setPendingPlacement] = useState<PendingPlacement | null>(null)
  useEffect(() => {
    addToolRef.current = addTool
  }, [addTool])

  // 광케이블 도구 — 시설 도구와 상호 배타. 선택 시 시설 2 개 클릭으로 케이블 연결 모달
  // 띄울 때 규격으로 prefill.
  const [cableTool, setCableTool] = useState<CableSpec | null>(null)

  // 선택 도구 — 도식 모드 전용. 빈 영역 드래그로 사각 범위 안 시설 다중 선택.
  //   선택 후 선택된 시설 중 하나 드래그 = 선택 전체 같은 delta 로 이동 (그룹 이동).
  //   addTool / cableTool 과 상호 배타. 2026-05-24 owner 요청.
  const [selectTool, setSelectTool] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  // 사각 선택 드래그 — SVG 좌표계 (viewport 변환된 좌표). 진행 중에만 ref → null 아님.
  const marqueeRef = useRef<{
    startX: number
    startY: number
    hasMoved: boolean
  } | null>(null)
  // 진행 중 marquee 사각형 — 렌더용. ref 와 동기화.
  const [marquee, setMarquee] = useState<{
    x: number
    y: number
    w: number
    h: number
  } | null>(null)
  // 그룹 드래그 — selectedIds 중 하나를 드래그하면 모든 선택 시설의 시작 좌표 캐시.
  //   delta 만큼 평행 이동 후 onPointerUp 에서 saveNodePositions 일괄 호출.
  //   양 끝 모두 선택된 케이블의 사용자 경로점(waypoints)도 같은 delta 이동 — 그렇지
  //   않으면 함체는 옮겨졌는데 경로점만 원래 위치에 남아 케이블이 꺾여 보임.
  //   pole_name·dist 메타 보존 (spread 로 x/y 만 교체).
  const groupDragRef = useRef<{
    anchorId: string  // 사용자가 잡은 시설
    startPositions: Map<string, { x: number; y: number }>
    startCableWaypoints: Map<string, Waypoint[]>  // cableId → 시작 waypoints (메타 포함)
    hasMoved: boolean
  } | null>(null)

  // LGU+ 표준 범례 모달
  const [legendOpen, setLegendOpen] = useState(false)

  // 정보 패널(케이블·접속함체) 접기 상태 — 캔버스 작업 공간 확보용.
  // 케이블·시설 패널은 동시에 1개만 뜨므로 공유 상태 1개. 선택 바꿔도 유지.
  //   청약 카테고리 (owner 2026-05-25): 케이블 선택 시 정보 패널은 기본 접힘.
  //     popover 가 사용 코어 입력을 담당. 패널이 필요하면 사용자가 펼침.
  const [infoPanelCollapsed, setInfoPanelCollapsed] = useState(
    projectCategory === '청약',
  )

  // 실사(sketch) — 지도/위성/거리뷰 위에 펜으로 그림판처럼 그림.
  //   메모리 휘발 (페이지 떠나면 사라짐). Phase 2 에서 화면 캡처→시설 첨부 저장 예정.
  //   단일 sketchStrokes — 지도+거리뷰 영역 통합, 화면 픽셀 좌표.
  //   그리기 모드 ON 시 지도 pan/zoom 잠금 + SketchOverlay 가 pointer 이벤트 캡처.
  const [sketchMode, setSketchMode] = useState(false)
  // 단일 strokes — 지도+거리뷰 영역 구분 없이 한 그림판 (owner 요청 2026-05-24).
  //   좌표는 화면 픽셀 통일. sketchMode 활성 동안 지도 pan/zoom 잠금 + 캔버스
  //   컨테이너 전체 (거리뷰 패널 포함) 위에 단일 SketchOverlay 가 pointer 캡처.
  const [sketchStrokes, setSketchStrokes] = useState<
    import('./SketchOverlay').SketchStroke[]
  >([])
  // 텍스트 박스 — 캔버스 위 메모. 색은 펜 공유, 크기는 펜 굵기×6 (overlay 안 매핑).
  const [sketchTexts, setSketchTexts] = useState<
    import('./SketchOverlay').SketchText[]
  >([])
  const [sketchTool, setSketchTool] = useState<import('./SketchOverlay').SketchTool>('pen')
  const [sketchPen, setSketchPen] = useState<import('./SketchOverlay').SketchPen>({
    color: '#ef4444', // rose-500
    width: 3,
  })
  // 실사 저장 다이얼로그 — 시설 선택 + 화면 캡처 (getDisplayMedia) → Storage 업로드
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)

  // 드롭다운 위치 추적 — 트리거 버튼 아래에 fixed 로 띄우기 위함.
  //   overflow-x-auto 부모 안 absolute 패널은 잘리므로 fixed 로 우회.
  //   외부 클릭 시 자동 닫힘 (트리거 + data-panel-id 패널 안 클릭은 제외).
  function useFixedDropdown(
    panelId: string,
  ): {
    btnRef: React.MutableRefObject<HTMLButtonElement | null>
    pos: { top: number; right: number } | null
    open: boolean
    setOpen: React.Dispatch<React.SetStateAction<boolean>>
  } {
    const [open, setOpen] = useState(false)
    const btnRef = useRef<HTMLButtonElement | null>(null)
    const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
    useEffect(() => {
      if (!open) return
      function update() {
        const r = btnRef.current?.getBoundingClientRect()
        if (r) setPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
      }
      update()
      const onScroll = () => update()
      const onResize = () => update()
      window.addEventListener('scroll', onScroll, true)
      window.addEventListener('resize', onResize)
      function onDocPointer(e: PointerEvent) {
        const btn = btnRef.current
        const target = e.target as Node | null
        if (btn && target && btn.contains(target)) return
        const panel = (target as Element | null)?.closest?.(`[data-panel-id="${panelId}"]`)
        if (panel) return
        setOpen(false)
      }
      document.addEventListener('pointerdown', onDocPointer)
      return () => {
        window.removeEventListener('scroll', onScroll, true)
        window.removeEventListener('resize', onResize)
        document.removeEventListener('pointerdown', onDocPointer)
      }
    }, [open, panelId])
    return { btnRef, pos, open, setOpen }
  }

  // 「더보기」 dropdown
  const moreDD = useFixedDropdown('more')
  const moreBtnRef = moreDD.btnRef
  const morePos = moreDD.pos
  const moreOpen = moreDD.open
  const setMoreOpen = moreDD.setOpen
  // 「도면정렬」 dropdown (도식 모드)
  const layoutDD = useFixedDropdown('layout')
  // 「캡처」 dropdown (지도 모드)
  const captureDD = useFixedDropdown('capture')

  // 실사정보 배치 모드 — sketchMode 안에서 활성. 캔버스 좌클릭 시 그 위치에
  //   '실사정보' 시설 즉시 등록 (이름 자동 「실사{seq}」, 모달 X).
  //   기존 펜/T 도구와 상호 배타 (sketchTool 은 그대로 두고 별도 플래그).
  const [inspectionPlaceMode, setInspectionPlaceMode] = useState(false)
  const inspectionPlaceRef = useRef(false)
  // 실사 모드 세션 동안 배치한 실사정보 시설 카운트 (실사 모드 토글 시 초기화).
  //   실사 버튼 옆 배지 = strokes + texts + 이 카운트.
  const [sketchInspectionCount, setSketchInspectionCount] = useState(0)
  useEffect(() => {
    inspectionPlaceRef.current = inspectionPlaceMode
  }, [inspectionPlaceMode])

  // 거리뷰 패널 — 지도 모드 우측 컬럼. 시설 선택 또는 지도 클릭 시 그 좌표의 카카오 거리뷰.
  //   roadviewOpen 켜져 있으면 시설/케이블/고장점 패널을 가리고 거리뷰가 표시됨 (상호 배타).
  //   roadviewPos = 마지막으로 요청된 좌표. null 이면 안내 메시지만 표시.
  const [roadviewOpen, setRoadviewOpen] = useState(false)
  const [roadviewPos, setRoadviewPos] = useState<{ lat: number; lng: number } | null>(null)
  const [roadviewTitle, setRoadviewTitle] = useState<string | null>(null)
  const [roadviewCollapsed, setRoadviewCollapsed] = useState(false)
  useEffect(() => {
    roadviewOpenRef.current = roadviewOpen
  }, [roadviewOpen])

  // 고장점 검색 패널 — 캔버스 우측. 회선(코어연결) 기준.
  //   선택 드릴다운: 시설물 → 케이블 → 코어선번(회선).
  const [faultSearchOpen, setFaultSearchOpen] = useState(false)
  const [faultFacilityId, setFaultFacilityId] = useState('')
  const [faultCableId, setFaultCableId] = useState('')
  const [faultCircuitId, setFaultCircuitId] = useState('')
  const [faultPanelCollapsed, setFaultPanelCollapsed] = useState(false)
  const [faultPanelWidth, setFaultPanelWidth] = useState(340)

  // 캔버스 표시 영역 크기 — owner 요청 (광범위 작업 시 확장/축소).
  //   compact: 40vh · normal: 75vh (기본) · tall: 90vh · fullscreen: 화면 전체 (fixed inset-0)
  type CanvasSize = 'compact' | 'normal' | 'tall' | 'fullscreen'
  const CANVAS_SIZE_ORDER: CanvasSize[] = ['compact', 'normal', 'tall', 'fullscreen']
  const CANVAS_SIZE_HEIGHT: Record<CanvasSize, string> = {
    compact: '40vh',
    normal: '75vh',
    tall: '90vh',
    fullscreen: '100vh',
  }
  const CANVAS_SIZE_LABEL: Record<CanvasSize, string> = {
    compact: '작게',
    normal: '보통',
    tall: '크게',
    fullscreen: '전체',
  }
  const [canvasSize, setCanvasSize] = useState<CanvasSize>(initialCanvasSize ?? 'normal')

  const expandCanvas = () => {
    const idx = CANVAS_SIZE_ORDER.indexOf(canvasSize)
    if (idx < CANVAS_SIZE_ORDER.length - 1) setCanvasSize(CANVAS_SIZE_ORDER[idx + 1])
  }
  const shrinkCanvas = () => {
    const idx = CANVAS_SIZE_ORDER.indexOf(canvasSize)
    if (idx > 0) setCanvasSize(CANVAS_SIZE_ORDER[idx - 1])
  }

  // fullscreen 일 때 ESC 키로 normal 복귀
  useEffect(() => {
    if (canvasSize !== 'fullscreen') return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setCanvasSize('normal')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canvasSize])

  // 선택 도구 ON 시 ESC 로 해제 + 선택 비움 (다중 선택 흐름 빠른 취소)
  useEffect(() => {
    if (!selectTool) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSelectTool(false)
        setSelectedIds(new Set())
        setMarquee(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectTool])

  // 카테고리별 펼침 상태 — 처음엔 「국사」·「접속함체」만 펼침
  const [openCategories, setOpenCategories] = useState<Record<ClosureCategory, boolean>>({
    국사: true,
    설치장소: false,
    모바일국소: false,
    접속함체: true,
    RN_IJP_광MUX: false,
  })
  const groupedTypes = useMemo(() => groupClosureTypesByCategory(), [])

  // 시설 추가 도구 패널 접기 상태 — owner 요청 (2026-05-20):
  //   "시설을 선택할 때는 펼쳐서 선택, 그리기 할 때는 접어서 그리기"
  //   → 시설 종류 chip 클릭 시 자동 접힘. 다시 펼치려면 헤더 클릭.
  //   기본값 접힘 — 진입 시 캔버스에 바로 집중 (owner 요청).
  const [toolsCollapsed, setToolsCollapsed] = useState(true)

  // 광케이블 카테고리 펼침 상태 (시설 카테고리 openCategories 와 별개)
  const [cableCatOpen, setCableCatOpen] = useState(false)

  // 좌측 시설 목록 사이드바 — 클릭 시 해당 시설 위치로 캔버스 이동.
  //   기본값 접힘 — 진입 시 캔버스에 바로 집중 (owner 요청).
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)

  // 시설 목록 정렬 기준 — 사이드바 상단 드롭다운으로 선택.
  type FacilitySortKey = 'code' | 'install' | 'status' | 'name'
  const [facilitySort, setFacilitySort] = useState<FacilitySortKey>('code')

  // 카테고리별 시설 그룹 (좌측 사이드바용). 그룹 안에서 facilitySort 로 정렬.
  const facilitiesByCategory = useMemo(() => {
    const g: Record<ClosureCategory, FacilityNode[]> = {
      국사: [],
      설치장소: [],
      모바일국소: [],
      접속함체: [],
      RN_IJP_광MUX: [],
    }
    for (const f of facilities) {
      g[CLOSURE_TYPE_CATEGORY[f.closure_type]].push(f)
    }
    const byCode = (a: FacilityNode, b: FacilityNode) => a.seq_no - b.seq_no
    // 배지 번호순 — 배지 있는 시설 먼저(오름차순), 없는 시설은 뒤에 시설번호순
    const byInstall = (a: FacilityNode, b: FacilityNode) => {
      const na = installNoByFacility.get(a.id)
      const nb = installNoByFacility.get(b.id)
      if (na != null && nb != null) return na !== nb ? na - nb : byCode(a, b)
      if (na != null) return -1
      if (nb != null) return 1
      return byCode(a, b)
    }
    for (const cat of Object.keys(g) as ClosureCategory[]) {
      g[cat].sort((a, b) => {
        if (facilitySort === 'name') {
          const c = a.name.localeCompare(b.name, 'ko')
          return c !== 0 ? c : byCode(a, b)
        }
        if (facilitySort === 'install') {
          return byInstall(a, b)
        }
        if (facilitySort === 'status') {
          // 기설 먼저, 신설 나중. 같은 구분 안에서는 배지 번호순 (2차 정렬)
          const sa = a.install_status === 'existing' ? 0 : 1
          const sb = b.install_status === 'existing' ? 0 : 1
          return sa !== sb ? sa - sb : byInstall(a, b)
        }
        return byCode(a, b)
      })
    }
    return g
  }, [facilities, facilitySort, installNoByFacility])

  // 클릭/드래그 구분용 ref — 이동 거리가 threshold 미만이면 click
  const interactionRef = useRef<{
    id: string
    button: number          // 0 = 좌클릭(정렬 스냅) · 그 외 = 우클릭 등(자유 이동)
    startX: number
    startY: number
    offsetX: number
    offsetY: number
    hasMoved: boolean
    pointerType: string     // 'touch' 면 모바일 — 임계값 ↑ + 저장 전 확인 다이얼로그
    origPos: { x: number; y: number }  // 드래그 시작 시 원 위치 — 취소 시 복원용
  } | null>(null)

  const svgRef = useRef<SVGSVGElement>(null)
  // SketchOverlay 가 메인 SVG 의 CTM 으로 좌표 변환할 수 있도록 state 로도 보관.
  //   refCallback 으로 마운트 시 한 번 setState (이후 ref·state 가 같은 element 가리킴).
  const [mainSvgElState, setMainSvgElState] = useState<SVGSVGElement | null>(null)
  const setSvgRef = useCallback((el: SVGSVGElement | null) => {
    svgRef.current = el
    setMainSvgElState(el)
  }, [])

  // ===== Viewport (zoom · pan) ============================================
  // viewBox = `${x} ${y} ${width} ${height}` 동적 갱신. 모든 좌표는 SVG 좌표계.
  //   - wheel: 마우스 위치 anchor 기준 줌 in/out (width·height 비례 축소)
  //   - 빈 영역 드래그: viewport.x/y 를 dx·dy 만큼 이동
  type Viewport = { x: number; y: number; width: number; height: number }

  const computeFitViewport = useCallback(
    (pos: Record<string, { x: number; y: number }>): Viewport => {
      const xs = Object.values(pos).map((p) => p.x)
      const ys = Object.values(pos).map((p) => p.y)
      if (xs.length === 0) return { x: 0, y: 0, width: 800, height: 500 }
      const minX = Math.min(...xs) - 40
      const minY = Math.min(...ys) - 40
      const maxX = Math.max(...xs) + NODE_SIZE.width + 40
      const maxY = Math.max(...ys) + NODE_SIZE.height + 40
      return {
        x: minX,
        y: minY,
        width: Math.max(maxX - minX, 400),
        height: Math.max(maxY - minY, 300),
      }
    },
    [],
  )

  const [viewport, setViewport] = useState<Viewport>(() =>
    computeFitViewport(initialPositions),
  )

  // 고장점 검색 하이라이트가 바뀌면(새 검색) 그 경로가 보이도록 viewport fit.
  // effectivePositions 는 ref 로 읽어 시설 드래그 때마다 재-fit 되는 것을 방지.
  const effPosRef = useRef<Record<string, { x: number; y: number }>>({})
  effPosRef.current = effectivePositions
  const highlightFacKey = highlight?.facilityIds.join(',') ?? ''
  useEffect(() => {
    if (!highlightFacKey) return
    const ids = highlightFacKey.split(',')
    if (mode === 'map') {
      // 지도 모드 — 하이라이트된 시설들의 GPS 범위로 지도 fit
      const m = kakaoMap
      if (!m) return
      const bounds = new kakao.maps.LatLngBounds()
      let count = 0
      for (const id of ids) {
        const f = facilities.find((x) => x.id === id)
        if (f && f.lat != null && f.lng != null) {
          bounds.extend(new kakao.maps.LatLng(f.lat, f.lng))
          count += 1
        }
      }
      if (count > 0) m.setBounds(bounds)
      return
    }
    const pos: Record<string, { x: number; y: number }> = {}
    for (const id of ids) {
      const p = effPosRef.current[id]
      if (p) pos[id] = p
    }
    if (Object.keys(pos).length > 0) setViewport(computeFitViewport(pos))
  }, [highlightFacKey, computeFitViewport, mode, kakaoMap, facilities])

  // 빈 영역 드래그 (pan) ref. SVG 좌표 변환 비율을 시작 시점에 캡처.
  const panRef = useRef<{
    startClientX: number
    startClientY: number
    startVx: number
    startVy: number
    scaleX: number
    scaleY: number
    hasMoved: boolean
  } | null>(null)

  // pan 드래그 직후 발생하는 click 을 무시하기 위한 flag (pointerup → click 순서)
  const recentlyPannedRef = useRef(false)

  // ===== 모바일 두 손가락 핀치 줌·팬 (도식 모드 전용) ====================
  // 카카오맵은 자체적으로 멀티터치 처리 → 지도 모드는 추가 코드 불필요.
  // 도식 모드는 SVG 자체 viewport 라 직접 처리.
  //   activeTouchesRef: 현재 화면에 닿아있는 touch pointer 들 (id → clientX,Y)
  //   pinchRef: 두 손가락 입력 시작 시 스냅샷 (거리·중점·viewport 4 값)
  const activeTouchesRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<{
    startDist: number
    startMidX: number
    startMidY: number
    startVx: number
    startVy: number
    startVw: number
    startVh: number
    rectLeft: number
    rectTop: number
    rectWidth: number
    rectHeight: number
    // CTM 기반 screen→SVG 비율 (시작 시점의 viewport 기준)
    //   letterbox 가 적용된 SVG 에서 단순 viewport.width/rect.width 대신 정확한 비율 사용
    screenToSvgX: number
    screenToSvgY: number
  } | null>(null)

  // 함체 기설/신설 자동 추론
  const facilityIsNew = useMemo(() => {
    const cablesByFacility = new Map<string, CableEdge[]>()
    for (const c of cables) {
      for (const fId of [c.from_facility_id, c.to_facility_id]) {
        if (!cablesByFacility.has(fId)) cablesByFacility.set(fId, [])
        cablesByFacility.get(fId)!.push(c)
      }
    }
    const result = new Map<string, boolean>()
    for (const f of facilities) {
      const conns = cablesByFacility.get(f.id) ?? []
      const hasExisting = conns.some((c) => c.status === 'existing')
      result.set(f.id, !hasExisting)
    }
    return result
  }, [facilities, cables])

  // viewBox — 도식 모드만 사용 (사용자 제어 viewport).
  //   지도 모드는 viewBox 를 생략한다 → SVG 자연 좌표계(1 user unit = 1 CSS px).
  //   containerPointFromCoords 가 주는 컨테이너 픽셀이 그대로 SVG 좌표가 되어
  //   별도 크기 측정 없이 정확히 정렬된다.
  const viewBoxStr = `${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`

  const toSvgCoord = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const result = pt.matrixTransform(ctm.inverse())
    return { x: result.x, y: result.y }
  }, [])

  // wheel — 마우스 위치 anchor 로 줌. React 의 onWheel 은 passive:true 이라
  // preventDefault 가 안 되니 native addEventListener 로 attach.
  // 지도 모드는 카카오맵이 휠 줌을 직접 처리하므로 리스너를 달지 않는다.
  useEffect(() => {
    if (mode === 'map') return
    const svg = svgRef.current
    if (!svg) return
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const { x: mx, y: my } = toSvgCoord(e.clientX, e.clientY)
      const factor = e.deltaY < 0 ? 1 / 1.15 : 1.15  // 위로 굴림 = 확대 (width 축소)
      setViewport((v) => {
        const minW = 200
        const maxW = 12000
        const newWidth = Math.max(minW, Math.min(maxW, v.width * factor))
        const newHeight = Math.max(minW * 0.75, Math.min(maxW * 0.75, v.height * factor))
        const actual = newWidth / v.width  // 실제 적용된 배수 (limit 에 걸렸을 때 보정)
        return {
          x: mx - (mx - v.x) * actual,
          y: my - (my - v.y) * actual,
          width: newWidth,
          height: newHeight,
        }
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [toSvgCoord, mode])

  // 지도 모드 — GPS 가 있는 시설들이 모두 보이도록 지도 fit.
  //   setBounds 가 잡는 기본 줌에서 MAP_FIT_ZOOM_IN_STEPS 만큼 더 확대한다.
  //   fit 직후 level 을 시설 노드 줌 연동의 기준(mapBaseLevel)으로 저장.
  const fitMapToFacilities = useCallback(() => {
    const m = kakaoMap
    if (!m) return
    const withGps = facilities.filter(
      (f): f is FacilityNode & { lat: number; lng: number } =>
        f.lat != null && f.lng != null,
    )
    if (withGps.length === 0) return
    if (withGps.length === 1) {
      m.setCenter(new kakao.maps.LatLng(withGps[0].lat, withGps[0].lng))
      m.setLevel(Math.max(1, 3 - MAP_FIT_ZOOM_IN_STEPS))
      setMapBaseLevel(m.getLevel())
      return
    }
    const bounds = new kakao.maps.LatLngBounds()
    for (const f of withGps) bounds.extend(new kakao.maps.LatLng(f.lat, f.lng))
    m.setBounds(bounds)
    // setBounds 는 모든 시설이 여유 있게 들어가도록 줌을 잡는다 — 한 단계 더 확대.
    if (MAP_FIT_ZOOM_IN_STEPS > 0) {
      m.setLevel(Math.max(1, m.getLevel() - MAP_FIT_ZOOM_IN_STEPS))
    }
    setMapBaseLevel(m.getLevel())
  }, [kakaoMap, facilities])

  // 지도 첫 준비 시 1회 — 시설 GPS 범위로 자동 fit + setMinLevel(0) 시도.
  //   카카오 SDK 가 일부 지역에 level 0 타일을 제공하면 마우스 휠 줌으로 한 단계 더
  //   확대 가능. 미지원 지역은 silent fail — 기존 level 1 클램프 유지.
  const initialFitDoneRef = useRef(false)
  useEffect(() => {
    if (mapStatus !== 'ready' || initialFitDoneRef.current) return
    initialFitDoneRef.current = true
    if (kakaoMap) {
      try {
        kakaoMap.setMinLevel(0)
      } catch {
        // SDK 가 0 을 거부하면 무시 — 기본 최소(1) 유지
      }
    }
    fitMapToFacilities()
  }, [mapStatus, fitMapToFacilities, kakaoMap])

  // 지도 타일 종류 (roadmap/hybrid) 동기화 — 토글 시 카카오 setMapTypeId.
  //   첫 ready 시점에도 명시 적용 (기본은 roadmap 이지만 SDK 가 바꾼 적 있을 수 있음).
  useEffect(() => {
    if (!kakaoMap || mapStatus !== 'ready') return
    try {
      kakaoMap.setMapTypeId(
        mapTypeId === 'hybrid'
          ? kakao.maps.MapTypeId.HYBRID
          : kakao.maps.MapTypeId.ROADMAP,
      )
    } catch {
      // SDK 가 거부하면 무시 — 기본(roadmap) 유지
    }
  }, [kakaoMap, mapStatus, mapTypeId])

  // 실사 모드 ON 시 카카오맵 드래그·줌 잠금 — SketchOverlay 가 pointer 이벤트 캡처.
  //   OFF 로 돌아오면 다시 활성. SDK 가 지원 안 하면 무시.
  useEffect(() => {
    if (!kakaoMap || mapStatus !== 'ready') return
    if (!sketchMode) return
    try {
      kakaoMap.setDraggable(false)
      kakaoMap.setZoomable(false)
    } catch {
      /* SDK 거부 무시 */
    }
    return () => {
      try {
        kakaoMap.setDraggable(true)
        kakaoMap.setZoomable(true)
      } catch {
        /* SDK 거부 무시 */
      }
    }
  }, [kakaoMap, mapStatus, sketchMode])

  // 거리뷰 ROADVIEW 오버레이 동기화 — 지도 위 거리뷰 가능 도로의 파란 선.
  //   roadviewOpen 켜질 때 addOverlay, 꺼질 때 removeOverlay. SDK 가 거부하면 무시.
  useEffect(() => {
    if (!kakaoMap || mapStatus !== 'ready') return
    if (!roadviewOpen) return
    try {
      kakaoMap.addOverlayMapTypeId(kakao.maps.MapTypeId.ROADVIEW)
    } catch {
      /* SDK 거부 시 무시 */
    }
    return () => {
      try {
        kakaoMap.removeOverlayMapTypeId(kakao.maps.MapTypeId.ROADVIEW)
      } catch {
        /* SDK 거부 시 무시 */
      }
    }
  }, [kakaoMap, mapStatus, roadviewOpen])

  // 거리뷰 패널 열려 있을 때 시설 선택 시 그 시설 좌표로 panorama 이동.
  //   GPS 없으면 안내 toast.
  useEffect(() => {
    if (!roadviewOpen || !selectedId) return
    const f = facilities.find((x) => x.id === selectedId)
    if (!f) return
    if (f.lat == null || f.lng == null) {
      toast.info('이 시설은 GPS 좌표가 없습니다 — 지도 위 파란 선을 직접 클릭해 보세요')
      return
    }
    setRoadviewPos({ lat: f.lat, lng: f.lng })
    setRoadviewTitle(`${formatFacilityCode(f.closure_type, f.seq_no)} ${f.name}`)
  }, [roadviewOpen, selectedId, facilities])

  // GPS 가 없는(지도 미배치) 시설 목록 — 배치 패널에서 사용
  const unplacedFacilities = useMemo(
    () => facilities.filter((f) => f.lat == null || f.lng == null),
    [facilities],
  )
  const placingFacility = placingId
    ? facilities.find((f) => f.id === placingId) ?? null
    : null

  // 카카오맵 이벤트 — 클릭(시설 배치) + 지도 이동(드래그 override 정리).
  //   핸들러는 1회 등록하고 최신 placingId 는 ref 로 읽는다 (리스너 클로저는 고정).
  //   setState 는 effect 본문이 아닌 카카오 콜백 안에서 호출 — 캐스케이드 렌더 룰 회피.
  useEffect(() => {
    const m = kakaoMap
    if (!m) return
    const onClick = (e?: kakao.maps.MouseEvent) => {
      if (!e) return
      const lat = e.latLng.getLat()
      const lng = e.latLng.getLng()
      // 1) 「배치」 대기 중인 미배치 시설이 있으면 그 위치로 지정
      const pid = placingIdRef.current
      if (pid) {
        void (async () => {
          const r = await updateFacilityLatLng({
            project_id: projectId,
            facility_id: pid,
            lat,
            lng,
          })
          if (!r.ok) {
            toast.error(r.error)
            return
          }
          toast.success('시설 위치를 지정했습니다')
          setPlacingId(null)
          router.refresh()
        })()
        return
      }
      // 1.5) 실사정보 배치 모드 — 클릭 위치에 실사정보 시설 즉시 등록
      if (inspectionPlaceRef.current) {
        void (async () => {
          const r = await createInspectionFacility({
            project_id: projectId,
            lat,
            lng,
          })
          if (!r.ok) {
            toast.error(r.error)
            return
          }
          // 실사 모드 세션 배지 카운트 ↑ (sketchStrokes + sketchTexts 와 합산)
          setSketchInspectionCount((n) => n + 1)
          toast.success(`「${r.name}」 배치 완료`)
          router.refresh()
        })()
        // 1회 배치 후 해제 — 연속 배치는 다시 버튼
        setInspectionPlaceMode(false)
        return
      }
      // 2) 시설 추가 도구가 선택돼 있으면 그 위치에 새 시설 배치 폼 열기
      const tool = addToolRef.current
      if (tool) {
        setPendingPlacement({ closureType: tool, kind: 'latlng', lat, lng })
        setAddTool(null) // 1회 배치 후 도구 해제
        return
      }
      // 2.5) 거리뷰 패널이 열려 있으면 그 좌표로 panorama 이동 (가까운 거리뷰 자동 검색)
      if (roadviewOpenRef.current) {
        setRoadviewPos({ lat, lng })
        setRoadviewTitle(null)
        return
      }
      // 3) 빈 지도 클릭 — 선택 해제 (도식 모드의 빈 영역 클릭과 동일).
      //   시설·케이블 위 클릭은 그 요소가 이벤트를 잡아 이 콜백이 호출되지 않음.
      setSelectedId(null)
      setSelectedCableId(null)
    }
    // 지도가 움직이기 시작하면 드래그 픽셀 override 를 비워 GPS 투영으로 복귀
    const onMapMove = () => {
      setMapDragPos((prev) => (Object.keys(prev).length > 0 ? {} : prev))
    }
    kakao.maps.event.addListener(m, 'click', onClick)
    kakao.maps.event.addListener(m, 'dragstart', onMapMove)
    kakao.maps.event.addListener(m, 'zoom_start', onMapMove)
    return () => {
      kakao.maps.event.removeListener(m, 'click', onClick)
      kakao.maps.event.removeListener(m, 'dragstart', onMapMove)
      kakao.maps.event.removeListener(m, 'zoom_start', onMapMove)
    }
  }, [kakaoMap, projectId, router])

  // 미배치 시설들을 지도 중앙 격자에 한 번에 펼치기 — 이후 드래그로 실제 위치 보정
  const onBulkPlace = async () => {
    const m = kakaoMap
    if (!m || unplacedFacilities.length === 0) return
    const c = m.getCenter()
    const cLat = c.getLat()
    const cLng = c.getLng()
    const n = unplacedFacilities.length
    const cols = Math.ceil(Math.sqrt(n))
    const rows = Math.ceil(n / cols)
    const gap = 0.0008 // 약 90m 간격
    const items = unplacedFacilities.map((f, i) => {
      const r = Math.floor(i / cols)
      const col = i % cols
      return {
        id: f.id,
        lat: cLat - (r - (rows - 1) / 2) * gap,
        lng: cLng + (col - (cols - 1) / 2) * gap,
      }
    })
    const res = await bulkPlaceFacilities(projectId, items)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(`시설 ${res.count}개를 지도에 펼쳤습니다. 드래그해 실제 위치로 옮기세요.`)
    setShowUnplaced(false)
    router.refresh()
  }

  // 「전체보기」 — 도식: viewport 리셋 / 지도: 시설 GPS 범위로 fit
  const onFitToContent = () => {
    if (mode === 'map') {
      fitMapToFacilities()
      return
    }
    setViewport(computeFitViewport(effectivePositions))
  }

  // 도식 모드 — 캔버스를 PNG 이미지로 내보내기.
  const [exporting, setExporting] = useState(false)
  // 내보내는 순간에만 SVG 상단에 가로 배치로 그릴 범례 (시설·케이블)
  const [exportLegend, setExportLegend] = useState<{
    items: LegendItem[]
    x: number
    y: number
    width: number
  } | null>(null)

  const [snapping, setSnapping] = useState(false)
  const [graphLayouting, setGraphLayouting] = useState(false)

  // 「그래프 자동 배치」 — 케이블 그래프 기반 시설 위치 완전 재배치.
  //   허브(degree 최대 시설) 가운데 → BFS spanning tree → level 별 동심원 분포.
  //   owner 의 모든 시설 위치 덮어씀 (x_hint 무시). 케이블 cross 자연 감소·연결된
  //   시설끼리 가까이 배치. 설계 초기 또는 시설 많은 프로젝트 재정리 시 사용.
  const onGraphLayout = async () => {
    if (graphLayouting) return
    // 적용 범위 결정 — 다중 작업 시 다른 사람 시설 위치가 안 틀어지게:
    //   1) 「선택」 도구가 켜져 있고 선택된 시설이 있으면 → 그 시설들만
    //   2) 그 외 → 본인이 등록한 시설(created_by === myEmployeeId) 만
    //   양 끝이 모두 「범위 안」인 케이블만 그래프 입력에 포함.
    let inScope: (f: FacilityNode) => boolean
    let scopeLabel = ''
    if (selectTool && selectedIds.size > 0) {
      inScope = (f) => selectedIds.has(f.id)
      scopeLabel = `선택된 시설 ${selectedIds.size}개`
    } else if (myEmployeeId) {
      inScope = (f) => f.created_by === myEmployeeId
      const cnt = facilities.filter(inScope).length
      if (cnt === 0) {
        toast.info('본인이 등록한 시설이 없습니다 (선택 도구로 범위를 지정하거나 시설을 등록하세요)')
        return
      }
      scopeLabel = `본인 등록 시설 ${cnt}개`
    } else {
      toast.error('적용 범위를 판단할 수 없습니다 (로그인 정보 누락)')
      return
    }

    if (
      !confirm(
        `${scopeLabel} 위치를 케이블 그래프 기반으로 자동 재배치합니다.\n` +
          '※ 범위 안 시설 사이 케이블 경로점도 함께 reset 됩니다.\n' +
          '계속하시겠습니까?',
      )
    )
      return
    setGraphLayouting(true)
    try {
      const scopedFacilities = facilities.filter(inScope)
      const scopedFacIds = new Set(scopedFacilities.map((f) => f.id))
      const scopedCables = cables.filter(
        (c) => scopedFacIds.has(c.from_facility_id) && scopedFacIds.has(c.to_facility_id),
      )
      const positions = graphAwareLayout(
        scopedFacilities.map((f) => ({ id: f.id })),
        scopedCables.map((c) => ({
          from_facility_id: c.from_facility_id,
          to_facility_id: c.to_facility_id,
        })),
      )
      const changes = [...positions.values()].map((p) => ({ id: p.id, x: p.x, y: p.y }))
      if (changes.length === 0) {
        toast.info('재배치할 시설이 없습니다')
        return
      }
      // undo 스냅샷 — 이전 시설 좌표 + 이전 케이블 경로점 (clear 대상)
      const wpField: 'waypoints' | 'map_waypoints' = mode === 'map' ? 'map_waypoints' : 'waypoints'
      const snap: UndoSnapshot = {
        label: '그래프 자동 배치',
        positions: scopedFacilities
          .map((f) => {
            const p = effectivePositions[f.id]
            return p ? { id: f.id, x: p.x, y: p.y } : null
          })
          .filter((p): p is { id: string; x: number; y: number } => p !== null),
        cableWaypoints: scopedCables
          .map((c) => {
            const cur = (mode === 'map' ? c.mapWaypoints : c.waypoints) ?? []
            if (cur.length === 0) return null
            return { cableId: c.id, waypoints: cur.map((w) => ({ ...w })), field: wpField }
          })
          .filter((wp): wp is NonNullable<typeof wp> => wp !== null),
      }
      const res = await saveNodePositions(projectId, changes)
      if (!res.ok) {
        toast.error(res.error ?? '자동 배치 저장에 실패했습니다')
        return
      }
      // 케이블 경로점 일괄 clear — 범위 안 케이블만. 다른 사람 케이블 경로점 보존.
      let wpCleared = 0
      let wpFailed = 0
      for (const c of scopedCables) {
        const cur = (mode === 'map' ? c.mapWaypoints : c.waypoints) ?? []
        if (cur.length === 0) continue
        const clr = await saveCableWaypoints(projectId, c.id, [])
        if (clr.ok) wpCleared++
        else wpFailed++
      }
      const msg =
        wpFailed === 0
          ? `시설 ${changes.length}개 자동 배치 완료 (경로점 ${wpCleared}건 reset) — 「되돌리기」 가능`
          : `시설 ${changes.length}개 배치 — 경로점 ${wpCleared}건 reset, ${wpFailed}건 실패`
      if (wpFailed === 0) toast.success(msg)
      else toast.warning(msg)
      setUndoSnapshot(snap)
      router.refresh()
    } finally {
      setGraphLayouting(false)
    }
  }

  // 「케이블 거리 배율」 — 결과가 너무 틀어져 사용 어려워 비활성 (2026-05-24 owner 결정).
  //   코드는 git history 에 보존. 필요 시 reinstate.

  // 「도면정렬 / 그래프 자동 배치」 되돌리기 (undo) — 직전 실행 결과를 한 단계 복원.
  //   캐시는 메모리 (페이지 새로고침하면 사라짐). 단일 undo (실행마다 새 스냅샷이 옛 것 대체).
  type UndoSnapshot = {
    label: '도면자동배치' | '그래프 자동 배치'
    positions: { id: string; x: number; y: number }[]
    cableWaypoints: {
      cableId: string
      waypoints: Waypoint[]
      field: 'waypoints' | 'map_waypoints'
    }[]
  }
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null)
  const [undoing, setUndoing] = useState(false)
  const onUndo = async () => {
    if (!undoSnapshot || undoing) return
    setUndoing(true)
    try {
      if (undoSnapshot.positions.length > 0) {
        const r = await saveNodePositions(projectId, undoSnapshot.positions)
        if (!r.ok) {
          toast.error(r.error ?? '되돌리기 실패')
          return
        }
      }
      let wpFailed = 0
      for (const wp of undoSnapshot.cableWaypoints) {
        const r = await saveCableWaypoints(projectId, wp.cableId, wp.waypoints, wp.field)
        if (!r.ok) wpFailed++
      }
      if (wpFailed > 0) {
        toast.warning(`되돌리기 완료 — 케이블 경로점 ${wpFailed}건 복원 실패`)
      } else {
        toast.success(`${undoSnapshot.label} 결과를 이전 상태로 복원했습니다`)
      }
      setUndoSnapshot(null)
      router.refresh()
    } finally {
      setUndoing(false)
    }
  }

  // 「케이블 정렬」 — 케이블 V/H/대각선(45°) 각도에 맞춰 시설 위치 자동 재배치.
  //   BFS-snap (cable-snap-layout.ts). 가장 연결 많은 시설(국사·허브) 을 root 로
  //   원래 위치 유지, 그로부터 인접 시설을 부모→자식 방향각에 가장 가까운 45° 로
  //   snap. 결과를 saveNodePositions 로 DB 에 일괄 저장.
  const onCableSnap = async () => {
    if (snapping) return
    // 적용 범위 — onGraphLayout 과 동일 규칙.
    let inScope: (f: FacilityNode) => boolean
    let scopeLabel = ''
    if (selectTool && selectedIds.size > 0) {
      inScope = (f) => selectedIds.has(f.id)
      scopeLabel = `선택된 시설 ${selectedIds.size}개`
    } else if (myEmployeeId) {
      inScope = (f) => f.created_by === myEmployeeId
      const cnt = facilities.filter(inScope).length
      if (cnt === 0) {
        toast.info('본인이 등록한 시설이 없습니다 (선택 도구로 범위를 지정하거나 시설을 등록하세요)')
        return
      }
      scopeLabel = `본인 등록 시설 ${cnt}개`
    } else {
      toast.error('적용 범위를 판단할 수 없습니다 (로그인 정보 누락)')
      return
    }
    if (!confirm(`${scopeLabel} 위치를 케이블 각도(V/H/45°)에 맞춰 재배치합니다. 계속하시겠습니까?`)) return
    setSnapping(true)
    try {
      const scopedFacilities = facilities.filter(inScope)
      const scopedFacIds = new Set(scopedFacilities.map((f) => f.id))
      // 양 끝이 모두 범위 안인 케이블만 — 정렬 기준이 그 케이블의 방향.
      const scopedCables = cables.filter(
        (c) => scopedFacIds.has(c.from_facility_id) && scopedFacIds.has(c.to_facility_id),
      )
      // 현재 표시 위치 → Map. 드래그 오프셋(localPositions) 도 반영된 effectivePositions 사용.
      const posMap = new Map<string, { x: number; y: number }>()
      for (const f of scopedFacilities) {
        const p = effectivePositions[f.id]
        if (p) posMap.set(f.id, { x: p.x, y: p.y })
      }
      const changes = snapPositionsToCableDirections(scopedFacilities, scopedCables, posMap)
      if (changes.length === 0) {
        toast.info('이미 모든 케이블이 V/H/45° 로 정렬되어 있습니다')
        return
      }
      // undo 스냅샷 — 변경 대상 시설의 「이전」 좌표만 (도면자동배치는 경로점 안 건드림)
      const changeIds = new Set(changes.map((c) => c.id))
      const snap: UndoSnapshot = {
        label: '도면자동배치',
        positions: scopedFacilities
          .filter((f) => changeIds.has(f.id))
          .map((f) => {
            const p = effectivePositions[f.id]
            return p ? { id: f.id, x: p.x, y: p.y } : null
          })
          .filter((p): p is { id: string; x: number; y: number } => p !== null),
        cableWaypoints: [],
      }
      const res = await saveNodePositions(
        projectId,
        changes.map((c) => ({ id: c.id, x: c.x, y: c.y })),
      )
      if (!res.ok) {
        toast.error(res.error ?? '정렬 저장에 실패했습니다')
        return
      }
      toast.success(`시설 ${changes.length}개 재배치 완료 — 도면자동배치 (「되돌리기」 가능)`)
      setUndoSnapshot(snap)
      router.refresh()
    } finally {
      setSnapping(false)
    }
  }

  const onExportSchematic = async () => {
    const svg = svgRef.current
    if (!svg || exporting) return
    // 선택 강조·waypoint 핸들이 PNG 에 안 찍히게 먼저 해제
    setSelectedId(null)
    setSelectedCableId(null)
    setFaultSearchOpen(false)
    setExporting(true)
    // 선택 해제가 DOM 에 반영될 때까지 대기
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    )
    try {
      // 내보내기 영역 — 전체 콘텐츠 bounding box + 넉넉한 여백
      const PAD = 140
      let box = computeFitViewport(effectivePositions)
      try {
        const bb = svg.getBBox()
        if (bb.width > 0 && bb.height > 0) {
          box = {
            x: bb.x - PAD,
            y: bb.y - PAD,
            width: bb.width + PAD * 2,
            height: bb.height + PAD * 2,
          }
        }
      } catch {
        /* getBBox 실패 시 fit viewport 사용 */
      }
      // 도식에 포함된 시설·케이블 범례 — 좌상단에 배치
      const legendItems: LegendItem[] = []
      const facItems: LegendItem[] = []
      for (const t of CLOSURE_TYPE_VALUES) {
        const ofType = facilities.filter((f) => f.closure_type === t)
        if (ofType.length === 0) continue
        if (hasInstallStatus(t)) {
          // 설치구분으로 색이 갈리는 종류(접속함체·RN·IJP) 는 기설/신설 분리
          for (const st of FACILITY_INSTALL_STATUS_VALUES) {
            if (!ofType.some((f) => (f.install_status || 'new') === st)) continue
            facItems.push({
              kind: 'facility',
              closureType: t,
              installStatus: st,
              label: `${CLOSURE_TYPE_LABEL[t]} (${FACILITY_INSTALL_STATUS_LABEL[st]})`,
            })
          }
        } else {
          facItems.push({
            kind: 'facility',
            closureType: t,
            installStatus: 'new',
            label: CLOSURE_TYPE_LABEL[t],
          })
        }
      }
      // 케이블 범례 — owner 결정 2026-05-25: 실제 사용된 (status + installation_type)
      //   조합을 모두 표시. 예: 「기설(지중)」, 「기설(가공)」, 「신설(지중)」.
      //   같은 조합은 중복 제거. 라벨에 설치구분 포함.
      const cabItems: LegendItem[] = []
      const seenCableKeys = new Set<string>()
      for (const st of CABLE_STATUS_VALUES) {
        const ofStatus = cables.filter((c) => c.status === st)
        if (ofStatus.length === 0) continue
        // installation_type 별로 그룹
        const byInstall = new Map<string, typeof ofStatus[number]>()
        for (const c of ofStatus) {
          const k = c.installation_type ?? '(미지정)'
          if (!byInstall.has(k)) byInstall.set(k, c)
        }
        for (const [installKey, rep] of byInstall.entries()) {
          const dedupKey = `${st}|${installKey}`
          if (seenCableKeys.has(dedupKey)) continue
          seenCableKeys.add(dedupKey)
          const installSuffix =
            rep.installation_type ? `(${rep.installation_type})` : ''
          cabItems.push({
            kind: 'cable',
            spec: rep.spec,
            status: st,
            installationType: rep.installation_type,
            label: `${CABLE_STATUS_LABEL[st]}${installSuffix}`,
          })
        }
      }
      if (cutover.cables.size > 0) {
        cabItems.push({ kind: 'cutover', label: '기설 케이블 절단 절체' })
      }
      if (facItems.length > 0) {
        legendItems.push({ kind: 'header', label: '시설' }, ...facItems)
      }
      if (cabItems.length > 0) {
        legendItems.push({ kind: 'header', label: '케이블' }, ...cabItems)
      }
      if (legendItems.length > 0) {
        // 가로 배치 범례 — 박스 위쪽 영역. 시설 라벨이 잘리지 않게.
        //   (owner 2026-05-25 — 기존 좌측 세로 배치는 여백 부족으로 라벨 절단)
        // 박스 위쪽으로 LEGEND_AREA_H 만큼 추가 확보.
        const LEGEND_AREA_H = 180
        const LEGEND_PAD = 40
        box = {
          x: box.x,
          y: box.y - LEGEND_AREA_H,
          width: box.width,
          height: box.height + LEGEND_AREA_H,
        }
        setExportLegend({
          items: legendItems,
          x: box.x + LEGEND_PAD,
          y: box.y + LEGEND_PAD,
          width: box.width - LEGEND_PAD * 2,
        })
        await new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r())),
        )
      }
      const d = new Date()
      const p = (n: number) => String(n).padStart(2, '0')
      const dateStr = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
      const timeStr = `${p(d.getHours())}${p(d.getMinutes())}`
      // 파일명 규칙 (owner 2026-05-25):
      //   - 청약: 청약ID_가입자명_YYYYMMDD.png
      //   - 그 외: 지장이설_도식_YYYYMMDD_HHmm.png (기존)
      //   파일 시스템 금지 문자(\/:*?"<>|) 는 _ 로 치환.
      const sanitize = (s: string): string =>
        s.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '').trim()
      let fileName: string
      if (
        projectCategory === '청약' &&
        subscriptionId &&
        subscriberName
      ) {
        fileName = `${sanitize(subscriptionId)}_${sanitize(subscriberName)}_${dateStr}.png`
      } else if (projectCategory === '청약' && subscriptionId) {
        fileName = `${sanitize(subscriptionId)}_${dateStr}.png`
      } else {
        fileName = `지장이설_도식_${dateStr}_${timeStr}.png`
      }
      await exportSchematicPng(svg, box, fileName)
      toast.success('도식을 PNG 이미지로 내보냈습니다')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '도식 내보내기 실패')
    } finally {
      setExportLegend(null)
      setExporting(false)
    }
  }

  // 특정 시설을 화면 중앙으로 — 좌측 사이드바에서 시설 클릭 시. 줌 레벨은 유지.
  const focusFacility = (id: string) => {
    if (mode === 'map') {
      const f = facilities.find((x) => x.id === id)
      if (f && f.lat != null && f.lng != null && kakaoMap) {
        kakaoMap.setCenter(new kakao.maps.LatLng(f.lat, f.lng))
      }
      setSelectedId(id)
      setSelectedCableId(null)
      return
    }
    const pos = effectivePositions[id]
    if (!pos) return
    const cx = pos.x + NODE_SIZE.width / 2
    const cy = pos.y + NODE_SIZE.height / 2 - 10
    setViewport((v) => ({
      ...v,
      x: cx - v.width / 2,
      y: cy - v.height / 2,
    }))
    setSelectedId(id)
    setSelectedCableId(null)
  }

  // 줌 버튼 — viewport 중심 기준 확대/축소 (wheel 과 동일 로직, anchor=center)
  const onZoom = (dir: 'in' | 'out') => {
    setViewport((v) => {
      const factor = dir === 'in' ? 1 / 1.2 : 1.2
      const minW = 200
      const maxW = 12000
      const newWidth = Math.max(minW, Math.min(maxW, v.width * factor))
      const newHeight = Math.max(minW * 0.75, Math.min(maxW * 0.75, v.height * factor))
      const actual = newWidth / v.width
      const cx = v.x + v.width / 2
      const cy = v.y + v.height / 2
      return {
        x: cx - (cx - v.x) * actual,
        y: cy - (cy - v.y) * actual,
        width: newWidth,
        height: newHeight,
      }
    })
  }

  // 고장점 검색 드릴다운 — 시설물 → 케이블 → 회선. 상위 변경 시 하위 초기화.
  const pickFaultFacility = (id: string) => {
    setFaultFacilityId(id)
    setFaultCableId('')
    setFaultCircuitId('')
  }
  const pickFaultCable = (id: string) => {
    setFaultCableId(id)
    setFaultCircuitId('')
  }
  const pickFaultCircuit = (id: string) => setFaultCircuitId(id)

  // 캔버스에서 케이블 클릭 → 그 케이블 + 한쪽 시설물 선택 (드릴다운 step 2 채움)
  const handleFaultCableClick = (cableId: string) => {
    const c = cables.find((x) => x.id === cableId)
    if (!c) return
    setFaultFacilityId(c.from_facility_id)
    setFaultCableId(cableId)
    setFaultCircuitId('')
  }

  const toggleFaultSearch = () => {
    if (faultSearchOpen) {
      setFaultSearchOpen(false)
    } else {
      setFaultSearchOpen(true)
      setSelectedId(null)
      setSelectedCableId(null)
      setAddTool(null)
      setCableTool(null)
    }
  }

  // 케이블 연결 시 자동 정렬 — 허브(접속함체) 둘레 8슬롯 중 빈 곳에 위성 시설 배치.
  //   허브 = 둘 중 접속함체(한쪽만 접속함체면 그쪽). 위성 = 나머지 시설.
  //   허브에 케이블이 1조면 우측, 2조면 1번째 반대편(일직선),
  //   3조 이상은 수평·수직 4방향 먼저, 그다음 대각 4방향.
  //   도식 모드 전용. 설계자가 이후 드래그로 자유롭게 변경 가능.
  const alignFacilityForCable = (aId: string, bId: string) => {
    const fa = facilities.find((f) => f.id === aId)
    const fb = facilities.find((f) => f.id === bId)
    if (!fa || !fb) return
    // 허브 결정 — 한쪽만 접속함체면 그쪽이 허브, 아니면 먼저 클릭한 쪽
    const aClosure = CLOSURE_TYPE_CATEGORY[fa.closure_type] === '접속함체'
    const bClosure = CLOSURE_TYPE_CATEGORY[fb.closure_type] === '접속함체'
    let hubId = aId
    let satId = bId
    if (bClosure && !aClosure) {
      hubId = bId
      satId = aId
    }
    const hubPos = effectivePositions[hubId]
    if (!hubPos) return

    // 허브에 이미 연결된 이웃 시설 (이번에 잇는 위성은 제외)
    const neighborIds = new Set<string>()
    for (const c of cables) {
      if (c.from_facility_id === hubId) neighborIds.add(c.to_facility_id)
      else if (c.to_facility_id === hubId) neighborIds.add(c.from_facility_id)
    }
    neighborIds.delete(satId)
    neighborIds.delete(hubId)

    // 이웃이 점유한 슬롯
    const occupied = new Set<number>()
    for (const nId of neighborIds) {
      const np = effectivePositions[nId]
      if (!np) continue
      occupied.add(nearestSlot(np.x - hubPos.x, np.y - hubPos.y))
    }

    let slot: number
    if (neighborIds.size === 0) {
      slot = 0 // 첫 케이블 — 우측(수평)
    } else if (neighborIds.size === 1) {
      // 두 번째 — 기존 이웃 반대편 (일직선)
      const only = [...occupied][0] ?? 1
      slot = SLOT_OPPOSITE[only]
      if (occupied.has(slot)) slot = firstFreeSlot(occupied)
    } else {
      slot = firstFreeSlot(occupied)
    }
    const v = SLOT_VECTORS[slot]
    const placed = {
      x: hubPos.x + v.x * AUTO_PLACE_DISTANCE,
      y: hubPos.y + v.y * AUTO_PLACE_DISTANCE,
    }
    setPositions((prev) => ({ ...prev, [satId]: placed }))
    void saveNodePositions(projectId, [{ id: satId, x: placed.x, y: placed.y }])
  }

  // 좌클릭 드래그 스냅 — 드래그 위치(np)를 다른 시설들의 x/y 에 맞춰 정렬.
  //   x·y 각각 독립으로 가장 가까운 시설 좌표에 SNAP_THRESHOLD 안이면 스냅.
  const snapToFacilities = (
    np: { x: number; y: number },
    draggedId: string,
  ): { pos: { x: number; y: number }; guide: { x: number | null; y: number | null } } => {
    let sx = np.x
    let sy = np.y
    let bestDx = SNAP_THRESHOLD
    let bestDy = SNAP_THRESHOLD
    let snapX = false
    let snapY = false
    for (const [fid, p] of Object.entries(effectivePositions)) {
      if (fid === draggedId) continue
      const ddx = Math.abs(p.x - np.x)
      if (ddx <= bestDx) {
        bestDx = ddx
        sx = p.x
        snapX = true
      }
      const ddy = Math.abs(p.y - np.y)
      if (ddy <= bestDy) {
        bestDy = ddy
        sy = p.y
        snapY = true
      }
    }
    // guide 는 화면에 그릴 가이드선의 실제 좌표 (시설 중심 기준 — 좌상단 + 절반)
    return {
      pos: { x: sx, y: sy },
      guide: {
        x: snapX ? sx + NODE_SIZE.width / 2 : null,
        y: snapY ? sy + NODE_SIZE.height / 2 - 10 : null,
      },
    }
  }

  // 케이블 꺾은선(경로점) 드래그 스냅 — 경로점을 양옆 점(앞점·뒷점)의 x/y 에 맞춰
  //   정렬해 선분을 수직·수평으로 만든다. 앞점·뒷점 = 시설 중심 또는 이웃 경로점.
  const snapWaypoint = (
    nx: number,
    ny: number,
    cableId: string,
    index: number,
  ): { x: number; y: number; guide: { x: number | null; y: number | null } } => {
    const c = cables.find((x) => x.id === cableId)
    const noSnap = { x: nx, y: ny, guide: { x: null, y: null } }
    if (!c) return noSnap
    const from = effectivePositions[c.from_facility_id]
    const to = effectivePositions[c.to_facility_id]
    if (!from || !to) return noSnap
    const wps = effectiveWaypoints(cableId)
    const fromCenter = {
      x: from.x + NODE_SIZE.width / 2,
      y: from.y + NODE_SIZE.height / 2 - 10,
    }
    const toCenter = {
      x: to.x + NODE_SIZE.width / 2,
      y: to.y + NODE_SIZE.height / 2 - 10,
    }
    const prev = index === 0 ? fromCenter : { x: wps[index - 1].x, y: wps[index - 1].y }
    const next =
      index >= wps.length - 1 ? toCenter : { x: wps[index + 1].x, y: wps[index + 1].y }
    let sx = nx
    let sy = ny
    let bestDx = SNAP_THRESHOLD
    let bestDy = SNAP_THRESHOLD
    let snapX = false
    let snapY = false
    for (const p of [prev, next]) {
      const ddx = Math.abs(p.x - nx)
      if (ddx <= bestDx) {
        bestDx = ddx
        sx = p.x
        snapX = true
      }
      const ddy = Math.abs(p.y - ny)
      if (ddy <= bestDy) {
        bestDy = ddy
        sy = p.y
        snapY = true
      }
    }
    return {
      x: sx,
      y: sy,
      guide: { x: snapX ? sx : null, y: snapY ? sy : null },
    }
  }

  const handleNodeClick = (id: string) => {
    // 고장점 검색 모드 — 시설 클릭은 드릴다운 step 1 (시설물) 선택
    if (faultSearchOpen) {
      pickFaultFacility(id)
      return
    }
    // 지도 모드 — 케이블 도구가 켜져 있으면 시설 2개 클릭으로 케이블 연결,
    //   아니면 클릭 = 선택(정보 패널).
    if (mode === 'map') {
      setSelectedCableId(null)
      if (cableTool) {
        if (selectedId === id) {
          setSelectedId(null)
          return
        }
        if (selectedId === null) {
          setSelectedId(id)
          return
        }
        setPendingConnection({ fromId: selectedId, toId: id })
        setSelectedId(null)
        return
      }
      setSelectedId((cur) => (cur === id ? null : id))
      return
    }
    setSelectedCableId(null)  // 시설 선택 시 케이블 경로 편집 종료
    if (selectedId === id) {
      setSelectedId(null)
      return
    }
    if (selectedId === null) {
      setSelectedId(id)
      return
    }
    // 두 번째 클릭 — 케이블 연결 모달 열기. 자동 정렬은 케이블 생성 후(onSaved).
    setPendingConnection({ fromId: selectedId, toId: id })
    setSelectedId(null)
  }

  // 케이블의 경로 점 배열 — [출발 시설 중심, ...중간 경로점, 도착 시설 중심]
  //   - 도식 모드: 경로점 x/y 그대로
  //   - 지도 모드: 경로점 lat/lng 를 화면 픽셀로 투영 (Phase 4)
  //   - 경로점 없으면 같은 경로 다른 케이블과 겹치지 않게 수직 offset 적용
  // Phase 2 (2026-05-23) — 도식 모드의 시설 anchor 사전 계산.
  //   2026-05-23 owner 요청: "기본으로 접속함체나 시설물 중간에 출발/도착".
  //   사이드 anchor 비활성 — 모든 케이블이 시설 중심에서 출발/도착.
  //   같은 경로 2 조 이상의 시각 분리는 cableOffsets 의 「렌즈 모양」 으로 처리 (끝점 중심 유지).
  //   지도 모드는 cableAnchors=null.
  const cableAnchors = useMemo(() => {
    if (mode === 'map') return null
    type AnchorEnd = { x: number; y: number; side?: 'N' | 'S' | 'E' | 'W' | 'D' }
    const result = new Map<
      string,
      { from?: AnchorEnd; to?: AnchorEnd }
    >()
    // 사이드 anchor 로직 비활성 — 항상 빈 Map 반환 → 모든 케이블이 시설 중심 사용.
    return result
    // eslint-disable-next-line no-unreachable

    // 시설별로 연결된 케이블 모음
    const cablesByFacility = new Map<string, CableEdge[]>()
    for (const c of cables) {
      if (!cablesByFacility.has(c.from_facility_id)) {
        cablesByFacility.set(c.from_facility_id, [])
      }
      cablesByFacility.get(c.from_facility_id)!.push(c)
      if (!cablesByFacility.has(c.to_facility_id)) {
        cablesByFacility.set(c.to_facility_id, [])
      }
      cablesByFacility.get(c.to_facility_id)!.push(c)
    }

    const halfW = NODE_SIZE.width / 2
    const halfH = NODE_SIZE.height / 2
    const PERPENDICULAR_STEP = 20 // 같은 변에 분산할 케이블 사이 간격(px)

    // atan2 결과 (-π~π) → 4 방위 'E'/'S'/'W'/'N'.
    //   ±45° 기준으로 경계 — 동쪽 ±45° 안이면 E, 그 다음 시계방향으로 S, W, N.
    function cardinalOf(angle: number): 'E' | 'S' | 'W' | 'N' {
      const a = (angle + Math.PI / 4 + 2 * Math.PI) % (2 * Math.PI)
      if (a < Math.PI / 2) return 'E'
      if (a < Math.PI) return 'S'
      if (a < (3 * Math.PI) / 2) return 'W'
      return 'N'
    }

    for (const [facilityId, connCables] of cablesByFacility.entries()) {
      const pos = effectivePositions[facilityId]
      if (!pos) continue
      const cx = pos.x + halfW
      const cy = pos.y + halfH - 10

      // 각 케이블의 상대 endpoint 방향각 + 방위 quantize
      type Item = {
        cableId: string
        isFromSide: boolean
        angle: number
        dir: 'E' | 'S' | 'W' | 'N'
      }
      const items: Item[] = []
      for (const c of connCables) {
        const isFromSide = c.from_facility_id === facilityId
        const otherId = isFromSide ? c.to_facility_id : c.from_facility_id
        const otherPos = effectivePositions[otherId]
        if (!otherPos) continue
        const otherCx = otherPos.x + halfW
        const otherCy = otherPos.y + halfH - 10
        const angle = Math.atan2(otherCy - cy, otherCx - cx)
        items.push({
          cableId: c.id,
          isFromSide,
          angle,
          dir: cardinalOf(angle),
        })
      }
      if (items.length === 0) continue

      // 방위별 그룹핑
      const byDir = new Map<'E' | 'S' | 'W' | 'N', Item[]>()
      for (const item of items) {
        if (!byDir.has(item.dir)) byDir.set(item.dir, [])
        byDir.get(item.dir)!.push(item)
      }

      // 1~2 조 같은 방향 — anchor 안 함 (중심 사용). 케이블이 시설 중심에서 출발해
      //   자연 다이아곤(45° 등)으로 갈 수 있도록. Phase 3 의 장애물 회피만 적용.
      // 3~4 조 같은 방향 — 변에 평행 분산 (조수 식별 + 변 anchor + 직각 라우팅).
      // 5+ 조 같은 방향 — 90° 부채꼴 arc (코너 anchor 포함, 대각선 라우팅).
      for (const [dir, group] of byDir.entries()) {
        // 같은 변 안에서 자연 각도 순으로 정렬해 인접 케이블이 안 꼬이게.
        //   E/W: 위→아래 (sin(angle) 오름차순)
        //   N/S: 좌→우 (cos(angle) 오름차순)
        group.sort((a, b) => {
          if (dir === 'E' || dir === 'W') return Math.sin(a.angle) - Math.sin(b.angle)
          return Math.cos(a.angle) - Math.cos(b.angle)
        })

        const N = group.length
        if (N < 3) continue // 1~2 조는 중심에서 자연 라우팅
        if (N <= 4) {
          // 3~4 조: 카디널 변에 수직 평행 분산
          group.forEach((item, i) => {
            const offset = (i - (N - 1) / 2) * PERPENDICULAR_STEP
            let ax: number, ay: number
            let side: 'N' | 'S' | 'E' | 'W'
            if (dir === 'E') {
              ax = cx + halfW
              ay = cy + offset
              side = 'E'
            } else if (dir === 'W') {
              ax = cx - halfW
              ay = cy + offset
              side = 'W'
            } else if (dir === 'N') {
              ax = cx + offset
              ay = cy - halfH
              side = 'N'
            } else {
              ax = cx + offset
              ay = cy + halfH
              side = 'S'
            }
            const entry = result.get(item.cableId) ?? {}
            if (item.isFromSide) entry.from = { x: ax, y: ay, side }
            else entry.to = { x: ax, y: ay, side }
            result.set(item.cableId, entry)
          })
        } else {
          // 5+ 조 같은 방향: 카디널 변에 좁은 간격으로 분산 (대각선 사용 안 함).
          //   owner 요청 (2026-05-23): 모든 케이블이 V/H. 5+ 조도 같은 변에 평행 분산해
          //   모두 V/H 출발. 변 길이가 부족하면 간격 좁힘.
          const tightStep = Math.min(PERPENDICULAR_STEP, 80 / N) // N 이 클수록 간격 좁힘
          group.forEach((item, i) => {
            const offset = (i - (N - 1) / 2) * tightStep
            let ax: number, ay: number
            let side: 'N' | 'S' | 'E' | 'W'
            if (dir === 'E') {
              ax = cx + halfW
              ay = cy + offset
              side = 'E'
            } else if (dir === 'W') {
              ax = cx - halfW
              ay = cy + offset
              side = 'W'
            } else if (dir === 'N') {
              ax = cx + offset
              ay = cy - halfH
              side = 'N'
            } else {
              ax = cx + offset
              ay = cy + halfH
              side = 'S'
            }
            const entry = result.get(item.cableId) ?? {}
            if (item.isFromSide) entry.from = { x: ax, y: ay, side }
            else entry.to = { x: ax, y: ay, side }
            result.set(item.cableId, entry)
          })
        }
      }
    }
    return result
  }, [cables, effectivePositions, mode])

  // 도식·지도 모드 케이블 raw 라우팅 (offset 미적용) — overlap 탐지와 cablePathPoints 둘 다 공유.
  //   사용자 waypoint 가 있으면 그대로. 없으면 candidate (직선/L자/ㄷ자) 점수화 (bends → 시설 가로지름 → 길이).
  //   여기서 한 번 계산하고 segment-level overlap 탐지에 재활용 → cablePathPoints 가 단순해짐.
  //   (2026-05-24) best path + candidates 둘 다 반환. 후속 pathsAfterOverlapReassign 단계가
  //   segment overlap 그룹 안에서 cores 큰 케이블에 best(직선) 유지, 작은 케이블에 next-best(우회) 재배정.
  //   같은 시설 쌍 / 다른 시설 쌍 segment 겹침 모두 통합 처리 (samePairCandIdx 폐기).
  const rawCablePaths = useMemo(() => {
    type RawData = { path: Waypoint[]; candidates: Waypoint[][] }
    const result = new Map<string, RawData>()
    const halfW = NODE_SIZE.width / 2
    const halfH = NODE_SIZE.height / 2

    for (const c of cables) {
      const from = effectivePositions[c.from_facility_id]
      const to = effectivePositions[c.to_facility_id]
      if (!from || !to) continue
      const fromCenter = {
        x: from.x + halfW,
        y: from.y + halfH - 10,
      }
      const toCenter = {
        x: to.x + halfW,
        y: to.y + halfH - 10,
      }
      const anchor = cableAnchors?.get(c.id)
      const fromPt = anchor?.from ?? fromCenter
      const toPt = anchor?.to ?? toCenter
      const wps = effectiveWaypoints(c.id)

      let midPoints: { x: number; y: number }[]
      if (mode === 'map') {
        midPoints = []
        const m = kakaoMap
        if (m) {
          const proj = m.getProjection()
          for (const w of wps) {
            if (w.lat != null && w.lng != null) {
              const pt = proj.containerPointFromCoords(
                new kakao.maps.LatLng(w.lat, w.lng),
              )
              midPoints.push({ x: pt.x, y: pt.y })
            }
          }
        }
      } else {
        midPoints = wps.map((w) => ({ x: w.x, y: w.y }))
      }

      // 도식 모드 + 사용자 waypoint 없음 → 자동 라우팅
      if (midPoints.length === 0 && mode !== 'map') {
        const fromForRoute = anchor?.from ?? fromPt
        const toForRoute = anchor?.to ?? toPt

        // obstacles — 다른 시설 + from·to 시설도 포함.
        //   (2026-05-24) owner 보고: 우회 path 가 도착 시설 옆 도형 영역으로 지나가서 시각 충돌.
        //   from/to 시설의 segment 끝점(t≈0,1)은 자연히 가까움 → t>0.05 && t<0.95 가 제외.
        //   중간 segment 가 from/to 시설 옆을 지나가면 페널티 (도형 영역 침범).
        const obstacles: { cx: number; cy: number }[] = []
        for (const [, opos] of Object.entries(effectivePositions)) {
          obstacles.push({
            cx: opos.x + halfW,
            cy: opos.y + halfH - 10,
          })
        }

        // CROSS_CLEAR 50 → 80 — 시설 도형 크기 NODE_SIZE.width=90 기준.
        //   50 px 떨어진 segment 는 도형 옆을 살짝 지나가는 정도 → 시각 충돌 가능.
        const CROSS_CLEAR = 80
        const distPointToSeg = (
          p: { x: number; y: number },
          a: { x: number; y: number },
          b: { x: number; y: number },
        ): { dist: number; t: number } => {
          const sdx = b.x - a.x
          const sdy = b.y - a.y
          const len2 = sdx * sdx + sdy * sdy
          if (len2 < 0.01) return { dist: Math.hypot(p.x - a.x, p.y - a.y), t: 0 }
          let t = ((p.x - a.x) * sdx + (p.y - a.y) * sdy) / len2
          t = Math.max(0, Math.min(1, t))
          const cx = a.x + t * sdx
          const cy = a.y + t * sdy
          return { dist: Math.hypot(p.x - cx, p.y - cy), t }
        }
        const countCrossings = (pts: { x: number; y: number }[]): number => {
          let count = 0
          for (let i = 0; i < pts.length - 1; i++) {
            for (const o of obstacles) {
              const { dist, t } = distPointToSeg({ x: o.cx, y: o.cy }, pts[i], pts[i + 1])
              if (t > 0.05 && t < 0.95 && dist < CROSS_CLEAR) count++
            }
          }
          return count
        }

        const dx = toForRoute.x - fromForRoute.x
        const dy = toForRoute.y - fromForRoute.y
        const adx = Math.abs(dx)
        const ady = Math.abs(dy)

        type Cand = {
          waypoints: { x: number; y: number }[]
          bends: number
          length: number
          crossings: number
        }
        const candidates: Cand[] = []
        const addCand = (wpsLocal: { x: number; y: number }[]) => {
          const full = [fromForRoute, ...wpsLocal, toForRoute]
          const crossings = countCrossings(full)
          let len = 0
          for (let i = 0; i < full.length - 1; i++) {
            len += Math.hypot(full[i + 1].x - full[i].x, full[i + 1].y - full[i].y)
          }
          candidates.push({
            waypoints: wpsLocal,
            bends: wpsLocal.length,
            length: len,
            crossings,
          })
        }

        if (adx <= 5 || ady <= 5) {
          addCand([])
        }
        if (adx > 5 && ady > 5) {
          addCand([{ x: toForRoute.x, y: fromForRoute.y }])
          addCand([{ x: fromForRoute.x, y: toForRoute.y }])
        }
        const VDETOUR = halfH + 80
        const HDETOUR = halfW + 80
        // degenerate detour 방지 (2026-05-24):
        //   H 케이블 (fromY ≈ toY) 에 H detour 적용 시 wp1=(detourX,fromY), wp2=(detourX,toY)
        //   가 거의 같은 점이 되어 polyline 이 시각적으로 직선으로 보임 (T-4TLR 케이스).
        //   같은 식으로 V 케이블 (fromX ≈ toX) 에 V detour 도 degenerate.
        const isHCable = Math.abs(toForRoute.y - fromForRoute.y) < 15
        const isVCable = Math.abs(toForRoute.x - fromForRoute.x) < 15
        // (2026-05-24 owner 보고) stepMult 3 제거 — 매우 큰 detour candidate 가
        //   cores 재배정으로 작은 케이블에 선택되면 path 가 매우 멀리 늘어짐 (T-ACFL).
        //   stepMult [1, 2] 만 사용 → detour 거리 시설 도형 2 배 안.
        for (const stepMult of [1, 2]) {
          for (const sign of [-1, 1]) {
            // V detour (위/아래 ㄷ자) — V 케이블에는 degenerate 이므로 skip
            if (!isVCable) {
              const detourY = (fromForRoute.y + toForRoute.y) / 2 + sign * VDETOUR * stepMult
              addCand([
                { x: fromForRoute.x, y: detourY },
                { x: toForRoute.x, y: detourY },
              ])
            }
            // H detour (좌/우 ㄷ자) — H 케이블에는 degenerate 이므로 skip
            if (!isHCable) {
              const detourX = (fromForRoute.x + toForRoute.x) / 2 + sign * HDETOUR * stepMult
              addCand([
                { x: detourX, y: fromForRoute.y },
                { x: detourX, y: toForRoute.y },
              ])
            }
          }
        }

        candidates.sort(
          (a, b) =>
            a.bends - b.bends || a.crossings - b.crossings || a.length - b.length,
        )
        if (candidates.length > 0) {
          midPoints = candidates[0].waypoints
        }
        // candidates 전부를 후속 pathsAfterOverlapReassign 단계에 노출 (큰→작은 cores 순으로 idx 재배정)
        const allCandidates: Waypoint[][] = candidates.map((cd) => [
          fromPt,
          ...cd.waypoints,
          toPt,
        ])
        result.set(c.id, {
          path: [fromPt, ...midPoints, toPt],
          candidates: allCandidates,
        })
        continue
      }

      // 사용자 waypoint 가 있거나 지도 모드 → candidates 없이 path 만
      result.set(c.id, {
        path: [fromPt, ...midPoints, toPt],
        candidates: [],
      })
    }

    return result
  }, [cables, effectivePositions, effectiveWaypoints, cableAnchors, mode, kakaoMap])

  // segment overlap 통합 처리 (2026-05-24 owner 3번 선택):
  //   Pass 1: 모든 케이블 best path → segment overlap 그룹핑 → 그룹 안에서
  //           cores 큰 게 best 유지(직선), 작은 게 next-best candidate(우회) 재배정.
  //           같은 시설 쌍 / 다른 시설 쌍 모두 통합 처리.
  //   Pass 2: 재배정 후 새 path 로 segment 재분석 → 잔여 overlap 만 평행 이동.
  //   결과: paths(재배정 후 path) + offsets(잔여 평행 이동).
  const pathsWithOverlap = useMemo(() => {
    const finalPaths = new Map<string, Waypoint[]>()
    const offsets = new Map<string, number>()

    // 모든 cable best path 로 초기화
    for (const c of cables) {
      const data = rawCablePaths.get(c.id)
      if (data) finalPaths.set(c.id, data.path)
    }

    // segment 분석 헬퍼 — H/V segment 리스트 추출. 짧은 stub 무시. 대각선 skip.
    type Seg = { dir: 'H' | 'V'; perp: number; start: number; end: number }
    const SEG_MIN_LEN = 30
    function analyzeSegs(path: Waypoint[]): Seg[] {
      const segs: Seg[] = []
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i]
        const b = path[i + 1]
        const adx = Math.abs(b.x - a.x)
        const ady = Math.abs(b.y - a.y)
        const segLen = Math.hypot(adx, ady)
        if (segLen < SEG_MIN_LEN) continue
        if (ady < 15) {
          segs.push({
            dir: 'H',
            perp: (a.y + b.y) / 2,
            start: Math.min(a.x, b.x),
            end: Math.max(a.x, b.x),
          })
        } else if (adx < 15) {
          segs.push({
            dir: 'V',
            perp: (a.x + b.x) / 2,
            start: Math.min(a.y, b.y),
            end: Math.max(a.y, b.y),
          })
        }
      }
      return segs
    }

    // 임계 파라미터화 — Pass 1 은 loose (시각적 인접 인식), Pass 2 는 strict (실제 겹침).
    //   Pass 1 PERP_TOL=120: ㄷ자 우회로 VDETOUR(=halfH+80≈100px) 만큼 떨어진 segment 도 같은 그룹으로 인식.
    //     owner 의도 "B-029 주변 두 케이블 시각 분리" — perp 80px 떨어졌어도 시각적으로 같은 영역.
    //   Pass 2 PERP_TOL=20: 재배정 후 실제 겹친 케이블만 평행 이동.
    function segsOverlap(segsA: Seg[], segsB: Seg[], perpTol: number, ovMin: number): boolean {
      for (const sa of segsA) {
        for (const sb of segsB) {
          if (sa.dir !== sb.dir) continue
          if (Math.abs(sa.perp - sb.perp) > perpTol) continue
          const ov = Math.min(sa.end, sb.end) - Math.max(sa.start, sb.start)
          if (ov >= ovMin) return true
        }
      }
      return false
    }

    // union-find 로 segment 겹치는 그룹 추출 (현재 finalPaths 기준)
    function buildGroups(perpTol: number, ovMin: number): string[][] {
      const cableSegs = new Map<string, Seg[]>()
      for (const c of cables) {
        const path = finalPaths.get(c.id)
        if (!path || path.length < 2) continue
        const segs = analyzeSegs(path)
        if (segs.length > 0) cableSegs.set(c.id, segs)
      }
      const parent = new Map<string, string>()
      for (const id of cableSegs.keys()) parent.set(id, id)
      const find = (x: string): string => {
        const px = parent.get(x)
        if (!px || px === x) return x
        const root = find(px)
        parent.set(x, root)
        return root
      }
      const union = (x: string, y: string) => {
        const rx = find(x)
        const ry = find(y)
        if (rx !== ry) parent.set(rx, ry)
      }
      const ids = [...cableSegs.keys()]
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          if (segsOverlap(cableSegs.get(ids[i])!, cableSegs.get(ids[j])!, perpTol, ovMin)) {
            union(ids[i], ids[j])
          }
        }
      }
      const grouped = new Map<string, string[]>()
      for (const id of ids) {
        const root = find(id)
        const arr = grouped.get(root)
        if (arr) arr.push(id)
        else grouped.set(root, [id])
      }
      return [...grouped.values()].filter((g) => g.length > 1)
    }

    // Pass 1: cores 우선순위로 재배정. cores 큰 게 idx 0 (best 유지), 작은 게 candidate idx 1+ 사용.
    //   기준 (산업 관행 + owner "12C 우회" 의도):
    //     1. cores 큰 케이블 = 직선 우선 (백본 보존)
    //     2. 같은 cores: status existing → relocating → new → removing (기설 매핑 안정)
    //     3. tie: cable.id (deterministic)
    const statusRank: Record<CableStatus, number> = {
      existing: 0,
      relocating: 1,
      new: 2,
      removing: 3,
    }
    const cableById = new Map(cables.map((c) => [c.id, c]))
    const groupsPass1 = buildGroups(120, 40) // loose — 시각적 인접
    for (const grp of groupsPass1) {
      const sorted = grp
        .map((id) => cableById.get(id))
        .filter((c): c is CableEdge => Boolean(c))
        .sort((a, b) => {
          const ca = cableSpecCoreCount(a.spec as CableSpec)
          const cb = cableSpecCoreCount(b.spec as CableSpec)
          if (ca !== cb) return cb - ca
          const sa = statusRank[a.status] ?? 9
          const sb = statusRank[b.status] ?? 9
          if (sa !== sb) return sa - sb
          return a.id.localeCompare(b.id)
        })
      sorted.forEach((c, i) => {
        if (i === 0) return // 가장 큰 케이블 = best 유지
        const cands = rawCablePaths.get(c.id)?.candidates ?? []
        if (cands.length <= 1) return // candidate 없음 (waypoint 저장된 케이블 등) → 그대로
        // (2026-05-24 owner 보고) candidate idx max = 4 — 그 이상은 stepMult 2 의 큰
        //   detour candidate. 그룹에 5+ 케이블이면 일부 같은 path 사용 (가독성 차선).
        const useIdx = Math.min(i, 4, cands.length - 1)
        finalPaths.set(c.id, cands[useIdx])
      })
    }

    // Pass 2: 재배정 후 잔여 overlap → 평행 이동. (재배정으로 분리된 그룹은 buildGroups 가 제외)
    const groupsPass2 = buildGroups(20, 40) // strict — 실제 겹침
    for (const grp of groupsPass2) {
      const sorted = [...grp].sort()
      sorted.forEach((id, i) => {
        offsets.set(id, (i - (sorted.length - 1) / 2) * CABLE_SHIFT_GAP * 2)
      })
    }

    // 진단용 — 어떤 케이블이 어느 그룹에 묶이고 어떤 path idx 사용 중인지.
    //   owner 디버그 시 F12 콘솔 열어서 확인. production 빌드에도 남김 (작은 로그).
    if (typeof window !== 'undefined' && groupsPass1.length > 0) {
      const sha = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local'
      const summary = groupsPass1.map((g) =>
        g
          .map((id) => {
            const c = cableById.get(id)
            if (!c) return id
            const cand = rawCablePaths.get(id)?.candidates ?? []
            const finalP = finalPaths.get(id)
            const usedIdx = cand.findIndex((p) => p === finalP)
            const pts = finalP?.length ?? 0
            const coords =
              finalP?.map((p) => `(${p.x.toFixed(0)},${p.y.toFixed(0)})`).join('→') ?? ''
            return `${c.cable_code}(${c.spec},cands=${cand.length},used=${usedIdx},pts=${pts}) ${coords}`
          })
          .join('  ||  '),
      )
      console.log(`[relocation:${sha}] Pass1 그룹:`, summary)
    }

    return { paths: finalPaths, offsets }
  }, [cables, rawCablePaths])

  const cableOffsets = pathsWithOverlap.offsets

  // cablePathPoints — rawCablePaths 의 base path 를 가져와 shift offset 만 적용 (전체 평행 이동).
  //   라우팅 logic 자체는 rawCablePaths useMemo 에서 이미 한 번 계산. lens 폐기 (2026-05-24).
  const cablePathPoints = useCallback(
    (c: CableEdge): Waypoint[] => {
      // pathsWithOverlap 가 cores 우선 재배정 후 path 와 잔여 평행 이동 offset 둘 다 제공.
      const path = pathsWithOverlap.paths.get(c.id)
      if (!path || path.length < 2) return []

      // 도형 가장자리 trim — 시설 종류별 정확한 반경 적용.
      //   (2026-05-24 owner 보고) 시설 도형 위에 cable_code 마커·라벨이 그려져서 케이블이
      //   가려짐 → 도형과 케이블 사이 빈 공간 보임. 도형 가장자리에서 시작·도착하면
      //   마커·라벨이 도형 안에 있고 케이블은 도형 밖에서 도형 외곽에 직접 닿음.
      //   FacilityShape 의 도형별 반경에 -1 (시각적으로 살짝 잠겨야 도형이 케이블 끝점을 가려 닿아 보임).
      // 지도 모드는 trim 안 함 (2026-05-24 owner 보고):
      //   지도 모드에서는 시설 마커가 작고 줌과 함께 축소돼서 trim 만큼이 큰 비율로 보임 →
      //   케이블이 시설과 떨어져 보임. owner 가 기존(중심 직접 연결) 동작을 원함.
      const fromF = facilities.find((f) => f.id === c.from_facility_id)
      const toF = facilities.find((f) => f.id === c.to_facility_id)
      const fromR = mode === 'map' ? 0 : facilityEdgeRadius(fromF?.closure_type)
      const toR = mode === 'map' ? 0 : facilityEdgeRadius(toF?.closure_type)
      const trimEdge = (start: Waypoint, next: Waypoint, radius: number): Waypoint => {
        if (radius === 0) return start
        const dx = next.x - start.x
        const dy = next.y - start.y
        const d = Math.hypot(dx, dy)
        if (d <= radius) return start
        return {
          x: start.x + dx * (radius / d),
          y: start.y + dy * (radius / d),
        }
      }
      const trimmed: Waypoint[] =
        path.length === 2
          ? [trimEdge(path[0], path[1], fromR), trimEdge(path[1], path[0], toR)]
          : [trimEdge(path[0], path[1], fromR), ...path.slice(1, -1), trimEdge(path[path.length - 1], path[path.length - 2], toR)]

      const fromPt = path[0]
      const toPt = path[path.length - 1]
      const offset = cableOffsets.get(c.id) ?? 0
      if (offset === 0) return trimmed
      const overallDx = toPt.x - fromPt.x
      const overallDy = toPt.y - fromPt.y
      const len = Math.hypot(overallDx, overallDy) || 1
      const nx = -overallDy / len
      const ny = overallDx / len

      // 평행 이동 시 첫·끝점은 시설 도형 가장자리 유지, 중간 점만 평행 이동.
      //   (2026-05-24) 전체 평행 이동 시 케이블 시작·종료가 시설 도형에서 offset 만큼
      //   떨어져 보임 → 첫·끝 segment 가 살짝 꺾여 시설 도형까지 자연히 연결되도록.
      if (trimmed.length === 2) return trimmed // 끝점 두 개뿐이면 평행 이동 안 함
      const offsetMid = trimmed
        .slice(1, -1)
        .map((p) => ({ x: p.x + nx * offset, y: p.y + ny * offset }))
      return [trimmed[0], ...offsetMid, trimmed[trimmed.length - 1]]
    },
    [pathsWithOverlap, cableOffsets, facilities, mode],
  )

  // 경로점의 화면 좌표 — 도식: x/y · 지도: lat/lng 투영 (없으면 null)
  const waypointScreenPos = useCallback(
    (w: Waypoint): { x: number; y: number } | null => {
      if (mode === 'map') {
        const m = kakaoMap
        if (!m || w.lat == null || w.lng == null) return null
        const pt = m
          .getProjection()
          .containerPointFromCoords(new kakao.maps.LatLng(w.lat, w.lng))
        return { x: pt.x, y: pt.y }
      }
      return { x: w.x, y: w.y }
    },
    [mode, kakaoMap],
  )

  // waypoint 추가 — 선분 i (점 i ~ 점 i+1 사이) 클릭 시 waypoints 의 index i 에 삽입
  const addWaypoint = async (cableId: string, segmentIndex: number, x: number, y: number) => {
    const current = effectiveWaypoints(cableId)
    let wp: Waypoint = { x: Math.round(x), y: Math.round(y) }
    // 지도 모드 — 클릭 픽셀을 GPS 좌표로 역변환해 함께 저장
    if (mode === 'map' && kakaoMap) {
      const ll = kakaoMap
        .getProjection()
        .coordsFromContainerPoint(new kakao.maps.Point(x, y))
      wp = {
        x: Math.round(x),
        y: Math.round(y),
        lat: ll.getLat(),
        lng: ll.getLng(),
      }
    }
    const next = [
      ...current.slice(0, segmentIndex),
      wp,
      ...current.slice(segmentIndex),
    ]
    setCableWaypoints((prev) => ({ ...prev, [cableId]: next }))
    const result = await saveCableWaypoints(
      projectId,
      cableId,
      next,
      mode === 'map' ? 'map_waypoints' : 'waypoints',
    )
    if (!result.ok) toast.error(result.error)
  }

  // waypoint 삭제 — 우클릭
  const removeWaypoint = async (cableId: string, index: number) => {
    const current = effectiveWaypoints(cableId)
    const next = current.filter((_, i) => i !== index)
    setCableWaypoints((prev) => ({ ...prev, [cableId]: next }))
    const result = await saveCableWaypoints(
      projectId,
      cableId,
      next,
      mode === 'map' ? 'map_waypoints' : 'waypoints',
    )
    if (!result.ok) toast.error(result.error)
  }

  // 멀티터치 핀치 시도 — 자식 (시설/라벨/케이블/waypoint) pointerdown 핸들러도
  //   호출. 첫 손가락이 시설 위에 떨어진 상태에서 두 번째 손가락이 어디든 떨어지면
  //   pinch zoom 시작해야 한다. 자식이 stopPropagation 하므로 SVG 핸들러까지 안 오니
  //   각 자식이 직접 등록·검사한다 (owner 보고 2026-05-25 — 모바일 핀치 안 됨).
  //   반환값 true = pinch 시작됨 → 자식 핸들러는 abort 해야 함.
  const tryStartPinchFromChild = (e: React.PointerEvent): boolean => {
    if (mode === 'map') return false
    if (e.pointerType !== 'touch') return false
    const svg = svgRef.current
    if (!svg) return false
    activeTouchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (activeTouchesRef.current.size < 2) return false
    // 두 번째 손가락 도착 — 핀치 시작. 모든 진행 중 드래그 취소.
    panRef.current = null
    marqueeRef.current = null
    setMarquee(null)
    labelDragRef.current = null
    waypointDragRef.current = null
    groupDragRef.current = null
    interactionRef.current = null
    setDragging(null)
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return false
    const _ctm = svg.getScreenCTM()
    const _inv = _ctm?.inverse()
    const screenToSvgX = _inv?.a ?? viewport.width / rect.width
    const screenToSvgY = _inv?.d ?? viewport.height / rect.height
    const pts = Array.from(activeTouchesRef.current.values())
    const dx = pts[1].x - pts[0].x
    const dy = pts[1].y - pts[0].y
    pinchRef.current = {
      startDist: Math.hypot(dx, dy) || 1,
      startMidX: (pts[0].x + pts[1].x) / 2,
      startMidY: (pts[0].y + pts[1].y) / 2,
      startVx: viewport.x,
      startVy: viewport.y,
      startVw: viewport.width,
      startVh: viewport.height,
      rectLeft: rect.left,
      rectTop: rect.top,
      rectWidth: rect.width,
      rectHeight: rect.height,
      screenToSvgX,
      screenToSvgY,
    }
    try {
      svg.setPointerCapture(e.pointerId)
    } catch {}
    return true
  }

  // waypoint 드래그 시작
  const onWaypointPointerDown = (
    e: React.PointerEvent<SVGCircleElement>,
    cableId: string,
    index: number,
  ) => {
    if (!editable) return
    // 멀티터치 두 번째 손가락이면 pinch 시작 + drag setup abort
    if (tryStartPinchFromChild(e)) return
    e.stopPropagation()
    const { x, y } = toSvgCoord(e.clientX, e.clientY)
    const wp = effectiveWaypoints(cableId)[index]
    if (!wp) return
    // 경로점의 현재 화면 좌표 기준으로 offset 계산 (지도 모드는 lat/lng 투영값)
    const sp = waypointScreenPos(wp)
    if (!sp) return
    waypointDragRef.current = {
      cableId,
      index,
      startX: x,
      startY: y,
      offsetX: x - sp.x,
      offsetY: y - sp.y,
      hasMoved: false,
    }
    // 원 요소에 캡처 — 지도 모드(SVG 루트 pointer-events:none)에서도 안정적
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerDown = (e: React.PointerEvent<SVGGElement>, id: string) => {
    if (!editable) return
    // 멀티터치 두 번째 손가락이면 pinch 시작 + drag setup abort
    if (tryStartPinchFromChild(e)) return
    // 도식·지도 모드 공통 — pointer 캡처로 드래그. 지도 모드도 동일 (Phase 2).
    e.stopPropagation()
    const { x, y } = toSvgCoord(e.clientX, e.clientY)
    const pos = effectivePositions[id]
    if (!pos) return
    // 그룹 드래그 — 다중 선택 상태에서 선택된 시설 중 하나를 잡으면 전체를 같이 이동.
    //   도식 모드 + 좌클릭 + 잡은 시설이 selectedIds 에 포함 + 2 개 이상 선택일 때만.
    if (
      mode === 'schematic' &&
      e.button === 0 &&
      selectedIds.has(id) &&
      selectedIds.size > 1
    ) {
      const startPositions = new Map<string, { x: number; y: number }>()
      for (const sid of selectedIds) {
        const p = effectivePositions[sid]
        if (p) startPositions.set(sid, { x: p.x, y: p.y })
      }
      // 양 끝이 모두 선택된 케이블의 사용자 경로점도 함께 이동 — 메타(pole_name·dist) 보존.
      const startCableWaypoints = new Map<string, Waypoint[]>()
      for (const c of cables) {
        if (!selectedIds.has(c.from_facility_id) || !selectedIds.has(c.to_facility_id)) continue
        const wps = effectiveWaypoints(c.id)
        if (wps.length === 0) continue
        startCableWaypoints.set(c.id, wps.map((w) => ({ ...w })))
      }
      groupDragRef.current = { anchorId: id, startPositions, startCableWaypoints, hasMoved: false }
    }
    interactionRef.current = {
      id,
      button: e.button,
      startX: x,
      startY: y,
      offsetX: x - pos.x,
      offsetY: y - pos.y,
      hasMoved: false,
      pointerType: e.pointerType,
      origPos: { x: pos.x, y: pos.y },
    }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }

  // 시설명 라벨 드래그 시작 — 라벨 위 투명 hit rect 의 pointerdown.
  const onLabelPointerDown = (
    e: React.PointerEvent<SVGRectElement>,
    facilityId: string,
    curDx: number,
    curDy: number,
  ) => {
    if (!editable) return
    if (tryStartPinchFromChild(e)) return
    e.stopPropagation()
    const { x, y } = toSvgCoord(e.clientX, e.clientY)
    labelDragRef.current = {
      id: facilityId,
      startX: x,
      startY: y,
      startDx: curDx,
      startDy: curDy,
      hasMoved: false,
    }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }

  // SVG 빈 영역 pointerdown — pan 시작. 노드 위는 노드 onPointerDown 에서 stopPropagation
  // 하므로 여기까지 안 옴.
  const onSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    // 지도 모드 — pan 은 카카오맵이 직접 처리 (SVG 루트 pointer-events:none)
    if (mode === 'map') return
    if (interactionRef.current) return  // 노드 드래그 중이면 무시 (이론상 도달 안 함)

    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return

    // === 멀티터치 — 손가락이 어디 떨어지든 SVG 루트가 받음 (bubble) ===
    // 두 번째 손가락이 시설/케이블 위에 떨어져도 핀치 zoom 이 동작해야 함.
    // (owner 보고 2026-05-25 — 한 손가락이라도 시설 위면 pinch 안 됐던 버그)
    if (e.pointerType === 'touch') {
      activeTouchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (activeTouchesRef.current.size === 2) {
        // 두 번째 손가락 도착 → 핀치 시작. 진행 중인 모든 다른 드래그 취소.
        //   pan/marquee 뿐 아니라 시설 드래그·라벨 드래그·waypoint 드래그·그룹 드래그
        //   모두 중단. 그렇지 않으면 한 손가락이 라벨/시설을 움직이면서 다른 손가락이
        //   pinch 를 시도해 「선택영역과 화면확대영역 차이」 가 생김 (owner 2026-05-25).
        panRef.current = null
        marqueeRef.current = null
        setMarquee(null)
        labelDragRef.current = null
        waypointDragRef.current = null
        groupDragRef.current = null
        interactionRef.current = null
        setDragging(null)
        // CTM 기반 screen→SVG 비율
        const _ctm = svg.getScreenCTM()
        const _inv = _ctm?.inverse()
        const screenToSvgX = _inv?.a ?? viewport.width / rect.width
        const screenToSvgY = _inv?.d ?? viewport.height / rect.height
        const pts = Array.from(activeTouchesRef.current.values())
        const dx = pts[1].x - pts[0].x
        const dy = pts[1].y - pts[0].y
        pinchRef.current = {
          startDist: Math.hypot(dx, dy) || 1,
          startMidX: (pts[0].x + pts[1].x) / 2,
          startMidY: (pts[0].y + pts[1].y) / 2,
          startVx: viewport.x,
          startVy: viewport.y,
          startVw: viewport.width,
          startVh: viewport.height,
          rectLeft: rect.left,
          rectTop: rect.top,
          rectWidth: rect.width,
          rectHeight: rect.height,
          screenToSvgX,
          screenToSvgY,
        }
        // 두 번째 손가락도 SVG 가 캡처해 후속 move/up 이 안 새도록.
        try {
          svg.setPointerCapture(e.pointerId)
        } catch {}
        return
      }
    }

    // SVG 배경을 직접 누른 경우만 pan/marquee. 케이블·라벨·시설 위에서 누르면 시작 안 함
    // — setPointerCapture 가 케이블 click 이벤트를 SVG 로 가로채는 것을 방지.
    if (e.target !== svgRef.current) return
    // 선택 도구 ON — pan 대신 marquee(사각 범위 선택) 시작
    if (selectTool && e.button === 0) {
      const { x, y } = toSvgCoord(e.clientX, e.clientY)
      marqueeRef.current = { startX: x, startY: y, hasMoved: false }
      setMarquee({ x, y, w: 0, h: 0 })
      svg.setPointerCapture(e.pointerId)
      return
    }
    // CTM 역행렬로 screen px → SVG unit 정확한 비율 계산.
    //   SVG 의 preserveAspectRatio 기본값 'xMidYMid meet' 은 viewBox 와 rect 의
    //   aspect ratio 가 다를 때 letterbox 와 함께 uniform scale 적용한다.
    //   기존 viewport.width/rect.width 같은 단순 비율은 letterbox 보정 안 되어 한 축이 느리거나 빠름.
    //   getScreenCTM().inverse().a / .d 가 실제 적용된 scale 이라 정확.
    const _ctm = svg.getScreenCTM()
    const _inv = _ctm?.inverse()
    const screenToSvgX = _inv?.a ?? viewport.width / rect.width
    const screenToSvgY = _inv?.d ?? viewport.height / rect.height
    panRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startVx: viewport.x,
      startVy: viewport.y,
      scaleX: screenToSvgX,
      scaleY: screenToSvgY,
      hasMoved: false,
    }
    // SVG element 에 capture — 마우스가 SVG 밖으로 나가도 pointermove 계속 받기
    svg.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    // 1) 노드 드래그 진행 중
    const ir = interactionRef.current
    if (ir) {
      const { x, y } = toSvgCoord(e.clientX, e.clientY)
      const dx = x - ir.startX
      const dy = y - ir.startY
      // 모바일 터치 — 임계값을 화면 픽셀 30px 상당으로 ↑ (손가락 떨림으로 인한 의도치 않은 이동 방지)
      //   SVG 좌표계라 viewport 스케일 반영해야 함 (확대 시 더 큰 SVG 거리 필요)
      const svgPxPerScreenPx = svgRef.current
        ? viewport.width / (svgRef.current.getBoundingClientRect().width || 1)
        : 1
      const threshold =
        ir.pointerType === 'touch' ? 30 * svgPxPerScreenPx : DRAG_THRESHOLD
      if (!ir.hasMoved && Math.hypot(dx, dy) < threshold) return
      if (!ir.hasMoved) {
        ir.hasMoved = true
        setDragging(ir.id)
        // 단일 선택은 드래그 시 해제. 그룹 드래그(다중) 중에는 selectedIds 유지.
        if (!groupDragRef.current) setSelectedId(null)
      }
      // 그룹 드래그 — anchor 의 시작 좌표 + delta 로 모든 선택 시설을 동일 delta 이동.
      //   스냅은 anchor 만 적용 → 같은 delta 로 나머지 보정. 케이블도 자동 따라감.
      const gd = groupDragRef.current
      if (gd) {
        gd.hasMoved = true
        const anchorStart = gd.startPositions.get(gd.anchorId)
        if (!anchorStart) return
        // anchor 의 새 위치 (스냅 적용)
        let anchorNew = { x: x - ir.offsetX, y: y - ir.offsetY }
        if (ir.button === 0) {
          const snapped = snapToFacilities(anchorNew, gd.anchorId)
          anchorNew = snapped.pos
          setSnapGuide(snapped.guide)
        }
        const gdx = anchorNew.x - anchorStart.x
        const gdy = anchorNew.y - anchorStart.y
        setPositions((prev) => {
          const next = { ...prev }
          for (const [sid, sStart] of gd.startPositions.entries()) {
            next[sid] = { x: sStart.x + gdx, y: sStart.y + gdy }
          }
          return next
        })
        // 양 끝 모두 선택된 케이블 — 사용자 경로점도 동일 delta 이동 (메타 보존)
        if (gd.startCableWaypoints.size > 0) {
          setCableWaypoints((prev) => {
            const next = { ...prev }
            for (const [cid, startWps] of gd.startCableWaypoints.entries()) {
              next[cid] = startWps.map((w) => ({
                ...w,
                x: Math.round(w.x + gdx),
                y: Math.round(w.y + gdy),
              }))
            }
            return next
          })
        }
        return
      }
      let np = { x: x - ir.offsetX, y: y - ir.offsetY }
      // 지도 모드는 mapDragPos(임시 픽셀)에, 도식 모드는 positions(영구 레이아웃)에 기록
      if (mode === 'map') {
        setMapDragPos((prev) => ({ ...prev, [ir.id]: np }))
      } else {
        // 좌클릭(button 0) 드래그 — 다른 시설과 수직·수평 정렬 스냅.
        //   우클릭 등은 스냅 없이 자유 이동.
        if (ir.button === 0) {
          const snapped = snapToFacilities(np, ir.id)
          np = snapped.pos
          setSnapGuide(snapped.guide)
        }
        setPositions((prev) => ({ ...prev, [ir.id]: np }))
      }
      return
    }
    // 1.5) 시설명 라벨 드래그 진행 중
    const ld = labelDragRef.current
    if (ld) {
      const { x, y } = toSvgCoord(e.clientX, e.clientY)
      const dx = x - ld.startX
      const dy = y - ld.startY
      if (!ld.hasMoved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      ld.hasMoved = true
      setLabelOffsets((prev) => ({
        ...prev,
        [ld.id]: {
          dx: Math.round(ld.startDx + dx),
          dy: Math.round(ld.startDy + dy),
        },
      }))
      return
    }
    // 2) 케이블 waypoint 드래그 진행 중
    const wd = waypointDragRef.current
    if (wd) {
      const { x, y } = toSvgCoord(e.clientX, e.clientY)
      const dx = x - wd.startX
      const dy = y - wd.startY
      if (!wd.hasMoved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      wd.hasMoved = true
      let nx = x - wd.offsetX
      let ny = y - wd.offsetY
      // 도식 모드 — 경로점을 양옆 점 기준 수직·수평 정렬 스냅
      if (mode !== 'map') {
        const snapped = snapWaypoint(nx, ny, wd.cableId, wd.index)
        nx = snapped.x
        ny = snapped.y
        setSnapGuide(snapped.guide)
      }
      // 지도 모드 — 픽셀을 GPS 좌표로 역변환
      let llPart: { lat: number; lng: number } | null = null
      if (mode === 'map' && kakaoMap) {
        const ll = kakaoMap
          .getProjection()
          .coordsFromContainerPoint(new kakao.maps.Point(nx, ny))
        llPart = { lat: ll.getLat(), lng: ll.getLng() }
      }
      setCableWaypoints((prev) => {
        const base = prev[wd.cableId] ?? effectiveWaypoints(wd.cableId)
        const next = base.map((w, i) => {
          if (i !== wd.index) return w
          // 위치만 갱신하고 전주명·구간거리는 보존
          const moved: Waypoint = { ...w, x: Math.round(nx), y: Math.round(ny) }
          if (llPart) {
            moved.lat = llPart.lat
            moved.lng = llPart.lng
          }
          return moved
        })
        return { ...prev, [wd.cableId]: next }
      })
      return
    }
    // 2.5) marquee(사각 범위 선택) 진행 중
    const mq = marqueeRef.current
    if (mq) {
      const { x, y } = toSvgCoord(e.clientX, e.clientY)
      const dx = x - mq.startX
      const dy = y - mq.startY
      if (!mq.hasMoved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      mq.hasMoved = true
      setMarquee({
        x: Math.min(mq.startX, x),
        y: Math.min(mq.startY, y),
        w: Math.abs(dx),
        h: Math.abs(dy),
      })
      return
    }
    // 2.7) 두 손가락 핀치 — 줌·팬 동시. activeTouchesRef 갱신 + pinch 계산.
    if (e.pointerType === 'touch' && activeTouchesRef.current.has(e.pointerId)) {
      activeTouchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const pinch = pinchRef.current
      if (pinch && activeTouchesRef.current.size === 2) {
        const pts = Array.from(activeTouchesRef.current.values())
        const dx = pts[1].x - pts[0].x
        const dy = pts[1].y - pts[0].y
        const dist = Math.hypot(dx, dy) || 1
        const midX = (pts[0].x + pts[1].x) / 2
        const midY = (pts[0].y + pts[1].y) / 2
        // scale: 손가락이 멀어지면 확대(viewport 축소)
        const scale = dist / pinch.startDist
        // viewport 한계 (wheel zoom 과 동일)
        const minW = 200
        const maxW = 12000
        const newW = Math.max(minW, Math.min(maxW, pinch.startVw / scale))
        const newH = Math.max(minW * 0.75, Math.min(maxW * 0.75, pinch.startVh / scale))
        // CTM 기반 screen→SVG 비율로 anchor 계산 (letterbox 가 있어도 정확).
        // 시작 viewport 기준 시작 중점에 해당하는 SVG 좌표 = anchor.
        const sxStart =
          pinch.startVx + (pinch.startMidX - pinch.rectLeft) * pinch.screenToSvgX
        const syStart =
          pinch.startVy + (pinch.startMidY - pinch.rectTop) * pinch.screenToSvgY
        // 새 viewport 의 screen→SVG 비율 = scale 변화에 비례 (uniform scale 가정)
        const newScreenToSvgX = pinch.screenToSvgX * (newW / pinch.startVw)
        const newScreenToSvgY = pinch.screenToSvgY * (newH / pinch.startVh)
        // 현재 중점이 같은 SVG 좌표를 가리키도록 viewport.x/y 계산 (anchor + 팬)
        const newVx = sxStart - (midX - pinch.rectLeft) * newScreenToSvgX
        const newVy = syStart - (midY - pinch.rectTop) * newScreenToSvgY
        setViewport({ x: newVx, y: newVy, width: newW, height: newH })
        return
      }
    }
    // 3) 빈 영역 pan 진행 중
    const pan = panRef.current
    if (pan) {
      const dx = e.clientX - pan.startClientX
      const dy = e.clientY - pan.startClientY
      if (!pan.hasMoved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      pan.hasMoved = true
      // 드래그 방향으로 화면이 이동 = viewport 는 반대로 이동
      setViewport((v) => ({
        ...v,
        x: pan.startVx - dx * pan.scaleX,
        y: pan.startVy - dy * pan.scaleY,
      }))
    }
  }

  const onPointerUp = async (e?: React.PointerEvent<SVGSVGElement>) => {
    // 멀티터치 정리 — touch pointer 떨어지면 추적 맵에서 제거.
    //   2 개 미만 되면 핀치 종료.
    if (e && e.pointerType === 'touch') {
      activeTouchesRef.current.delete(e.pointerId)
      if (activeTouchesRef.current.size < 2) {
        pinchRef.current = null
      }
      // 핀치 직후의 click 으로 선택 해제 안 되게 flag
      if (e.pointerType === 'touch' && pinchRef.current === null) {
        // 핀치 중이었다면 recentlyPannedRef 플래그 활용
      }
    }
    // 1) 노드 드래그 마무리
    const ir = interactionRef.current
    if (ir) {
      const gd = groupDragRef.current
      interactionRef.current = null
      groupDragRef.current = null
      setSnapGuide(null)
      // 모바일 터치 — 시설 이동 직전 확인. 취소 시 원위치 복원 + 저장 skip.
      //   손으로 화면 이동(pan) 시 의도치 않은 시설 이동 방지.
      if (ir.hasMoved && ir.pointerType === 'touch') {
        const count = gd ? gd.startPositions.size : 1
        const msg =
          count > 1
            ? `시설 ${count}개를 이동하시겠습니까?`
            : '시설을 이동하시겠습니까?'
        if (!confirm(msg)) {
          // 취소 — 원위치로 복원 (group 은 모든 시설 + 케이블 경로점, 단일은 해당 시설만)
          setDragging(null)
          if (gd) {
            setPositions((prev) => {
              const next = { ...prev }
              for (const [sid, sStart] of gd.startPositions.entries()) {
                next[sid] = { x: sStart.x, y: sStart.y }
              }
              return next
            })
            if (gd.startCableWaypoints.size > 0) {
              setCableWaypoints((prev) => {
                const next = { ...prev }
                for (const [cid, startWps] of gd.startCableWaypoints.entries()) {
                  next[cid] = startWps.map((w) => ({ ...w }))
                }
                return next
              })
            }
          } else if (mode === 'map') {
            setMapDragPos((prev) => {
              const next = { ...prev }
              delete next[ir.id]
              return next
            })
          } else {
            setPositions((prev) => ({
              ...prev,
              [ir.id]: { x: ir.origPos.x, y: ir.origPos.y },
            }))
          }
          return
        }
      }
      if (ir.hasMoved && gd) {
        // 그룹 드래그 일괄 저장 — 모든 선택 시설의 새 좌표 한 번에 push
        setDragging(null)
        const updates: { id: string; x: number; y: number }[] = []
        for (const sid of gd.startPositions.keys()) {
          const p = effectivePositions[sid]
          if (p) updates.push({ id: sid, x: p.x, y: p.y })
        }
        // 시설 위치 + 영향받은 케이블 경로점 동시 저장 (병렬)
        const tasks: Promise<{ ok: true } | { ok: false; error: string }>[] = []
        if (updates.length > 0) tasks.push(saveNodePositions(projectId, updates))
        for (const cid of gd.startCableWaypoints.keys()) {
          const wps = effectiveWaypoints(cid)
          tasks.push(saveCableWaypoints(projectId, cid, wps, 'waypoints'))
        }
        const results = await Promise.all(tasks)
        const failed = results.find((r) => !r.ok)
        if (failed && !failed.ok) toast.error(failed.error)
        return
      }
      if (ir.hasMoved) {
        setDragging(null)
        const pos = effectivePositions[ir.id]
        if (mode === 'map') {
          // 지도 모드 — 드롭한 픽셀을 GPS 좌표로 역변환해 저장
          const m = kakaoMap
          if (pos && m) {
            const cx = pos.x + NODE_SIZE.width / 2
            const cy = pos.y + NODE_SIZE.height / 2 - 10
            const ll = m
              .getProjection()
              .coordsFromContainerPoint(new kakao.maps.Point(cx, cy))
            const result = await updateFacilityLatLng({
              project_id: projectId,
              facility_id: ir.id,
              lat: ll.getLat(),
              lng: ll.getLng(),
            })
            if (!result.ok) {
              toast.error(result.error)
              // 실패 시 override 제거 → 원래 위치로 복귀
              setMapDragPos((prev) => {
                const next = { ...prev }
                delete next[ir.id]
                return next
              })
            } else {
              toast.success('시설 위치를 저장했습니다')
              router.refresh()
            }
          }
        } else if (pos) {
          const result = await saveNodePositions(projectId, [
            { id: ir.id, x: pos.x, y: pos.y },
          ])
          if (!result.ok) toast.error(result.error)
        }
      } else {
        handleNodeClick(ir.id)
      }
      return
    }
    // 1.5) 시설명 라벨 드래그 마무리
    const ld = labelDragRef.current
    if (ld) {
      labelDragRef.current = null
      if (ld.hasMoved) {
        const off = labelOffsets[ld.id]
        if (off) {
          const result = await saveFacilityLabelOffset(
            projectId,
            ld.id,
            off.dx,
            off.dy,
            mode === 'map' ? 'map' : 'schematic',
          )
          if (!result.ok) {
            toast.error(result.error)
          } else {
            // 저장 성공 — 로컬 override 를 일부러 그대로 둠.
            //   - 이걸 즉시 지우면 router.refresh() 가 새 데이터 받기 전 한 프레임 동안
            //     SVG 가 stale prop (옛 위치) 로 폴백 → 라벨이 "원위치로 갔다가 새 위치로"
            //     깜박이는 현상이 생김 (owner 보고 2026-05-25 — 편집 중인 모드에서 발생).
            //   - 다른 모드 라벨까지 안 새도록 정리는 「모드 전환 시」 setLabelOffsets({})
            //     에서 일괄 처리 (도식↔지도 토글 핸들러).
            //   - router.refresh() 만 호출해 다른 패널·배지·합계가 새 데이터를 받게 함.
            router.refresh()
          }
        }
      } else {
        // 이동 없이 클릭 — 시설 선택 (도형 클릭과 동일)
        handleNodeClick(ld.id)
      }
      return
    }
    // 2) 케이블 waypoint 드래그 마무리
    const wd = waypointDragRef.current
    if (wd) {
      waypointDragRef.current = null
      setSnapGuide(null)
      if (wd.hasMoved) {
        const result = await saveCableWaypoints(
          projectId,
          wd.cableId,
          effectiveWaypoints(wd.cableId),
          mode === 'map' ? 'map_waypoints' : 'waypoints',
        )
        if (!result.ok) toast.error(result.error)
      }
      return
    }
    // 2.5) marquee 마무리 — 사각 범위 안 시설 모두 selectedIds 에 담음
    const mq = marqueeRef.current
    if (mq) {
      marqueeRef.current = null
      if (mq.hasMoved && marquee) {
        const x0 = marquee.x
        const y0 = marquee.y
        const x1 = marquee.x + marquee.w
        const y1 = marquee.y + marquee.h
        const halfW = NODE_SIZE.width / 2
        const halfH = NODE_SIZE.height / 2
        const hit = new Set<string>()
        for (const f of facilities) {
          const pos = effectivePositions[f.id]
          if (!pos) continue
          const cx = pos.x + halfW
          const cy = pos.y + halfH - 10
          if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) hit.add(f.id)
        }
        setSelectedIds(hit)
        // 드래그 직후의 click 으로 선택이 즉시 해제되지 않게 flag (pan 과 동일 패턴)
        recentlyPannedRef.current = true
      } else {
        // 빈 클릭 — 선택 해제
        setSelectedIds(new Set())
      }
      setMarquee(null)
      return
    }
    // 3) pan 마무리. 드래그 이동했으면 onCanvasClick 무시 flag
    const pan = panRef.current
    if (pan) {
      panRef.current = null
      if (pan.hasMoved) recentlyPannedRef.current = true
    }
  }

  const onCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    // 지도 모드 — 빈 영역 클릭은 카카오맵으로 통과 (SVG 루트 pointer-events:none)
    if (mode === 'map') return
    // pan 드래그 직후의 click 은 무시 (화면 이동만 한 것임)
    if (recentlyPannedRef.current) {
      recentlyPannedRef.current = false
      return
    }
    // 드래그 직후의 pointerup 이 click 으로 전파되는 경우 무시
    if (interactionRef.current) return

    // 시설 노드·케이블 위 클릭은 빈 영역이 아님 — 그 click 이벤트가 SVG 까지 bubble 되어도
    // 무시한다. (안 그러면 노드 클릭으로 한 선택이 직후 click 으로 바로 해제됨)
    // SVG 배경을 직접 클릭한 경우만 e.target === svg.
    if (e.target !== svgRef.current) return

    // 실사정보 배치 모드 — 클릭 위치에 즉시 등록 (모달 X, 이름 자동)
    if (inspectionPlaceMode) {
      const { x, y } = toSvgCoord(e.clientX, e.clientY)
      const placedX = Math.max(0, Math.round(x - NODE_SIZE.width / 2))
      const placedY = Math.max(0, Math.round(y - NODE_SIZE.height / 2))
      void (async () => {
        const r = await createInspectionFacility({
          project_id: projectId,
          x: placedX,
          y: placedY,
        })
        if (!r.ok) {
          toast.error(r.error)
          return
        }
        // 실사 모드 세션 배지 카운트 ↑
        setSketchInspectionCount((n) => n + 1)
        toast.success(`「${r.name}」 배치 완료`)
        router.refresh()
      })()
      setInspectionPlaceMode(false)
      return
    }

    // 추가 모드 ON — 클릭 좌표에서 노드 중심 기준으로 좌상단 위치 환산해 임시 배치
    if (addTool) {
      const { x, y } = toSvgCoord(e.clientX, e.clientY)
      // 클릭 지점이 노드 중심에 오도록 NODE_SIZE 의 절반만큼 빼기
      const placedX = Math.max(0, Math.round(x - NODE_SIZE.width / 2))
      const placedY = Math.max(0, Math.round(y - NODE_SIZE.height / 2))
      setPendingPlacement({ closureType: addTool, kind: 'xy', x: placedX, y: placedY })
      setAddTool(null)  // 1회 배치 후 도구 해제 (연속 추가는 다시 클릭)
      setSelectedId(null)
      return
    }

    // 빈 영역 클릭 시 선택 해제 (시설·케이블 모두)
    setSelectedId(null)
    setSelectedCableId(null)
  }

  const fromFacility = pendingConnection
    ? facilities.find((f) => f.id === pendingConnection.fromId)
    : null
  const toFacility = pendingConnection
    ? facilities.find((f) => f.id === pendingConnection.toId)
    : null

  const isFullscreen = canvasSize === 'fullscreen'
  // 전체화면은 z-50 — 하단 탭바(BottomNav, z-40)를 덮어 가린다.
  //   owner 요청: 최대 확장 시 홈/사무/작업/자재 탭이 캡처 화면을 가리지 않게.
  const wrapperClass = isFullscreen
    ? 'fixed inset-0 z-50 bg-white border border-slate-200 overflow-hidden flex flex-col'
    : 'border border-slate-200 rounded-xl bg-white overflow-hidden'

  return (
    <div className={wrapperClass}>
      <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2 overflow-x-auto">
        <p className="shrink-0 text-xs text-slate-600">
          시설 {facilities.length}개 · 케이블 {cables.length}개
        </p>
        <div className="ml-auto flex items-center gap-1 shrink-0">
          {/* 도식 / 지도 모드 토글 */}
          <div className="mr-1 inline-flex items-center rounded-md border border-slate-300 overflow-hidden">
            <button
              type="button"
              onClick={() => {
                setMode('schematic')
                setCaptureActive(false)
                setAutoCaptureActive(false)
                // 모드 전환 시 라벨 로컬 override 비움 — 한쪽 모드에서 만든 drag offset 이
                // 다른 모드 라벨에도 적용되는 현상 방지 (owner 2026-05-25).
                setLabelOffsets({})
              }}
              className={
                'inline-flex items-center gap-1 px-2 h-7 text-[11px] font-medium ' +
                (mode === 'schematic'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:bg-slate-50')
              }
            >
              <Network className="h-3 w-3" />
              도식
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('map')
                // 지도 모드에 없는 도식 전용 도구는 정리
                setAddTool(null)
                setCableTool(null)
                setLabelOffsets({})
              }}
              className={
                'inline-flex items-center gap-1 px-2 h-7 text-[11px] font-medium border-l border-slate-300 ' +
                (mode === 'map'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:bg-slate-50')
              }
            >
              <MapIcon className="h-3 w-3" />
              지도
            </button>
          </div>

          {/* 위성 토글 — 지도 모드 한정. roadmap ↔ hybrid(위성+도로명) 전환.
              시설 좌표는 GPS 라 두 모드 모두 동일 위치에 그려진다. */}
          {mode === 'map' && (
            <button
              type="button"
              onClick={() =>
                setMapTypeId((t) => (t === 'hybrid' ? 'roadmap' : 'hybrid'))
              }
              className={
                'mr-1 inline-flex items-center gap-1 rounded-md border px-2 h-7 text-[11px] font-medium ' +
                (mapTypeId === 'hybrid'
                  ? 'bg-emerald-600 text-white border-emerald-700'
                  : 'text-slate-700 border-slate-300 hover:bg-slate-50')
              }
              title={mapTypeId === 'hybrid' ? '일반 지도로 전환' : '위성 + 도로명으로 전환'}
            >
              <Layers className="h-3 w-3" />
              {mapTypeId === 'hybrid' ? '위성' : '위성'}
            </button>
          )}

          {/* 배경 흐림 슬라이더 — 0(원본) ~ 100(회색조 최대) 드래그 조정.
              지도/위성 두 모드 공통. 더블클릭으로 0(끄기) ↔ 70(기본) 토글. */}
          {mode === 'map' && (
            <div
              className="mr-1 inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-2 h-7"
              title={dimLevel === 0 ? '배경 흐림: 끔' : `배경 흐림: ${dimLevel}%`}
            >
              <button
                type="button"
                onClick={() => setDimLevel((v) => (v === 0 ? 70 : 0))}
                className="text-[10px] font-medium text-slate-600 whitespace-nowrap hover:text-slate-900"
                title="원본 ↔ 기본(70%) 토글"
              >
                흐림
              </button>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={dimLevel}
                onChange={(e) => setDimLevel(Number(e.target.value))}
                className="w-16 h-3 accent-slate-700 cursor-pointer"
                aria-label="배경 흐림 강도"
              />
              <span className="text-[10px] font-mono text-slate-500 min-w-[2.25rem] text-right">
                {dimLevel}%
              </span>
            </div>
          )}

          {/* 추가 확대 — 지도 모드 한정. 카카오 SDK 의 level 1 한계를 CSS scale 로 우회.
              편집 가능하지만 좌표가 미세하게 어긋날 수 있음 (보정 코드 적용). */}
          {mode === 'map' && (
            <div className="mr-1 inline-flex items-center rounded-md border border-slate-300 overflow-hidden">
              <button
                type="button"
                onClick={() =>
                  setExtraZoom((z) =>
                    z >= 2 ? 2 : z >= 1.5 ? 2 : z >= 1.25 ? 1.5 : 1.25,
                  )
                }
                disabled={extraZoom >= 2}
                className="inline-flex items-center justify-center w-7 h-7 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                title="추가 확대 (CSS scale)"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              {extraZoomActive && (
                <span className="px-1.5 text-[10px] font-mono text-emerald-700 border-l border-slate-300">
                  {extraZoom}x
                </span>
              )}
              <button
                type="button"
                onClick={() =>
                  setExtraZoom((z) =>
                    z <= 1 ? 1 : z <= 1.25 ? 1 : z <= 1.5 ? 1.25 : 1.5,
                  )
                }
                disabled={extraZoom <= 1}
                className="inline-flex items-center justify-center w-7 h-7 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed border-l border-slate-300"
                title="추가 확대 축소"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* 시설 목록 보임/숨김 — 좌측 사이드바 토글 (도식·지도 공통) */}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            className={
              'mr-1 inline-flex items-center gap-1 rounded-md border px-2 h-7 text-[11px] font-medium ' +
              (!sidebarCollapsed
                ? 'bg-slate-900 text-white border-slate-900'
                : 'text-slate-700 border-slate-300 hover:bg-slate-50')
            }
            title={sidebarCollapsed ? '시설 목록 보이기' : '시설 목록 숨기기'}
          >
            <List className="h-3 w-3" />
            시설 목록
          </button>

          {/* 시설 추가 보임/숨김 — 좌측 사이드바 토글 (도식·지도 공통) */}
          {editable && (
            <button
              type="button"
              onClick={() => setToolsCollapsed((v) => !v)}
              className={
                'mr-1 inline-flex items-center gap-1 rounded-md border px-2 h-7 text-[11px] font-medium ' +
                (!toolsCollapsed || addTool || cableTool
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'text-slate-700 border-slate-300 hover:bg-slate-50')
              }
              title={toolsCollapsed ? '시설 추가 패널 열기' : '닫기'}
            >
              <Plus className="h-3 w-3" />
              시설 추가
              {addTool && (
                <span className="ml-0.5 rounded bg-blue-500 px-1 text-[9px] font-semibold text-white">
                  {CLOSURE_TYPE_LABEL[addTool]}
                </span>
              )}
              {cableTool && (
                <span className="ml-0.5 rounded bg-emerald-500 px-1 text-[9px] font-semibold text-white">
                  {cableTool}
                </span>
              )}
            </button>
          )}

          {/* 선택 도구 — 도식 모드 전용. 빈 영역 드래그로 사각 범위 안 시설 다중 선택 후 그룹 이동 */}
          {editable && mode === 'schematic' && (
            <button
              type="button"
              onClick={() => {
                const next = !selectTool
                setSelectTool(next)
                if (next) {
                  setAddTool(null)
                  setCableTool(null)
                  setToolsCollapsed(true)
                } else {
                  // 도구 끄면 선택 해제
                  setSelectedIds(new Set())
                  setMarquee(null)
                }
              }}
              className={
                'mr-1 inline-flex items-center gap-1 rounded-md border px-2 h-7 text-[11px] font-medium ' +
                (selectTool
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'text-slate-700 border-slate-300 hover:bg-slate-50')
              }
              title={selectTool ? '선택 도구 끄기 (Esc)' : '빈 영역 드래그로 시설 다중 선택 후 그룹 이동'}
            >
              <Crosshair className="h-3 w-3" />
              선택
              {selectTool && selectedIds.size > 0 && (
                <span className="ml-0.5 rounded bg-white px-1 text-[9px] font-semibold text-violet-700">
                  {selectedIds.size}
                </span>
              )}
            </button>
          )}

          {/* 도면정렬 dropdown — 도식 모드 전용:
                1. 도면자동배치 (케이블 V/H/45° snap)
                2. 그래프 자동 배치 (허브 중심 동심원 재배치)
              owner 요청 (2026-05-24): 잘못 실행 시 「되돌리기」 버튼으로 즉시 복원.
              케이블 거리 배율은 결과가 너무 틀어져 사용 어려워 비활성 (2026-05-24). */}
          {editable && mode === 'schematic' && (
            <>
              <button
                ref={layoutDD.btnRef}
                type="button"
                onClick={() => layoutDD.setOpen((v) => !v)}
                className={
                  'mr-1 inline-flex items-center gap-1 rounded-md border px-2 h-7 text-[11px] font-medium ' +
                  (layoutDD.open
                    ? 'bg-slate-900 border-slate-900 text-white'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50')
                }
                title="도면 자동 정렬·재배치 메뉴"
                aria-expanded={layoutDD.open}
              >
                <Sparkles className="h-3 w-3" />
                {snapping || graphLayouting ? '처리 중…' : '도면정렬'}
              </button>
              {layoutDD.open && layoutDD.pos && (
                <div
                  data-panel-id="layout"
                  className="z-50 w-60 rounded-md border border-slate-200 bg-white shadow-lg p-2 space-y-2 text-[11px]"
                  style={{
                    position: 'fixed',
                    top: layoutDD.pos.top,
                    right: layoutDD.pos.right,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onCableSnap()
                      layoutDD.setOpen(false)
                    }}
                    disabled={snapping}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-50 disabled:opacity-60"
                    title="케이블이 수직/수평/45° 대각선으로 보이도록 시설 위치를 자동 재배치"
                  >
                    <span className="font-medium text-slate-700">도면자동배치</span>
                    <span className="block text-[10px] text-slate-500 mt-0.5">케이블이 직각·45° 로 보이도록 시설 snap</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onGraphLayout()
                      layoutDD.setOpen(false)
                    }}
                    disabled={graphLayouting}
                    className="w-full text-left px-2 py-1.5 rounded text-violet-700 bg-violet-50 hover:bg-violet-100 disabled:opacity-60"
                    title="허브 중심 + 연결된 시설끼리 가까이 — 케이블 그래프 기반 전체 재배치"
                  >
                    <span className="font-medium">그래프 자동 배치</span>
                    <span className="block text-[10px] text-violet-600 mt-0.5">허브 중심 동심원 — 모든 시설 강제 재배치</span>
                  </button>
                </div>
              )}
              {/* 되돌리기 — 직전 도면정렬/그래프 자동 배치 결과를 이전 상태로 복원 */}
              {undoSnapshot && (
                <button
                  type="button"
                  onClick={onUndo}
                  disabled={undoing}
                  className="mr-1 inline-flex items-center gap-1 rounded-md border border-amber-400 bg-amber-50 px-2 h-7 text-[11px] font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                  title={`${undoSnapshot.label} 결과를 이전 상태로 복원`}
                >
                  <Undo2 className="h-3 w-3" />
                  {undoing ? '복원 중…' : `되돌리기 (${undoSnapshot.label})`}
                </button>
              )}
            </>
          )}

          {/* 검색창 보임/숨김 — 지도 모드에서만 (검색은 지도 기능) */}
          {mode === 'map' && (
            <button
              type="button"
              onClick={() => setSearchVisible((v) => !v)}
              className={
                'mr-1 inline-flex items-center gap-1 rounded-md border px-2 h-7 text-[11px] font-medium ' +
                (searchVisible
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'text-slate-700 border-slate-300 hover:bg-slate-50')
              }
              title={searchVisible ? '검색창 숨기기' : '검색창 보이기'}
            >
              <Search className="h-3 w-3" />
              검색
            </button>
          )}

          {/* 거리뷰 — 지도 모드에서만. 카카오 Roadview panorama 를 우측 패널에 표시.
              켜면 지도 위에 파란 선(거리뷰 가능 도로) 오버레이. 시설 클릭 또는
              지도 빈 곳(파란 선 위) 클릭 시 그 위치의 거리뷰가 보임. */}
          {mode === 'map' && mapStatus === 'ready' && (
            <button
              type="button"
              onClick={() => {
                const next = !roadviewOpen
                setRoadviewOpen(next)
                if (next) {
                  setFaultSearchOpen(false)
                  setRoadviewCollapsed(false)
                } else {
                  setRoadviewPos(null)
                  setRoadviewTitle(null)
                }
              }}
              className={
                'mr-1 inline-flex items-center gap-1 rounded-md border px-2 h-7 text-[11px] font-medium ' +
                (roadviewOpen
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'text-slate-700 border-slate-300 hover:bg-slate-50')
              }
              title={
                roadviewOpen
                  ? '거리뷰 끄기'
                  : '카카오 거리뷰 — 시설 클릭 또는 지도 위 파란 선 클릭으로 표시'
              }
            >
              <Camera className="h-3 w-3" />
              거리뷰
            </button>
          )}

          {/* 실사(sketch) — 지도/위성/거리뷰 위에 펜으로 자유 그리기.
              켜면 지도 pan/zoom 잠금 + SketchOverlay 활성. 일회성 메모 (페이지 떠나면 사라짐).
              Phase 2 에서 「화면 저장」 → 시설 첨부 + 「실사내용확인」 알림 예정. */}
          {mode === 'map' && mapStatus === 'ready' && (
            <button
              type="button"
              onClick={() =>
                setSketchMode((v) => {
                  // 모드 OFF→ON 전환 시 세션 카운터 리셋
                  if (!v) setSketchInspectionCount(0)
                  return !v
                })
              }
              className={
                'mr-1 inline-flex items-center gap-1 rounded-md border px-2 h-7 text-[11px] font-medium ' +
                (sketchMode
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'text-slate-700 border-slate-300 hover:bg-slate-50')
              }
              title={sketchMode ? '실사 그리기 끄기' : '지도/거리뷰 위에 펜으로 그리기 (그림판처럼)'}
            >
              <Pencil className="h-3 w-3" />
              실사
              {sketchMode &&
                sketchStrokes.length + sketchTexts.length + sketchInspectionCount > 0 && (
                  <span className="ml-0.5 rounded bg-white px-1 text-[9px] font-semibold text-rose-700">
                    {sketchStrokes.length + sketchTexts.length + sketchInspectionCount}
                  </span>
                )}
            </button>
          )}

          {/* 캡처 메뉴 — 지도 모드. 자동/분할 두 가지 방식을 드롭다운에서 선택.
              진행 중이면 버튼이 해당 색으로 강조 + 「취소」 항목 노출.
              controlled state + position:fixed — 부모 overflow-x-auto 에서도 잘리지 않음. */}
          {mode === 'map' && mapStatus === 'ready' && (
            <>
              <button
                ref={captureDD.btnRef}
                type="button"
                onClick={() => captureDD.setOpen((v) => !v)}
                className={
                  'mr-1 inline-flex items-center gap-1 rounded-md border px-2 h-7 text-[11px] font-medium ' +
                  (autoCaptureActive
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : captureActive
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'text-slate-700 border-slate-300 hover:bg-slate-50')
                }
                title="캡처 방식 선택 (자동 / 분할)"
                aria-expanded={captureDD.open}
              >
                <Camera className="h-3 w-3" />
                캡처
                {(autoCaptureActive || captureActive) && (
                  <span className="ml-0.5 text-[9px] opacity-90">
                    ({autoCaptureActive ? '자동' : '분할'})
                  </span>
                )}
              </button>
              {captureDD.open && captureDD.pos && (
              <div
                data-panel-id="capture"
                className="z-50 w-52 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg"
                style={{
                  position: 'fixed',
                  top: captureDD.pos.top,
                  right: captureDD.pos.right,
                }}
                onClick={() => requestAnimationFrame(() => captureDD.setOpen(false))}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (autoCaptureActive) {
                      setAutoCaptureActive(false)
                      return
                    }
                    setCaptureActive(false)
                    setSelectedId(null)
                    setSelectedCableId(null)
                    setFaultSearchOpen(false)
                    fitMapToFacilities()
                    setAutoCaptureActive(true)
                  }}
                  className={
                    'w-full text-left rounded-md px-2 py-1.5 text-[11px] font-medium flex items-start gap-2 ' +
                    (autoCaptureActive
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'text-slate-700 hover:bg-slate-50')
                  }
                >
                  <ImageDown className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span className="flex-1">
                    <span className="block font-semibold">자동 캡처</span>
                    <span className="block text-[10px] text-slate-500 mt-0.5">
                      화면 공유로 지도 자동 캡처·합성
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (captureActive) {
                      setCaptureActive(false)
                      return
                    }
                    setAutoCaptureActive(false)
                    setSelectedId(null)
                    setSelectedCableId(null)
                    setFaultSearchOpen(false)
                    fitMapToFacilities()
                    setCaptureActive(true)
                  }}
                  className={
                    'mt-0.5 w-full text-left rounded-md px-2 py-1.5 text-[11px] font-medium flex items-start gap-2 ' +
                    (captureActive
                      ? 'bg-amber-50 text-amber-800'
                      : 'text-slate-700 hover:bg-slate-50')
                  }
                >
                  <Camera className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span className="flex-1">
                    <span className="block font-semibold">분할 캡처</span>
                    <span className="block text-[10px] text-slate-500 mt-0.5">
                      시설 영역을 격자로 나눠 가이드
                    </span>
                  </span>
                </button>
                {(autoCaptureActive || captureActive) && (
                  <button
                    type="button"
                    onClick={() => {
                      setAutoCaptureActive(false)
                      setCaptureActive(false)
                    }}
                    className="mt-1 w-full text-left rounded-md px-2 py-1.5 text-[11px] font-medium text-rose-700 hover:bg-rose-50 border-t border-slate-100"
                  >
                    캡처 취소
                  </button>
                )}
              </div>
              )}
            </>
          )}

          {/* 도식 내보내기 — 도식 모드. 캔버스를 PNG 이미지 파일로 저장 */}
          {mode === 'schematic' && facilities.length > 0 && (
            <button
              type="button"
              onClick={onExportSchematic}
              disabled={exporting}
              className="mr-1 inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 h-7 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              title="도식을 PNG 이미지 파일로 내보냅니다"
            >
              <Download className="h-3 w-3" />
              {exporting ? '내보내는 중…' : '도식 내보내기'}
            </button>
          )}

          {/* 줌 컨트롤 — 도식 모드만 (지도 모드는 카카오맵 자체 줌) */}
          {mode === 'schematic' && (
            <button
              type="button"
              onClick={() => onZoom('out')}
              className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
              title="축소"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onFitToContent}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 h-7 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
            title="전체보기"
          >
            <Maximize2 className="h-3 w-3" />
            전체보기
          </button>
          {mode === 'schematic' && (
            <>
              <button
                type="button"
                onClick={() => onZoom('in')}
                className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
                title="확대"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <span className="px-2 text-[11px] font-medium text-slate-500 font-mono min-w-[3rem] text-right">
                {Math.round((computeFitViewport(effectivePositions).width / viewport.width) * 100)}%
              </span>
            </>
          )}

          {/* 더보기 — 자주 안 쓰는 컨트롤(표준 범례·탭 메뉴·캔버스 표시 크기)을 묶어 툴바 정리.
              controlled state + position:fixed — 부모 overflow-x-auto 영향 회피.
              모바일 터치 영역 확보 위해 h-9 (모바일) / sm:h-7 (데스크탑). */}
          <button
            ref={moreBtnRef}
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className={
              'ml-1 inline-flex h-9 w-9 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-md border ' +
              (moreOpen
                ? 'bg-slate-900 border-slate-900 text-white'
                : 'border-slate-300 text-slate-700 hover:bg-slate-50')
            }
            title="더보기"
            aria-label="더보기"
            aria-expanded={moreOpen}
          >
            <MoreHorizontal className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          </button>
          {moreOpen && morePos && (
            <div
              data-panel-id="more"
              className="z-50 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg space-y-1"
              style={{ position: 'fixed', top: morePos.top, right: morePos.right }}
              onClick={() => {
                // 항목 클릭 후 자동 닫힘 (개별 버튼 onClick 후)
                requestAnimationFrame(() => setMoreOpen(false))
              }}
            >
              <button
                type="button"
                onClick={() => setLegendOpen(true)}
                className="w-full text-left rounded-md px-2 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
              >
                <BookOpen className="h-3.5 w-3.5 shrink-0" />
                표준 범례
              </button>
              {tabPanel && (
                <button
                  type="button"
                  onClick={() => setTabPanelOpen((v) => !v)}
                  className={
                    'w-full text-left rounded-md px-2 py-1.5 text-[11px] font-medium inline-flex items-center gap-2 ' +
                    (tabPanelOpen
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-50')
                  }
                  title="시설·케이블·회선·... 탭 메뉴 토글"
                >
                  <PanelTop className="h-3.5 w-3.5 shrink-0" />
                  탭 메뉴 {tabPanelOpen ? '숨기기' : '보이기'}
                </button>
              )}
              <div className="pt-1 border-t border-slate-100">
                <p className="px-0.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  캔버스 표시 크기
                </p>
                <div
                  className="inline-flex w-full items-center overflow-hidden rounded-md border border-slate-300"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={shrinkCanvas}
                    disabled={canvasSize === 'compact'}
                    className="inline-flex h-7 flex-1 items-center justify-center text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                    title="캔버스 축소"
                  >
                    <Shrink className="h-3.5 w-3.5" />
                  </button>
                  <span className="inline-flex h-7 min-w-[3rem] items-center justify-center border-x border-slate-200 px-2 text-[11px] font-medium text-slate-600">
                    {CANVAS_SIZE_LABEL[canvasSize]}
                  </span>
                  <button
                    type="button"
                    onClick={expandCanvas}
                    disabled={canvasSize === 'fullscreen'}
                    className="inline-flex h-7 flex-1 items-center justify-center text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                    title="캔버스 확장"
                  >
                    <Expand className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {/* 테스트 도구 — 임의 시설/케이블 일괄 생성·삭제 (지장이설 시각 테스트용) */}
              {editable && (
                <div className="pt-1 border-t border-slate-100">
                  <p className="px-0.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    테스트 도구
                  </p>
                  <form action={seedTestFacilities}>
                    <input type="hidden" name="project_id" value={projectId} />
                    <button
                      type="submit"
                      className="w-full text-left rounded-md px-2 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
                      title="현재 시설 분포 중심에서 반경 400m 안에 임의 시설·케이블 일괄 생성"
                    >
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      테스트 시설 생성
                    </button>
                  </form>
                  <form
                    action={clearTestFacilities}
                    onSubmit={(e) => {
                      if (
                        !confirm(
                          '「[TEST]」 표시된 테스트 시설·케이블을 모두 삭제합니다. 진행할까요?',
                        )
                      ) {
                        e.preventDefault()
                      }
                    }}
                  >
                    <input type="hidden" name="project_id" value={projectId} />
                    <button
                      type="submit"
                      className="w-full text-left rounded-md px-2 py-1.5 text-[11px] font-medium text-rose-700 hover:bg-rose-50 inline-flex items-center gap-2"
                      title="[TEST] 마커가 붙은 시설·케이블 일괄 삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5 shrink-0" />
                      테스트 시설 일괄 삭제
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={toggleFaultSearch}
            className={
              'ml-1 inline-flex items-center gap-1 rounded-md px-2 h-7 text-[11px] font-medium border ' +
              (faultSearchOpen
                ? 'bg-violet-600 text-white border-violet-600'
                : 'border-slate-300 text-slate-700 hover:bg-slate-50')
            }
          >
            <Crosshair className="h-3 w-3" />
            고장점 검색
          </button>

          {isFullscreen && (
            <button
              type="button"
              onClick={() => setCanvasSize('normal')}
              className="ml-1 inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 h-7 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              title="전체화면 종료 (ESC)"
            >
              <X className="h-3 w-3" />
              닫기
            </button>
          )}
        </div>
      </div>

      {/* 좌측 시설 목록 + 시설·케이블 추가 사이드바 + SVG 캔버스 — 가로 flex.
          relative 는 실사 SketchOverlay 가 이 영역 전체를 덮을 수 있게 (지도+거리뷰 통합 그림판).
          data-sketch-canvas-region 은 「실사 저장」 캡처 시 잘라낼 영역 anchor. */}
      <div
        className={isFullscreen ? 'relative flex flex-1 min-h-0' : 'relative flex'}
        style={isFullscreen ? undefined : { height: CANVAS_SIZE_HEIGHT[canvasSize] }}
        data-sketch-canvas-region
      >
        {/* 좌측 시설 목록 — 클릭 시 해당 시설로 캔버스 이동 */}
        {!sidebarCollapsed && (
          <aside className="w-52 shrink-0 border-r border-slate-200 bg-slate-50 overflow-y-auto">
            <div className="sticky top-0 z-10 bg-slate-50 px-3 py-2 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-600">
                  시설 목록 ({facilities.length})
                </span>
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed(true)}
                  className="text-slate-400 hover:text-slate-700 text-xs"
                  title="목록 접기"
                >
                  ◀
                </button>
              </div>
              <select
                value={facilitySort}
                onChange={(e) => setFacilitySort(e.target.value as FacilitySortKey)}
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[11px] text-slate-700"
                title="시설 목록 정렬"
              >
                <option value="code">시설번호순</option>
                <option value="install">설치순번(배지)순</option>
                <option value="status">기설·신설순</option>
                <option value="name">이름순</option>
              </select>
            </div>
            {facilities.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-slate-400 italic">
                아직 시설이 없습니다.
              </p>
            ) : (
              <div className="py-1">
                {(Object.keys(CLOSURE_CATEGORY_LABEL) as ClosureCategory[]).map((cat) => {
                  const list = facilitiesByCategory[cat]
                  if (list.length === 0) return null
                  return (
                    <div key={cat} className="mb-1">
                      <p className="px-3 py-1 text-[10px] font-bold text-rose-600 uppercase tracking-wide">
                        {CLOSURE_CATEGORY_LABEL[cat]} ({list.length})
                      </p>
                      <ul>
                        {list.map((f) => {
                          const active = selectedId === f.id
                          // 설치 순번 배지 (접속함체·RN·IJP)
                          const installNo = installNoByFacility.get(f.id)
                          // 신설/기설 — 접속함체만 의미 있음 (다른 종류는 표시 안 함)
                          const isClosureCat =
                            CLOSURE_TYPE_CATEGORY[f.closure_type] === '접속함체'
                          const isNew = f.install_status !== 'existing'
                          const isNewClosure = isClosureCat && isNew
                          return (
                            <li key={f.id}>
                              <button
                                type="button"
                                onClick={() => focusFacility(f.id)}
                                className={
                                  'w-full text-left px-3 py-1 flex items-center gap-1.5 text-[11px] ' +
                                  (active
                                    ? 'bg-blue-100 text-blue-900'
                                    : 'text-slate-700 hover:bg-slate-100')
                                }
                              >
                                {/* 색 점 — 도면과 동일 (접속함체는 기설=검정·신설=빨강) */}
                                <span
                                  className="inline-block w-2 h-2 rounded-full shrink-0"
                                  style={{
                                    backgroundColor: facilityDiagramColor(
                                      f.closure_type,
                                      f.install_status,
                                    ),
                                  }}
                                />
                                <span className="font-mono text-[10px] text-slate-500 shrink-0">
                                  {formatFacilityCode(f.closure_type, f.seq_no)}
                                </span>
                                {/* 설치 순번 배지 — 도면의 녹색 원 배지와 동일 색 */}
                                {installNo != null && (
                                  <span className="shrink-0 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-green-600 text-[8px] font-bold text-white">
                                    {installNo}
                                  </span>
                                )}
                                <span
                                  className={
                                    'truncate flex-1 ' +
                                    (isNewClosure && !active ? 'text-red-600 font-medium' : '')
                                  }
                                >
                                  {f.name}
                                </span>
                                {/* 신설/기설 — 접속함체만 */}
                                {isClosureCat && (
                                  <span
                                    className={
                                      'shrink-0 rounded px-1 py-px text-[9px] font-medium border ' +
                                      (isNew
                                        ? 'bg-red-50 text-red-600 border-red-200'
                                        : 'bg-slate-100 text-slate-500 border-slate-300')
                                    }
                                  >
                                    {isNew ? '신설' : '기설'}
                                  </span>
                                )}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                })}
              </div>
            )}
          </aside>
        )}

        {/* 시설 추가 사이드바 — 툴바 토글로 보임/숨김. 도식·지도 공통.
            chip 선택 시 자동 접힘 (그리기 작업 시 화면 최대화 — owner 요청).
            라벨은 「시설 추가」 로 통일했지만 내부에 케이블 추가도 포함 (광케이블 카테고리). */}
        {editable && !toolsCollapsed && (
          <aside className="w-60 shrink-0 border-r border-slate-200 bg-slate-50 overflow-y-auto">
            <div className="sticky top-0 z-10 bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-600">
                시설 추가
              </span>
              <button
                type="button"
                onClick={() => setToolsCollapsed(true)}
                className="text-slate-400 hover:text-slate-700 text-xs"
                title="패널 접기"
              >
                ◀
              </button>
            </div>
            {(addTool || cableTool) && (
              <div className="px-3 py-1.5 border-b border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setAddTool(null)
                    setCableTool(null)
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                >
                  <X className="h-3 w-3" />
                  선택 해제
                </button>
              </div>
            )}
            <div className="p-2 space-y-1.5">
              {(Object.keys(CLOSURE_CATEGORY_LABEL) as ClosureCategory[]).map((cat) => {
                const types = groupedTypes[cat]
                if (types.length === 0) return null
                const open = openCategories[cat]
                return (
                  <div key={cat}>
                    <button
                      type="button"
                      onClick={() => setOpenCategories((p) => ({ ...p, [cat]: !p[cat] }))}
                      className="text-[10px] font-bold text-rose-600 uppercase tracking-wide hover:text-rose-800 flex items-center gap-1"
                    >
                      <span>{open ? '▼' : '▶'}</span>
                      {CLOSURE_CATEGORY_LABEL[cat]}
                      <span className="font-normal text-slate-400">({types.length})</span>
                    </button>
                    {open && (
                      <div className="mt-1 ml-2 flex items-center gap-1.5 flex-wrap">
                        {types.map((t) => {
                          const active = addTool === t
                          const color = CLOSURE_TYPE_COLOR[t]
                          return (
                            <button
                              key={t}
                              type="button"
                              onClick={() => {
                                // 같은 chip 다시 누름 = 해제 (펼친 상태 유지)
                                // 다른 chip 선택 = 자동 접힘 (그리기 모드)
                                if (active) {
                                  setAddTool(null)
                                } else {
                                  setAddTool(t)
                                  setCableTool(null)
                                  setSelectTool(false)
                                  setSelectedIds(new Set())
                                  setToolsCollapsed(true)
                                }
                              }}
                              className={
                                'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium border ' +
                                (active
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100')
                              }
                            >
                              <span
                                className="inline-block w-2 h-2 rounded-full"
                                style={{ backgroundColor: active ? 'white' : color }}
                              />
                              {CLOSURE_TYPE_LABEL[t]}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* 광케이블 카테고리 — 규격 chip. 선택 후 시설 2 개 클릭으로 케이블 배치 */}
              <div>
                <button
                  type="button"
                  onClick={() => setCableCatOpen((v) => !v)}
                  className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide hover:text-emerald-900 flex items-center gap-1"
                >
                  <span>{cableCatOpen ? '▼' : '▶'}</span>
                  광케이블
                  <span className="font-normal text-slate-400">({CABLE_SPEC_VALUES.length})</span>
                </button>
                {cableCatOpen && (
                  <div className="mt-1 ml-2 flex items-center gap-1.5 flex-wrap">
                    {CABLE_SPEC_VALUES.map((s) => {
                      const active = cableTool === s
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => {
                            if (active) {
                              setCableTool(null)
                            } else {
                              setCableTool(s)
                              setAddTool(null)
                              setSelectTool(false)
                              setSelectedIds(new Set())
                              setToolsCollapsed(true)
                            }
                          }}
                          className={
                            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium border ' +
                            (active
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100')
                          }
                        >
                          <span
                            className="inline-block w-3 h-1 rounded"
                            style={{ backgroundColor: active ? 'white' : cableSpecColor(s) }}
                          />
                          {s}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </aside>
        )}

        <div ref={setCanvasAreaRef} className="flex-1 min-w-0 relative overflow-hidden">

          {/* 지도 모드 검색창 — 캔버스 중앙 최상단 floating.
              별도 바 대신 지도 위에 띄워 캔버스를 더 넓게 쓴다. SDK 준비 후에만 노출.
              바깥 래퍼는 in-flow 블록(relative) — 블록은 부모 폭 100% 라 flex 가운데
              정렬이 확실히 먹는다 (absolute + left/right 는 폭이 안 늘어나는 경우가 있었음).
              지도/SVG 는 absolute inset-0 라 이 in-flow 래퍼에 밀리지 않는다.
              빈 좌우 영역은 pointer-events-none 으로 지도 조작을 막지 않는다. */}
          {mode === 'map' &&
            mapStatus === 'ready' &&
            searchVisible &&
            !captureActive &&
            !autoCaptureActive && (
            <div className="relative z-20 flex justify-center px-2 pt-2 pointer-events-none">
              <div className="w-full max-w-md space-y-2 pointer-events-auto">
                <div className="flex items-start gap-1.5 rounded-lg bg-white/95 p-1.5 shadow-lg ring-1 ring-slate-200 backdrop-blur-sm">
                  <div className="flex-1 min-w-0">
                    <MapSearchBox
                      onPick={(lat, lng) => {
                        const m = kakaoMap
                        if (!m) return
                        m.setCenter(new kakao.maps.LatLng(lat, lng))
                        m.setLevel(3)
                      }}
                    />
                  </div>
                  {unplacedFacilities.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowUnplaced((v) => !v)}
                      className={
                        'shrink-0 inline-flex items-center gap-1 rounded-md px-2.5 h-8 text-xs font-medium border ' +
                        (showUnplaced
                          ? 'bg-amber-500 text-white border-amber-500'
                          : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50')
                      }
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      미배치 {unplacedFacilities.length}
                    </button>
                  )}
                </div>

                {/* 배치 대기 배너 — 「배치」 누른 시설을 지도 클릭으로 위치 지정 */}
                {placingFacility && (
                  <div className="flex items-center justify-between gap-2 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
                    <span className="min-w-0 truncate">
                      지도를 클릭해 「{placingFacility.name}」 위치를 지정하세요
                    </span>
                    <button
                      type="button"
                      onClick={() => setPlacingId(null)}
                      className="shrink-0 inline-flex items-center gap-1 text-slate-300 hover:text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                      취소
                    </button>
                  </div>
                )}

                {/* 미배치 시설 패널 — 일괄 펼치기 + 개별 배치 */}
                {showUnplaced && unplacedFacilities.length > 0 && (
                  <div className="rounded-lg border border-slate-200 bg-white p-2 space-y-2 shadow-lg">
                    <button
                      type="button"
                      onClick={onBulkPlace}
                      className="w-full rounded-md bg-emerald-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      미배치 시설 {unplacedFacilities.length}개를 지도 중앙에 펼치기
                    </button>
                    <p className="px-0.5 text-[10px] text-slate-500 leading-snug">
                      펼친 뒤 시설을 드래그해 실제 위치로 옮기세요. 또는 아래에서 「배치」를
                      누른 뒤 지도를 클릭하세요.
                    </p>
                    <ul className="max-h-44 space-y-1 overflow-y-auto">
                      {unplacedFacilities.map((f) => (
                        <li
                          key={f.id}
                          className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-2 py-1"
                        >
                          <span className="min-w-0 truncate text-[11px] text-slate-700">
                            <span className="font-mono text-slate-500">
                              {formatFacilityCode(f.closure_type, f.seq_no)}
                            </span>{' '}
                            {f.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setPlacingId(f.id)
                              setShowUnplaced(false)
                            }}
                            className="shrink-0 rounded-md bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-slate-800"
                          >
                            배치
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 카카오맵 배경 — 항상 mount, 지도 모드에서만 표시. SVG 가 위에 투명 오버레이.
              추가 확대(extraZoom) 적용 시 SVG 와 동일한 transform 으로 정렬 유지.
              dimLevel(0~100) 비율로 회색조·어둡게·대비 보간해 시설·케이블이 두드러진다. */}
          <div
            ref={mapSetContainer}
            className="absolute inset-0"
            style={{
              display: mode === 'map' ? 'block' : 'none',
              zIndex: 0,
              transform: extraZoomActive ? `scale(${extraZoom})` : undefined,
              transformOrigin: '50% 50%',
              // 회색조 + 밝기↑(>1) + 대비↓ — 어두워지지 않고 밝게 바랜 회색.
              // dimLevel=70 기본: grayscale 0.7 · brightness 1.07 · contrast 0.755
              filter:
                dimLevel > 0
                  ? `grayscale(${dimLevel / 100}) brightness(${(1 + (dimLevel / 100) * 0.1).toFixed(3)}) contrast(${(1 - (dimLevel / 100) * 0.35).toFixed(3)})`
                  : undefined,
            }}
          />
          {/* 지도 로딩 / 에러 오버레이 */}
          {mode === 'map' && mapStatus === 'loading' && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-50/80">
              <p className="text-sm text-slate-500">지도를 불러오는 중…</p>
            </div>
          )}
          {mode === 'map' && mapStatus === 'error' && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-50 p-6">
              <div className="max-w-md rounded-xl border border-rose-200 bg-rose-50 p-4 text-center">
                <TriangleAlert className="mx-auto h-6 w-6 text-rose-500" />
                <p className="mt-2 text-sm font-semibold text-rose-800">
                  카카오맵을 불러오지 못했습니다
                </p>
                <p className="mt-1 text-xs text-rose-700">{mapError}</p>
                <p className="mt-2 text-[11px] text-rose-600 leading-relaxed">
                  환경변수(NEXT_PUBLIC_KAKAO_MAP_KEY)·도메인 등록·dev 서버 재시작을 확인하세요.
                </p>
              </div>
            </div>
          )}
          <svg
            ref={setSvgRef}
            viewBox={mode === 'map' ? undefined : viewBoxStr}
            className="select-none absolute inset-0 w-full h-full"
            style={{
              display: 'block',
              background: mode === 'map' ? 'transparent' : 'white',
              zIndex: 1, // 카카오맵 배경(zIndex:0) 위에 오버레이
              // 추가 확대 — 지도 div 와 동일한 transform 으로 정렬 유지.
              transform:
                mode === 'map' && extraZoomActive ? `scale(${extraZoom})` : undefined,
              transformOrigin: '50% 50%',
              cursor:
                mode === 'map'
                  ? 'default'
                  : selectTool
                    ? 'default'
                    : addTool || faultSearchOpen
                      ? 'crosshair'
                      : dragging
                        ? 'grabbing'
                        : 'grab',
              touchAction: 'none',
              // 지도 모드 — SVG 루트는 이벤트 통과(지도 pan/zoom). 시설·케이블 등
              // 클릭 대상 요소만 pointer-events 를 개별로 켠다.
              pointerEvents: mode === 'map' ? 'none' : 'auto',
            }}
            onPointerDown={onSvgPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={onCanvasClick}
        >
          {/* 고장점 검색 하이라이트 — 경로 케이블 글로우 + 시설 링 (케이블·노드 아래) */}
          {highlight && (
            <g style={{ pointerEvents: 'none' }}>
              {highlight.cableIds.map((cid) => {
                const c = cableById.get(cid)
                if (!c) return null
                const pts = cablePathPoints(c)
                if (pts.length < 2) return null
                const isFaultCable = highlight.fault?.cableId === cid
                return (
                  <polyline
                    key={`hl-${cid}`}
                    points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="none"
                    stroke={isFaultCable ? FAULT_COLOR : ROUTE_COLOR}
                    strokeWidth={11}
                    strokeOpacity={0.3}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )
              })}
              {/* 끊긴 중간경로 — 추정 연결 (점선 + 방향 화살표) */}
              {highlight.gaps.map((g, i) => {
                const a = effectivePositions[g.fromId]
                const b = effectivePositions[g.toId]
                if (!a || !b) return null
                const ax = a.x + NODE_SIZE.width / 2
                const ay = a.y + NODE_SIZE.height / 2 - 10
                const bx = b.x + NODE_SIZE.width / 2
                const by = b.y + NODE_SIZE.height / 2 - 10
                const dx = bx - ax
                const dy = by - ay
                const len = Math.hypot(dx, dy) || 1
                const ux = dx / len
                const uy = dy / len
                const px = -uy
                const py = ux
                // 화살촉 — 도착 노드 앞쪽 (노드에 안 가리게 34px 뒤로)
                const tipX = bx - ux * 34
                const tipY = by - uy * 34
                const baseX = tipX - ux * 12
                const baseY = tipY - uy * 12
                const midX = (ax + bx) / 2
                const midY = (ay + by) / 2
                return (
                  <g key={`gap-${i}`}>
                    <line
                      x1={ax}
                      y1={ay}
                      x2={bx}
                      y2={by}
                      stroke={ROUTE_GAP_COLOR}
                      strokeWidth={2.5}
                      strokeDasharray="7 5"
                      strokeOpacity={0.9}
                      strokeLinecap="round"
                    />
                    <polygon
                      points={`${tipX},${tipY} ${baseX + px * 6},${baseY + py * 6} ${baseX - px * 6},${baseY - py * 6}`}
                      fill={ROUTE_GAP_COLOR}
                    />
                    <g transform={`translate(${midX}, ${midY})`}>
                      <rect
                        x={-27}
                        y={-8}
                        width={54}
                        height={15}
                        rx={7.5}
                        fill="white"
                        stroke={ROUTE_GAP_COLOR}
                        strokeWidth={1}
                      />
                      <text
                        x={0}
                        y={3}
                        textAnchor="middle"
                        fill={ROUTE_GAP_COLOR}
                        style={{ fontSize: 8.5, fontWeight: 700, fontFamily: LABEL_FONT }}
                      >
                        추정경로
                      </text>
                    </g>
                  </g>
                )
              })}
              {highlight.facilityIds.map((fid) => {
                const pos = effectivePositions[fid]
                if (!pos) return null
                return (
                  <circle
                    key={`hlf-${fid}`}
                    cx={pos.x + NODE_SIZE.width / 2}
                    cy={pos.y + NODE_SIZE.height / 2 - 10}
                    r={30}
                    fill="none"
                    stroke={ROUTE_COLOR}
                    strokeWidth={3}
                    strokeOpacity={0.6}
                  />
                )
              })}
            </g>
          )}

          {/* 드래그 정렬 가이드 — 시설·경로점이 수직·수평으로 맞을 때 점선 */}
          {snapGuide && (snapGuide.x !== null || snapGuide.y !== null) && (
            <g style={{ pointerEvents: 'none' }}>
              {snapGuide.x !== null && (
                <line
                  x1={snapGuide.x}
                  y1={viewport.y}
                  x2={snapGuide.x}
                  y2={viewport.y + viewport.height}
                  stroke={SELECTED_COLOR}
                  strokeWidth={1}
                  strokeDasharray="5 4"
                  strokeOpacity={0.7}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {snapGuide.y !== null && (
                <line
                  x1={viewport.x}
                  y1={snapGuide.y}
                  x2={viewport.x + viewport.width}
                  y2={snapGuide.y}
                  stroke={SELECTED_COLOR}
                  strokeWidth={1}
                  strokeDasharray="5 4"
                  strokeOpacity={0.7}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          )}

          {/* 사각 선택(marquee) 진행 중 — 보라 점선 사각 */}
          {marquee && (marquee.w > 0 || marquee.h > 0) && (
            <rect
              x={marquee.x}
              y={marquee.y}
              width={marquee.w}
              height={marquee.h}
              fill="#8b5cf6"
              fillOpacity={0.12}
              stroke="#7c3aed"
              strokeWidth={1.5}
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
              style={{ pointerEvents: 'none' }}
            />
          )}

          {/* 케이블 (엣지) — 노드보다 먼저. polyline 경로 (시작·끝 시설 자동 + 중간 waypoint) */}
          {cables.map((c) => {
            const pts = cablePathPoints(c)
            if (pts.length < 2) return null
            const style = edgeStyle(c.spec, c.status, c.installation_type)
            const selected = selectedCableId === c.id
            // 선택된 시설에 연결된 케이블인지 (동일 시설 연결 직관 확인)
            const linkedToSelectedFacility =
              selectedId !== null &&
              (c.from_facility_id === selectedId || c.to_facility_id === selectedId)
            const wps = effectiveWaypoints(c.id)
            const ptsStr = pts.map((p) => `${p.x},${p.y}`).join(' ')
            // 라벨 위치 — 경로 점들의 가운데
            const midIdx = Math.floor(pts.length / 2)
            const labelPt =
              pts.length % 2 === 1
                ? pts[midIdx]
                : {
                    x: (pts[midIdx - 1].x + pts[midIdx].x) / 2,
                    y: (pts[midIdx - 1].y + pts[midIdx].y) / 2,
                  }
            // 라벨 크기 — 도식은 크게·볼드, 지도는 원래 작은 크기 (지도 가독성 우선).
            //   추가 확대(extraZoom>1) 시 지도 모드 폰트만 1/extraZoom 역보정해 시각 크기 고정.
            const labelBig = mode !== 'map'
            const lblSpecFont = labelBig ? 20 : 9 / extraZoom
            const lblCodeFont = labelBig ? 20 : 8 / extraZoom
            const lblWeight = labelBig ? 700 : 400
            const lblSpecDy = labelBig ? -13 : -4
            const lblCodeDy = labelBig ? 13 : 8
            const lblBadgeRectDy = labelBig ? 24 : 12
            const lblBadgeTextDy = labelBig ? 32 : 20
            return (
              <g key={c.id} opacity={style.opacity}>
                {/* 선택 강조 (파랑) / 선택 시설에 연결된 케이블 강조 (주황) */}
                {selected ? (
                  <polyline
                    points={ptsStr}
                    fill="none"
                    stroke={SELECTED_COLOR}
                    strokeWidth={style.width + 8}
                    strokeOpacity={0.2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ) : linkedToSelectedFacility ? (
                  <polyline
                    points={ptsStr}
                    fill="none"
                    stroke={LINKED_COLOR}
                    strokeWidth={style.width + 6}
                    strokeOpacity={0.45}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ) : null}
                {/* 보이는 케이블 선 — 직접 클릭으로도 케이블 선택 가능 (hit line 보조) */}
                <polyline
                  points={ptsStr}
                  fill="none"
                  stroke={style.stroke}
                  strokeWidth={style.width}
                  strokeDasharray={style.dash}
                  strokeLinejoin="round"
                  style={{
                    cursor: 'pointer',
                    pointerEvents: mode === 'map' ? 'auto' : undefined,
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (faultSearchOpen) {
                      handleFaultCableClick(c.id)
                      return
                    }
                    if (!selected) {
                      setSelectedCableId(c.id)
                      setSelectedId(null)
                    }
                  }}
                />
                {/* 클릭 hit area — 선분별 굵은 선 (넓은 클릭 영역).
                    pointer-events="all" — 투명 stroke 도 확실히 클릭 잡힘.
                    선택 안 된 케이블 = 클릭 시 선택 / 선택된 케이블 = 클릭 위치에 waypoint 추가 */}
                {pts.slice(0, -1).map((p, i) => {
                  const q = pts[i + 1]
                  return (
                    <line
                      key={`hit-${i}`}
                      x1={p.x}
                      y1={p.y}
                      x2={q.x}
                      y2={q.y}
                      stroke="transparent"
                      strokeWidth={16}
                      strokeLinecap="round"
                      pointerEvents="all"
                      style={{ cursor: selected ? 'copy' : 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (faultSearchOpen) {
                          handleFaultCableClick(c.id)
                          return
                        }
                        if (selected) {
                          const { x, y } = toSvgCoord(e.clientX, e.clientY)
                          addWaypoint(c.id, i, x, y)
                        } else {
                          setSelectedCableId(c.id)
                          setSelectedId(null)
                        }
                      }}
                    />
                  )
                })}
                {/* 라벨 */}
                <text
                  x={labelPt.x}
                  y={labelPt.y + lblSpecDy}
                  textAnchor="middle"
                  className="fill-slate-700"
                  style={{
                    fontSize: lblSpecFont,
                    fontWeight: lblWeight,
                    fontFamily: 'system-ui',
                    pointerEvents: 'none',
                  }}
                >
                  {c.spec}
                </text>
                <text
                  x={labelPt.x}
                  y={labelPt.y + lblCodeDy}
                  textAnchor="middle"
                  className="fill-slate-400"
                  style={{
                    fontSize: lblCodeFont,
                    fontWeight: lblWeight,
                    fontFamily: 'monospace',
                    pointerEvents: 'none',
                  }}
                >
                  {c.cable_code}
                </text>
                {/* 회선·코어 배정 수 배지 (teal) */}
                {(() => {
                  const cnt = coreCountByCable.get(c.id) ?? 0
                  if (cnt === 0) return null
                  return (
                    <g pointerEvents="none">
                      <rect
                        x={labelPt.x - 15}
                        y={labelPt.y + lblBadgeRectDy}
                        width={30}
                        height={11}
                        rx={5.5}
                        fill="#0d9488"
                      />
                      <text
                        x={labelPt.x}
                        y={labelPt.y + lblBadgeTextDy}
                        textAnchor="middle"
                        fill="white"
                        style={{ fontSize: 7.5, fontWeight: 700, fontFamily: 'system-ui' }}
                      >
                        회선 {cnt}
                      </text>
                    </g>
                  )
                })()}
                {/* 사용 코어 라벨 — 도식 모드 전용.
                    청약: 케이블 spec 위쪽 (popover 자리). 역할별(설계자 파랑·작업자 빨강) 분리.
                          popover 가 열려있으면 가려지므로 숨김.
                    그 외: 기존 from-anchor 빨간 박스 (Phase 5 동작 유지). */}
                {(() => {
                  if (mode === 'map') return null
                  const isSubscriptionCtx = projectCategory === '청약'
                  if (isSubscriptionCtx) {
                    if (subscriptionPopoverCableId === c.id) return null
                    const byRole = coresByCableByRole.get(c.id)
                    if (!byRole) return null
                    // 청약 라벨 — owner 2026-05-25 추가 조정: 0.7배 축소 (39→27), 더 위로.
                    const fontSize = 27
                    const fontWeight = 800
                    const padX = 10
                    const padY = 6
                    const rows: { label: string; color: string; dashed: boolean }[] = []
                    if (byRole.worker)
                      rows.push({ label: byRole.worker, color: '#dc2626', dashed: false })
                    if (byRole.designer)
                      rows.push({ label: byRole.designer, color: '#2563eb', dashed: true })
                    if (rows.length === 0) return null
                    // 첫 줄 y — 36C(spec, 20px) 위쪽 충분히 띄움. 80px 위.
                    const firstY = labelPt.y - 80
                    const rowH = fontSize + padY * 2 + 4
                    return (
                      <g pointerEvents="none">
                        {rows.map((row, idx) => {
                          const w = estimateTextWidth(row.label, fontSize) + padX * 2
                          const h = fontSize + padY * 2
                          const y = firstY - idx * rowH
                          return (
                            <g key={idx}>
                              <rect
                                x={labelPt.x - w / 2}
                                y={y - h / 2}
                                width={w}
                                height={h}
                                rx={4}
                                fill="white"
                                stroke={row.color}
                                strokeWidth={2.2}
                                strokeDasharray={row.dashed ? '7 4' : undefined}
                              />
                              <text
                                x={labelPt.x}
                                y={y + fontSize * 0.35}
                                textAnchor="middle"
                                fill={row.color}
                                style={{ fontSize, fontWeight, fontFamily: LABEL_FONT }}
                              >
                                {row.label}
                              </text>
                            </g>
                          )
                        })}
                      </g>
                    )
                  }
                  // 비-청약 (지장이설/계획) — 기존 from-anchor 동작 유지
                  const coreLabel = coresByCable.get(c.id)
                  if (!coreLabel) return null
                  if (pts.length < 2) return null
                  const fromPt = pts[0]
                  const nextPt = pts[1]
                  const dx = nextPt.x - fromPt.x
                  const dy = nextPt.y - fromPt.y
                  const len = Math.hypot(dx, dy) || 1
                  const ux = dx / len
                  const uy = dy / len
                  const ALONG = 35
                  const PERP = 12
                  const lx = fromPt.x + ux * ALONG - uy * PERP
                  const ly = fromPt.y + uy * ALONG + ux * PERP
                  const fontSize = 9
                  const fontWeight = 600
                  const padX = 4
                  const padY = 2
                  const w = estimateTextWidth(coreLabel, fontSize) + padX * 2
                  const h = fontSize + padY * 2
                  return (
                    <g pointerEvents="none">
                      <rect
                        x={lx - w / 2}
                        y={ly - h / 2}
                        width={w}
                        height={h}
                        rx={2}
                        fill="white"
                        stroke="#dc2626"
                        strokeWidth={1}
                      />
                      <text
                        x={lx}
                        y={ly + fontSize * 0.35}
                        textAnchor="middle"
                        fill="#dc2626"
                        style={{ fontSize, fontWeight, fontFamily: LABEL_FONT }}
                      >
                        {coreLabel}
                      </text>
                    </g>
                  )
                })()}

                {/* 청약 카테고리 도식 모드 — 선택된 케이블 위에 사용코어 입력 popover.
                    selectedCableId 와 별개로 subscriptionPopoverCableId 가 통제 →
                    popover X 만 누르면 popover 만 닫히고 정보 패널은 유지됨. */}
                {projectCategory === '청약' &&
                  mode === 'schematic' &&
                  subscriptionPopoverCableId === c.id &&
                  (() => {
                    // 이 케이블의 기존 코어 배정 — popover 가 중복·designer 신설 감지에 사용
                    const cableAssignments = (coreAssignments ?? [])
                      .filter((a) => a.cable_id === c.id)
                      .map((a) => ({
                        core: a.core_range_start,
                        entered_role: a.entered_role,
                        lifecycle: (a.lifecycle === 'preexisting'
                          ? 'preexisting'
                          : 'new') as 'preexisting' | 'new',
                      }))
                    // popover 크기 — 1.5배 확대 + 글자 크기 키움 (owner 2026-05-25)
                    //   기본 위치: 36C(케이블 spec) 바로 위, 사용선번 라벨이 있던 자리.
                    //   어차피 popover 열리면 사용선번 라벨이 숨겨지므로 그 위치가 자연스러움
                    //   (owner 2026-05-25 추가). 드래그 헤더로 이동 가능.
                    const POP_W = 570
                    const POP_H = 480
                    const POP_OFFSET_FROM_LABEL = 30
                    const defaultRole: 'designer' | 'worker' =
                      projectDesignerId && myEmployeeId === projectDesignerId
                        ? 'designer'
                        : 'worker'
                    // 드래그 거리 보정용 svgScale — viewport.width / rect.width
                    const svgRect = svgRef.current?.getBoundingClientRect()
                    const svgScale =
                      svgRect && svgRect.width > 0
                        ? viewport.width / svgRect.width
                        : 1
                    return (
                      <foreignObject
                        x={labelPt.x - POP_W / 2}
                        y={labelPt.y - POP_H - POP_OFFSET_FROM_LABEL}
                        width={POP_W}
                        height={POP_H}
                        style={{ overflow: 'visible' }}
                      >
                        <SubscriptionCablePopover
                          projectId={projectId}
                          cableId={c.id}
                          cableCode={c.cable_code}
                          cableSpec={c.spec}
                          cableAssignments={cableAssignments}
                          defaultRole={defaultRole}
                          svgScale={svgScale}
                          onSaved={() => router.refresh()}
                          onClose={() => setSubscriptionPopoverCableId(null)}
                        />
                      </foreignObject>
                    )
                  })()}
                {/* 선택 시 waypoint 핸들 — 드래그 이동 / 우클릭 삭제.
                    지도 모드는 경로점 lat/lng 를 화면으로 투영한 위치에 표시. */}
                {selected &&
                  wps.map((w, i) => {
                    const sp = waypointScreenPos(w)
                    if (!sp) return null
                    return (
                      <circle
                        key={`wp-${i}`}
                        cx={sp.x}
                        cy={sp.y}
                        r={6}
                        fill="white"
                        stroke={SELECTED_COLOR}
                        strokeWidth={2}
                        style={{
                          cursor: 'grab',
                          pointerEvents: mode === 'map' ? 'auto' : undefined,
                        }}
                        onPointerDown={(e) => onWaypointPointerDown(e, c.id, i)}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          removeWaypoint(c.id, i)
                        }}
                      />
                    )
                  })}
              </g>
            )
          })}

          {/* 시설 (노드) */}
          {facilities.map((f) => {
            const pos = effectivePositions[f.id]
            if (!pos) return null
            // 첫째 줄 ID — 설계자가 입력한 ID(facility_code) 우선, 없으면 자동 코드
            const code = f.facility_code || formatFacilityCode(f.closure_type, f.seq_no)
            const isNew = facilityIsNew.get(f.id) ?? false
            // 신설 접속함체 — 라벨 글자도 빨강 (도형 색과 일치)
            const isNewClosure =
              CLOSURE_TYPE_CATEGORY[f.closure_type] === '접속함체' &&
              f.install_status === 'new'
            const isSelected = selectedId === f.id
            const isMultiSelected = selectedIds.has(f.id)
            const cableCount = facilityCableCount.get(f.id) ?? 0
            const nodeCx = NODE_SIZE.width / 2
            const nodeCy = NODE_SIZE.height / 2 - 10
            // 도형 배율 — 지도 모드 줌 축소(mapNodeScale)에 더해, 접속함체는
            //   지도 모드에서 0.65 배 추가 축소 (owner 결정 2026-05-23). 도식 모드는 1.
            const shapeScale =
              mode === 'map' &&
              CLOSURE_TYPE_CATEGORY[f.closure_type] === '접속함체'
                ? mapNodeScale * 0.65
                : mapNodeScale
            // 라벨 — 글자 크기는 원래대로 고정. 도형이 축소된 만큼 위치만 중심 쪽으로 당겨
            //   축소된 도형 바로 아래에 붙도록 한다 (scale=1 이면 원래 좌표 그대로).
            const labelCodeY = nodeCy + shapeScale * (NODE_SIZE.height - 20 - nodeCy)
            // 라벨 크기 — 도식은 크게, 지도는 작게 (지도 가독성 우선).
            //   캡처도 평소 지도 화면 그대로 — 글자를 키우지 않는다 (키우면 상자가 겹침).
            // 지도 모드는 추가 확대(extraZoom>1) 시 폰트를 1/extraZoom 으로 줄여
            // 시각 크기를 고정 (SVG transform scale 과 상쇄).
            const facCodeFont = mode === 'map' ? 9 / extraZoom : 15
            const facNameFont = mode === 'map' ? 10 / extraZoom : 17
            // 굵기 — 지도 모드는 650, 도식 모드는 큼직하게
            const facCodeWeight = mode === 'map' ? 650 : 700
            const facNameWeight = 600
            const labelNameY = labelCodeY + (mode === 'map' ? 12 : 19)
            // 라벨 위치 — 마우스 드래그 offset (시설명 겹침 방지).
            //   드래그 중이면 로컬 override, 아니면 저장된 label_dx/label_dy.
            // 시설명 — 잘라내지 않고 전체 표시 (라벨 박스가 글자에 맞춰 늘어남)
            const labelDispName = f.name
            const labelW = Math.max(
              estimateTextWidth(code, facCodeFont),
              estimateTextWidth(labelDispName, facNameFont) +
                (installNoByFacility.get(f.id) ? facNameFont * 1.9 : 0),
            )
            // 라벨 offset 은 도식·지도 모드별 별도 컬럼 — 한 모드에서 옮긴
            // 위치가 다른 모드를 흔들지 않게 (owner 2026-05-25).
            const labelOff = labelOffsets[f.id] ?? {
              dx: mode === 'map' ? f.label_dx_map : f.label_dx,
              dy: mode === 'map' ? f.label_dy_map : f.label_dy,
            }
            // 라벨이 시설에서 멀어지면 연결선(leader) — 어느 시설 라벨인지 표시.
            //   선은 라벨 박스 가장자리에서 멈춰 글자 위를 지나지 않게 한다.
            const leaderShow =
              Math.hypot(labelOff.dx, labelOff.dy) > LABEL_LEADER_THRESHOLD
            let leaderEndX = nodeCx
            let leaderEndY = nodeCy
            if (leaderShow) {
              const lcX = nodeCx + labelOff.dx
              const lcY = (labelCodeY + labelNameY) / 2 + labelOff.dy
              const ddx = nodeCx - lcX
              const ddy = nodeCy - lcY
              const hw = labelW / 2 + 3
              const hh = (labelNameY - labelCodeY) / 2 + facNameFont * 0.7 + 3
              const tx = ddx !== 0 ? hw / Math.abs(ddx) : Infinity
              const ty = ddy !== 0 ? hh / Math.abs(ddy) : Infinity
              const t = Math.min(tx, ty, 1)
              leaderEndX = lcX + ddx * t
              leaderEndY = lcY + ddy * t
            }
            return (
              <g
                key={f.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                style={{
                  cursor: editable ? (dragging === f.id ? 'grabbing' : 'pointer') : 'default',
                  // 지도 모드 — SVG 루트가 pointer-events:none 이라 시설은 개별로 켠다.
                  //   클릭(선택)·드래그(이동) 모두 pointer 핸들러가 처리.
                  pointerEvents: mode === 'map' ? 'auto' : undefined,
                }}
                onPointerDown={(e) => onPointerDown(e, f.id)}
              >
                {/* 라벨 연결선(leader) — 라벨이 멀어졌을 때 어느 시설인지 표시.
                    도형·라벨보다 먼저 그려 그 아래로 깔린다. */}
                {leaderShow && (
                  <line
                    x1={nodeCx}
                    y1={nodeCy}
                    x2={leaderEndX}
                    y2={leaderEndY}
                    stroke="#94a3b8"
                    strokeWidth={1}
                    strokeDasharray="3 2"
                    vectorEffect="non-scaling-stroke"
                    style={{ pointerEvents: 'none' }}
                  />
                )}
                {/* 노란색 마크 강조 — 지도 모드: 도형 뒤 맥동 후광.
                    스케일 그룹 밖에 둬 줌 아웃해도 작아지지 않아 멀리서도 눈에 띈다. */}
                {f.is_marked && mode === 'map' && (
                  <g style={{ pointerEvents: 'none' }}>
                    <circle
                      cx={nodeCx}
                      cy={nodeCy}
                      r={26}
                      fill="#facc15"
                      fillOpacity={0.3}
                    />
                    <circle
                      cx={nodeCx}
                      cy={nodeCy}
                      r={22}
                      fill="none"
                      stroke="#eab308"
                      strokeWidth={3.5}
                    >
                      <animate
                        attributeName="r"
                        values="20;38;20"
                        dur="1.6s"
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="stroke-opacity"
                        values="0.95;0;0.95"
                        dur="1.6s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  </g>
                )}
                {/* 도형 — 지도 모드 줌 축소 시 노드 중심 기준으로 함께 축소.
                    중심(GPS 투영점)은 불변 → 케이블 연결점 유지. 라벨은 이 그룹 밖이라 원래 크기. */}
                <g
                  transform={
                    shapeScale !== 1
                      ? `translate(${nodeCx}, ${nodeCy}) scale(${shapeScale}) translate(${-nodeCx}, ${-nodeCy})`
                      : undefined
                  }
                >
                  {/* 선택 강조 — 도형 뒤 동그란 후광 */}
                  {isSelected && (
                    <circle
                      cx={NODE_SIZE.width / 2}
                      cy={NODE_SIZE.height / 2 - 10}
                      r={22}
                      fill={SELECTED_COLOR}
                      fillOpacity={0.18}
                      stroke={SELECTED_COLOR}
                      strokeWidth={2}
                      strokeDasharray="3 3"
                    />
                  )}
                  {/* 다중 선택 강조 — 보라 후광. isSelected 와 동시 표시 안 함 (단일 선택 우선) */}
                  {!isSelected && isMultiSelected && (
                    <circle
                      cx={NODE_SIZE.width / 2}
                      cy={NODE_SIZE.height / 2 - 10}
                      r={22}
                      fill="#8b5cf6"
                      fillOpacity={0.18}
                      stroke="#7c3aed"
                      strokeWidth={2}
                      strokeDasharray="4 3"
                    />
                  )}

                  <FacilityShape
                    closureType={f.closure_type}
                    isNew={isNew}
                    installStatus={f.install_status}
                  />

                  {/* 연결 케이블 수 배지 — 동일 시설 연결 직관 확인 (도형 우상단) */}
                  {cableCount > 0 && (
                    <g style={{ pointerEvents: 'none' }}>
                      <circle
                        cx={NODE_SIZE.width / 2 + 17}
                        cy={NODE_SIZE.height / 2 - 26}
                        r={8}
                        fill="#0f766e"
                        stroke="white"
                        strokeWidth={1.5}
                      />
                      <text
                        x={NODE_SIZE.width / 2 + 17}
                        y={NODE_SIZE.height / 2 - 22.5}
                        textAnchor="middle"
                        fill="white"
                        style={{ fontSize: 9, fontFamily: LABEL_FONT, fontWeight: 700 }}
                      >
                        {cableCount}
                      </text>
                    </g>
                  )}

                  {/* 노란색 마크 배지 — is_marked 시 도형 좌상단 (노란 원 + 흰 별) */}
                  {f.is_marked && (
                    <g style={{ pointerEvents: 'none' }}>
                      <circle
                        cx={NODE_SIZE.width / 2 - 17}
                        cy={NODE_SIZE.height / 2 - 26}
                        r={8}
                        fill="#facc15"
                        stroke="white"
                        strokeWidth={1.5}
                      />
                      <text
                        x={NODE_SIZE.width / 2 - 17}
                        y={NODE_SIZE.height / 2 - 22.3}
                        textAnchor="middle"
                        fill="white"
                        style={{ fontSize: 10, fontFamily: LABEL_FONT, fontWeight: 700 }}
                      >
                        ★
                      </text>
                    </g>
                  )}
                </g>

                {/* 라벨 — 도형이 축소돼도 글자 크기는 처음 크기로 고정.
                    흰색 외곽선(paintOrder=stroke → 외곽선이 글자 뒤)으로 배경 지도 글자와 구분.
                    g transform — 마우스 드래그 offset 적용. */}
                <g
                  transform={`translate(${labelOff.dx}, ${labelOff.dy})`}
                  style={{
                    visibility: labelsHiddenForCapture ? 'hidden' : undefined,
                  }}
                >
                {/* 글자 변형 — (nodeCx, labelCodeY) 기준 너비 0.75배·높이 1.2배 (조밀한 장체) */}
                <g
                  transform={
                    mode === 'map'
                      ? `translate(${nodeCx} ${labelCodeY}) scale(${LABEL_SCALE_X} ${LABEL_SCALE_Y}) translate(${-nodeCx} ${-labelCodeY})`
                      : undefined
                  }
                >
                {/* 지도 모드 — 글자 뒤 흰 배경 박스로 지도 배경 글자와 시인성 확보 */}
                {mode === 'map' && (
                  <rect
                    x={nodeCx - labelW / 2 - 5}
                    y={labelCodeY - facCodeFont}
                    width={labelW + 10}
                    height={labelNameY - labelCodeY + facNameFont + 8}
                    rx={4}
                    fill="#ffffff"
                    fillOpacity={1}
                    stroke="#cbd5e1"
                    strokeWidth={0.75}
                    style={{ pointerEvents: 'none' }}
                  />
                )}
                <text
                  x={nodeCx}
                  y={labelCodeY}
                  textAnchor="middle"
                  className={isNewClosure ? 'fill-red-600' : 'fill-slate-900'}
                  stroke="#ffffff"
                  strokeWidth={LABEL_HALO_WIDTH}
                  strokeLinejoin="round"
                  paintOrder="stroke"
                  style={{
                    fontSize: facCodeFont,
                    fontFamily: LABEL_FONT,
                    fontWeight: facCodeWeight,
                    letterSpacing: LABEL_TRACKING,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {code}
                </text>
                {(() => {
                  const displayName = f.name
                  const installNo = installNoByFacility.get(f.id)
                  // 접속함체가 아니면 기존처럼 가운데 정렬 이름만
                  if (!installNo) {
                    return (
                      <text
                        x={nodeCx}
                        y={labelNameY}
                        textAnchor="middle"
                        className={isNewClosure ? 'fill-red-600' : 'fill-slate-950'}
                        stroke="#ffffff"
                        strokeWidth={LABEL_HALO_WIDTH}
                        strokeLinejoin="round"
                        paintOrder="stroke"
                        style={{
                          fontSize: facNameFont,
                          fontFamily: LABEL_FONT,
                          fontWeight: facNameWeight,
                          letterSpacing: LABEL_TRACKING,
                        }}
                      >
                        {displayName}
                      </text>
                    )
                  }
                  // 접속함체 — 시설명 앞에 설치 순번 (녹색 원 + 흰 숫자, 글자와 같은 크기)
                  const F = facNameFont
                  const r = F * 0.78
                  const gap = 4
                  const nameW = estimateTextWidth(displayName, F)
                  const startX = nodeCx - (r * 2 + gap + nameW) / 2
                  const circleCx = startX + r
                  const circleCy = labelNameY - F * 0.35
                  return (
                    <>
                      <circle
                        cx={circleCx}
                        cy={circleCy}
                        r={r}
                        fill="#16a34a"
                        stroke="#ffffff"
                        strokeWidth={1.5}
                      />
                      <text
                        x={circleCx}
                        y={circleCy + F * 0.35}
                        textAnchor="middle"
                        fill="#ffffff"
                        style={{
                          fontSize: F,
                          fontFamily: LABEL_FONT,
                          fontWeight: 700,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {installNo}
                      </text>
                      <text
                        x={startX + r * 2 + gap}
                        y={labelNameY}
                        textAnchor="start"
                        className={isNewClosure ? 'fill-red-600' : 'fill-slate-950'}
                        stroke="#ffffff"
                        strokeWidth={LABEL_HALO_WIDTH}
                        strokeLinejoin="round"
                        paintOrder="stroke"
                        style={{
                          fontSize: F,
                          fontFamily: LABEL_FONT,
                          fontWeight: facNameWeight,
                          letterSpacing: LABEL_TRACKING,
                        }}
                      >
                        {displayName}
                      </text>
                    </>
                  )
                })()}
                {/* 라벨 드래그용 투명 hit area — 글자 위 전체를 덮어 드래그/선택 처리 */}
                {editable && (
                  <rect
                    x={nodeCx - labelW / 2 - 5}
                    y={labelCodeY - facCodeFont}
                    width={labelW + 10}
                    height={labelNameY - labelCodeY + facNameFont + 8}
                    fill="transparent"
                    style={{ cursor: 'move', pointerEvents: 'all' }}
                    onPointerDown={(e) =>
                      onLabelPointerDown(e, f.id, labelOff.dx, labelOff.dy)
                    }
                  />
                )}
                </g>
                </g>
                {/* 청약 도식 모드 — 시설 「작업내역입력」 popover */}
                {projectCategory === '청약' &&
                  mode === 'schematic' &&
                  facilityTaskPopoverId === f.id &&
                  (() => {
                    const POP_W = 480
                    const POP_H = 460
                    const POP_OFFSET_FROM_NODE = 40
                    const svgRect = svgRef.current?.getBoundingClientRect()
                    const popSvgScale =
                      svgRect && svgRect.width > 0
                        ? viewport.width / svgRect.width
                        : 1
                    // 시설 노드 위쪽으로 띄움 (라벨 안 가리는 적당한 위치)
                    return (
                      <foreignObject
                        x={nodeCx - POP_W / 2}
                        y={-POP_H - POP_OFFSET_FROM_NODE}
                        width={POP_W}
                        height={POP_H}
                        style={{ overflow: 'visible' }}
                        // popover 안 클릭이 시설 <g> 의 onPointerDown 으로 bubble 되면
                        //   interactionRef 가 잡히고 pointerup 시 handleNodeClick → 선택 해제 → popover 닫힘.
                        //   pointerdown/up/click 모두 여기서 차단.
                        onPointerDown={(e) => e.stopPropagation()}
                        onPointerUp={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <FacilityTaskPopover
                          projectId={projectId}
                          facilityId={f.id}
                          facilityCode={code}
                          facilityName={f.name}
                          taskTypes={taskTypes ?? []}
                          svgScale={popSvgScale}
                          onSaved={() => router.refresh()}
                          onClose={() => setFacilityTaskPopoverId(null)}
                        />
                      </foreignObject>
                    )
                  })()}
              </g>
            )
          })}

          {/* 절단 절체 마크 — 폭발 모양 + 「절단 절체」 글자를 해당 케이블에.
              시설 노드보다 위 레이어에 그려 분기수 배지에 안 가린다.
              케이블 끝(신설 함체)에서 노드·배지를 벗어날 만큼 떨어뜨린다. */}
          {cables.map((c) => {
            const cut = cutover.cables.get(c.id)
            if (!cut) return null
            const pts = cablePathPoints(c)
            if (pts.length < 2) return null
            const along = (
              a: { x: number; y: number },
              b: { x: number; y: number },
            ) => {
              const dx = b.x - a.x
              const dy = b.y - a.y
              const len = Math.hypot(dx, dy)
              if (len < 1) return a
              const t = Math.min(58 / len, 0.45)
              return { x: a.x + dx * t, y: a.y + dy * t }
            }
            const marks: { x: number; y: number }[] = []
            if (cut.from) marks.push(along(pts[0], pts[1]))
            if (cut.to)
              marks.push(along(pts[pts.length - 1], pts[pts.length - 2]))
            return marks.map((m, i) => (
              <g key={`cut-${c.id}-${i}`} pointerEvents="none">
                <polygon
                  points={burstPoints(m.x, m.y)}
                  fill="#dc2626"
                  stroke="white"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                />
                {/* 「절단 절체」 글자 알약 — 도식 모드에만 표시.
                    지도 모드는 시설이 빽빽이 놓여 글자가 다른 시설을 가려서 숨김.
                    폭발 마크만으로도 식별 가능. */}
                {mode !== 'map' && (
                  <>
                    <rect
                      x={m.x - 31}
                      y={m.y + 13}
                      width={62}
                      height={15}
                      rx={7.5}
                      fill="#dc2626"
                      stroke="white"
                      strokeWidth={1.5}
                    />
                    <text
                      x={m.x}
                      y={m.y + 23.7}
                      textAnchor="middle"
                      fill="white"
                      style={{ fontSize: 9, fontFamily: LABEL_FONT, fontWeight: 700 }}
                    >
                      절단 절체
                    </text>
                  </>
                )}
              </g>
            ))
          })}

          {/* 고장점 마커 — 측정 거리로 추정한 위치 (노드 위에 표시) */}
          {highlight?.fault &&
            (() => {
              const c = cableById.get(highlight.fault.cableId)
              if (!c) return null
              const pts = cablePathPoints(c)
              if (pts.length < 2) return null
              const pt = pointAlongPolyline(pts, highlight.fault.fraction)
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <circle cx={pt.x} cy={pt.y} r={13} fill={FAULT_COLOR} fillOpacity={0.25} />
                  <line
                    x1={pt.x - 16}
                    y1={pt.y}
                    x2={pt.x + 16}
                    y2={pt.y}
                    stroke={FAULT_COLOR}
                    strokeWidth={1.5}
                  />
                  <line
                    x1={pt.x}
                    y1={pt.y - 16}
                    x2={pt.x}
                    y2={pt.y + 16}
                    stroke={FAULT_COLOR}
                    strokeWidth={1.5}
                  />
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={6}
                    fill={FAULT_COLOR}
                    stroke="white"
                    strokeWidth={2}
                  />
                  <text
                    x={pt.x}
                    y={pt.y - 21}
                    textAnchor="middle"
                    fill={FAULT_COLOR}
                    style={{ fontSize: 10, fontWeight: 700, fontFamily: LABEL_FONT }}
                  >
                    고장점
                  </text>
                </g>
              )
            })()}

            {/* 도식 내보내기용 범례 — 내보내는 순간에만 상단에 가로로 표시 */}
            {exportLegend && (
              <ExportLegend
                items={exportLegend.items}
                x={exportLegend.x}
                y={exportLegend.y}
                width={exportLegend.width}
              />
            )}
          </svg>

          {/* 분할 캡처 가이드 — 지도 모드, 시설 영역을 격자로 나눠 스크린샷 */}
          {captureActive && mode === 'map' && mapStatus === 'ready' && kakaoMap && (
            <MapCaptureGuide
              map={kakaoMap}
              facilities={facilities}
              captureBarSlot={captureBarSlot}
              onClose={() => setCaptureActive(false)}
            />
          )}

          {/* 탭 메뉴 오버레이 — 시설·케이블·회선·... 탭을 캔버스 위에 표시.
              상단 「탭 메뉴」 버튼으로 토글. 캔버스를 덮고 그 안에서 작업한다. */}
          {tabPanel && tabPanelOpen && (
            <div className="absolute inset-0 z-40 overflow-y-auto bg-white">
              {tabPanel}
            </div>
          )}
        </div>

        {/* 거리뷰 패널 — 지도 모드 + 거리뷰 토글 ON. 다른 우측 패널보다 우선 */}
        {roadviewOpen && mode === 'map' && (
          <RoadviewPanel
            position={roadviewPos}
            title={roadviewTitle}
            onClose={() => {
              setRoadviewOpen(false)
              setRoadviewPos(null)
              setRoadviewTitle(null)
            }}
            collapsed={roadviewCollapsed}
            onToggleCollapse={() => setRoadviewCollapsed((v) => !v)}
          />
        )}

        {/* 케이블 정보 패널 — 케이블 선택 시 우측 컬럼. 정보 수정·경로점 거리·삭제 */}
        {!roadviewOpen &&
          !faultSearchOpen &&
          selectedCableId &&
          (() => {
            const c = cableById.get(selectedCableId)
            if (!c) return null
            const fromF = facilities.find((f) => f.id === c.from_facility_id)
            const toF = facilities.find((f) => f.id === c.to_facility_id)
            const fromName = fromF
              ? `${formatFacilityCode(fromF.closure_type, fromF.seq_no)} ${fromF.name}`
              : '(삭제됨)'
            const toName = toF
              ? `${formatFacilityCode(toF.closure_type, toF.seq_no)} ${toF.name}`
              : '(삭제됨)'
            const wps = effectiveWaypoints(c.id)
            return (
              <CableInfoPanel
                key={`${c.id}-${wps.length}`}
                projectId={projectId}
                cable={{
                  id: c.id,
                  cable_code: c.cable_code,
                  spec: c.spec as CableSpec,
                  status: c.status,
                  installation_type: c.installation_type,
                  total_length: c.total_length,
                  end_distance: c.end_distance,
                }}
                fromName={fromName}
                toName={toName}
                fromLat={fromF?.lat ?? null}
                fromLng={fromF?.lng ?? null}
                toLat={toF?.lat ?? null}
                toLng={toF?.lng ?? null}
                waypoints={wps}
                waypointColumn={mode === 'map' ? 'map_waypoints' : 'waypoints'}
                circuits={circuits ?? []}
                assignments={(coreAssignments ?? []).filter(
                  (a) => a.cable_id === c.id,
                )}
                onClose={() => setSelectedCableId(null)}
                onSaved={() => {
                  setSelectedCableId(null)
                  router.refresh()
                }}
                onCoreChanged={() => router.refresh()}
                collapsed={infoPanelCollapsed}
                onToggleCollapse={() => setInfoPanelCollapsed((v) => !v)}
              />
            )
          })()}

        {/* 시설 정보 패널 — 시설(모든 종류) 선택 시 우측 컬럼.
            기본 정보 수정 + 공종량·자재 입력 (기별명세서용) */}
        {!roadviewOpen &&
          !faultSearchOpen &&
          selectedId &&
          (() => {
            const f = facilities.find((x) => x.id === selectedId)
            if (!f) return null
            return (
              <FacilityInfoPanel
                key={f.id}
                projectId={projectId}
                facility={{
                  id: f.id,
                  closure_type: f.closure_type,
                  seq_no: f.seq_no,
                  name: f.name,
                  facility_code: f.facility_code,
                  closure_spec: f.closure_spec,
                  install_address: f.install_address,
                  notes: f.notes,
                  inspection_request: f.inspection_request,
                  parent_facility_id: f.parent_facility_id,
                  is_marked: f.is_marked,
                  mark_note: f.mark_note,
                  work_window_start: f.work_window_start,
                  work_window_end: f.work_window_end,
                  install_status: f.install_status,
                }}
                stations={facilities
                  .filter((x) => x.closure_type === '국사')
                  .map((x) => ({
                    id: x.id,
                    closure_type: x.closure_type,
                    seq_no: x.seq_no,
                    name: x.name,
                  }))}
                cableCount={facilityCableCount.get(f.id) ?? 0}
                installNo={installNoByFacility.get(f.id) ?? null}
                position={effectivePositions[f.id] ?? null}
                taskTypes={taskTypes ?? []}
                tasks={(facilityTasks ?? []).filter((t) => t.facility_id === f.id)}
                materials={(facilityMaterials ?? []).filter(
                  (m) => m.facility_id === f.id,
                )}
                onClose={() => setSelectedId(null)}
                onChanged={() => router.refresh()}
                collapsed={infoPanelCollapsed}
                onToggleCollapse={() => setInfoPanelCollapsed((v) => !v)}
              />
            )
          })()}

        {/* 고장점 검색 패널 — 우측 컬럼. 시설물→케이블→회선 드릴다운 */}
        {!roadviewOpen && faultSearchOpen && (
          <FaultSearchPanel
            facilities={facilities}
            cables={cables}
            circuits={circuits ?? []}
            assignments={coreAssignments ?? []}
            facilityId={faultFacilityId}
            cableId={faultCableId}
            circuitId={faultCircuitId}
            onPickFacility={pickFaultFacility}
            onPickCable={pickFaultCable}
            onPickCircuit={pickFaultCircuit}
            width={faultPanelWidth}
            onResize={setFaultPanelWidth}
            onClose={() => setFaultSearchOpen(false)}
            collapsed={faultPanelCollapsed}
            onToggleCollapse={() => setFaultPanelCollapsed((v) => !v)}
          />
        )}

        {/* 실사 그리기 오버레이 — 캔버스 영역(사이드바+지도+우측패널) 전체를 덮음.
            sketchMode 일 때 pointer 캡처 → 영역 구분 없이 한 그림판처럼 그리기.
            도구: pen(자유 그리기) / text(클릭 위치 텍스트 박스).
            inspectionPlaceMode 가 켜진 동안엔 pointer 캡처 안 함 → 클릭이 지도/캔버스로
            통과해서 시설 즉시 배치. */}
        <SketchOverlay
          enabled={sketchMode && !inspectionPlaceMode}
          tool={sketchTool}
          pen={sketchPen}
          strokes={sketchStrokes}
          onStrokesChange={setSketchStrokes}
          texts={sketchTexts}
          onTextsChange={setSketchTexts}
          // 도식 모드는 메인 SVG content 좌표(viewport pan/zoom 따라옴),
          // 지도 모드는 GPS 좌표(카카오 지도 pan/zoom 따라옴).
          coords={mode === 'map' ? 'gps' : 'svg'}
          kakaoMap={kakaoMap}
          mapEpoch={mapEpoch}
          mainSvgEl={mainSvgElState}
          svgViewport={viewport}
          // 캔버스(지도/SVG) 영역 element — 거리뷰·사이드바 등 영역 밖 그림은 픽셀 anchor.
          //   GPS/SVG 좌표 계산도 이 영역 기준으로 정확히 변환됨.
          canvasContainerEl={canvasAreaEl}
        />

        {/* 실사 도구 바 — sketchMode ON 시 캔버스 하단 중앙 floating.
            flex-wrap 으로 좁은 화면에서 자동 줄바꿈. z-50 (캡처 가이드보다 위).
            캡처 중에는 visibility:hidden 으로 PNG 에 안 찍히게 가림. */}
        {sketchMode && (
          <div
            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-50 flex flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-2.5 py-2 shadow-lg"
            style={{
              pointerEvents: 'auto',
              maxWidth: 'calc(100vw - 1rem)',
              visibility: labelsHiddenForCapture || saveDialogOpen ? 'hidden' : undefined,
            }}
          >
            {/* 도구 — 펜(자유 그리기) / T(텍스트 박스) */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSketchTool('pen')}
                className={
                  'inline-flex h-9 w-9 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-md border ' +
                  (sketchTool === 'pen'
                    ? 'bg-slate-900 border-slate-900 text-white'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50')
                }
                title="펜 — 자유 그리기"
                aria-label="펜"
              >
                <Pencil className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setSketchTool('text')}
                className={
                  'inline-flex h-9 w-9 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-md border ' +
                  (sketchTool === 'text'
                    ? 'bg-slate-900 border-slate-900 text-white'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50')
                }
                title="텍스트 — 클릭한 위치에 글자 입력"
                aria-label="텍스트"
              >
                <Type className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              </button>
              {/* 실사정보입력 — 클릭한 위치에 「실사{N}」 시설 즉시 배치 (모달 X) */}
              <button
                type="button"
                onClick={() => setInspectionPlaceMode((v) => !v)}
                className={
                  'inline-flex h-9 sm:h-7 items-center gap-1 shrink-0 whitespace-nowrap px-2.5 rounded-md border text-xs sm:text-[11px] font-semibold ' +
                  (inspectionPlaceMode
                    ? 'bg-rose-600 border-rose-600 text-white'
                    : 'bg-white border-rose-400 text-rose-700 hover:bg-rose-50')
                }
                title="실사정보 입력 — 클릭한 위치에 실사정보 시설 즉시 등록 (이름 자동 「실사N」)"
                aria-label="실사정보입력"
              >
                <span
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: inspectionPlaceMode ? 'white' : '#dc2626',
                    color: inspectionPlaceMode ? '#dc2626' : 'white',
                    fontWeight: 900,
                    fontSize: 10,
                  }}
                >
                  i
                </span>
                실사정보입력
              </button>
            </div>
            <span className="mx-1 h-5 w-px bg-slate-200" />
            <div className="flex items-center gap-1">
              {['#ef4444', '#000000', '#2563eb', '#16a34a', '#eab308'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSketchPen((p) => ({ ...p, color: c }))}
                  className={
                    'inline-block h-7 w-7 sm:h-6 sm:w-6 shrink-0 rounded-full border-2 ' +
                    (sketchPen.color === c ? 'border-slate-900' : 'border-slate-300')
                  }
                  style={{ backgroundColor: c }}
                  title={`색 ${c}`}
                  aria-label={`색 ${c}`}
                />
              ))}
            </div>
            <span className="mx-1 h-5 w-px bg-slate-200" />
            <div className="flex items-center gap-1">
              {[2, 3, 5, 8].map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setSketchPen((p) => ({ ...p, width: w }))}
                  className={
                    'inline-flex h-9 w-9 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-md border ' +
                    (sketchPen.width === w
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50')
                  }
                  title={
                    sketchTool === 'text'
                      ? `글자 크기 ${w * 6}px`
                      : `굵기 ${w}px`
                  }
                  aria-label={`굵기 ${w}px`}
                >
                  <span
                    className="inline-block rounded-full bg-current"
                    style={{ width: w, height: w }}
                  />
                </button>
              ))}
            </div>
            <span className="mx-1 h-5 w-px bg-slate-200" />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  // 가장 최근에 추가한 항목 1개 되돌리기 (선/텍스트 둘 다 비교)
                  const lastS = sketchStrokes[sketchStrokes.length - 1]
                  const lastT = sketchTexts[sketchTexts.length - 1]
                  if (!lastS && !lastT) return
                  const tsS = lastS ? Number(lastS.id.split('-')[1]) : 0
                  const tsT = lastT ? Number(lastT.id.split('-')[1]) : 0
                  if (tsS >= tsT) setSketchStrokes((s) => s.slice(0, -1))
                  else setSketchTexts((t) => t.slice(0, -1))
                }}
                disabled={sketchStrokes.length === 0 && sketchTexts.length === 0}
                className="inline-flex items-center gap-1 shrink-0 whitespace-nowrap rounded-md border border-slate-300 px-2.5 h-9 sm:h-7 text-xs sm:text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                title="마지막 항목 되돌리기"
              >
                <Undo2 className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                되돌리기
              </button>
              <button
                type="button"
                onClick={() => {
                  if (sketchStrokes.length === 0 && sketchTexts.length === 0) return
                  if (!confirm('실사 그림·텍스트를 모두 지웁니다. 계속하시겠습니까?')) return
                  setSketchStrokes([])
                  setSketchTexts([])
                }}
                disabled={sketchStrokes.length === 0 && sketchTexts.length === 0}
                className="inline-flex items-center gap-1 shrink-0 whitespace-nowrap rounded-md border border-rose-300 px-2.5 h-9 sm:h-7 text-xs sm:text-[11px] font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                title="전체 지우기"
              >
                <Trash2 className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                지우기
              </button>
              <button
                type="button"
                onClick={() => setSaveDialogOpen(true)}
                className="inline-flex items-center gap-1 shrink-0 whitespace-nowrap rounded-md bg-rose-600 px-2.5 h-9 sm:h-7 text-xs sm:text-[11px] font-semibold text-white hover:bg-rose-700"
                title="현재 캔버스 화면을 시설에 저장"
              >
                <Save className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                시설에 저장
              </button>
              <button
                type="button"
                onClick={() => setSketchMode(false)}
                className="inline-flex items-center gap-1 shrink-0 whitespace-nowrap rounded-md border border-slate-300 bg-slate-100 px-2.5 h-9 sm:h-7 text-xs sm:text-[11px] font-medium text-slate-700 hover:bg-slate-200"
                title="실사 끄기"
              >
                <X className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                끄기
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 실사 화면 저장 다이얼로그 — 시설 선택 + 화면 캡처(getDisplayMedia) → Storage */}
      <FieldInspectionSaveDialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        projectId={projectId}
        facilities={facilities.map((f) => ({
          id: f.id,
          closure_type: f.closure_type,
          seq_no: f.seq_no,
          name: f.name,
        }))}
        preselectedFacilityId={selectedId}
        onCaptureRunningChange={(running) => {
          // 캡처 중에는 다이얼로그·도구바·라벨 등 모두 PNG 에 안 찍히게 가림.
          //   labelsHiddenForCapture state 로 React 렌더에 visibility:hidden 적용
          //   (실사 도구바·다이얼로그·고정 UI 등 일괄 처리)
          setLabelsHiddenForCapture(running)
          // 다이얼로그 자체도 가림 (fixed z-60 이라 React rerender 후에도 보임)
          const el = document.querySelector(
            '[data-field-inspection-dialog]',
          ) as HTMLElement | null
          if (el) el.style.opacity = running ? '0' : '1'
        }}
        onSaved={() => router.refresh()}
      />

      {/* 분할 캡처 컨트롤 바 영역 — 캔버스(지도) 아래. MapCaptureGuide 가 portal 로 채운다. */}
      {captureActive && mode === 'map' && mapStatus === 'ready' && (
        <div
          ref={setCaptureBarSlot}
          className="shrink-0 border-t border-slate-200 bg-white"
        />
      )}

      {/* 지도 자동 캡처 패널 — 캔버스(지도) 아래. 화면 공유로 자동 캡처·합성 */}
      {autoCaptureActive && mode === 'map' && mapStatus === 'ready' && kakaoMap && (
        <div className="shrink-0">
          <MapAutoCapture
            map={kakaoMap}
            facilities={captureFacilities}
            getMapRect={() =>
              canvasAreaRef.current?.getBoundingClientRect() ?? null
            }
            onCaptureRunningChange={setLabelsHiddenForCapture}
            onClose={() => setAutoCaptureActive(false)}
          />
        </div>
      )}

      {pendingConnection && fromFacility && toFacility && (
        <ConnectionModal
          projectId={projectId}
          from={fromFacility}
          to={toFacility}
          defaultSpec={cableTool}
          onClose={() => setPendingConnection(null)}
          onSaved={() => {
            // 도식 모드 — 케이블 생성 후 위성 시설을 허브 둘레 슬롯으로 자동 정렬
            if (mode === 'schematic' && pendingConnection) {
              alignFacilityForCable(
                pendingConnection.fromId,
                pendingConnection.toId,
              )
            }
            setPendingConnection(null)
            router.refresh()
          }}
        />
      )}

      <LegendPanel open={legendOpen} onClose={() => setLegendOpen(false)} />

      {pendingPlacement && (
        <NewFacilityModal
          projectId={projectId}
          placement={pendingPlacement}
          masters={facilityMasters ?? []}
          onClose={() => setPendingPlacement(null)}
          onSaved={() => {
            setPendingPlacement(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}


function NewFacilityModal({
  projectId,
  placement,
  masters,
  onClose,
  onSaved,
}: {
  projectId: string
  placement: PendingPlacement
  masters: FacilityMasterMini[]
  onClose: () => void
  onSaved: () => void
}) {
  const closureType = placement.closureType
  const [name, setName] = useState('')
  const [masterId, setMasterId] = useState<string | null>(null)
  const [closureSpec, setClosureSpec] = useState<string>('')
  const [installAddress, setInstallAddress] = useState('')
  const [installStatus, setInstallStatus] = useState<FacilityInstallStatus>('new')
  const [facilityCode, setFacilityCode] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 설치 구분(기설/신설) 은 접속함체 + RN/IJP 에 노출
  const showInstallStatus = hasInstallStatus(closureType)

  // 시설 종류와 master.facility_type 매핑:
  //   '국사' → 'station'
  //   '함체_가공형' / '함체_관로형' → 'box'
  //   그 외(맨홀·가입자시설·MOFD·OJC·국사내장비) → 마스터 없음
  const masterType: 'station' | 'box' | null =
    closureType === '국사'
      ? 'station'
      : closureType === '함체_가공형' || closureType === '함체_관로형'
        ? 'box'
        : null

  const filteredMasters = useMemo(() => {
    if (!masterType) return []
    return masters.filter((m) => m.facility_type === masterType)
  }, [masters, masterType])

  // 시설명 자동 매칭 — 이름이 마스터와 일치하면 master_id + 부가정보 prefill
  const onNameChange = (v: string) => {
    setName(v)
    if (filteredMasters.length === 0) return
    const matched = filteredMasters.find((m) => m.name === v.trim())
    if (matched) {
      setMasterId(matched.id)
      if (matched.spec_enum && !closureSpec) setClosureSpec(matched.spec_enum)
      if (matched.address && !installAddress) setInstallAddress(matched.address)
    } else {
      setMasterId(null)
    }
  }

  const isFacilityClosure = closureType === '함체_가공형' || closureType === '함체_관로형'

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    if (!name.trim()) {
      toast.error('시설 이름을 입력하세요')
      return
    }
    setSubmitting(true)
    const spec = closureSpec
      ? (closureSpec as (typeof CABLE_SPEC_VALUES)[number])
      : null
    const result =
      placement.kind === 'xy'
        ? await createFacilityAtPosition({
            project_id: projectId,
            closure_type: closureType,
            name: name.trim(),
            x: placement.x,
            y: placement.y,
            master_facility_id: masterId,
            closure_spec: spec,
            install_address: installAddress.trim() || null,
            install_status: showInstallStatus ? installStatus : null,
            facility_code: facilityCode.trim() || null,
          })
        : await createFacilityAtLatLng({
            project_id: projectId,
            closure_type: closureType,
            name: name.trim(),
            lat: placement.lat,
            lng: placement.lng,
            master_facility_id: masterId,
            closure_spec: spec,
            install_address: installAddress.trim() || null,
            install_status: showInstallStatus ? installStatus : null,
            facility_code: facilityCode.trim() || null,
          })
    setSubmitting(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(`${CLOSURE_TYPE_LABEL[closureType]} ${name.trim()} 등록 완료`)
    onSaved()
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Plus className="h-5 w-5 text-blue-600" />
            {CLOSURE_TYPE_LABEL[closureType]} 추가
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {placement.kind === 'xy'
              ? `좌표 (${placement.x}, ${placement.y}) — 캔버스 위치 그대로 저장됩니다.`
              : `지도 위치 (${placement.lat.toFixed(6)}, ${placement.lng.toFixed(6)}) 에 저장됩니다.`}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700">
              시설 이름 <span className="text-rose-600">*</span>
              {masterId && (
                <span className="ml-2 text-[10px] font-medium text-emerald-700">
                  ✓ 마스터 매칭됨
                </span>
              )}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              required
              maxLength={200}
              list={filteredMasters.length > 0 ? `masters-${closureType}` : undefined}
              placeholder={
                masterType
                  ? '마스터 자동완성 — 새 이름도 입력 가능'
                  : '예: 0025A 79M3#1 / 필동 충무영상센터'
              }
              autoFocus
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
            />
            {filteredMasters.length > 0 && (
              <datalist id={`masters-${closureType}`}>
                {filteredMasters.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.code ? `${m.code} · ${m.address ?? ''}` : (m.address ?? '')}
                  </option>
                ))}
              </datalist>
            )}
          </div>

          {isFacilityClosure && (
            <div>
              <label className="block text-xs font-medium text-slate-700">함체 규격</label>
              <select
                value={closureSpec}
                onChange={(e) => setClosureSpec(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">(미지정)</option>
                {CABLE_SPEC_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700">
              {facilityIdLabel(closureType)}
            </label>
            <input
              type="text"
              value={facilityCode}
              onChange={(e) => setFacilityCode(e.target.value)}
              maxLength={100}
              placeholder="미입력 시 자동 부여"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {showInstallStatus && (
            <div>
              <label className="block text-xs font-medium text-slate-700">설치 구분</label>
              <select
                value={installStatus}
                onChange={(e) =>
                  setInstallStatus(e.target.value as FacilityInstallStatus)
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {FACILITY_INSTALL_STATUS_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {FACILITY_INSTALL_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          )}

          {closureType === '가입자시설' && (
            <div>
              <label className="block text-xs font-medium text-slate-700">설치 주소</label>
              <input
                type="text"
                value={installAddress}
                onChange={(e) => setInstallAddress(e.target.value)}
                maxLength={500}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:bg-slate-300"
            >
              {submitting ? '저장 중...' : '시설 추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


// LGU+ 표준 범례 (owner 첨부 이미지, 2026-05-20) 의 도형을 캔버스 노드에 재현.
// LegendPanel.tsx 의 SVG 아이콘 패턴과 동일. NODE_SIZE 90×90 의 중심 좌표(cx, cy)에 배치.
//
// 매핑:
//   국사 (5종) — 깃발 + 마름모 4 색
//   국사 내부 (MOFD/OJC/국사내장비) — 작은 박스 + 라벨
//   설치장소 — 맨홀(사각)·가입자시설(원)·창고(마름모 초록)·일반설치장소(삼각형 파랑)
//   접속함체 (5종) — 함체_가공형/관로형(원+X 검정), 중간접속형(원+X 빨강), 중간분기형(원+T 주황), SP내장형(보타이 빨강)
//   모바일국소 (8종) — 기지국(탑), 중계기(깃발), 안테나(H원), ESS_LTE_DU(eNB 박스), ESS_LTE_RRH(충원), ESS_CDMA_기지국(기원), ESS_CDMA_광중계기(광원), ESS_RF중계기(RF원)
//   RN/IJP/광MUX (5종) — RN_TPS(R빨강), RN_LTE(R보라), TPS_LTE_외(R초록), IJP(i노랑), 광Mux(M파랑)
// 시설 종류별 도형 가장자리 반경 — 케이블 끝점 trim 용.
//   FacilityShape 의 도형별 외접 반경에 -1 (도형이 케이블 끝점을 살짝 가려 닿아 보이도록).
//   undefined 또는 미정의 종류는 기본 9.
function facilityEdgeRadius(closureType: ClosureType | undefined): number {
  if (!closureType) return 9
  // 접속함체 원+X 또는 원+T (r=14)
  if (
    closureType === '함체_가공형' ||
    closureType === '함체_관로형' ||
    closureType === '중간접속형' ||
    closureType === '중간분기형'
  ) return 13
  if (closureType === 'SP내장형') return 12 // 보타이
  // 국사 마름모 s=22 — 내접원 ≈ 11
  if (
    closureType === '종합국사' ||
    closureType === '집중국사' ||
    closureType === '가입자국사' ||
    closureType === '간이국사' ||
    closureType === '창고'
  ) return 10
  // 국사 (깃대+깃발) — 작은 영역
  if (closureType === '국사') return 8
  // 국사 내부 박스 (32×16) — 짧은 변 반
  if (closureType === 'MOFD' || closureType === 'OJC' || closureType === '국사내장비') return 7
  if (closureType === '맨홀') return 8
  if (closureType === '가입자시설') return 10
  if (closureType === '일반설치장소') return 9
  if (closureType === '기지국') return 10
  if (closureType === '중계기') return 7
  if (closureType === '안테나') return 10
  if (
    closureType === 'ESS_LTE_DU' ||
    closureType === 'ESS_LTE_RRH' ||
    closureType === 'ESS_CDMA_기지국' ||
    closureType === 'ESS_CDMA_광중계기' ||
    closureType === 'ESS_RF중계기'
  ) return 8
  if (
    closureType === 'RN_TPS' ||
    closureType === 'RN_LTE' ||
    closureType === 'TPS_LTE_외' ||
    closureType === 'IJP' ||
    closureType === '광Mux'
  ) return 10
  return 9
}

function FacilityShape({
  closureType,
  isNew,
  installStatus,
}: {
  closureType: ClosureType
  isNew: boolean
  installStatus?: string
}) {
  const cx = NODE_SIZE.width / 2
  const cy = NODE_SIZE.height / 2 - 10
  const isFallback = isNew ? NEW_COLOR : EXISTING_COLOR
  // 접속함체 색상은 설치 구분으로 — 기설=검정, 신설=빨강 (owner 결정 2026-05-22)
  const stdColor = facilityDiagramColor(closureType, installStatus ?? 'new')

  // ===== 국사 카테고리 =====================================================
  if (closureType === '국사') {
    // 깃대 + 깃발 (LegendPanel FlagIcon 의 캔버스용 확대)
    return (
      <g>
        <line x1={cx - 9} y1={cy - 10} x2={cx - 9} y2={cy + 12} stroke="#111827" strokeWidth={2} />
        <rect x={cx - 9} y={cy - 10} width={16} height={10} fill="#111827" />
      </g>
    )
  }
  if (
    closureType === '종합국사' ||
    closureType === '집중국사' ||
    closureType === '가입자국사' ||
    closureType === '간이국사'
  ) {
    // 마름모 4 색 (45도 회전 사각형)
    const s = 22
    return (
      <rect
        x={cx - s / 2}
        y={cy - s / 2}
        width={s}
        height={s}
        fill={stdColor}
        transform={`rotate(45 ${cx} ${cy})`}
      />
    )
  }

  // ===== 국사 내부 — 작은 박스 + 라벨 ======================================
  if (closureType === 'MOFD' || closureType === 'OJC' || closureType === '국사내장비') {
    const w = 32
    const h = 16
    const label = closureType === '국사내장비' ? 'EQ' : closureType
    return (
      <g>
        <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} fill="white" stroke={isFallback} strokeWidth={1.4} />
        <text x={cx} y={cy + 3} textAnchor="middle" fill={isFallback} style={{ fontSize: 8, fontFamily: LABEL_FONT, fontWeight: 600 }}>
          {label}
        </text>
      </g>
    )
  }

  // ===== 설치장소 ==========================================================
  if (closureType === '맨홀') {
    const s = 18
    return (
      <rect x={cx - s / 2} y={cy - s / 2} width={s} height={s} fill="white" stroke={isFallback} strokeWidth={1.8} />
    )
  }
  if (closureType === '가입자시설') {
    return <circle cx={cx} cy={cy} r={11} fill={stdColor} stroke={stdColor} strokeWidth={1} />
  }
  if (closureType === '창고') {
    // 초록 마름모
    const s = 22
    return (
      <rect
        x={cx - s / 2}
        y={cy - s / 2}
        width={s}
        height={s}
        fill={stdColor}
        transform={`rotate(45 ${cx} ${cy})`}
      />
    )
  }
  if (closureType === '일반설치장소') {
    // 파란 정삼각형
    return (
      <polygon
        points={`${cx},${cy - 12} ${cx + 11},${cy + 10} ${cx - 11},${cy + 10}`}
        fill={stdColor}
      />
    )
  }

  // ===== 접속함체 ==========================================================
  if (closureType === '함체_가공형' || closureType === '함체_관로형') {
    // 원 + X — 규격색(stdColor). 접속함체 기설이면 stdColor 가 검정으로 산출됨.
    const r = 14
    return (
      <g>
        <circle cx={cx} cy={cy} r={r} fill="white" stroke={stdColor} strokeWidth={1.8} />
        <line x1={cx - r * 0.7} y1={cy - r * 0.7} x2={cx + r * 0.7} y2={cy + r * 0.7} stroke={stdColor} strokeWidth={1.5} />
        <line x1={cx - r * 0.7} y1={cy + r * 0.7} x2={cx + r * 0.7} y2={cy - r * 0.7} stroke={stdColor} strokeWidth={1.5} />
      </g>
    )
  }
  if (closureType === '중간접속형') {
    // 빨강 원 + X
    const r = 14
    return (
      <g>
        <circle cx={cx} cy={cy} r={r} fill="white" stroke={stdColor} strokeWidth={1.8} />
        <line x1={cx - r * 0.7} y1={cy - r * 0.7} x2={cx + r * 0.7} y2={cy + r * 0.7} stroke={stdColor} strokeWidth={1.6} />
        <line x1={cx - r * 0.7} y1={cy + r * 0.7} x2={cx + r * 0.7} y2={cy - r * 0.7} stroke={stdColor} strokeWidth={1.6} />
      </g>
    )
  }
  if (closureType === '중간분기형') {
    // 주황 원 + T (수직·수평선)
    const r = 14
    return (
      <g>
        <circle cx={cx} cy={cy} r={r} fill="white" stroke={stdColor} strokeWidth={1.8} />
        <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke={stdColor} strokeWidth={1.6} />
        <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke={stdColor} strokeWidth={1.6} />
      </g>
    )
  }
  if (closureType === 'SP내장형') {
    // 빨강 보타이 (양쪽 삼각형이 가운데에서 만남)
    return (
      <g>
        <polygon points={`${cx},${cy} ${cx - 12},${cy - 9} ${cx - 12},${cy + 9}`} fill={stdColor} />
        <polygon points={`${cx},${cy} ${cx + 12},${cy - 9} ${cx + 12},${cy + 9}`} fill={stdColor} />
      </g>
    )
  }

  // ===== 모바일국소 ========================================================
  if (closureType === '기지국') {
    // 탑 (꼭대기 점 + 사다리꼴)
    return (
      <g>
        <circle cx={cx} cy={cy - 14} r={2.5} fill="#111827" />
        <polygon
          points={`${cx},${cy - 11} ${cx + 9},${cy + 12} ${cx - 9},${cy + 12}`}
          fill="none"
          stroke="#111827"
          strokeWidth={1.6}
        />
        <line x1={cx - 5} y1={cy + 2} x2={cx + 5} y2={cy + 2} stroke="#111827" strokeWidth={1.2} />
      </g>
    )
  }
  if (closureType === '중계기') {
    // 작은 깃발 (검정 삼각 깃발)
    return (
      <g>
        <line x1={cx - 8} y1={cy - 12} x2={cx - 8} y2={cy + 12} stroke="#111827" strokeWidth={1.8} />
        <polygon points={`${cx - 8},${cy - 12} ${cx + 8},${cy - 8} ${cx - 8},${cy - 4}`} fill="#111827" />
      </g>
    )
  }
  if (closureType === '안테나') {
    // H 원형 (빨강)
    return <CircledText cx={cx} cy={cy} text="H" color={stdColor} />
  }
  if (closureType === 'ESS_LTE_DU') {
    // eNB 박스 (파랑)
    return <BoxedText cx={cx} cy={cy} text="eNB" color={stdColor} width={26} />
  }
  if (closureType === 'ESS_LTE_RRH') {
    return <CircledText cx={cx} cy={cy} text="충" color={stdColor} />
  }
  if (closureType === 'ESS_CDMA_기지국') {
    return <CircledText cx={cx} cy={cy} text="기" color={stdColor} />
  }
  if (closureType === 'ESS_CDMA_광중계기') {
    return <CircledText cx={cx} cy={cy} text="광" color={stdColor} />
  }
  if (closureType === 'ESS_RF중계기') {
    return <CircledText cx={cx} cy={cy} text="RF" color={stdColor} />
  }

  // ===== RN / IJP / 광MUX ==================================================
  if (closureType === 'RN_TPS' || closureType === 'RN_LTE' || closureType === 'TPS_LTE_외') {
    return <CircledText cx={cx} cy={cy} text="R" color={stdColor} />
  }
  if (closureType === 'IJP') {
    return <CircledText cx={cx} cy={cy} text="i" color={stdColor} />
  }
  if (closureType === '광Mux') {
    return <CircledText cx={cx} cy={cy} text="M" color={stdColor} />
  }

  // ===== 실사정보 — 큰 빨간 원 + 흰 'i' + 펄스 후광 (눈에 확 띄게) ============
  if (closureType === '실사정보') {
    const R = 18
    return (
      <g>
        {/* 펄스 후광 — 노란 마크와 유사한 강조 효과 */}
        <circle cx={cx} cy={cy} r={R + 4} fill="#fecaca" fillOpacity={0.5}>
          <animate
            attributeName="r"
            values={`${R + 2};${R + 10};${R + 2}`}
            dur="1.8s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="fill-opacity"
            values="0.7;0;0.7"
            dur="1.8s"
            repeatCount="indefinite"
          />
        </circle>
        {/* 본체 원 — 채움 + 흰 테두리로 어떤 배경에서도 보이게 */}
        <circle
          cx={cx}
          cy={cy}
          r={R}
          fill="#dc2626"
          stroke="white"
          strokeWidth={3}
        />
        {/* 안에 흰 'i' 글자 — 작은 점 + 세로 긴 사각 */}
        <circle cx={cx} cy={cy - 6} r={2.5} fill="white" />
        <rect x={cx - 2} y={cy - 2} width={4} height={11} rx={1.5} fill="white" />
      </g>
    )
  }

  // ===== 안전망 — 미매칭 시 기본 박스 =======================================
  const w = 32
  const h = 16
  return (
    <g>
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} fill="white" stroke={isFallback} strokeWidth={1.4} />
      <text x={cx} y={cy + 3} textAnchor="middle" fill={isFallback} style={{ fontSize: 7, fontFamily: LABEL_FONT, fontWeight: 600 }}>
        {closureType}
      </text>
    </g>
  )
}


// 캔버스 노드용 「원+글자」 / 「박스+글자」 헬퍼 (LegendPanel 의 작은 아이콘을 NODE_SIZE 에 맞춰 확대)

function CircledText({ cx, cy, text, color }: { cx: number; cy: number; text: string; color: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={14} fill={color} />
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        fill="white"
        style={{ fontSize: text.length > 1 ? 10 : 12, fontFamily: LABEL_FONT, fontWeight: 700 }}
      >
        {text}
      </text>
    </g>
  )
}

function BoxedText({ cx, cy, text, color, width = 26 }: { cx: number; cy: number; text: string; color: string; width?: number }) {
  const h = 16
  return (
    <g>
      <rect x={cx - width / 2} y={cy - h / 2} width={width} height={h} fill={color} rx={2.5} />
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        fill="white"
        style={{ fontSize: 9, fontFamily: LABEL_FONT, fontWeight: 700 }}
      >
        {text}
      </text>
    </g>
  )
}


// 도식 내보내기 범례 항목 — 시설(기설/신설 분리)·케이블 상태·절단 절체.
type LegendItem =
  | { kind: 'header'; label: string }
  | { kind: 'facility'; closureType: ClosureType; installStatus: string; label: string }
  | {
      kind: 'cable'
      spec: string
      status: CableStatus
      installationType: CableInstallationType | null
      label: string
    }
  | { kind: 'cutover'; label: string }

// 도식 내보내기용 범례 — 도식 상단에 가로 배치 (owner 2026-05-25).
//   기존 좌측 세로 배치 → 시설 라벨이 잘려서, 위쪽 전체 폭으로 배치.
//   섹션(시설/케이블)이 그룹 헤더로 구분되고, 항목은 자동 줄바꿈 (보통 3 줄 이내).
function ExportLegend({
  items,
  x,
  y,
  width,
}: {
  items: LegendItem[]
  x: number
  y: number
  width: number
}) {
  const TITLE_FONT = 22
  const HEADER_FONT = 16
  const FONT = 16
  const ICON_W = 50
  const ICON_TEXT_GAP = 6
  const ITEM_GAP_X = 18
  const ROW_GAP_Y = 6
  const ROW_H = 36
  const PAD_X = 18
  const PAD_TOP = 38 // 제목 아래 첫 줄 시작
  const PAD_BOTTOM = 14
  const TITLE_GAP_X = 16
  const HEADER_GAP_X = 16
  const ICON_SCALE = 0.5

  // 「범례」 타이틀 폭
  const titleW = estimateTextWidth('범례', TITLE_FONT) + TITLE_GAP_X

  // 항목별 폭 산출
  function itemWidth(it: LegendItem): number {
    if (it.kind === 'header') {
      return estimateTextWidth(it.label, HEADER_FONT) + HEADER_GAP_X
    }
    return ICON_W + ICON_TEXT_GAP + estimateTextWidth(it.label, FONT)
  }

  // 한 줄에 가능한 폭 = width - PAD_X*2 - titleW (첫 줄은 타이틀 차지, 둘째 이상은 전체)
  // 단순화: 모든 줄이 동일하게 width - PAD_X*2 안에 들어가도록.
  // 첫 줄은 타이틀 다음부터 시작.
  const availW = Math.max(200, width - PAD_X * 2)
  const firstRowAvailW = Math.max(200, availW - titleW)

  // 행 분할 — items 순서대로 채워나감. 행 사이에 group header 는 같이 묶어 표시.
  type Placed = { it: LegendItem; w: number }
  const rows: Placed[][] = [[]]
  let curRowWidth = 0
  let curRowAvail = firstRowAvailW
  for (const it of items) {
    const w = itemWidth(it)
    const need = curRowWidth === 0 ? w : ITEM_GAP_X + w
    if (curRowWidth + need > curRowAvail && rows[rows.length - 1].length > 0) {
      // 다음 줄
      rows.push([])
      curRowWidth = 0
      curRowAvail = availW
    }
    rows[rows.length - 1].push({ it, w })
    curRowWidth += need
  }

  const H = PAD_TOP + rows.length * ROW_H + (rows.length - 1) * ROW_GAP_Y + PAD_BOTTOM
  const W = width

  return (
    <g transform={`translate(${x}, ${y})`} pointerEvents="none">
      <rect
        x={0}
        y={0}
        width={W}
        height={H}
        rx={10}
        fill="#ffffff"
        stroke="#94a3b8"
        strokeWidth={1.5}
      />
      {/* 「범례」 타이틀 — 좌상단 */}
      <text
        x={PAD_X}
        y={PAD_TOP - 6}
        fill="#0f172a"
        style={{ fontSize: TITLE_FONT, fontWeight: 800, fontFamily: LABEL_FONT }}
      >
        범례
      </text>
      {/* 행별 렌더 */}
      {rows.map((row, ri) => {
        const cy = PAD_TOP + ri * (ROW_H + ROW_GAP_Y) + ROW_H / 2
        // 첫 줄은 타이틀 다음부터 시작
        let cursorX = ri === 0 ? PAD_X + titleW : PAD_X
        return (
          <g key={ri}>
            {row.map(({ it, w }, ii) => {
              const startX = cursorX
              cursorX += w + ITEM_GAP_X
              if (it.kind === 'header') {
                return (
                  <g key={ii}>
                    <rect
                      x={startX - 6}
                      y={cy - 12}
                      width={w}
                      height={24}
                      rx={4}
                      fill="#f1f5f9"
                    />
                    <text
                      x={startX}
                      y={cy + HEADER_FONT * 0.36}
                      fill="#475569"
                      style={{
                        fontSize: HEADER_FONT,
                        fontWeight: 700,
                        fontFamily: LABEL_FONT,
                      }}
                    >
                      {it.label}
                    </text>
                  </g>
                )
              }
              const iconCx = startX + ICON_W / 2
              return (
                <g key={ii}>
                  {it.kind === 'facility' && (
                    <g
                      transform={`translate(${iconCx - (NODE_SIZE.width / 2) * ICON_SCALE}, ${cy - (NODE_SIZE.height / 2 - 10) * ICON_SCALE}) scale(${ICON_SCALE})`}
                    >
                      <FacilityShape
                        closureType={it.closureType}
                        isNew={it.installStatus !== 'existing'}
                        installStatus={it.installStatus}
                      />
                    </g>
                  )}
                  {it.kind === 'cable' &&
                    (() => {
                      const s = edgeStyle(it.spec, it.status, it.installationType)
                      return (
                        <line
                          x1={startX + 4}
                          y1={cy}
                          x2={startX + ICON_W - 4}
                          y2={cy}
                          stroke={s.stroke}
                          strokeWidth={s.width}
                          strokeDasharray={s.dash}
                          opacity={s.opacity}
                          strokeLinecap="round"
                        />
                      )
                    })()}
                  {it.kind === 'cutover' && (
                    <>
                      <line
                        x1={startX + 4}
                        y1={cy}
                        x2={startX + ICON_W - 4}
                        y2={cy}
                        stroke="#111827"
                        strokeWidth={3.4}
                        strokeLinecap="round"
                      />
                      <polygon
                        points={burstPoints(iconCx, cy)}
                        fill="#dc2626"
                        stroke="white"
                        strokeWidth={1.5}
                        strokeLinejoin="round"
                      />
                    </>
                  )}
                  <text
                    x={startX + ICON_W + ICON_TEXT_GAP}
                    y={cy + FONT * 0.36}
                    fill="#1e293b"
                    style={{ fontSize: FONT, fontFamily: LABEL_FONT }}
                  >
                    {it.label}
                  </text>
                </g>
              )
            })}
          </g>
        )
      })}
    </g>
  )
}


function ConnectionModal({
  projectId,
  from,
  to,
  defaultSpec,
  onClose,
  onSaved,
}: {
  projectId: string
  from: FacilityNode
  to: FacilityNode
  defaultSpec: CableSpec | null
  onClose: () => void
  onSaved: () => void
}) {
  const fromLabel = `${formatFacilityCode(from.closure_type, from.seq_no)} ${from.name}`
  const toLabel = `${formatFacilityCode(to.closure_type, to.seq_no)} ${to.name}`

  // 전체거리 기본값 — 두 시설 GPS 좌표가 있으면 지도상 직선거리(m)로 자동 입력.
  //   기설·신설 공통. 설계자가 필요시 수정 (waypoint 입력 후엔 도로 경로 거리로).
  const autoLength =
    from.lat != null && from.lng != null && to.lat != null && to.lng != null
      ? Math.round(
          haversineMeters(
            { lat: from.lat, lng: from.lng },
            { lat: to.lat, lng: to.lng },
          ),
        )
      : null

  const [spec, setSpec] = useState<string>(defaultSpec ?? '144C')
  const [status, setStatus] = useState<string>('new')
  const [cableCode, setCableCode] = useState('')
  const [installationType, setInstallationType] = useState('')
  const [totalLength, setTotalLength] = useState<string>(
    autoLength != null ? String(autoLength) : '',
  )
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    // redirect 안 하는 캔버스용 액션 — 현재 모드(도식/지도)를 유지한 채 케이블만 추가
    const result = await createCableFromCanvas({
      project_id: projectId,
      from_facility_id: from.id,
      to_facility_id: to.id,
      spec,
      status,
      cable_code: cableCode.trim(),
      installation_type: installationType || null,
      total_length: totalLength.trim() === '' ? null : Number(totalLength),
      notes: notes.trim() || null,
    })
    setSubmitting(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(`${result.cable_code} 케이블을 등록했습니다`)
    onSaved()
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-lg font-bold text-slate-900">케이블 연결</h3>
          <p className="text-xs text-slate-500 mt-1">두 시설을 연결할 케이블 정보를 입력하세요.</p>
        </div>

        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <p className="text-slate-600">
            <span className="font-medium text-slate-900">{fromLabel}</span>
            <span className="mx-2 text-slate-400">→</span>
            <span className="font-medium text-slate-900">{toLabel}</span>
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                규격 <span className="text-rose-600">*</span>
              </label>
              <select
                value={spec}
                onChange={(e) => setSpec(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {CABLE_SPEC_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">상태</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {CABLE_STATUS_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {CABLE_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">
              케이블 ID (신설은 비워두면 자동 생성)
            </label>
            <input
              type="text"
              value={cableCode}
              onChange={(e) => setCableCode(e.target.value)}
              maxLength={100}
              placeholder="기설은 LGU+ 제공 ID. 신설은 비워두면 NEW-XXXX-NNNNNN"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">
              설치 구분 (LGU+ 광망 범례)
            </label>
            <select
              value={installationType}
              onChange={(e) => setInstallationType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">(미지정)</option>
              {CABLE_INSTALLATION_TYPE_VALUES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">
              전체거리 (m)
            </label>
            <input
              type="number"
              min={0}
              step="0.1"
              value={totalLength}
              onChange={(e) => setTotalLength(e.target.value)}
              placeholder="전체거리"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              {autoLength != null
                ? '지도상 두 시설 직선거리로 자동 입력했습니다. 필요시 수정하세요.'
                : '시설 GPS 좌표가 없어 자동 계산을 못 했습니다. 직접 입력하세요.'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">비고</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:bg-slate-300"
            >
              {submitting ? '저장 중...' : '케이블 생성'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


// 기존 `Legend()` 컴포넌트는 LegendPanel.tsx 로 이동·확장됨.
// 「표준 범례」 버튼 클릭 시 LGU+ 표준 범례 (29 시설 + 광망) 모달 노출.
