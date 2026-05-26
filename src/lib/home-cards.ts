// 홈 카드 개인화 — 사용자별 순서·표시 설정.
// employees.home_card_prefs jsonb 컬럼에 저장.
// 형식: { order: HomeCardId[], hidden: HomeCardId[] }

// 'relocation' 카드는 2026-05-25 BottomNav 「공사설계」 탭으로 이동 (홈 카드에서 제거).
//   기존 사용자 home_card_prefs 에 남아있어도 ALL_IDS 에 없으므로 resolve 시 자동 무시.
export type HomeCardId =
  | 'attendance'
  | 'today_works'
  | 'vehicles'
  | 'my_materials'
  | 'stock_approvals'
  | 'my_works'
  | 'schedule_changes'
  | 'approvals'
  | 'annual_leave'
  | 'leaves'
  | 'admin'
  | 'reports'

// 기본 순서 — prefs 가 비어있을 때 사용. 새 카드는 여기에만 추가하면 자동 폴백.
export const HOME_CARD_DEFAULT_ORDER: HomeCardId[] = [
  'attendance',
  'today_works',
  'vehicles',
  'my_materials',
  'stock_approvals',
  'my_works',
  'schedule_changes',
  'approvals',
  'annual_leave',
  'leaves',
  'admin',
  'reports',
]

export const HOME_CARD_LABEL: Record<HomeCardId, string> = {
  attendance: '오늘 근태',
  today_works: '오늘 작업',
  vehicles: '업무용 차량',
  my_materials: '내 자재',
  stock_approvals: '자재 사용 승인 대기',
  my_works: '내 작업 진행 목록',
  schedule_changes: '일정변경 요청 대기',
  approvals: '결재',
  annual_leave: '내 연차 잔여',
  leaves: '휴가·외근 현황',
  admin: '관리 메뉴',
  reports: '리포트',
}

export const HOME_CARD_DESCRIPTION: Record<HomeCardId, string> = {
  attendance: '출퇴근 / 오늘 근무 상태',
  today_works: '오늘 진행할 작업 시작·마감',
  vehicles: '업무용 차량 출고·반납 (본사 직원만 노출 대상)',
  my_materials: '보유 자재 (보유 시에만 자동 노출)',
  stock_approvals: '자재 사용 승인 대기 (자재담당자만 노출 대상)',
  my_works: '본인 배정된 작업 진행 목록',
  schedule_changes: '담당 작업의 일정변경 요청 대기 (요청 시에만 노출)',
  approvals: '내 신청 + 결재함 (본사 직원만 노출 대상)',
  annual_leave: '본인 연차 잔여·사용 (입사일 등록 시 노출)',
  leaves: '회사 직원 오늘 휴가·외근 현황',
  admin: '직원·현장·마스터·리포트 관리 (관리자만 노출 대상)',
  reports: '월별 리포트 (팀장 권한자 노출 대상)',
}

export type HomeCardPrefs = {
  order: HomeCardId[]
  hidden: HomeCardId[]
}

const ALL_IDS = new Set<HomeCardId>(HOME_CARD_DEFAULT_ORDER)

/**
 * employees.home_card_prefs jsonb 를 안전한 형태로 정규화.
 *   - 사용자 order 에서 알 수 없는 id 와 중복 제거
 *   - 사용자 order 에 빠진 새 카드(코드에 추가됐지만 사용자 prefs 에 없음)는
 *     기본 순서대로 뒤에 끼워 넣음 → forward-compatible
 *   - hidden 도 알 수 없는 id 와 중복 제거
 */
export function resolveHomeCardPrefs(raw: unknown): HomeCardPrefs {
  const r = (raw as { order?: unknown; hidden?: unknown } | null | undefined) ?? null

  const order: HomeCardId[] = []
  if (r && Array.isArray(r.order)) {
    for (const v of r.order) {
      if (typeof v === 'string' && ALL_IDS.has(v as HomeCardId) && !order.includes(v as HomeCardId)) {
        order.push(v as HomeCardId)
      }
    }
  }
  for (const id of HOME_CARD_DEFAULT_ORDER) {
    if (!order.includes(id)) order.push(id)
  }

  const hidden: HomeCardId[] = []
  if (r && Array.isArray(r.hidden)) {
    for (const v of r.hidden) {
      if (typeof v === 'string' && ALL_IDS.has(v as HomeCardId) && !hidden.includes(v as HomeCardId)) {
        hidden.push(v as HomeCardId)
      }
    }
  }

  return { order, hidden }
}

export function isCardVisible(prefs: HomeCardPrefs, id: HomeCardId): boolean {
  return !prefs.hidden.includes(id)
}

export function isValidHomeCardId(v: string): v is HomeCardId {
  return ALL_IDS.has(v as HomeCardId)
}
