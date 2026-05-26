// 공사설계 시설물 일괄등록 — 텍스트 파서.
//
// 입력 형식 (한 박스에 섞어서, 줄 단위):
//   C, 함체규격, ID, 구분, 명칭                 — 접속함체 (5 필드)
//   L, 코어수, ID, 구분, from시설명, to시설명     — 케이블 (6 필드)
//
// 대소문자 구분 없음 (c, C, l, L 모두 가능).
// 빈 줄·주석(//, #) 무시.
// from/to 는 같은 일괄 입력 안 함체 명칭 또는 기존 시설 명칭으로 매칭.
// 매칭 실패 시 케이블은 미연결 목록(relocation_pending_cables)으로 보관.

import { CABLE_SPEC_VALUES, type CableSpec } from '@/lib/connection'

// 구분 약어 매핑 (사용자 입력 → 정식 enum 값)
//   접속함체: 가공/관로/중접/중간분기/SP
//   케이블 설치구분: 가공/구내/해저/입상/지중
export const CLOSURE_KIND_MAP: Record<string, string> = {
  가공: '함체_가공형',
  관로: '함체_관로형',
  중접: '중간접속형',
  중간접속: '중간접속형',
  중간분기: '중간분기형',
  분기: '중간분기형',
  sp: 'SP내장형',
  SP: 'SP내장형',
}

export const CABLE_INSTALLATION_TYPES = [
  '가공',
  '구내',
  '해저',
  '입상',
  '지중',
] as const

// 코어수 → CableSpec 매핑. "36" → "36C" 같은 단순 변환.
//   드랍 케이블(1C(드랍), 2C(드랍))은 사용자가 명시적으로 입력해야 함.
export function coreCountToCableSpec(input: string): CableSpec | null {
  const v = input.trim()
  if (CABLE_SPEC_VALUES.includes(v as CableSpec)) return v as CableSpec
  // 숫자만 입력 시 'NC' 형태로 매칭
  const n = parseInt(v, 10)
  if (!isFinite(n)) return null
  const candidate = `${n}C`
  if (CABLE_SPEC_VALUES.includes(candidate as CableSpec)) return candidate as CableSpec
  return null
}

export type ParsedClosure = {
  lineNo: number
  rawLine: string
  closure_spec: CableSpec | null
  facility_code: string | null
  closure_type: string
  name: string
}

export type ParsedCable = {
  lineNo: number
  rawLine: string
  spec: CableSpec
  cable_code: string | null
  installation_type: string | null
  from_name: string
  to_name: string
}

export type ParseError = {
  lineNo: number
  rawLine: string
  message: string
}

export type ParseResult = {
  closures: ParsedClosure[]
  cables: ParsedCable[]
  errors: ParseError[]
}

// CSV 한 줄 분리 (간단 — 콤마 split, trim).
function splitFields(line: string): string[] {
  return line.split(',').map((s) => s.trim())
}

export function parseBulkRegisterText(text: string): ParseResult {
  const result: ParseResult = {
    closures: [],
    cables: [],
    errors: [],
  }

  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1
    const raw = lines[i]
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('//') || line.startsWith('#')) continue

    const fields = splitFields(line)
    const type = fields[0]?.toUpperCase()
    if (type === 'C') {
      // C, 함체규격, ID, 구분, 명칭
      if (fields.length < 5) {
        result.errors.push({
          lineNo,
          rawLine: raw,
          message: '접속함체는 5개 필드 필요: C, 함체규격, ID, 구분, 명칭',
        })
        continue
      }
      // 함체규격 — 케이블의 코어수와 동일 매핑 (36 → 36C). 비어있어도 허용.
      const specRaw = fields[1]?.trim() ?? ''
      let closureSpec: CableSpec | null = null
      if (specRaw) {
        closureSpec = coreCountToCableSpec(specRaw)
        if (!closureSpec) {
          result.errors.push({
            lineNo,
            rawLine: raw,
            message: `함체규격을 인식할 수 없습니다: ${specRaw} (예: 12, 36, 72, 144, 288, 576)`,
          })
          continue
        }
      }
      const facilityCode = fields[2] || null
      const kindRaw = fields[3] ?? ''
      const closureType = CLOSURE_KIND_MAP[kindRaw] ?? CLOSURE_KIND_MAP[kindRaw.toLowerCase()]
      if (!closureType) {
        result.errors.push({
          lineNo,
          rawLine: raw,
          message: `함체 구분을 인식할 수 없습니다: ${kindRaw} (가공/관로/중접/중간분기/SP)`,
        })
        continue
      }
      const name = fields.slice(4).join(',').trim() // 명칭에 콤마 포함 가능
      if (!name) {
        result.errors.push({
          lineNo,
          rawLine: raw,
          message: '함체 명칭이 비어 있습니다',
        })
        continue
      }
      if (name.length > 200) {
        result.errors.push({
          lineNo,
          rawLine: raw,
          message: '명칭은 200자 이하',
        })
        continue
      }
      result.closures.push({
        lineNo,
        rawLine: raw,
        closure_spec: closureSpec,
        facility_code: facilityCode,
        closure_type: closureType,
        name,
      })
    } else if (type === 'L') {
      // L, 코어수, ID, 구분, from시설명, to시설명
      if (fields.length < 6) {
        result.errors.push({
          lineNo,
          rawLine: raw,
          message: '케이블은 6개 필드 필요: L, 코어수, ID, 구분, from, to',
        })
        continue
      }
      const spec = coreCountToCableSpec(fields[1] ?? '')
      if (!spec) {
        result.errors.push({
          lineNo,
          rawLine: raw,
          message: `케이블 코어수를 인식할 수 없습니다: ${fields[1]} (예: 1, 2, 12, 36, 72, 144, 288, 576)`,
        })
        continue
      }
      const cableCode = fields[2] || null
      const installRaw = fields[3] ?? ''
      const installationType =
        (CABLE_INSTALLATION_TYPES as readonly string[]).includes(installRaw)
          ? installRaw
          : null
      if (installRaw && !installationType) {
        result.errors.push({
          lineNo,
          rawLine: raw,
          message: `설치구분을 인식할 수 없습니다: ${installRaw} (가공/구내/해저/입상/지중)`,
        })
        continue
      }
      const fromName = fields[4]?.trim() ?? ''
      const toName = fields.slice(5).join(',').trim()
      if (!fromName || !toName) {
        result.errors.push({
          lineNo,
          rawLine: raw,
          message: 'from·to 시설 명칭이 필요합니다',
        })
        continue
      }
      result.cables.push({
        lineNo,
        rawLine: raw,
        spec,
        cable_code: cableCode,
        installation_type: installationType,
        from_name: fromName,
        to_name: toName,
      })
    } else {
      result.errors.push({
        lineNo,
        rawLine: raw,
        message: `첫 필드는 C(함체) 또는 L(케이블) — 인식 불가: ${fields[0]}`,
      })
    }
  }
  return result
}

// 시설 배치 좌표 계산 — 드래그된 bbox 안 N 개 시설을 가로/세로/그리드로 배치.
//   direction:
//     'horizontal' — 1행 N열
//     'vertical'   — N행 1열
//     'auto'       — bbox 종횡비로 자동 (가로가 더 넓으면 horizontal)
export function computeBulkPositions(input: {
  count: number
  bbox: { x: number; y: number; width: number; height: number }
  direction: 'horizontal' | 'vertical' | 'auto'
}): { x: number; y: number }[] {
  const { count, bbox } = input
  if (count <= 0) return []

  let dir = input.direction
  if (dir === 'auto') {
    dir = bbox.width >= bbox.height ? 'horizontal' : 'vertical'
  }

  const positions: { x: number; y: number }[] = []
  const cx = bbox.x + bbox.width / 2
  const cy = bbox.y + bbox.height / 2

  if (count === 1) {
    positions.push({ x: cx, y: cy })
    return positions
  }

  if (dir === 'horizontal') {
    const step = bbox.width / Math.max(1, count - 1)
    for (let i = 0; i < count; i++) {
      positions.push({ x: bbox.x + step * i, y: cy })
    }
  } else {
    const step = bbox.height / Math.max(1, count - 1)
    for (let i = 0; i < count; i++) {
      positions.push({ x: cx, y: bbox.y + step * i })
    }
  }

  return positions
}
