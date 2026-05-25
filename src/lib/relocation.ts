// 지장이설 모듈 공통 유틸 — server/client 양쪽에서 사용.
//
// 사양: docs/RELOCATION_DESIGN_PLAN.md (v0.8)
//
// 케이블 규격은 connection.ts 의 CableSpec 재사용 (이미 enum 정의 됨).

import { CABLE_SPEC_VALUES, type CableSpec } from './connection'

// ===== enum 미러링 (DB 의 relocation_* enum 들) =======================

// LGU+ 표준 범례 (2026-05-20) 적용. 마이그 0041 로 enum 21 종 추가, 누적 29 종.
//   카테고리 5 그룹: 국사 / 설치장소 / 모바일국소 / 접속함체 / RN-IJP-광MUX
//   + 국사 내부 (MOFD·OJC·국사내장비) 는 「국사」 카테고리 안 sub 그룹

export type ClosureType =
  // 국사 (5 + 국사내부 3)
  | '국사'
  | '종합국사'
  | '집중국사'
  | '가입자국사'
  | '간이국사'
  | 'MOFD'
  | 'OJC'
  | '국사내장비'
  // 설치장소 (4)
  | '맨홀'
  | '가입자시설'
  | '창고'
  | '일반설치장소'
  // 접속함체 (5) — 설치방식 2 + 용도 3
  | '함체_가공형'
  | '함체_관로형'
  | '중간접속형'
  | '중간분기형'
  | 'SP내장형'
  // 모바일국소 (8)
  | '기지국'
  | '중계기'
  | '안테나'
  | 'ESS_LTE_DU'
  | 'ESS_LTE_RRH'
  | 'ESS_CDMA_기지국'
  | 'ESS_CDMA_광중계기'
  | 'ESS_RF중계기'
  // RN/IJP/광MUX (5)
  | 'RN_TPS'
  | 'RN_LTE'
  | 'TPS_LTE_외'
  | 'IJP'
  | '광Mux'
  // 실사정보 — 시설 인프라(드래그·정보 패널·실사 캡처 첨부)를 그대로 쓰는 가상 시설.
  //   사용자가 임의 위치에 마커처럼 배치하고 비고·실사 캡처를 첨부.
  | '실사정보'

export const CLOSURE_TYPE_VALUES: readonly ClosureType[] = [
  '국사', '종합국사', '집중국사', '가입자국사', '간이국사',
  'MOFD', 'OJC', '국사내장비',
  '맨홀', '가입자시설', '창고', '일반설치장소',
  '함체_가공형', '함체_관로형', '중간접속형', '중간분기형', 'SP내장형',
  '기지국', '중계기', '안테나',
  'ESS_LTE_DU', 'ESS_LTE_RRH',
  'ESS_CDMA_기지국', 'ESS_CDMA_광중계기', 'ESS_RF중계기',
  'RN_TPS', 'RN_LTE', 'TPS_LTE_외', 'IJP', '광Mux',
  '실사정보',
]

export const CLOSURE_TYPE_LABEL: Record<ClosureType, string> = {
  국사: '국사',
  종합국사: '종합국사',
  집중국사: '집중국사',
  가입자국사: '가입자국사',
  간이국사: '간이국사',
  MOFD: 'MOFD',
  OJC: 'OJC',
  국사내장비: '국사내장비',
  맨홀: '맨홀',
  가입자시설: '가입자시설',
  창고: '창고',
  일반설치장소: '일반설치장소',
  함체_가공형: '함체(가공형)',
  함체_관로형: '함체(관로형)',
  중간접속형: '중간접속형',
  중간분기형: '중간분기형',
  SP내장형: 'SP내장형',
  기지국: '기지국',
  중계기: '중계기 / 초소형 중계기',
  안테나: '안테나',
  ESS_LTE_DU: 'ESS_LTE_DU',
  ESS_LTE_RRH: 'ESS_LTE_RRH',
  ESS_CDMA_기지국: 'ESS_CDMA_기지국',
  ESS_CDMA_광중계기: 'ESS_CDMA_광중계기',
  ESS_RF중계기: 'ESS_RF중계기',
  RN_TPS: 'RN_TPS',
  RN_LTE: 'RN_LTE',
  TPS_LTE_외: 'TPS,LTE 외',
  IJP: 'IJP',
  광Mux: '광Mux',
  실사정보: '실사정보',
}

// 시설 번호 prefix — 카테고리·종류별로 1자.
//   기존(S/B/H/C/M/O/E) 호환 + 신규(W/P/T/N/J/X) 추가
export const CLOSURE_TYPE_PREFIX: Record<ClosureType, string> = {
  국사: 'S',
  종합국사: 'S',
  집중국사: 'S',
  가입자국사: 'S',
  간이국사: 'S',
  MOFD: 'M',
  OJC: 'O',
  국사내장비: 'E',
  맨홀: 'H',
  가입자시설: 'C',
  창고: 'W',
  일반설치장소: 'P',
  함체_가공형: 'B',
  함체_관로형: 'B',
  중간접속형: 'B',
  중간분기형: 'B',
  SP내장형: 'B',
  기지국: 'T',
  중계기: 'T',
  안테나: 'T',
  ESS_LTE_DU: 'T',
  ESS_LTE_RRH: 'T',
  ESS_CDMA_기지국: 'T',
  ESS_CDMA_광중계기: 'T',
  ESS_RF중계기: 'T',
  RN_TPS: 'N',
  RN_LTE: 'N',
  TPS_LTE_외: 'N',
  IJP: 'J',
  광Mux: 'X',
  실사정보: 'I', // I for Inspection
}

// 카테고리 — 범례 + 추가 도구 패널 그룹화에 사용
export type ClosureCategory =
  | '국사'
  | '설치장소'
  | '모바일국소'
  | '접속함체'
  | 'RN_IJP_광MUX'

export const CLOSURE_CATEGORY_LABEL: Record<ClosureCategory, string> = {
  국사: '국사',
  설치장소: '설치장소',
  모바일국소: '모바일국소',
  접속함체: '접속함체',
  RN_IJP_광MUX: 'RN / IJP / 광MUX',
}

export const CLOSURE_TYPE_CATEGORY: Record<ClosureType, ClosureCategory> = {
  국사: '국사',
  종합국사: '국사',
  집중국사: '국사',
  가입자국사: '국사',
  간이국사: '국사',
  MOFD: '국사',
  OJC: '국사',
  국사내장비: '국사',
  맨홀: '설치장소',
  가입자시설: '설치장소',
  창고: '설치장소',
  일반설치장소: '설치장소',
  함체_가공형: '접속함체',
  함체_관로형: '접속함체',
  중간접속형: '접속함체',
  중간분기형: '접속함체',
  SP내장형: '접속함체',
  기지국: '모바일국소',
  중계기: '모바일국소',
  안테나: '모바일국소',
  ESS_LTE_DU: '모바일국소',
  ESS_LTE_RRH: '모바일국소',
  ESS_CDMA_기지국: '모바일국소',
  ESS_CDMA_광중계기: '모바일국소',
  ESS_RF중계기: '모바일국소',
  RN_TPS: 'RN_IJP_광MUX',
  RN_LTE: 'RN_IJP_광MUX',
  TPS_LTE_외: 'RN_IJP_광MUX',
  IJP: 'RN_IJP_광MUX',
  광Mux: 'RN_IJP_광MUX',
  // 실사정보 — '설치장소' 카테고리에 매핑 (별도 카테고리 추가 회피, 작업량 ↓)
  실사정보: '설치장소',
}

// LGU+ 표준 색깔 (범례 이미지 기준 추정)
// SVG fill/stroke 직접 사용.
export const CLOSURE_TYPE_COLOR: Record<ClosureType, string> = {
  국사: '#111827',           // slate-900
  종합국사: '#2563eb',       // blue-600 (파랑 마름모)
  집중국사: '#f59e0b',       // amber-500 (주황 마름모)
  가입자국사: '#ea580c',     // orange-600 (진오렌지 마름모)
  간이국사: '#38bdf8',       // sky-400 (하늘 마름모)
  MOFD: '#111827',
  OJC: '#111827',
  국사내장비: '#111827',
  맨홀: '#111827',
  가입자시설: '#dc2626',     // red-600
  창고: '#16a34a',           // green-600 (초록 마름모)
  일반설치장소: '#2563eb',   // blue-600 (파란 삼각형)
  함체_가공형: '#111827',
  함체_관로형: '#111827',
  중간접속형: '#dc2626',     // 빨강 원+X
  중간분기형: '#ea580c',     // 주황 원+T
  SP내장형: '#dc2626',       // 빨강 보타이
  기지국: '#111827',
  중계기: '#111827',
  안테나: '#dc2626',         // H 빨강 원
  ESS_LTE_DU: '#0ea5e9',     // sky-500 (파랑)
  ESS_LTE_RRH: '#f59e0b',    // amber (주황 충)
  ESS_CDMA_기지국: '#0d9488',// teal (청록)
  ESS_CDMA_광중계기: '#94a3b8', // slate-400 (회색)
  ESS_RF중계기: '#16a34a',   // green-600 (초록 RF)
  RN_TPS: '#dc2626',         // 빨강 R
  RN_LTE: '#7c3aed',         // violet 보라 R
  TPS_LTE_외: '#16a34a',     // 초록 R
  IJP: '#eab308',            // yellow i
  광Mux: '#2563eb',          // 파랑 M
  실사정보: '#dc2626',       // 빨강 (눈에 잘 보이는 강조 — 노란마크처럼 펄스 후광)
}

// 국사 내부 토폴로지 노드만 parent 를 가질 수 있음 (DB CHECK 와 일치)
export function isInternalNode(t: ClosureType): boolean {
  return t === 'MOFD' || t === 'OJC' || t === '국사내장비'
}

// 카테고리별 시설 그룹핑 헬퍼
export function groupClosureTypesByCategory(): Record<ClosureCategory, ClosureType[]> {
  const grouped: Record<ClosureCategory, ClosureType[]> = {
    국사: [],
    설치장소: [],
    모바일국소: [],
    접속함체: [],
    RN_IJP_광MUX: [],
  }
  for (const t of CLOSURE_TYPE_VALUES) {
    grouped[CLOSURE_TYPE_CATEGORY[t]].push(t)
  }
  return grouped
}

// 표시 번호 조립 (예: S-001)
export function formatFacilityCode(closureType: ClosureType, seqNo: number): string {
  const prefix = CLOSURE_TYPE_PREFIX[closureType]
  return `${prefix}-${String(seqNo).padStart(3, '0')}`
}

// 시설 ID 필드 라벨 — 시설 종류(카테고리)에 따라 다르게 부른다.
//   국사·설치장소·IJP·광Mux → 설치장소ID / 모바일국소 → 모바일ID
//   접속함체 → 접속함체ID / RN(TPS·LTE·외) → RNID
export function facilityIdLabel(t: ClosureType): string {
  const cat = CLOSURE_TYPE_CATEGORY[t]
  if (cat === '접속함체') return '접속함체ID'
  if (cat === '모바일국소') return '모바일ID'
  if (t === 'RN_TPS' || t === 'RN_LTE' || t === 'TPS_LTE_외') return 'RNID'
  return '설치장소ID'
}


// 두 GPS 좌표 사이 거리(m) — Haversine.
//   지도에서 케이블을 추가할 때 두 시설 좌표로 전체거리 기본값을 채우는 데 쓴다.
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000 // 지구 반지름(m)
  const toRad = (d: number): number => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}


// ===== 설치 순번 배지 ===================================================
// 시설명 앞에 붙는 숫자 배지 — 접속함체·RN·IJP 의 설치(작업) 순서.

// 설치 순번 배지 대상 시설 — 모든 시설 종류 (owner 결정 2026-05-23).
//   원래 접속함체·RN·IJP 한정이었으나 국사·설치장소 등 전 시설로 확대.
//   단 '실사정보' 시설은 실사 캡처 첨부 전용 마커라 작업 순번 무관 — 제외.
export function isInstallNumbered(closureType?: ClosureType): boolean {
  if (closureType === '실사정보') return false
  return true
}

// 설치 구분(기설/신설) 을 갖는 시설 — 접속함체 + RN/IJP.
//   국사·맨홀·가입자시설 등은 기설/신설 구분이 의미 없어 미표시. 광Mux 제외.
export function hasInstallStatus(t: ClosureType): boolean {
  const cat = CLOSURE_TYPE_CATEGORY[t]
  return cat === '접속함체' || (cat === 'RN_IJP_광MUX' && t !== '광Mux')
}

/**
 * 설치 순번 배지 번호 산출.
 *   입력: 배지 대상(eligible)으로 이미 걸러진 시설 목록.
 *   - install_order(설계자 수동 지정)가 있으면 그 번호를 우선 적용.
 *   - 같은 번호가 둘이면 먼저 만난 쪽만 차지하고 나머지는 자동 배정으로 밀림 (방어).
 *   - 수동 지정 안 된 시설은 created_at 순서로 빈 번호를 채워 배정.
 *   결과: 시설 id → 1 이상의 정수.
 */
export function computeInstallNumbers(
  facilities: {
    id: string
    install_order: number | null
    created_at: string | null
  }[],
): Map<string, number> {
  const result = new Map<string, number>()
  const used = new Set<number>()

  // 1) 설계자 수동 지정 — 그대로 적용
  for (const f of facilities) {
    if (f.install_order != null && f.install_order > 0 && !used.has(f.install_order)) {
      result.set(f.id, f.install_order)
      used.add(f.install_order)
    }
  }

  // 2) 수동 지정 안 된(또는 번호 충돌로 밀린) 시설 — created_at 순으로 빈 번호 채움
  const auto = facilities
    .filter((f) => !result.has(f.id))
    .slice()
    .sort((a, b) => {
      const ta = a.created_at ?? ''
      const tb = b.created_at ?? ''
      if (ta !== tb) return ta < tb ? -1 : 1
      return a.id < b.id ? -1 : 1
    })
  let next = 1
  for (const f of auto) {
    while (used.has(next)) next += 1
    result.set(f.id, next)
    used.add(next)
    next += 1
  }
  return result
}


// 신설 접속함체 — 접속함체 종류 + 설치구분이 신설.
export function isNewClosure(
  closure_type: ClosureType,
  install_status: string | null,
): boolean {
  return (
    CLOSURE_TYPE_CATEGORY[closure_type] === '접속함체' && install_status === 'new'
  )
}

/**
 * 절단 절체 — 기설 케이블이 신설 접속함체에 연결된 경우.
 *   기설 케이블이 깔린 자리에 새 함체를 끼우려면 그 케이블을 잘라(절단)
 *   양 끝을 새 함체로 인입·접속(절체)해야 한다.
 *   판정: 케이블 status='existing' 이고 한쪽 끝 시설이 신설 접속함체.
 *
 * 반환:
 *   - cables: 케이블 id → 어느 끝(from/to)이 신설 함체인지 (캔버스 ✂ 마크용)
 *   - facilityIds: 절단 절체 작업이 필요한 신설 함체 id 집합
 *   - cableCountByFacility: 신설 함체별 절단 대상 케이블 수
 */
export function findCutoverCables(
  cables: {
    id: string
    status: string
    from_facility_id: string
    to_facility_id: string
  }[],
  facilities: {
    id: string
    closure_type: ClosureType
    install_status: string | null
  }[],
): {
  cables: Map<string, { from: boolean; to: boolean }>
  facilityIds: Set<string>
  cableCountByFacility: Map<string, number>
} {
  const newClosureIds = new Set(
    facilities
      .filter((f) => isNewClosure(f.closure_type, f.install_status))
      .map((f) => f.id),
  )
  const cablesMap = new Map<string, { from: boolean; to: boolean }>()
  const facilityIds = new Set<string>()
  const cableCountByFacility = new Map<string, number>()
  for (const c of cables) {
    if (c.status !== 'existing') continue
    const fromNew = newClosureIds.has(c.from_facility_id)
    const toNew = newClosureIds.has(c.to_facility_id)
    if (!fromNew && !toNew) continue
    cablesMap.set(c.id, { from: fromNew, to: toNew })
    if (fromNew) {
      facilityIds.add(c.from_facility_id)
      cableCountByFacility.set(
        c.from_facility_id,
        (cableCountByFacility.get(c.from_facility_id) ?? 0) + 1,
      )
    }
    if (toNew) {
      facilityIds.add(c.to_facility_id)
      cableCountByFacility.set(
        c.to_facility_id,
        (cableCountByFacility.get(c.to_facility_id) ?? 0) + 1,
      )
    }
  }
  return { cables: cablesMap, facilityIds, cableCountByFacility }
}


export type CableStatus = 'existing' | 'relocating' | 'new' | 'removing'

export const CABLE_STATUS_VALUES: readonly CableStatus[] = [
  'existing',
  'relocating',
  'new',
  'removing',
]

export const CABLE_STATUS_LABEL: Record<CableStatus, string> = {
  existing: '기설',
  relocating: '기설 이설',
  new: '신설',
  removing: '철거',
}

export const CABLE_STATUS_COLOR: Record<CableStatus, string> = {
  existing: 'bg-slate-100 text-slate-700 border-slate-300',
  relocating: 'bg-amber-50 text-amber-700 border-amber-300',
  new: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  removing: 'bg-rose-50 text-rose-700 border-rose-300',
}


// 시설 설치 구분 — 접속함체의 기설/신설 (마이그 0050)
export type FacilityInstallStatus = 'existing' | 'new'

export const FACILITY_INSTALL_STATUS_VALUES: readonly FacilityInstallStatus[] = [
  'existing',
  'new',
]

export const FACILITY_INSTALL_STATUS_LABEL: Record<FacilityInstallStatus, string> = {
  existing: '기설',
  new: '신설',
}


export type CoreLifecycle = 'preexisting' | 'relocating' | 'new'

export const CORE_LIFECYCLE_VALUES: readonly CoreLifecycle[] = [
  'preexisting',
  'relocating',
  'new',
]

export const CORE_LIFECYCLE_LABEL: Record<CoreLifecycle, string> = {
  preexisting: '기설',
  relocating: '재배정',
  new: '신설',
}


export type CircuitKind = '1코어' | '2코어' | '이원화_1코어씩' | '이원화_2코어씩'

export const CIRCUIT_KIND_VALUES: readonly CircuitKind[] = [
  '1코어',
  '2코어',
  '이원화_1코어씩',
  '이원화_2코어씩',
]

export const CIRCUIT_KIND_LABEL: Record<CircuitKind, string> = {
  '1코어': '1코어',
  '2코어': '2코어',
  이원화_1코어씩: '이원화 (1코어씩)',
  이원화_2코어씩: '이원화 (2코어씩)',
}

export function isCircuitDiverse(k: CircuitKind): boolean {
  return k === '이원화_1코어씩' || k === '이원화_2코어씩'
}

// 회선 종류에서 다이버시티 분리 단위(코어 수)
export function circuitDiversityUnit(k: CircuitKind): number {
  if (k === '이원화_1코어씩') return 1
  if (k === '이원화_2코어씩') return 2
  return 0
}


export type CircuitStatus = 'OK' | 'ER' | '확인' | '해지'

export const CIRCUIT_STATUS_VALUES: readonly CircuitStatus[] = ['OK', 'ER', '확인', '해지']

export const CIRCUIT_STATUS_COLOR: Record<CircuitStatus, string> = {
  OK: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  ER: 'bg-rose-50 text-rose-700 border-rose-300',
  확인: 'bg-amber-50 text-amber-700 border-amber-300',
  해지: 'bg-slate-200 text-slate-500 border-slate-300',
}


export type SplitterType = '2:8' | '2:16' | '1:2:8:4' | '1:3:8:4'

export const SPLITTER_TYPE_VALUES: readonly SplitterType[] = [
  '2:8',
  '2:16',
  '1:2:8:4',
  '1:3:8:4',
]

// 출력 포트 수 추정 (2:8 → 8, 2:16 → 16, 1:2:8:4 → 미해결 § 9-1)
// owner 답 받으면 정정. 일단 마지막 숫자 기준 보수적 추정.
export function splitterOutputCount(t: SplitterType): number {
  if (t === '2:8') return 8
  if (t === '2:16') return 16
  // 1:2:8:4 → 마지막 4 가 최종 출력? 또는 2*8*4=64?
  // owner 답 받기 전까지 보수적으로 마지막 숫자 사용. UI 에 ⚠ 표시.
  if (t === '1:2:8:4') return 4
  if (t === '1:3:8:4') return 4
  return 0
}


export type SplitterWorkMode = '분기' | '내부접속만'

export const SPLITTER_WORK_MODE_VALUES: readonly SplitterWorkMode[] = ['분기', '내부접속만']


export type PhaseTaskKind = '함체신설_절단' | '기설접속' | '코어재배정' | '제거'

export const PHASE_TASK_KIND_VALUES: readonly PhaseTaskKind[] = [
  '함체신설_절단',
  '기설접속',
  '코어재배정',
  '제거',
]


export type PhaseStatus = '계획' | '확정' | '진행중' | '완료' | '취소'

export const PHASE_STATUS_VALUES: readonly PhaseStatus[] = [
  '계획',
  '확정',
  '진행중',
  '완료',
  '취소',
]

export const PHASE_STATUS_COLOR: Record<PhaseStatus, string> = {
  계획: 'bg-slate-100 text-slate-700 border-slate-300',
  확정: 'bg-blue-50 text-blue-700 border-blue-300',
  진행중: 'bg-amber-50 text-amber-700 border-amber-300',
  완료: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  취소: 'bg-rose-50 text-rose-700 border-rose-300',
}


// ===== LGU+ 광망 범례 — 케이블 표준 색깔·설치종류 ======================
// 사양서 § ?-? (owner 첨부 표준 범례, 2026-05-20)

// 규격별 색깔 — 광망 범례의 「규격별 COLOR」 5 구간 + 기타
//   1C~12C / 13C~36C / 37C~72C / 73C~144C / 145C~288C / 기타(576C 등)
export function cableSpecColor(spec: CableSpec): string {
  // 1C ~ 12C: 빨강
  if (spec === '1C' || spec === '1C(드랍)' || spec === '2C' || spec === '2C(드랍)' || spec === '12C') {
    return '#dc2626'
  }
  // 13C ~ 36C: 청록
  if (spec === '36C') return '#0d9488'
  // 37C ~ 72C: 초록
  if (spec === '72C') return '#16a34a'
  // 73C ~ 144C: 보라
  if (spec === '144C') return '#7c3aed'
  // 145C ~ 288C: 갈색
  if (spec === '288C') return '#92400e'
  // 기타 (576C 등)
  return '#111827'
}

// 설치종류 — 가공·구내·해저 = solid, 입상 = dotted, 지중 = dashed
export type CableInstallationType = '가공' | '구내' | '해저' | '입상' | '지중'

export const CABLE_INSTALLATION_TYPE_VALUES: readonly CableInstallationType[] = [
  '가공', '구내', '해저', '입상', '지중',
]

export function installationTypeDash(t: CableInstallationType | null | undefined): string {
  if (t === '입상') return '2 3'      // dotted
  if (t === '지중') return '8 4'      // dashed
  return 'none'                        // 가공·구내·해저·기본 = solid
}


// ===== 케이블 규격 메타 (유니트·여장판) ================================
// 사양서 § 2-3 (owner 답 2026-05-19)

export type CableSpecMeta = {
  cores: number          // 총 코어 수
  unitSize: number       // 유니트 크기 (코어/유니트)
  unitCount: number      // 유니트 수
  hasUnits: boolean      // 드랍·소심수는 false
}

export const CABLE_SPEC_META: Partial<Record<CableSpec, CableSpecMeta>> = {
  '12C': { cores: 12, unitSize: 12, unitCount: 1, hasUnits: true },
  '36C': { cores: 36, unitSize: 12, unitCount: 3, hasUnits: true },
  '72C': { cores: 72, unitSize: 12, unitCount: 6, hasUnits: true },
  '144C': { cores: 144, unitSize: 24, unitCount: 6, hasUnits: true },
  '288C': { cores: 288, unitSize: 48, unitCount: 6, hasUnits: true },
  // 576C, 드랍·1C·2C 는 메타 미정 (§ 9-2 미해결) — undefined 반환
}

// 코어 번호 → 유니트 번호 (1-based)
export function coreUnitIndex(spec: CableSpec, core: number): number | null {
  const meta = CABLE_SPEC_META[spec]
  if (!meta || !meta.hasUnits) return null
  if (core < 1 || core > meta.cores) return null
  return Math.floor((core - 1) / meta.unitSize) + 1
}

// 케이블 규격 → 코어 수. META 우선, 없으면 "1C(드랍)"/"576C" 같은 라벨에서 숫자 파싱.
//   1C·1C(드랍)·2C·2C(드랍) → 1·1·2·2 / 576C → 576
export function cableSpecCoreCount(spec: CableSpec): number {
  const meta = CABLE_SPEC_META[spec]
  if (meta) return meta.cores
  const m = /^(\d+)C/.exec(spec)
  return m ? Math.max(1, Number.parseInt(m[1], 10)) : 1
}


// ===== 함체 규격 메타 (수용 한도) =====================================
// 사양서 § 2-2

export type ClosureSpecMeta = {
  maxCables: number          // 한 함체 수용 케이블 조 수
  maxSpliceCores: number     // 한 함체 접속 가능 코어 총수
  trayCapacity: number       // 여장판 1매 수용 코어 수
}

// 함체로 쓰이는 cable_spec 만 메타 가짐
export const CLOSURE_SPEC_META: Partial<Record<CableSpec, ClosureSpecMeta>> = {
  '12C':  { maxCables: 6, maxSpliceCores: 48,  trayCapacity: 36 },
  '36C':  { maxCables: 6, maxSpliceCores: 48,  trayCapacity: 36 },
  '72C':  { maxCables: 6, maxSpliceCores: 144, trayCapacity: 36 },
  '144C': { maxCables: 8, maxSpliceCores: 288, trayCapacity: 48 },
  '288C': { maxCables: 8, maxSpliceCores: 576, trayCapacity: 72 },
}

// 케이블 규격 → 한 단계 위 함체 규격 (기본 추천)
export const CLOSURE_RECOMMENDED_FROM_CABLE: Partial<Record<CableSpec, CableSpec>> = {
  '1C': '12C',
  '1C(드랍)': '12C',
  '2C': '12C',
  '2C(드랍)': '12C',
  '12C': '36C',
  '36C': '72C',
  '72C': '144C',
  '144C': '288C',
  // 288C 의 1단계 위는 미해결 (§ 9-2 — owner 답 'b' = 실무상 거의 안 씀)
}


// ===== 작업시간 공식 (차수 자동 분할용) =================================
// 사양서 § 2-5

/**
 * 한 함체에서의 작업시간(분) 산출.
 *   - 함체 신설(절단) 시 +20분
 *   - 연속 코어: 3분/코어
 *   - 비연속 코어: 8분/코어
 *
 * 추가 facility_tasks 의 임의 공종은 별도 계산 (master.standard_minutes_per_unit × quantity).
 */
export type TaskTimeInput = {
  isNewClosure: boolean      // 함체 신설(절단) 여부
  coresContinuous: number    // 연속 코어 수
  coresNonContinuous: number // 비연속 코어 수
  extraMinutes?: number      // facility_tasks 합산 등 추가 시간 (선택)
}

export const TIME_PER_CONTINUOUS_CORE = 3
export const TIME_PER_NONCONTINUOUS_CORE = 8
export const TIME_NEW_CLOSURE = 20

export function estimateTaskMinutes(input: TaskTimeInput): number {
  return (
    (input.isNewClosure ? TIME_NEW_CLOSURE : 0) +
    input.coresContinuous * TIME_PER_CONTINUOUS_CORE +
    input.coresNonContinuous * TIME_PER_NONCONTINUOUS_CORE +
    (input.extraMinutes ?? 0)
  )
}


// ===== 차수 모델 상수 ==================================================

export const SHIFT_WINDOW_MINUTES = 180 // 02:00 ~ 05:00 = 180 분
export const TEAMS_DEFAULT = 2
export const TEAMS_COMPLEX = 3
export const TEAMS_MAX = 4

/**
 * 한 차수에 가용한 총 작업 분 (팀 수 × 180).
 */
export function phaseCapacityMinutes(teams: number): number {
  return Math.max(1, Math.min(teams, TEAMS_MAX)) * SHIFT_WINDOW_MINUTES
}


// ===== 신설 케이블 ID 생성 헬퍼 ========================================
// 형식: NEW-{프로젝트단축코드}-{6자리 순번}
//   - 프로젝트단축코드: project.id 의 앞 4자(영숫자 대문자)
//   - 순번: relocation_cable_seq.last_seq + 1

export function projectShortCode(projectId: string): string {
  return projectId.replace(/-/g, '').slice(0, 4).toUpperCase()
}

export function formatNewCableCode(projectId: string, seq: number): string {
  return `NEW-${projectShortCode(projectId)}-${String(seq).padStart(6, '0')}`
}


// ===== 케이블 규격 export 재노출 (편의) ================================

export { CABLE_SPEC_VALUES }
export type { CableSpec }


// ===== 공사 설계 — 프로젝트 카테고리 ===================================
// owner 2026-05-25: 「공사 설계」 진입 시 청약 / 계획 / 지장이설 3 카테고리로 분기.
//   카테고리 안에서 프로젝트를 생성·관리. URL 슬러그는 ASCII 사용.

export type RelocationCategory = '청약' | '계획' | '지장이설'
export type RelocationCategorySlug = 'subscription' | 'planning' | 'relocation'

export const RELOCATION_CATEGORY_VALUES: readonly RelocationCategory[] = [
  '청약',
  '계획',
  '지장이설',
]

export const RELOCATION_CATEGORY_SLUG: Record<RelocationCategory, RelocationCategorySlug> = {
  청약: 'subscription',
  계획: 'planning',
  지장이설: 'relocation',
}

export const RELOCATION_CATEGORY_FROM_SLUG: Record<RelocationCategorySlug, RelocationCategory> = {
  subscription: '청약',
  planning: '계획',
  relocation: '지장이설',
}

export const RELOCATION_CATEGORY_LABEL: Record<RelocationCategory, string> = {
  청약: '청약 설계',
  계획: '계획 설계',
  지장이설: '지장이설 설계',
}

export const RELOCATION_CATEGORY_DESCRIPTION: Record<RelocationCategory, string> = {
  청약: '소호·FTTH·모바일·전용회선·다회선·아파트 청약 공사 설계',
  계획: '망보강·코어분산·이원화 계획 공사 설계',
  지장이설: '도로공사 등 LGU+ 광케이블 지장이설 설계',
}

export function isRelocationCategorySlug(v: string): v is RelocationCategorySlug {
  return v === 'subscription' || v === 'planning' || v === 'relocation'
}

export function isRelocationCategory(v: string): v is RelocationCategory {
  return v === '청약' || v === '계획' || v === '지장이설'
}
