// CSV 파서 — RFC 4180 단순 케이스 + 콤마/세미콜론 자동 감지.
//
// 입력 예:
//   `name,spec,unit\n광케이블,12C,m\n"접속단자, 특수","",ea`
// 출력: rows[0] = ['name','spec','unit'], rows[1] = ['광케이블','12C','m'], ...
//
// 처리:
//   - 따옴표 안 콤마·줄바꿈 보존
//   - 두 따옴표 ("") 는 이스케이프
//   - UTF-8 BOM 제거
//   - CRLF / LF / CR 모두 행 구분자로 인정
//   - 마지막 줄 trailing newline 허용

export type CsvParseResult = {
  rows: string[][]
  delimiter: ',' | ';'
}

export function detectDelimiter(text: string): ',' | ';' {
  // 첫 줄의 콤마·세미콜론 카운트로 판단. 동률이면 콤마 우선.
  const firstLine = text.replace(/^﻿/, '').split(/\r\n|\n|\r/)[0] ?? ''
  let commas = 0
  let semis = 0
  let inQ = false
  for (const c of firstLine) {
    if (c === '"') inQ = !inQ
    else if (!inQ && c === ',') commas++
    else if (!inQ && c === ';') semis++
  }
  return semis > commas ? ';' : ','
}

export function parseCsv(text: string, delimiter?: ',' | ';'): CsvParseResult {
  const cleaned = text.replace(/^﻿/, '')
  const delim = delimiter ?? detectDelimiter(cleaned)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQ = false
  let i = 0
  const n = cleaned.length

  while (i < n) {
    const ch = cleaned[i]
    if (inQ) {
      if (ch === '"') {
        if (cleaned[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        inQ = false
        i++
        continue
      }
      cell += ch
      i++
      continue
    }
    // not in quotes
    if (ch === '"') {
      inQ = true
      i++
      continue
    }
    if (ch === delim) {
      row.push(cell)
      cell = ''
      i++
      continue
    }
    if (ch === '\r' || ch === '\n') {
      row.push(cell)
      cell = ''
      rows.push(row)
      row = []
      // CRLF 처리
      if (ch === '\r' && cleaned[i + 1] === '\n') i += 2
      else i++
      continue
    }
    cell += ch
    i++
  }
  // 마지막 셀
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  // 모두 빈 행 제거
  const trimmed = rows.filter((r) => r.some((c) => c.trim() !== ''))
  return { rows: trimmed, delimiter: delim }
}

// 헤더+데이터 매핑 — 헤더 행 첫 줄, 그 외 데이터.
// 헤더 이름 → 컬럼 인덱스 맵 반환. 누락된 헤더는 -1.
export function indexHeaders(header: string[], required: string[]): Record<string, number> {
  const map: Record<string, number> = {}
  const lower = header.map((h) => h.trim())
  for (const key of required) {
    const idx = lower.indexOf(key)
    map[key] = idx
  }
  return map
}

export function getCell(row: string[], idx: number): string {
  if (idx < 0 || idx >= row.length) return ''
  return (row[idx] ?? '').trim()
}
