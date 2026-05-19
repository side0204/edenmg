import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildCsv, csvResponse } from '@/lib/csv'
import { calcLeaveUsage } from '@/lib/annual-leave'
import { LEAVE_TYPE_LABEL, type LeaveType, type LeaveStatus } from '@/lib/leave'

// 연차 사용 이력 CSV — 관리자 전용.
// query: month=YYYY-MM (필수). status 가 '승인' 인 row 만 (실제 차감된 건만)
//        + 차감 대상 종류 (연차·반차·반반차) 만
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, permission')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; company_id: string; permission: string } | null
  if (!me || me.permission !== 'admin') {
    return new Response('Forbidden', { status: 403 })
  }

  const url = new URL(req.url)
  const month = url.searchParams.get('month') ?? ''
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  if (!m) {
    return new Response('Invalid month (YYYY-MM)', { status: 400 })
  }
  const y = Number(m[1])
  const mm = Number(m[2])
  if (mm < 1 || mm > 12) {
    return new Response('Invalid month (YYYY-MM)', { status: 400 })
  }
  const monthStart = `${y}-${String(mm).padStart(2, '0')}-01`
  const nextYear = mm === 12 ? y + 1 : y
  const nextMon = mm === 12 ? 1 : mm + 1
  const monthEndExcl = `${nextYear}-${String(nextMon).padStart(2, '0')}-01`

  // 시작일이 해당 월에 속하는 신청 + 승인됨 + 회사 스코프
  const { data: lrData } = await supabase
    .from('leave_requests')
    .select(
      'id, employee_id, type, start_date, end_date, start_time, end_time, status, final_actor_id, final_acted_at, created_at',
    )
    .eq('company_id', me.company_id)
    .eq('status', '승인')
    .gte('start_date', monthStart)
    .lt('start_date', monthEndExcl)
    .order('start_date', { ascending: true })

  type LR = {
    id: string
    employee_id: string
    type: LeaveType
    start_date: string
    end_date: string
    start_time: string | null
    end_time: string | null
    status: LeaveStatus
    final_actor_id: string | null
    final_acted_at: string | null
    created_at: string
  }
  const leaves = (lrData ?? []) as LR[]

  // 차감 대상만
  const filtered = leaves.filter((l) => calcLeaveUsage(l.type, l.start_date, l.end_date) > 0)

  // 직원·처리자 이름 매핑
  const ids = Array.from(
    new Set([
      ...filtered.map((l) => l.employee_id),
      ...filtered.map((l) => l.final_actor_id).filter((v): v is string => !!v),
    ]),
  )
  const nameById = new Map<string, string>()
  const metaById = new Map<
    string,
    { position: string | null; team: string | null; work_type: string | null }
  >()
  if (ids.length > 0) {
    const { data: emps } = await supabase
      .from('employees')
      .select('id, name, position, team, work_type')
      .in('id', ids)
    for (const e of (emps ?? []) as {
      id: string
      name: string
      position: string | null
      team: string | null
      work_type: string | null
    }[]) {
      nameById.set(e.id, e.name)
      metaById.set(e.id, { position: e.position, team: e.team, work_type: e.work_type })
    }
  }

  const headers = [
    '신청자',
    '직급',
    '팀',
    '직무',
    '종류',
    '시작일',
    '종료일',
    '차감일수',
    '처리자',
    '처리시각',
  ]
  const rows: unknown[][] = filtered.map((l) => {
    const meta = metaById.get(l.employee_id)
    return [
      nameById.get(l.employee_id) ?? '?',
      meta?.position ?? '',
      meta?.team ?? '',
      meta?.work_type ?? '',
      LEAVE_TYPE_LABEL[l.type],
      l.start_date,
      l.end_date,
      calcLeaveUsage(l.type, l.start_date, l.end_date),
      l.final_actor_id ? nameById.get(l.final_actor_id) ?? '' : '',
      l.final_acted_at ?? '',
    ]
  })

  const csv = buildCsv(headers, rows)
  return csvResponse(csv, `연차사용_${month}.csv`)
}
