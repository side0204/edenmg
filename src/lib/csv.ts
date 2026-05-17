// CSV 빌더 — UTF-8 BOM + CRLF + RFC 4180 escape.
// Excel(특히 한글 Windows) 호환을 최우선으로 함.

const BOM = '﻿'

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (s === '') return ''
  // 쉼표·큰따옴표·줄바꿈 중 하나라도 있으면 큰따옴표로 감싸고 내부 " 는 "" 로 escape
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function buildCsv(headers: string[], rows: unknown[][]): string {
  const lines: string[] = []
  lines.push(headers.map(escapeCell).join(','))
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(','))
  }
  return BOM + lines.join('\r\n') + '\r\n'
}

// 다운로드 응답 헬퍼 — Content-Disposition 의 파일명을 RFC 5987 로 둘 다 박는다
// (구버전 IE 가 아니더라도 안전).
export function csvResponse(body: string, filename: string): Response {
  const encoded = encodeURIComponent(filename)
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encoded}`,
      'Cache-Control': 'no-store',
    },
  })
}

// "YYYY-MM" → { startISO, endISOExclusive } (Asia/Seoul 자정 기준 UTC ISO)
// timestamptz 범위 쿼리에 그대로 쓸 수 있는 값을 돌려준다.
//   start: 해당 월 1일 00:00 KST
//   end  : 다음 달 1일 00:00 KST (exclusive)
export function monthRangeKST(month: string): { startISO: string; endISOExclusive: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  if (!m) return null
  const year = Number(m[1])
  const mon = Number(m[2])
  if (mon < 1 || mon > 12) return null
  // KST 자정 = UTC 15:00 전일.
  const startUtc = new Date(Date.UTC(year, mon - 1, 1, -9, 0, 0))
  const endUtc = new Date(Date.UTC(year, mon, 1, -9, 0, 0))
  return { startISO: startUtc.toISOString(), endISOExclusive: endUtc.toISOString() }
}

// KST 'YYYY-MM-DD' 문자열
export function dateKST(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(iso))
}

// KST 'YYYY-MM-DD HH:mm' 문자열 (CSV 표시용)
export function dateTimeKST(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d)
  const time = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
  return `${date} ${time}`
}

// 두 ISO 사이 분 차이 (퇴근 - 출근). 음수/누락은 빈 문자열.
export function durationMinutes(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return ''
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const mins = Math.round(ms / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}:${String(m).padStart(2, '0')}`
}
