import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildCsv, csvResponse, dateTimeKST, monthRangeKST } from '@/lib/csv'
import { LEAVE_TYPE_LABEL, type LeaveType } from '@/lib/leave'

// GET /api/reports/leaves?month=YYYY-MM
// 거름 기준: 신청 기간(start_date~end_date)이 해당 월과 겹치는 행.
//   → 월 마감 시 그 달 발생 휴가/외근을 모두 잡아내기 위함.
// 권한:
//   - admin / ceo : 같은 회사 전체
//   - foreman     : 본인이 assigned_foreman_id 인 신청만
//   - worker      : 403
export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get('month') ?? ''
  if (!monthRangeKST(month)) {
    return new Response('월 형식이 올바르지 않습니다 (YYYY-MM)', { status: 400 })
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, permission, company_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | {
        id: string
        permission: 'worker' | 'foreman' | 'admin' | 'ceo'
        company_id: string
      }
    | null
  if (!me) return new Response('Forbidden', { status: 403 })
  if (me.permission === 'worker') return new Response('Forbidden', { status: 403 })

  const m = /^(\d{4})-(\d{2})$/.exec(month)!
  const lastDay = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate()
  const startDate = `${m[1]}-${m[2]}-01`
  const endDate = `${m[1]}-${m[2]}-${String(lastDay).padStart(2, '0')}`

  let query = supabase
    .from('leave_requests')
    .select(
      `
        id, type, start_date, end_date, start_time, end_time,
        reason, is_urgent, status, pending_stage,
        final_actor_id, final_acted_at, created_at,
        employees:employee_id ( name, permission, position, team, work_type ),
        foreman:assigned_foreman_id ( name ),
        substitute:substitute_employee_id ( name )
      `,
    )
    .eq('company_id', me.company_id)
    .lte('start_date', endDate)
    .gte('end_date', startDate)
    .order('start_date', { ascending: true })

  if (me.permission === 'foreman') {
    query = query.eq('assigned_foreman_id', me.id)
  }

  const { data, error } = await query
  if (error) return new Response(`조회 실패: ${error.message}`, { status: 500 })

  // 최종 처리자 이름을 매핑하기 위해 final_actor_id 들을 모아 한 번에 조회.
  type Row = {
    type: LeaveType
    start_date: string
    end_date: string
    start_time: string | null
    end_time: string | null
    reason: string
    is_urgent: boolean
    status: string
    pending_stage: string | null
    final_actor_id: string | null
    final_acted_at: string | null
    created_at: string
    employees: {
      name: string | null
      permission: string | null
      position: string | null
      team: string | null
      work_type: string | null
    } | null
    foreman: { name: string | null } | null
    substitute: { name: string | null } | null
  }
  const rows = (data ?? []) as unknown as Row[]

  const actorIds = Array.from(
    new Set(rows.map((r) => r.final_actor_id).filter((v): v is string => !!v)),
  )
  const actorNameById = new Map<string, string>()
  if (actorIds.length > 0) {
    const { data: actors } = await supabase
      .from('employees')
      .select('id, name')
      .in('id', actorIds)
    for (const a of (actors as { id: string; name: string }[] | null) ?? []) {
      actorNameById.set(a.id, a.name)
    }
  }

  const csvRows = rows.map((r) => [
    dateTimeKST(r.created_at),
    r.employees?.name ?? '',
    PERMISSION_LABEL[r.employees?.permission as keyof typeof PERMISSION_LABEL] ?? '',
    r.employees?.position ?? '',
    r.employees?.team ?? '',
    r.employees?.work_type ?? '',
    LEAVE_TYPE_LABEL[r.type] ?? r.type,
    r.start_date,
    r.end_date,
    r.start_time ? r.start_time.slice(0, 5) : '',
    r.end_time ? r.end_time.slice(0, 5) : '',
    r.is_urgent ? '예' : '',
    r.foreman?.name ?? '',
    r.substitute?.name ?? '',
    r.status,
    r.reason,
    r.final_actor_id ? actorNameById.get(r.final_actor_id) ?? '' : '',
    dateTimeKST(r.final_acted_at),
  ])

  return csvResponse(buildCsv(LEAVE_HEADERS, csvRows), `leaves_${month}.csv`)
}

const LEAVE_HEADERS = [
  '신청일시',
  '직원명',
  '권한',
  '직급',
  '팀',
  '분야',
  '종류',
  '시작일',
  '종료일',
  '시작시각',
  '종료시각',
  '긴급',
  '1차결재자(소장)',
  '대무자',
  '상태',
  '사유',
  '최종처리자',
  '최종처리시각',
]

const PERMISSION_LABEL = {
  worker: '작업자',
  foreman: '소장',
  admin: '관리자',
  ceo: '대표',
} as const
