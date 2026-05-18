import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildCsv, csvResponse, monthRangeKST } from '@/lib/csv'

/**
 * 일반 일보(외선·기타) CSV 출력 API.
 * — 접속일보(connection_reports)는 /api/reports/connection-reports 에서 별도 처리.
 *   이 엔드포인트는 work_daily_reports (외선팀·기타 분야) 전용.
 *
 * 파라미터:
 *   - month   : YYYY-MM (필수)
 *   - work_id : 선택
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const month = url.searchParams.get('month') ?? ''
  const workId = url.searchParams.get('work_id') ?? ''

  const range = monthRangeKST(month)
  if (!range) {
    return new Response('month 형식이 잘못되었습니다 (YYYY-MM)', { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('unauthorized', { status: 401 })

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, permission, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | {
        id: string
        company_id: string
        permission: 'worker' | 'team_member' | 'team_leader' | 'admin'
        is_active: boolean
      }
    | null
  if (!me || !me.is_active) return new Response('inactive', { status: 403 })

  const isAdmin = me.permission === 'admin'
  const isForeman = me.permission === 'team_leader'
  if (!isAdmin && !isForeman) {
    return new Response('forbidden', { status: 403 })
  }

  const startDate = monthFirstDay(month)
  const endDate = monthFirstDayNext(month)
  if (!startDate || !endDate) return new Response('month 파싱 실패', { status: 400 })

  let q = supabase
    .from('work_daily_reports')
    .select(
      `id, work_id, author_employee_id, report_date, content, materials_used, progress, notes,
       status, reviewed_by, reviewed_at, review_comment,
       works!inner ( id, name, company_id, assignee_employee_id, worker_type, worker_type_custom, order_id, category ),
       author:employees!work_daily_reports_author_employee_id_fkey ( id, name, permission, position, team, work_type )`,
    )
    .gte('report_date', startDate)
    .lt('report_date', endDate)
    .order('report_date', { ascending: true })

  if (workId) q = q.eq('work_id', workId)

  const { data: reportsData, error } = await q
  if (error) {
    return new Response('조회 실패: ' + error.message, { status: 500 })
  }

  type Row = {
    id: string
    work_id: string
    author_employee_id: string
    report_date: string
    content: string
    materials_used: string | null
    progress: string
    notes: string | null
    status: string
    reviewed_by: string | null
    reviewed_at: string | null
    review_comment: string | null
    works: {
      id: string
      name: string
      company_id: string
      assignee_employee_id: string | null
      worker_type: string | null
      worker_type_custom: string | null
      order_id: string | null
      category: string | null
    }
    author: {
      id: string
      name: string
      permission: string
      position: string | null
      team: string | null
      work_type: string | null
    } | null
  }

  let rows = (reportsData ?? []) as unknown as Row[]
  rows = rows.filter((r) => r.works?.company_id === me.company_id)
  // 접속팀 작업의 일보는 거의 없겠지만, 정의상 별도 entity 라 여기서는 제외
  rows = rows.filter((r) => (r.works?.worker_type ?? '') !== '접속팀')
  if (!isAdmin && isForeman) {
    rows = rows.filter((r) => r.works?.assignee_employee_id === me.id)
  }

  // 처리자 이름 매핑
  const reviewerIds = Array.from(
    new Set(rows.map((r) => r.reviewed_by).filter((x): x is string => !!x)),
  )
  const reviewerMap = new Map<string, string>()
  if (reviewerIds.length > 0) {
    const { data: revs } = await supabase
      .from('employees')
      .select('id, name')
      .in('id', reviewerIds)
    for (const r of (revs ?? []) as { id: string; name: string }[]) {
      reviewerMap.set(r.id, r.name)
    }
  }

  const csvRows = rows.map((r) => {
    const wt =
      r.works?.worker_type === '기타'
        ? `기타(${r.works?.worker_type_custom ?? ''})`
        : (r.works?.worker_type ?? '')
    return [
      r.report_date,
      r.author?.name ?? '',
      r.author?.permission ?? '',
      r.author?.position ?? '',
      r.author?.team ?? '',
      r.author?.work_type ?? '',
      r.works?.name ?? '',
      r.works?.order_id ?? '',
      r.works?.category ?? '',
      wt,
      r.content,
      r.materials_used ?? '',
      r.progress,
      r.status,
      r.reviewed_by ? (reviewerMap.get(r.reviewed_by) ?? '') : '',
      r.reviewed_at ?? '',
      r.review_comment ?? '',
      r.notes ?? '',
    ]
  })

  const header = [
    '일자',
    '작성자',
    '권한',
    '직급',
    '팀',
    '분야',
    '작업명',
    '공사번호',
    '카테고리',
    '작업자구분',
    '작업내역',
    '사용자재',
    '진행률',
    '상태',
    '처리자',
    '처리시각',
    '처리의견',
    '특이사항',
  ]
  return csvResponse(buildCsv(header, csvRows), `일반일보_${month}.csv`)
}

function monthFirstDay(month: string): string | null {
  return /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : null
}
function monthFirstDayNext(month: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  if (!m) return null
  const year = Number(m[1])
  const mon = Number(m[2])
  const nextYear = mon === 12 ? year + 1 : year
  const nextMon = mon === 12 ? 1 : mon + 1
  return `${nextYear}-${String(nextMon).padStart(2, '0')}-01`
}
