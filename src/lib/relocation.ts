// 지장이설 모듈 공통 유틸 — server/client 양쪽에서 사용.
//
// 사양: docs/RELOCATION_DESIGN_PLAN.md (v0.8)
//
// 케이블 규격은 connection.ts 의 CableSpec 재사용 (이미 enum 정의 됨).

import { CABLE_SPEC_VALUES, type CableSpec } from './connection'

// ===== enum 미러링 (DB 의 relocation_* enum 들) =======================

export type ClosureType =
  | '국사'
  | '맨홀'
  | '함체_가공형'
  | '함체_관로형'
  | '가입자시설'
  | 'MOFD'
  | 'OJC'
  | '국사내장비'

export const CLOSURE_TYPE_VALUES: readonly ClosureType[] = [
  '국사',
  '맨홀',
  '함체_가공형',
  '함체_관로형',
  '가입자시설',
  'MOFD',
  'OJC',
  '국사내장비',
]

export const CLOSURE_TYPE_LABEL: Record<ClosureType, string> = {
  국사: '국사',
  맨홀: '맨홀',
  함체_가공형: '함체(가공형)',
  함체_관로형: '함체(관로형)',
  가입자시설: '가입자시설',
  MOFD: 'MOFD',
  OJC: 'OJC',
  국사내장비: '국사내장비',
}

// 시설 번호 prefix (S/B/H/C/M/O/E)
export const CLOSURE_TYPE_PREFIX: Record<ClosureType, string> = {
  국사: 'S',
  함체_가공형: 'B',
  함체_관로형: 'B',
  맨홀: 'H',
  가입자시설: 'C',
  MOFD: 'M',
  OJC: 'O',
  국사내장비: 'E',
}

// 국사 내부 토폴로지 노드만 parent 를 가질 수 있음 (DB CHECK 와 일치)
export function isInternalNode(t: ClosureType): boolean {
  return t === 'MOFD' || t === 'OJC' || t === '국사내장비'
}

// 표시 번호 조립 (예: S-001)
export function formatFacilityCode(closureType: ClosureType, seqNo: number): string {
  const prefix = CLOSURE_TYPE_PREFIX[closureType]
  return `${prefix}-${String(seqNo).padStart(3, '0')}`
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
