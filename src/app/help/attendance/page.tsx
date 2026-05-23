import { findScenario } from '@/lib/help-scenarios'
import {
  ScenarioFrame,
  Step,
  SectionTitle,
  Tip,
  Warning,
  FaqItem,
} from '../ScenarioFrame'

export default function Page() {
  const scenario = findScenario('attendance')!
  return (
    <ScenarioFrame scenario={scenario}>
      <SectionTitle>한 줄로</SectionTitle>
      <p>
        모바일 또는 PC 에서 「출근하기」 한 번 — 현재 위치로 가장 가까운 현장을 자동
        매칭합니다. 반경(기본 500m) 안이면 그대로, 밖이면 사유만 한 줄 적어주세요.
      </p>

      <SectionTitle>사전 준비</SectionTitle>
      <ul className="list-disc pl-5 space-y-1 text-slate-700">
        <li>회사 도메인으로 로그인된 상태</li>
        <li>모바일은 브라우저에 위치 권한 허용 (최초 1회 팝업)</li>
        <li>홈 → 「오늘 근태」 카드에서 진입</li>
      </ul>

      <SectionTitle>출근 단계별 흐름</SectionTitle>
      <div className="space-y-4">
        <Step n={1}>
          <p>
            홈에서 초록색 <b>「출근하기 →」</b> 버튼을 누릅니다. (이미 출근했다면 검정색
            「퇴근하기 →」 가 보입니다.)
          </p>
        </Step>
        <Step n={2}>
          <p>
            출퇴근 페이지가 열리면 자동으로 현재 위치를 확인하고 가장 가까운 현장이
            표시됩니다.
          </p>
          <ul className="list-disc pl-5 text-sm text-slate-600 space-y-0.5">
            <li>반경 안 → 「출근」 버튼을 누르면 끝</li>
            <li>반경 밖 → 「반경 밖 사유」 입력란이 자동으로 열림</li>
          </ul>
        </Step>
        <Step n={3}>
          <p>
            반경 밖이면 사유(예: <i>"발주처 회의 이동 중"</i>)를 적고 「출근」 누르면
            기록됩니다.
          </p>
        </Step>
      </div>

      <SectionTitle>퇴근 단계별 흐름</SectionTitle>
      <p>
        같은 화면에서 「퇴근」 누르면 끝. 출근 때와 같이 반경 밖이면 사유 입력. 한 번
        퇴근한 뒤에는 그 날 다시 출근으로 되돌릴 수 없으니 마감 전에 확인 부탁드립니다.
      </p>

      <Tip>
        반경(기본 500m)은 현장별로 관리자가 따로 설정할 수 있습니다. 본인 현장 반경이
        너무 좁다면 팀장/관리자에게 조정 요청 가능합니다.
      </Tip>

      <Warning>
        위치 권한이 차단되어 있으면 출근 자체가 안 됩니다. 브라우저 주소창의 자물쇠
        아이콘 → 사이트 설정 → 위치 「허용」 으로 바꿔주세요. 회사 PWA 를 홈 화면에 추가한
        뒤에도 같은 설정이 적용됩니다.
      </Warning>

      <SectionTitle>자주 묻는 질문</SectionTitle>
      <div className="space-y-2">
        <FaqItem q="현장이 새로 생겼는데 매칭이 안 돼요">
          <p>
            관리자에게 <b>/admin/sites</b> 에서 현장 등록을 부탁하세요. 회사·현장명·반경·
            위경도가 다 있어야 자동 매칭됩니다.
          </p>
        </FaqItem>
        <FaqItem q="휴가·외근 날인데 출근해도 되나요?">
          <p>
            휴가·외근 승인된 날은 출근 자체를 하지 않는 게 맞습니다. 출근 후 외근 사유가
            생긴 경우 「외근 신청」 을 결재함에 올려주세요.
          </p>
        </FaqItem>
        <FaqItem q="출근 시각이 잘못 찍혔어요">
          <p>
            본인은 직접 수정할 수 없습니다. 팀장에게 알리면 관리자가 수정해줄 수
            있습니다. 출퇴근 데이터는 5년 보존 대상이라 감사 추적이 남습니다.
          </p>
        </FaqItem>
      </div>
    </ScenarioFrame>
  )
}
