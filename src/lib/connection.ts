// 접속일보 공통 유틸 — server/client 양쪽에서 사용.
//
// 핵심: 사용선번 파서 + 중복 검증 + 코어수 계산.
//
// 입력 형식 (자유 텍스트, 한국 광케이블 현장 관습):
//   "1-6"           → [1,2,3,4,5,6]
//   "1,3,5"         → [1,3,5]
//   "1-6,12-18"     → [1..6, 12..18]
//   "1-6, 8"        → [1..6, 8]   (공백 허용)
//   "1-6, 3-8"      → 중복 detect → 에러
//   "8-3"           → 역순 → 에러
//   "0", "-1", "1.5", "abc" → 에러

export type WorkerType = '접속팀' | '외선팀' | '기타'

export type CableSpec =
  | '1C'
  | '1C(드랍)'
  | '2C'
  | '2C(드랍)'
  | '12C'
  | '36C'
  | '72C'
  | '144C'
  | '288C'
  | '576C'

export const CABLE_SPEC_VALUES: readonly CableSpec[] = [
  '1C',
  '1C(드랍)',
  '2C',
  '2C(드랍)',
  '12C',
  '36C',
  '72C',
  '144C',
  '288C',
  '576C',
]

export type PlanNodeType = 'upper_station' | 'box' | 'lower_station'

export const PLAN_NODE_TYPE_LABEL: Record<PlanNodeType, string> = {
  upper_station: '상위국',
  box: '함체',
  lower_station: '하위국',
}

export type ConnectionTaskType =
  | '접속(12C이하)'
  | '접속(12C초과)'
  | '성단접속'
  | '성단작업'
  | '함체작업(주간)'
  | '함체작업(야간)'
  | '중간분기함체(기설)'
  | '중간분기함체(신설)'
  | '단자함설치'
  | '국사패치'
  | 'IJP신설'
  | '고위험(함체)'
  | '신호수'
  | '기타'

export const CONNECTION_TASK_TYPE_VALUES: readonly ConnectionTaskType[] = [
  '접속(12C이하)',
  '접속(12C초과)',
  '성단접속',
  '성단작업',
  '함체작업(주간)',
  '함체작업(야간)',
  '중간분기함체(기설)',
  '중간분기함체(신설)',
  '단자함설치',
  '국사패치',
  'IJP신설',
  '고위험(함체)',
  '신호수',
  '기타',
]

export type WorkReportProgress = '시작전' | '진행중' | '완료'
export type WorkReportStatus = '대기' | '승인' | '반려'

// ===== 사용선번 파서 ==================================================

export type ParseResult =
  | { ok: true; numbers: number[]; coreCount: number }
  | { ok: false; error: string }

/**
 * 사용선번 자유 텍스트를 파싱.
 *
 * 받는 형식:
 *   - "1-6"             범위
 *   - "1,3,5"           개별 (콤마)
 *   - "1-6,12-18"       여러 범위
 *   - "1-6, 8"          공백 허용
 *
 * 반환: 성공 시 정렬된 선번 배열 + 코어수 (numbers.length).
 *       실패 시 사용자 친화적 한국어 에러 메시지.
 *
 * 검증:
 *   - 정수만 (소수·음수·0 거부)
 *   - 범위는 작은 수 ≤ 큰 수
 *   - 같은 입력 안에서 중복 detect
 */
export function parseLineNumbers(input: string): ParseResult {
  const trimmed = (input ?? '').trim()
  if (!trimmed) return { ok: false, error: '선번이 비어있습니다.' }

  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return { ok: false, error: '선번이 비어있습니다.' }

  const collected: number[] = []
  const seen = new Set<number>()

  for (const part of parts) {
    if (part.includes('-')) {
      const segs = part.split('-').map((s) => s.trim())
      if (segs.length !== 2 || !segs[0] || !segs[1]) {
        return { ok: false, error: `'${part}' 형식이 올바르지 않습니다 (예: 1-6).` }
      }
      const a = toInt(segs[0])
      const b = toInt(segs[1])
      if (a === null || b === null) {
        return { ok: false, error: `'${part}' 에 숫자가 아닌 값이 있습니다.` }
      }
      if (a <= 0 || b <= 0) {
        return { ok: false, error: `'${part}' — 선번은 1 이상이어야 합니다.` }
      }
      if (a > b) {
        return { ok: false, error: `'${part}' — 시작번호가 끝번호보다 큽니다.` }
      }
      for (let n = a; n <= b; n++) {
        if (seen.has(n)) {
          return { ok: false, error: `선번 ${n} 이 중복됩니다.` }
        }
        seen.add(n)
        collected.push(n)
      }
    } else {
      const n = toInt(part)
      if (n === null) {
        return { ok: false, error: `'${part}' 가 숫자가 아닙니다.` }
      }
      if (n <= 0) {
        return { ok: false, error: `선번 ${part} — 1 이상이어야 합니다.` }
      }
      if (seen.has(n)) {
        return { ok: false, error: `선번 ${n} 이 중복됩니다.` }
      }
      seen.add(n)
      collected.push(n)
    }
  }

  return { ok: true, numbers: collected.slice().sort((x, y) => x - y), coreCount: collected.length }
}

function toInt(s: string): number | null {
  if (!/^-?\d+$/.test(s)) return null
  const n = Number(s)
  if (!Number.isInteger(n)) return null
  return n
}

/**
 * 코어수만 빠르게 계산. 파싱 실패 시 null.
 * 컴포넌트에서 입력 옆에 "접속코어수: N" 표시할 때 사용.
 */
export function calcCoreCount(input: string): number | null {
  const r = parseLineNumbers(input)
  return r.ok ? r.coreCount : null
}

// ===== 색상 / 라벨 매핑 ===============================================

export const TASK_TYPE_COLOR: Record<ConnectionTaskType, string> = {
  '접속(12C이하)': 'text-emerald-700 bg-emerald-50 border-emerald-200',
  '접속(12C초과)': 'text-emerald-800 bg-emerald-100 border-emerald-300',
  '성단접속': 'text-blue-700 bg-blue-50 border-blue-200',
  '성단작업': 'text-blue-800 bg-blue-100 border-blue-300',
  '함체작업(주간)': 'text-amber-700 bg-amber-50 border-amber-200',
  '함체작업(야간)': 'text-violet-800 bg-violet-100 border-violet-300',
  '중간분기함체(기설)': 'text-slate-700 bg-slate-100 border-slate-200',
  '중간분기함체(신설)': 'text-slate-800 bg-slate-200 border-slate-300',
  '단자함설치': 'text-indigo-700 bg-indigo-50 border-indigo-200',
  '국사패치': 'text-cyan-700 bg-cyan-50 border-cyan-200',
  'IJP신설': 'text-fuchsia-700 bg-fuchsia-50 border-fuchsia-200',
  '고위험(함체)': 'text-rose-700 bg-rose-50 border-rose-200',
  '신호수': 'text-orange-700 bg-orange-50 border-orange-200',
  '기타': 'text-slate-600 bg-slate-100 border-slate-200',
}

export function formatTaskLabel(
  taskType: ConnectionTaskType,
  customName: string | null,
): string {
  if (taskType === '기타') return customName ? `기타 (${customName})` : '기타'
  return taskType
}

export function formatMaterialLabel(
  master: { name: string; spec: string | null; unit: string | null } | null,
  custom: { name: string | null; spec: string | null; unit: string | null },
): { name: string; spec: string | null; unit: string | null; isCustom: boolean } {
  if (master) {
    return { name: master.name, spec: master.spec, unit: master.unit, isCustom: false }
  }
  return { name: custom.name ?? '', spec: custom.spec, unit: custom.unit, isCustom: true }
}
