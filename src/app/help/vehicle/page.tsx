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
  const scenario = findScenario('vehicle')!
  return (
    <ScenarioFrame scenario={scenario}>
      <SectionTitle>한 줄로</SectionTitle>
      <p>
        회사 차량을 한 명만 사용 중인 상태로 모바일에서 1초 출고, 도착 후 km·주유·반납
        위치를 적고 반납하면 끝.
      </p>

      <SectionTitle>출고 흐름</SectionTitle>
      <div className="space-y-4">
        <Step n={1}>
          <p>홈 「업무용 차량」 카드 또는 BottomNav 「사무 → 차량」 진입.</p>
        </Step>
        <Step n={2}>
          <p>
            「대기」 상태 차량 중 사용할 차량을 누르고 「출고」. 본인이 다른 차량을 이미
            사용 중이면 차단됩니다 (1인 1차량).
          </p>
        </Step>
        <Step n={3}>
          <p>
            출발 km (선택)·목적(선택) 입력. 이전 반납 km 가 placeholder 로 표시되니
            참고하세요. 「출고」 누르면 끝.
          </p>
        </Step>
      </div>

      <SectionTitle>반납 흐름</SectionTitle>
      <div className="space-y-4">
        <Step n={1}>
          <p>홈 카드 상단의 큰 「반납하기 →」 버튼을 누릅니다.</p>
        </Step>
        <Step n={2}>
          <p>
            <b>도착 km · 주유 여부 + 금액 · 메모 · 반납 위치</b> 를 입력합니다. 주유
            체크박스를 안 켜면 금액 무시. 반납 위치는 선택이지만 다음 운전자가
            참고합니다.
          </p>
        </Step>
        <Step n={3}>
          <p>「반납」 누르면 운행 기록이 저장되고 차량이 「대기」 로 돌아갑니다.</p>
        </Step>
      </div>

      <SectionTitle>운행 이력 검색·CSV</SectionTitle>
      <p>
        /vehicles 헤더 「🔍 운행 이력」 → 월 또는 임의 기간 + 차량·운전자·주유 필터로
        검색. 우상단 CSV 버튼으로 현재 필터 그대로 다운로드 가능.
      </p>

      <Tip>
        반납 위치는 운전자 본인의 정산용이 아니라 <b>다음 운전자가 차량을 찾기 위한
        힌트</b> 입니다. "본사 주차장 B2-3" 처럼 구체적으로 적어주세요.
      </Tip>

      <Warning>
        한 차량에 동시 운전 1명, 한 명에 동시 1대만 가능합니다. 운행 기록은 삭제 안 됩니다
        — 잘못 입력했으면 관리자에게 수정 요청.
      </Warning>

      <SectionTitle>자주 묻는 질문</SectionTitle>
      <div className="space-y-2">
        <FaqItem q="차량이 「비활성」 으로 나옵니다">
          <p>
            관리자가 잠시 사용 중지한 차량입니다 (수리·정비 등). 관리자가
            <b>/admin/employees</b> 옆 차량 관리에서 다시 활성화해야 합니다.
          </p>
        </FaqItem>
        <FaqItem q="이미 누가 사용 중이에요">
          <p>
            카드의 「타인 사용 중」 배지 + 운전자명·출고 시각을 보고 그 사람에게
            연락하세요. 카드를 펼치면 목적·경과 시간도 확인 가능합니다.
          </p>
        </FaqItem>
        <FaqItem q="주유했는데 영수증은 어디에 첨부하나요?">
          <p>
            현재 첨부 기능은 미지원입니다 (M4 자재 모듈 정착 후 검토). 금액만 입력하고
            영수증은 별도 보관하세요.
          </p>
        </FaqItem>
      </div>
    </ScenarioFrame>
  )
}
