// 사용법 시나리오 — 직무·권한별 미니 가이드 메타데이터.
// 본문(markdown)은 src/app/help/scenarios/[slug]/page.tsx 에서 직접 작성.
// 콘텐츠가 stale 됐는지 자동 점검할 수 있도록 routes·last_reviewed 를 박아둔다.
// 후속 단계에서 routes 의 git log 최근 수정일과 last_reviewed 를 비교해
// 「검토 필요」 amber 배지를 띄울 예정 (현재는 메타데이터만 박아두고 표시 X).

export type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'
export type WorkType = '사무' | '자재담당' | '외선팀' | '접속팀' | '장비팀' | '신호수'

export type Scenario = {
  slug: string
  title: string
  oneLiner: string
  // 시간 추정 (분) — "5~10분" 같은 범위로 표시
  estMinutesMin: number
  estMinutesMax: number
  // 「내게 해당」 배지 판정용. 빈 배열 = 모두 해당
  permissions: Permission[]
  workTypes: WorkType[]
  // 본문에서 다루는 라우트 — 「관련 메뉴」 표시 + 후속 stale 자동 점검에 사용
  routes: string[]
  // 본문을 마지막으로 점검한 날짜 (YYYY-MM-DD). 콘텐츠 갱신 시 같이 올린다.
  lastReviewed: string
}

export const SCENARIOS: Scenario[] = [
  {
    slug: 'attendance',
    title: '출퇴근 — GPS 인증과 반경 밖 사유',
    oneLiner: '현장 도착·복귀 시 위치 인증으로 1초 만에 출퇴근 기록.',
    estMinutesMin: 3,
    estMinutesMax: 5,
    permissions: [],
    workTypes: [],
    routes: ['/attendance'],
    lastReviewed: '2026-05-23',
  },
  {
    slug: 'leave-request',
    title: '휴가·외근 신청 — 대무자 지정과 결재 흐름',
    oneLiner: '연차·반차·병가·외근을 모바일에서 신청 + 결재 진행 상황 확인.',
    estMinutesMin: 5,
    estMinutesMax: 8,
    permissions: [],
    workTypes: [],
    routes: ['/requests', '/requests/new', '/my-leaves'],
    lastReviewed: '2026-05-23',
  },
  {
    slug: 'vehicle',
    title: '업무용 차량 출고·반납',
    oneLiner: '회사 차량을 1초 출고, 도착 후 km·주유 기록 후 반납.',
    estMinutesMin: 3,
    estMinutesMax: 5,
    permissions: [],
    workTypes: [],
    routes: ['/vehicles'],
    lastReviewed: '2026-05-23',
  },
  {
    slug: 'daily-report',
    title: '일반 일보 (외선팀·기타) — 작업 시작·마감과 일보 한 장',
    oneLiner: '오늘 작업 체크인 → 일보 작성 → 자재 사용까지 한 흐름.',
    estMinutesMin: 8,
    estMinutesMax: 12,
    permissions: [],
    workTypes: ['외선팀', '신호수', '장비팀'],
    routes: ['/works', '/'],
    lastReviewed: '2026-05-23',
  },
  {
    slug: 'connection-report',
    title: '접속일보 — 함체·코어·자재·사진까지',
    oneLiner: '접속팀 전용 — 작업구간·케이블·접속 코어 + EXIF 사진 첨부.',
    estMinutesMin: 10,
    estMinutesMax: 15,
    permissions: [],
    workTypes: ['접속팀'],
    routes: ['/works'],
    lastReviewed: '2026-05-23',
  },
  {
    slug: 'approval',
    title: '결재함 — 휴가·일보 처리 (팀장·관리자)',
    oneLiner: '본인 결재 단계 신청·일보를 모아 처리 + 긴급 전결 흐름.',
    estMinutesMin: 5,
    estMinutesMax: 8,
    permissions: ['team_leader', 'admin'],
    workTypes: [],
    routes: ['/approvals'],
    lastReviewed: '2026-05-23',
  },
  {
    slug: 'admin-onboarding',
    title: '직원 가입 승인 + 권한 부여 (관리자)',
    oneLiner: '신규 가입 신청 검토·승인 + 권한·토글 부여, 퇴사 처리까지.',
    estMinutesMin: 5,
    estMinutesMax: 10,
    permissions: ['admin'],
    workTypes: [],
    routes: ['/admin/employees'],
    lastReviewed: '2026-05-23',
  },
]

// 권한·직무가 「내게 해당」 인지 판정. 빈 배열은 「전 직원 대상」
export function matchesViewer(
  s: Scenario,
  permission: Permission,
  workType: WorkType | null,
): boolean {
  const permOk = s.permissions.length === 0 || s.permissions.includes(permission)
  const wtOk =
    s.workTypes.length === 0 || (workType !== null && s.workTypes.includes(workType))
  return permOk && wtOk
}

export function findScenario(slug: string): Scenario | null {
  return SCENARIOS.find((s) => s.slug === slug) ?? null
}

// 시나리오 목록 정렬 — 「내게 해당」 위, 나머지 아래. 그 안에서 원래 순서 유지.
export function sortScenariosForViewer(
  permission: Permission,
  workType: WorkType | null,
): Scenario[] {
  const mine: Scenario[] = []
  const others: Scenario[] = []
  for (const s of SCENARIOS) {
    if (matchesViewer(s, permission, workType)) mine.push(s)
    else others.push(s)
  }
  return [...mine, ...others]
}
