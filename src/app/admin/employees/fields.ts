// employees 의 인라인 편집 가능 필드 정의 — 서버 액션과 클라이언트 컴포넌트가 공유.

export type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

export const PERMISSION_VALUES: readonly Permission[] = [
  'worker',
  'team_member',
  'team_leader',
  'admin',
]
export const POSITION_VALUES = ['이사', '부장', '차장', '과장', '대리', '주임', '사원'] as const
export const TEAM_VALUES = ['지장', '계획', '공가', '청약', '정산', '자재', '지원'] as const
// 0027 마이그에서 enum rename: 공무→사무, 외선→외선팀, 접속→접속팀.
// 신규 추가: 자재담당, 장비팀, 신호수.
export const WORK_TYPE_VALUES = [
  '사무',
  '자재담당',
  '외선팀',
  '접속팀',
  '장비팀',
  '신호수',
] as const

// 차량번호 필수 여부 — 접속팀 필수, 외선팀 선택, 그 외 미사용
export const VEHICLE_PLATE_REQUIRED_WORK_TYPES = new Set<string>(['접속팀'])
export const VEHICLE_PLATE_OPTIONAL_WORK_TYPES = new Set<string>(['외선팀'])

export const PERMISSION_LABEL: Record<Permission, string> = {
  worker: '작업자',
  team_member: '팀원',
  team_leader: '팀장',
  admin: '관리자',
}

export type EditableField = 'permission' | 'position' | 'team' | 'work_type'

export const FIELD_VALUES: Record<EditableField, readonly string[]> = {
  permission: PERMISSION_VALUES,
  position: POSITION_VALUES,
  team: TEAM_VALUES,
  work_type: WORK_TYPE_VALUES,
}

// 라벨 ↔ 값 매핑 (권한만 영문→한글 변환 필요. 나머지는 값=라벨).
export function labelFor(field: EditableField, value: string): string {
  if (field === 'permission') return PERMISSION_LABEL[value as Permission] ?? value
  return value
}
