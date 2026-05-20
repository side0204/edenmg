'use client'

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
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
  Map as MapIcon,
  Network,
  TriangleAlert,
  MapPin,
} from 'lucide-react'
import {
  CABLE_SPEC_VALUES,
  CLOSURE_TYPE_LABEL,
  CLOSURE_TYPE_COLOR,
  CLOSURE_CATEGORY_LABEL,
  groupClosureTypesByCategory,
  CLOSURE_TYPE_CATEGORY,
  cableSpecColor,
  installationTypeDash,
  CABLE_INSTALLATION_TYPE_VALUES,
  formatFacilityCode,
  type ClosureType,
  type ClosureCategory,
  type CableStatus,
  type CableSpec,
  type CableInstallationType,
  type CoreLifecycle,
} from '@/lib/relocation'
import { CABLE_STATUS_LABEL, CABLE_STATUS_VALUES } from '@/lib/relocation'
import { autoLayoutPositions, NODE_SIZE } from './auto-layout'
import { saveNodePositions, saveCableWaypoints } from './position-actions'
import { createCable } from './cable-actions'
import {
  createFacilityAtPosition,
  createFacilityAtLatLng,
  updateFacilityLatLng,
  bulkPlaceFacilities,
} from './facility-actions'
import LegendPanel from './LegendPanel'
import CableInfoPanel from './CableInfoPanel'
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
}

type FacilityNode = {
  id: string
  closure_type: ClosureType
  seq_no: number
  name: string
  closure_spec: CableSpec | null
  install_address: string | null
  notes: string | null
  x_hint: number | null
  y_hint: number | null
  lat: number | null
  lng: number | null
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
  waypoints: Waypoint[]
  total_length: number | null
  end_distance: number | null
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
const CABLE_OFFSET_GAP = 7        // px — 같은 경로 여러 케이블 평행 간격

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

// 케이블 라인 스타일 산출 — LGU+ 표준 범례 적용 (2026-05-20)
//   - 색(stroke): 케이블 규격 (cableSpecColor — 1C~12C 빨강 / 13C~36C 청록 / ...)
//   - dash: 설치 구분 (installationTypeDash — 가공/구내/해저 solid · 입상 dotted · 지중 dashed)
//   - width·opacity: 상태 (신설 두껍게 · 철거 흐리게)
function edgeStyle(
  spec: string,
  status: CableStatus,
  installationType: CableInstallationType | null,
): { stroke: string; dash: string; width: number; opacity: number } {
  const stroke = cableSpecColor(spec as Parameters<typeof cableSpecColor>[0])
  const dash = installationTypeDash(installationType)
  let width = 1.8
  let opacity = 1
  if (status === 'new') width = 2.6
  else if (status === 'relocating') width = 2.2
  else if (status === 'removing') {
    width = 1.4
    opacity = 0.45
  }
  return { stroke, dash, width, opacity }
}


export default function TopologyCanvas({
  projectId,
  facilities,
  cables,
  editable,
  facilityMasters,
  taskTypes,
  facilityTasks,
  facilityMaterials,
  circuits,
  coreAssignments,
  initialCanvasSize,
}: {
  projectId: string
  facilities: FacilityNode[]
  cables: CableEdge[]
  editable: boolean
  facilityMasters?: FacilityMasterMini[]
  taskTypes?: TaskTypeOption[]
  facilityTasks?: FacilityTaskRow[]
  facilityMaterials?: FacilityMaterialRow[]
  circuits?: FaultSearchCircuit[]
  coreAssignments?: CanvasCoreAssignment[]
  // 캔버스 표시 영역 시작 크기 — 전용 캔버스 라우트는 'tall' 로 크게 연다.
  initialCanvasSize?: 'compact' | 'normal' | 'tall' | 'fullscreen'
}) {
  const router = useRouter()

  // 도식(schematic) / 지도(map) 모드.
  //   지도 모드 = 카카오맵을 SVG 캔버스 뒤 배경으로 깔고, 시설을 GPS 좌표로 투영해 배치.
  //   도식 모드는 기존 동작 그대로 — 모든 분기는 `mode === 'map'` 별도 경로.
  const [mode, setMode] = useState<'schematic' | 'map'>('schematic')
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
  const placingIdRef = useRef<string | null>(null)
  useEffect(() => {
    placingIdRef.current = placingId
  }, [placingId])

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

  // 케이블 경로 편집 — 선택된 케이블의 중간 waypoint 를 드래그/추가/삭제.
  //   selectedCableId: 현재 경로 편집 중인 케이블
  //   cableWaypoints: 로컬 override (서버 저장 전 부드러운 드래그용 — positions 와 같은 패턴)
  const [selectedCableId, setSelectedCableId] = useState<string | null>(null)
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

  const cableById = useMemo(() => new Map(cables.map((c) => [c.id, c])), [cables])

  // 케이블 waypoints — 로컬 override 우선, 없으면 서버 props
  const effectiveWaypoints = useCallback(
    (cableId: string): Waypoint[] =>
      cableWaypoints[cableId] ?? cableById.get(cableId)?.waypoints ?? [],
    [cableWaypoints, cableById],
  )

  // 같은 두 시설 사이 여러 케이블 — 수직 offset 으로 평행하게 분리 (겹침 방지)
  const cableOffsets = useMemo(() => {
    const groups = new Map<string, string[]>()
    for (const c of cables) {
      // 방향 무관 그룹 키 (A→B 와 B→A 같은 경로로 취급)
      const key = [c.from_facility_id, c.to_facility_id].sort().join('|')
      const arr = groups.get(key)
      if (arr) arr.push(c.id)
      else groups.set(key, [c.id])
    }
    const result = new Map<string, number>()
    for (const ids of groups.values()) {
      const k = ids.length
      // 중앙 기준 분산: 1조면 0, 2조면 -3.5/+3.5, 3조면 -7/0/+7 ...
      ids.forEach((id, i) => result.set(id, (i - (k - 1) / 2) * CABLE_OFFSET_GAP))
    }
    return result
  }, [cables])

  // 시설별 연결된 케이블 수 (노드 배지 — 동일 시설 연결 직관 확인)
  const facilityCableCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of cables) {
      m.set(c.from_facility_id, (m.get(c.from_facility_id) ?? 0) + 1)
      m.set(c.to_facility_id, (m.get(c.to_facility_id) ?? 0) + 1)
    }
    return m
  }, [cables])

  // 케이블별 회선·코어 배정 수 (케이블 라벨 배지)
  const coreCountByCable = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of coreAssignments ?? []) {
      m.set(a.cable_id, (m.get(a.cable_id) ?? 0) + 1)
    }
    return m
  }, [coreAssignments])

  const [selectedId, setSelectedId] = useState<string | null>(null)
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

  // LGU+ 표준 범례 모달
  const [legendOpen, setLegendOpen] = useState(false)

  // 정보 패널(케이블·접속함체) 접기 상태 — 캔버스 작업 공간 확보용.
  // 케이블·시설 패널은 동시에 1개만 뜨므로 공유 상태 1개. 선택 바꿔도 유지.
  const [infoPanelCollapsed, setInfoPanelCollapsed] = useState(false)

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
  const [toolsCollapsed, setToolsCollapsed] = useState(false)

  // 광케이블 카테고리 펼침 상태 (시설 카테고리 openCategories 와 별개)
  const [cableCatOpen, setCableCatOpen] = useState(false)

  // 좌측 시설 목록 사이드바 — 클릭 시 해당 시설 위치로 캔버스 이동
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // 카테고리별 시설 그룹 (좌측 사이드바용)
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
    for (const cat of Object.keys(g) as ClosureCategory[]) {
      g[cat].sort((a, b) => a.seq_no - b.seq_no)
    }
    return g
  }, [facilities])

  // 클릭/드래그 구분용 ref — 이동 거리가 threshold 미만이면 click
  const interactionRef = useRef<{
    id: string
    startX: number
    startY: number
    offsetX: number
    offsetY: number
    hasMoved: boolean
  } | null>(null)

  const svgRef = useRef<SVGSVGElement>(null)

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

  // 지도 모드 — GPS 가 있는 시설들이 모두 보이도록 지도 fit
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
      m.setLevel(3)
      return
    }
    const bounds = new kakao.maps.LatLngBounds()
    for (const f of withGps) bounds.extend(new kakao.maps.LatLng(f.lat, f.lng))
    m.setBounds(bounds)
  }, [kakaoMap, facilities])

  // 지도 첫 준비 시 1회 — 시설 GPS 범위로 자동 fit
  const initialFitDoneRef = useRef(false)
  useEffect(() => {
    if (mapStatus !== 'ready' || initialFitDoneRef.current) return
    initialFitDoneRef.current = true
    fitMapToFacilities()
  }, [mapStatus, fitMapToFacilities])

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
      // 2) 시설 추가 도구가 선택돼 있으면 그 위치에 새 시설 배치 폼 열기
      const tool = addToolRef.current
      if (tool) {
        setPendingPlacement({ closureType: tool, kind: 'latlng', lat, lng })
        setAddTool(null) // 1회 배치 후 도구 해제
      }
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
    // 두 번째 클릭 — 연결 시작
    setPendingConnection({ fromId: selectedId, toId: id })
    setSelectedId(null)
  }

  // 케이블의 경로 점 배열 — [출발 시설 중심, ...중간 경로점, 도착 시설 중심]
  //   - 도식 모드: 경로점 x/y 그대로
  //   - 지도 모드: 경로점 lat/lng 를 화면 픽셀로 투영 (Phase 4)
  //   - 경로점 없으면 같은 경로 다른 케이블과 겹치지 않게 수직 offset 적용
  const cablePathPoints = useCallback(
    (c: CableEdge): Waypoint[] => {
      const from = effectivePositions[c.from_facility_id]
      const to = effectivePositions[c.to_facility_id]
      if (!from || !to) return []
      const fromCenter = {
        x: from.x + NODE_SIZE.width / 2,
        y: from.y + NODE_SIZE.height / 2 - 10,
      }
      const toCenter = {
        x: to.x + NODE_SIZE.width / 2,
        y: to.y + NODE_SIZE.height / 2 - 10,
      }
      const wps = effectiveWaypoints(c.id)

      // 중간 경로점을 화면 좌표로 변환
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

      if (midPoints.length > 0) {
        return [fromCenter, ...midPoints, toCenter]
      }
      // 직선 케이블 — 같은 경로 여러 조면 수직 offset
      const offset = cableOffsets.get(c.id) ?? 0
      if (offset === 0) return [fromCenter, toCenter]
      const dx = toCenter.x - fromCenter.x
      const dy = toCenter.y - fromCenter.y
      const len = Math.hypot(dx, dy) || 1
      const nx = -dy / len // 진행 방향에 수직인 단위벡터
      const ny = dx / len
      return [
        { x: fromCenter.x + nx * offset, y: fromCenter.y + ny * offset },
        { x: toCenter.x + nx * offset, y: toCenter.y + ny * offset },
      ]
    },
    [effectivePositions, effectiveWaypoints, cableOffsets, mode, kakaoMap],
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
    const result = await saveCableWaypoints(projectId, cableId, next)
    if (!result.ok) toast.error(result.error)
  }

  // waypoint 삭제 — 우클릭
  const removeWaypoint = async (cableId: string, index: number) => {
    const current = effectiveWaypoints(cableId)
    const next = current.filter((_, i) => i !== index)
    setCableWaypoints((prev) => ({ ...prev, [cableId]: next }))
    const result = await saveCableWaypoints(projectId, cableId, next)
    if (!result.ok) toast.error(result.error)
  }

  // waypoint 드래그 시작
  const onWaypointPointerDown = (
    e: React.PointerEvent<SVGCircleElement>,
    cableId: string,
    index: number,
  ) => {
    if (!editable) return
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
    // 도식·지도 모드 공통 — pointer 캡처로 드래그. 지도 모드도 동일 (Phase 2).
    e.stopPropagation()
    const { x, y } = toSvgCoord(e.clientX, e.clientY)
    const pos = effectivePositions[id]
    if (!pos) return
    interactionRef.current = {
      id,
      startX: x,
      startY: y,
      offsetX: x - pos.x,
      offsetY: y - pos.y,
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
    // SVG 배경을 직접 누른 경우만 pan. 케이블 선·라벨 위에서 누르면 pan 시작 안 함
    // — setPointerCapture 가 케이블 click 이벤트를 SVG 로 가로채는 것을 방지.
    if (e.target !== svgRef.current) return
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    panRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startVx: viewport.x,
      startVy: viewport.y,
      scaleX: viewport.width / rect.width,
      scaleY: viewport.height / rect.height,
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
      if (!ir.hasMoved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      if (!ir.hasMoved) {
        ir.hasMoved = true
        setDragging(ir.id)
        setSelectedId(null)
      }
      const np = { x: x - ir.offsetX, y: y - ir.offsetY }
      // 지도 모드는 mapDragPos(임시 픽셀)에, 도식 모드는 positions(영구 레이아웃)에 기록
      if (mode === 'map') {
        setMapDragPos((prev) => ({ ...prev, [ir.id]: np }))
      } else {
        setPositions((prev) => ({ ...prev, [ir.id]: np }))
      }
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
      const nx = x - wd.offsetX
      const ny = y - wd.offsetY
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

  const onPointerUp = async () => {
    // 1) 노드 드래그 마무리
    const ir = interactionRef.current
    if (ir) {
      interactionRef.current = null
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
    // 2) 케이블 waypoint 드래그 마무리
    const wd = waypointDragRef.current
    if (wd) {
      waypointDragRef.current = null
      if (wd.hasMoved) {
        const result = await saveCableWaypoints(
          projectId,
          wd.cableId,
          effectiveWaypoints(wd.cableId),
        )
        if (!result.ok) toast.error(result.error)
      }
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
  const wrapperClass = isFullscreen
    ? 'fixed inset-0 z-40 bg-white border border-slate-200 overflow-hidden flex flex-col'
    : 'border border-slate-200 rounded-xl bg-white overflow-hidden'

  return (
    <div className={wrapperClass}>
      <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-slate-600">
          시설 {facilities.length}개 · 케이블 {cables.length}개
          {mode === 'map'
            ? placingFacility
              ? ' · 지도를 클릭해 시설 위치를 지정하세요'
              : addTool
                ? ` · 지도를 클릭해 ${CLOSURE_TYPE_LABEL[addTool]} 을(를) 배치하세요`
                : cableTool
                  ? ' · 시설 2개를 차례로 클릭해 케이블을 연결하세요'
                  : selectedCableId
                    ? ' · 케이블 경로 편집 — 선 클릭 = 경로점 추가 · 점 드래그 = 이동 · 점 우클릭 = 삭제'
                    : unplacedFacilities.length > 0
                      ? ` · 미배치 시설 ${unplacedFacilities.length}개 — 우측 「미배치」 버튼으로 배치`
                      : ' · 시설 드래그 = 위치 이동 · 클릭 = 선택 · 검색창으로 위치 이동'
            : editable && (
                faultSearchOpen
                  ? ' · 고장점 검색 — 케이블을 클릭해 회선을 선택하세요 (우측 패널)'
                  : addTool
                    ? ` · 캔버스를 클릭해 ${CLOSURE_TYPE_LABEL[addTool]} 을(를) 배치하세요`
                    : selectedCableId
                      ? ' · 케이블 경로 편집 — 선 클릭 = 경로점 추가 · 점 드래그 = 이동 · 점 우클릭 = 삭제'
                      : selectedId
                        ? ' · 다른 시설을 클릭하면 케이블이 연결됩니다 (취소: 빈 영역 클릭)'
                        : ' · 시설 클릭 = 연결 · 케이블 클릭 = 경로 편집 · 빈 영역 드래그 = 이동 · 휠 = 확대/축소'
              )}
        </p>
        <div className="flex items-center gap-1">
          {/* 도식 / 지도 모드 토글 */}
          <div className="mr-1 inline-flex items-center rounded-md border border-slate-300 overflow-hidden">
            <button
              type="button"
              onClick={() => setMode('schematic')}
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

          {/* 캔버스 표시 영역 크기 단계 — compact/normal/tall/fullscreen */}
          <div className="ml-2 inline-flex items-center rounded-md border border-slate-300 overflow-hidden">
            <button
              type="button"
              onClick={shrinkCanvas}
              disabled={canvasSize === 'compact'}
              className="inline-flex items-center justify-center w-7 h-7 text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
              title="캔버스 축소"
            >
              <Shrink className="h-3.5 w-3.5" />
            </button>
            <span className="px-2 text-[11px] font-medium text-slate-600 border-x border-slate-200 h-7 inline-flex items-center min-w-[3rem] justify-center">
              {CANVAS_SIZE_LABEL[canvasSize]}
            </span>
            <button
              type="button"
              onClick={expandCanvas}
              disabled={canvasSize === 'fullscreen'}
              className="inline-flex items-center justify-center w-7 h-7 text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
              title="캔버스 확장"
            >
              <Expand className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setLegendOpen(true)}
            className="ml-2 inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 h-7 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
          >
            <BookOpen className="h-3 w-3" />
            표준 범례
          </button>

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

      {/* 추가 도구 패널 — 접기/펼치기 가능. 헤더 항상 표시, 카테고리 그룹은 펼친 상태일 때만.
          시설 chip 클릭 시 자동 접힘 (owner 요청 — 그리기 작업 시 화면 최대화).
          도식·지도 모드 모두 표시 — 지도 모드는 지도 클릭으로 시설 배치, 시설 2개 클릭으로 케이블 연결. */}
      {editable && (
        <div className="px-4 py-2 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setToolsCollapsed((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900"
              title={toolsCollapsed ? '시설 추가 패널 펼치기' : '시설 추가 패널 접기'}
            >
              <span className="text-slate-400">{toolsCollapsed ? '▶' : '▼'}</span>
              시설·케이블 추가
              {addTool && (
                <span className="ml-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-600 text-white">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-white" />
                  {CLOSURE_TYPE_LABEL[addTool]}
                </span>
              )}
              {cableTool && (
                <span className="ml-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-600 text-white">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-white" />
                  케이블 {cableTool}
                </span>
              )}
              {!addTool && !cableTool && toolsCollapsed && (
                <span className="ml-1 text-[10px] text-slate-400">(클릭으로 펼치기)</span>
              )}
            </button>
            {(addTool || cableTool) && (
              <button
                type="button"
                onClick={() => {
                  setAddTool(null)
                  setCableTool(null)
                }}
                className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:text-slate-700"
              >
                <X className="h-3 w-3" />
                취소
              </button>
            )}
          </div>

          {!toolsCollapsed && (
            <div className="mt-1.5 space-y-1.5">
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
                      <div className="mt-1 ml-3 flex items-center gap-1.5 flex-wrap">
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
                  <div className="mt-1 ml-3 flex items-center gap-1.5 flex-wrap">
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
          )}
        </div>
      )}

      {/* 지도 모드 검색창 + 미배치 시설 배치. SDK 준비 완료 후에만 노출. */}
      {mode === 'map' && mapStatus === 'ready' && (
        <div className="px-4 py-2 border-b border-slate-100 bg-slate-50 space-y-2">
          <div className="flex items-start gap-2">
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
            <div className="flex items-center justify-between gap-2 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white">
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
            <div className="rounded-lg border border-slate-200 bg-white p-2 space-y-2">
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
      )}

      {/* 좌측 시설 목록 사이드바 + SVG 캔버스 — 가로 flex */}
      <div
        className={isFullscreen ? 'flex flex-1 min-h-0' : 'flex'}
        style={isFullscreen ? undefined : { height: CANVAS_SIZE_HEIGHT[canvasSize] }}
      >
        {/* 좌측 시설 목록 — 클릭 시 해당 시설로 캔버스 이동 */}
        {!sidebarCollapsed && (
          <aside className="w-52 shrink-0 border-r border-slate-200 bg-slate-50 overflow-y-auto">
            <div className="sticky top-0 bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
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
                                <span
                                  className="inline-block w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: CLOSURE_TYPE_COLOR[f.closure_type] }}
                                />
                                <span className="font-mono text-[10px] text-slate-500 shrink-0">
                                  {formatFacilityCode(f.closure_type, f.seq_no)}
                                </span>
                                <span className="truncate">{f.name}</span>
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

        <div className="flex-1 min-w-0 relative">
          {sidebarCollapsed && (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 shadow-sm"
            >
              ▶ 시설 목록
            </button>
          )}
          {/* 카카오맵 배경 — 항상 mount, 지도 모드에서만 표시. SVG 가 위에 투명 오버레이. */}
          <div
            ref={mapSetContainer}
            className="absolute inset-0"
            style={{ display: mode === 'map' ? 'block' : 'none', zIndex: 0 }}
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
            ref={svgRef}
            viewBox={mode === 'map' ? undefined : viewBoxStr}
            className="select-none absolute inset-0 w-full h-full"
            style={{
              display: 'block',
              background: mode === 'map' ? 'transparent' : 'white',
              zIndex: 1, // 카카오맵 배경(zIndex:0) 위에 오버레이
              cursor:
                mode === 'map'
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
                        style={{ fontSize: 8.5, fontWeight: 700, fontFamily: 'system-ui' }}
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
                  y={labelPt.y - 4}
                  textAnchor="middle"
                  className="fill-slate-700"
                  style={{ fontSize: 9, fontFamily: 'system-ui', pointerEvents: 'none' }}
                >
                  {c.spec}
                </text>
                <text
                  x={labelPt.x}
                  y={labelPt.y + 8}
                  textAnchor="middle"
                  className="fill-slate-400"
                  style={{ fontSize: 8, fontFamily: 'monospace', pointerEvents: 'none' }}
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
                        y={labelPt.y + 12}
                        width={30}
                        height={11}
                        rx={5.5}
                        fill="#0d9488"
                      />
                      <text
                        x={labelPt.x}
                        y={labelPt.y + 20}
                        textAnchor="middle"
                        fill="white"
                        style={{ fontSize: 7.5, fontWeight: 700, fontFamily: 'system-ui' }}
                      >
                        회선 {cnt}
                      </text>
                    </g>
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
            const code = formatFacilityCode(f.closure_type, f.seq_no)
            const isNew = facilityIsNew.get(f.id) ?? false
            const isSelected = selectedId === f.id
            const cableCount = facilityCableCount.get(f.id) ?? 0
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

                <FacilityShape closureType={f.closure_type} isNew={isNew} />

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
                      style={{ fontSize: 9, fontFamily: 'system-ui', fontWeight: 700 }}
                    >
                      {cableCount}
                    </text>
                  </g>
                )}

                <text x={NODE_SIZE.width / 2} y={NODE_SIZE.height - 20} textAnchor="middle" className="fill-slate-700" style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 700 }}>
                  {code}
                </text>
                <text x={NODE_SIZE.width / 2} y={NODE_SIZE.height - 8} textAnchor="middle" className="fill-slate-900" style={{ fontSize: 10, fontFamily: 'system-ui' }}>
                  {f.name.length > 12 ? f.name.slice(0, 11) + '…' : f.name}
                </text>
              </g>
            )
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
                    style={{ fontSize: 10, fontWeight: 700, fontFamily: 'system-ui' }}
                  >
                    고장점
                  </text>
                </g>
              )
            })()}
          </svg>
        </div>

        {/* 케이블 정보 패널 — 케이블 선택 시 우측 컬럼. 정보 수정·경로점 거리·삭제 */}
        {!faultSearchOpen &&
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
                waypoints={wps}
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
        {!faultSearchOpen &&
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
                  closure_spec: f.closure_spec,
                  install_address: f.install_address,
                  notes: f.notes,
                }}
                cableCount={facilityCableCount.get(f.id) ?? 0}
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
        {faultSearchOpen && (
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
      </div>

      {pendingConnection && fromFacility && toFacility && (
        <ConnectionModal
          projectId={projectId}
          from={fromFacility}
          to={toFacility}
          defaultSpec={cableTool}
          onClose={() => setPendingConnection(null)}
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
  const [submitting, setSubmitting] = useState(false)

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
function FacilityShape({
  closureType,
  isNew,
}: {
  closureType: ClosureType
  isNew: boolean
}) {
  const cx = NODE_SIZE.width / 2
  const cy = NODE_SIZE.height / 2 - 10
  const isFallback = isNew ? NEW_COLOR : EXISTING_COLOR
  const stdColor = CLOSURE_TYPE_COLOR[closureType] ?? isFallback

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
        <text x={cx} y={cy + 3} textAnchor="middle" fill={isFallback} style={{ fontSize: 8, fontFamily: 'system-ui', fontWeight: 600 }}>
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
    // 기존 — 원 + X (검정)
    const r = 14
    return (
      <g>
        <circle cx={cx} cy={cy} r={r} fill="white" stroke={isFallback} strokeWidth={1.8} />
        <line x1={cx - r * 0.7} y1={cy - r * 0.7} x2={cx + r * 0.7} y2={cy + r * 0.7} stroke={isFallback} strokeWidth={1.5} />
        <line x1={cx - r * 0.7} y1={cy + r * 0.7} x2={cx + r * 0.7} y2={cy - r * 0.7} stroke={isFallback} strokeWidth={1.5} />
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

  // ===== 안전망 — 미매칭 시 기본 박스 =======================================
  const w = 32
  const h = 16
  return (
    <g>
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} fill="white" stroke={isFallback} strokeWidth={1.4} />
      <text x={cx} y={cy + 3} textAnchor="middle" fill={isFallback} style={{ fontSize: 7, fontFamily: 'system-ui', fontWeight: 600 }}>
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
        style={{ fontSize: text.length > 1 ? 10 : 12, fontFamily: 'system-ui', fontWeight: 700 }}
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
        style={{ fontSize: 9, fontFamily: 'system-ui', fontWeight: 700 }}
      >
        {text}
      </text>
    </g>
  )
}


function ConnectionModal({
  projectId,
  from,
  to,
  defaultSpec,
  onClose,
}: {
  projectId: string
  from: FacilityNode
  to: FacilityNode
  defaultSpec: CableSpec | null
  onClose: () => void
}) {
  const fromLabel = `${formatFacilityCode(from.closure_type, from.seq_no)} ${from.name}`
  const toLabel = `${formatFacilityCode(to.closure_type, to.seq_no)} ${to.name}`

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

        <form action={createCable} className="space-y-3">
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="from_facility_id" value={from.id} />
          <input type="hidden" name="to_facility_id" value={to.id} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                규격 <span className="text-rose-600">*</span>
              </label>
              <select
                name="spec"
                required
                defaultValue={defaultSpec ?? '144C'}
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
                name="status"
                defaultValue="new"
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
              name="cable_code"
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
              name="installation_type"
              defaultValue=""
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
            <label className="block text-xs font-medium text-slate-700">비고</label>
            <input
              type="text"
              name="notes"
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
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              케이블 생성
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


// 기존 `Legend()` 컴포넌트는 LegendPanel.tsx 로 이동·확장됨.
// 「표준 범례」 버튼 클릭 시 LGU+ 표준 범례 (29 시설 + 광망) 모달 노출.
