// 휴가/외근 신청 도메인 공유 상수·헬퍼. UI·서버 양쪽에서 import.

export type LeaveType =
  | '연차'
  | '반차_오전'
  | '반차_오후'
  | '반반차_오전'
  | '반반차_오후'
  | '병가'
  | '공가'
  | '외근'

export type LeaveStatus = '대기' | '승인' | '반려' | '취소'
// DB enum 값은 'foreman' 그대로 유지 (legacy — 의미는 '팀장 단계').
// UI 표시는 '팀장 단계' 로 표시. 마이그로 enum value rename 가능하지만 위험 회피.
export type LeaveStage = 'foreman' | 'admin'
export type LeaveAction = '신청' | '승인' | '반려' | '전결' | '취소'

export const LEAVE_TYPE_VALUES: readonly LeaveType[] = [
  '연차',
  '반차_오전',
  '반차_오후',
  '반반차_오전',
  '반반차_오후',
  '병가',
  '공가',
  '외근',
]

// UI 라벨 — DB 값에 underscore 가 들어가는 것만 사람 표기로 바꿔준다.
export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  '연차': '연차',
  '반차_오전': '반차 (오전)',
  '반차_오후': '반차 (오후)',
  '반반차_오전': '반반차 (오전)',
  '반반차_오후': '반반차 (오후)',
  '병가': '병가',
  '공가': '공가',
  '외근': '외근',
}

// 신청 종류별 특성. UI 의 폼 동작과 시간 단위 결정에 사용.
//   - multiDay : 종료일을 시작일보다 뒤로 둘 수 있는가 (연차만 true)
//   - needsTime: 시작·종료 시간을 함께 입력해야 하는가 (외근·반반차)
export const LEAVE_TYPE_META: Record<LeaveType, { multiDay: boolean; needsTime: boolean }> = {
  '연차':       { multiDay: true,  needsTime: false },
  '반차_오전':  { multiDay: false, needsTime: false },
  '반차_오후':  { multiDay: false, needsTime: false },
  '반반차_오전': { multiDay: false, needsTime: true  },
  '반반차_오후': { multiDay: false, needsTime: true  },
  '병가':       { multiDay: true,  needsTime: false },
  '공가':       { multiDay: true,  needsTime: false },
  '외근':       { multiDay: false, needsTime: true  },
}

// 첨부파일 가능 종류 — 폼/상세에서 분기.
export const ATTACHMENT_ALLOWED_TYPES: readonly LeaveType[] = ['병가', '공가']

export const STATUS_COLOR: Record<LeaveStatus, string> = {
  '대기': 'text-amber-700 bg-amber-50 border-amber-200',
  '승인': 'text-emerald-700 bg-emerald-50 border-emerald-200',
  '반려': 'text-red-700 bg-red-50 border-red-200',
  '취소': 'text-slate-500 bg-slate-100 border-slate-200',
}

export function formatPeriod(
  startDate: string,
  endDate: string,
  startTime: string | null,
  endTime: string | null,
): string {
  const sameDay = startDate === endDate
  const datePart = sameDay ? startDate : `${startDate} ~ ${endDate}`
  if (startTime && endTime) {
    return `${datePart} ${startTime.slice(0, 5)}~${endTime.slice(0, 5)}`
  }
  return datePart
}
