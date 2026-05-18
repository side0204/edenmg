import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  buildCsv,
  csvResponse,
  dateTimeKST,
  durationMinutes,
  monthRangeKST,
} from '@/lib/csv'

// GET /api/reports/vehicle-trips
//
// 쿼리:
//   mode=month  &  month=YYYY-MM
//   mode=range  &  start=YYYY-MM-DD  &  end=YYYY-MM-DD
//   vehicle_id=<uuid> (선택)
//   driver_id=<uuid>  (선택)
//   refueled=1        (선택, 주유한 운행만)
//
// 권한: 같은 회사 직원 누구나 (차량 모듈 정책 = 전원 공개).
// 기간 기준은 출고일시(departed_at) — 월/기간에 출고된 운행을 대상.
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const mode = sp.get('mode') === 'range' ? 'range' : 'month'

  // 기간 해석
  let startIso: string
  let endIsoExclusive: string
  let filenameStem: string

  if (mode === 'month') {
    const month = sp.get('month') ?? ''
    const range = monthRangeKST(month)
    if (!range) {
      return new Response('월 형식이 올바르지 않습니다 (YYYY-MM)', { status: 400 })
    }
    startIso = range.startISO
    endIsoExclusive = range.endISOExclusive
    filenameStem = month
  } else {
    const start = sp.get('start') ?? ''
    const end = sp.get('end') ?? ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return new Response('날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)', { status: 400 })
    }
    if (end < start) {
      return new Response('종료일은 시작일 이후여야 합니다', { status: 400 })
    }
    // KST 자정 = UTC 15:00 전일
    const [sy, sm, sd] = start.split('-').map(Number)
    const [ey, em, ed] = end.split('-').map(Number)
    startIso = new Date(Date.UTC(sy, sm - 1, sd, -9, 0, 0)).toISOString()
    endIsoExclusive = new Date(Date.UTC(ey, em - 1, ed + 1, -9, 0, 0)).toISOString()
    filenameStem = `${start}_${end}`
  }

  const vehicleId = sp.get('vehicle_id') ?? ''
  const driverId = sp.get('driver_id') ?? ''
  const refueledOnly = sp.get('refueled') === '1'

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; company_id: string } | null
  if (!me) return new Response('Forbidden', { status: 403 })

  let query = supabase
    .from('vehicle_trips')
    .select(
      `
        id, departed_at, returned_at,
        start_odometer_km, end_odometer_km,
        purpose, refueled, refuel_amount_krw,
        vehicles:vehicle_id ( plate_number, name ),
        employees:driver_employee_id ( name, permission, position, team, work_type )
      `,
    )
    .eq('company_id', me.company_id)
    .gte('departed_at', startIso)
    .lt('departed_at', endIsoExclusive)
    .order('departed_at', { ascending: true })

  if (vehicleId) query = query.eq('vehicle_id', vehicleId)
  if (driverId) query = query.eq('driver_employee_id', driverId)
  if (refueledOnly) query = query.eq('refueled', true)

  const { data, error } = await query
  if (error) return new Response(`조회 실패: ${error.message}`, { status: 500 })

  type Row = {
    departed_at: string
    returned_at: string | null
    start_odometer_km: number | null
    end_odometer_km: number | null
    purpose: string | null
    refueled: boolean
    refuel_amount_krw: number | null
    vehicles: { plate_number: string | null; name: string | null } | null
    employees: {
      name: string | null
      permission: string | null
      position: string | null
      team: string | null
      work_type: string | null
    } | null
  }
  const rows = (data ?? []) as unknown as Row[]

  const csvRows = rows.map((r) => {
    const distance =
      r.start_odometer_km !== null && r.end_odometer_km !== null
        ? r.end_odometer_km - r.start_odometer_km
        : ''
    return [
      dateTimeKST(r.departed_at),
      dateTimeKST(r.returned_at),
      durationMinutes(r.departed_at, r.returned_at),
      r.vehicles?.plate_number ?? '',
      r.vehicles?.name ?? '',
      r.employees?.name ?? '',
      PERMISSION_LABEL[r.employees?.permission as keyof typeof PERMISSION_LABEL] ?? '',
      r.employees?.position ?? '',
      r.employees?.team ?? '',
      r.employees?.work_type ?? '',
      r.start_odometer_km ?? '',
      r.end_odometer_km ?? '',
      distance,
      r.purpose ?? '',
      r.refueled ? 'O' : 'X',
      r.refueled && r.refuel_amount_krw !== null ? r.refuel_amount_krw : '',
    ]
  })

  return csvResponse(
    buildCsv(VEHICLE_TRIP_HEADERS, csvRows),
    `vehicle_trips_${filenameStem}.csv`,
  )
}

const VEHICLE_TRIP_HEADERS = [
  '출고일시',
  '반납일시',
  '운행시간',
  '차량번호',
  '차명',
  '운전자',
  '권한',
  '직급',
  '팀',
  '분야',
  '출발km',
  '도착km',
  '주행km',
  '목적',
  '주유',
  '주유금액',
]

const PERMISSION_LABEL = {
  worker: '작업자',
  team_leader: '팀장',
  team_member: '팀원',
  admin: '관리자',
} as const
