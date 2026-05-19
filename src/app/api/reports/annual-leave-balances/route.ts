import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildCsv, csvResponse } from '@/lib/csv'
import {
  calcRemaining,
  formatPeriodRange,
  periodLabel,
} from '@/lib/annual-leave'

// 회차별 잔여 CSV — 관리자 전용. 회사 내 모든 직원 × 모든 회차.
// 컬럼: 직원명·권한·직급·팀·직무·입사일·회차·회차기간·부여·사용·잔여
export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, permission')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; company_id: string; permission: string } | null
  if (!me || me.permission !== 'admin') {
    return new Response('Forbidden', { status: 403 })
  }

  // 회사 직원 + 회차 데이터 모두 fetch
  const { data: empData } = await supabase
    .from('employees')
    .select('id, name, permission, position, team, work_type, hire_date')
    .eq('company_id', me.company_id)
  type Emp = {
    id: string
    name: string
    permission: string
    position: string | null
    team: string | null
    work_type: string | null
    hire_date: string | null
  }
  const emps = (empData ?? []) as Emp[]
  const empMap = new Map(emps.map((e) => [e.id, e]))

  const { data: balData } = await supabase
    .from('annual_leave_balances')
    .select('employee_id, period_seq, period_start, period_end, granted, used')
    .eq('company_id', me.company_id)
    .order('employee_id')
    .order('period_seq', { ascending: false })
  type Bal = {
    employee_id: string
    period_seq: number
    period_start: string
    period_end: string
    granted: number
    used: number
  }
  const bals = (balData ?? []) as Bal[]

  const headers = [
    '직원명',
    '권한',
    '직급',
    '팀',
    '직무',
    '입사일',
    '회차',
    '회차 기간',
    '부여(일)',
    '사용(일)',
    '잔여(일)',
  ]
  const rows: unknown[][] = bals.map((b) => {
    const e = empMap.get(b.employee_id)
    return [
      e?.name ?? '?',
      e?.permission ?? '',
      e?.position ?? '',
      e?.team ?? '',
      e?.work_type ?? '',
      e?.hire_date ?? '',
      periodLabel(b.period_seq),
      formatPeriodRange(b.period_start, b.period_end),
      b.granted,
      b.used,
      calcRemaining(b.granted, b.used),
    ]
  })

  const csv = buildCsv(headers, rows)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
  return csvResponse(csv, `연차잔여_${today}.csv`)
}
