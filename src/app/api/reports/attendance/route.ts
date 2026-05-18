import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  buildCsv,
  csvResponse,
  dateTimeKST,
  durationMinutes,
  monthRangeKST,
} from '@/lib/csv'

// GET /api/reports/attendance?month=YYYY-MM
// 권한:
//   - admin / ceo : 같은 회사 전체
//   - foreman     : 본인이 관리하는 현장(sites.manager_employee_id) 의 출퇴근만
//   - worker      : 403
export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get('month') ?? ''
  const range = monthRangeKST(month)
  if (!range) {
    return new Response('월 형식이 올바르지 않습니다 (YYYY-MM)', { status: 400 })
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, permission, company_id, companies(name)')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | {
        id: string
        permission: 'worker' | 'team_member' | 'team_leader' | 'admin'
        company_id: string
        companies: { name: string } | null
      }
    | null
  if (!me) return new Response('Forbidden', { status: 403 })
  if (me.permission === 'worker') return new Response('Forbidden', { status: 403 })

  // 근태 본문 쿼리. work_date 는 date 컬럼이라 KST 자정 경계와 정확히 맞춤.
  // 월 시작·종료를 KST 'YYYY-MM-DD' 로 변환해 date 비교에 쓴다.
  const m = /^(\d{4})-(\d{2})$/.exec(month)!
  const year = Number(m[1])
  const mon = Number(m[2])
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate()
  const startDate = `${m[1]}-${m[2]}-01`
  const endDate = `${m[1]}-${m[2]}-${String(lastDay).padStart(2, '0')}`

  let query = supabase
    .from('attendances')
    .select(
      `
        id, work_date, site_id,
        check_in_at, check_in_lat, check_in_lng, check_in_outside_reason,
        check_out_at, check_out_lat, check_out_lng, check_out_outside_reason,
        employees:employee_id ( id, name, permission, position, team, work_type ),
        sites:site_id ( id, name )
      `,
    )
    .eq('company_id', me.company_id)
    .gte('work_date', startDate)
    .lte('work_date', endDate)
    .order('work_date', { ascending: true })

  if (me.permission === 'team_leader') {
    // 본인 관리 현장만. 매니저인 sites.id 를 먼저 조회.
    const { data: mySites } = await supabase
      .from('sites')
      .select('id')
      .eq('company_id', me.company_id)
      .eq('manager_employee_id', me.id)
    const ids = (mySites as { id: string }[] | null)?.map((s) => s.id) ?? []
    if (ids.length === 0) {
      // 관리 현장이 없으면 헤더만 있는 빈 CSV.
      const empty = buildCsv(ATTENDANCE_HEADERS, [])
      return csvResponse(empty, `attendance_${month}.csv`)
    }
    query = query.in('site_id', ids)
  }

  const { data, error } = await query
  if (error) return new Response(`조회 실패: ${error.message}`, { status: 500 })

  type Row = {
    work_date: string
    check_in_at: string | null
    check_in_lat: number | null
    check_in_lng: number | null
    check_in_outside_reason: string | null
    check_out_at: string | null
    check_out_lat: number | null
    check_out_lng: number | null
    check_out_outside_reason: string | null
    employees: {
      name: string | null
      permission: string | null
      position: string | null
      team: string | null
      work_type: string | null
    } | null
    sites: { name: string | null } | null
  }
  const rows = (data ?? []) as unknown as Row[]

  const csvRows = rows.map((r) => [
    r.work_date,
    r.employees?.name ?? '',
    PERMISSION_LABEL[r.employees?.permission as keyof typeof PERMISSION_LABEL] ?? '',
    r.employees?.position ?? '',
    r.employees?.team ?? '',
    r.employees?.work_type ?? '',
    r.sites?.name ?? '',
    dateTimeKST(r.check_in_at),
    formatCoord(r.check_in_lat, r.check_in_lng),
    r.check_in_outside_reason ?? '',
    dateTimeKST(r.check_out_at),
    formatCoord(r.check_out_lat, r.check_out_lng),
    r.check_out_outside_reason ?? '',
    durationMinutes(r.check_in_at, r.check_out_at),
  ])

  return csvResponse(buildCsv(ATTENDANCE_HEADERS, csvRows), `attendance_${month}.csv`)
}

const ATTENDANCE_HEADERS = [
  '일자',
  '직원명',
  '권한',
  '직급',
  '팀',
  '분야',
  '현장명',
  '출근시각',
  '출근위치',
  '출근반경밖사유',
  '퇴근시각',
  '퇴근위치',
  '퇴근반경밖사유',
  '근무시간',
]

const PERMISSION_LABEL = {
  worker: '작업자',
  team_leader: '팀장',
  team_member: '팀원',
  admin: '관리자',
} as const

function formatCoord(lat: number | null, lng: number | null): string {
  if (lat === null || lng === null) return ''
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
}
