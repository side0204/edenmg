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
  const scenario = findScenario('approval')!
  return (
    <ScenarioFrame scenario={scenario}>
      <SectionTitle>한 줄로</SectionTitle>
      <p>
        본인이 1차 결재자로 지정된 휴가·외근 신청과 본인이 담당자로 지정된 일보를 결재함
        한 곳에서 처리합니다.
      </p>

      <SectionTitle>결재함 보기</SectionTitle>
      <p>
        홈 「결재」 카드의 빨간 배지 = 본인 처리 대기 건수. 카드 또는 BottomNav 「사무 →
        결재」 진입. 휴가·일보가 한 화면에 카드로 나열되고, 긴급 표시된 신청이 위로 정렬.
      </p>

      <SectionTitle>휴가·외근 결재 흐름</SectionTitle>
      <div className="space-y-4">
        <Step n={1}>
          <p>
            결재함에서 처리할 신청 카드를 탭하면 상세 + 「승인」 / 「반려」 버튼이
            나옵니다.
          </p>
        </Step>
        <Step n={2}>
          <p>
            <b>승인</b> — 사유 입력은 선택. 승인하면 결재선 다음 단계로 넘어가거나(2단의
            경우) 최종 처리 완료.
          </p>
        </Step>
        <Step n={3}>
          <p>
            <b>반려</b> — 반려 사유 필수. 신청자가 정정 후 재신청할 수 있도록 구체적으로
            적어주세요.
          </p>
        </Step>
        <Step n={4}>
          <p>
            관리자 권한자는 결재선 단계 무관 <b>「전결」</b> 로 단독 승인 가능 (긴급
            상황용). 전결 시 인디고 색으로 표시됩니다.
          </p>
        </Step>
      </div>

      <SectionTitle>일보 결재 흐름</SectionTitle>
      <p>
        본인이 담당자(work.assignee_employee_id)로 지정된 작업의 일보가 결재함에 들어옵니다.
        현재는 작업 상세 페이지에서 일보로 진입해 「승인」 / 「반려」 처리.
      </p>
      <ul className="list-disc pl-5 space-y-1 text-slate-700">
        <li>승인 시 일보의 자재 사용도 같이 확정 (holding 차감)</li>
        <li>반려 시 작성자가 정정 후 다시 제출</li>
        <li>승인 후엔 담당자만 수정 가능 (재승인 흐름)</li>
      </ul>

      <Tip>
        결재 의견은 신청자·작성자가 신청 상세 페이지에서 그대로 보게 됩니다. 사실
        관계와 어떤 정정이 필요한지 명확히 적어주세요.
      </Tip>

      <Warning>
        본인 신청서를 본인이 결재할 수는 없습니다 (시스템이 차단). 자기 결재가 필요한
        경우 다른 팀장 또는 관리자에게 부탁하세요.
      </Warning>

      <SectionTitle>자주 묻는 질문</SectionTitle>
      <div className="space-y-2">
        <FaqItem q="결재함에 안 보이는 신청이 있는데요">
          <p>
            본인이 1차 결재자(assigned_foreman_id)로 지정되어 있어야 보입니다. 관리자는
            전사 모두 보입니다. 신청자에게 결재자 지정을 확인하세요.
          </p>
        </FaqItem>
        <FaqItem q="이미 처리한 건을 다시 보고 싶어요">
          <p>
            결재함 상단에 「처리 완료」 탭이 있습니다. 본인이 과거에 처리한 건들이 시간순
            정렬.
          </p>
        </FaqItem>
        <FaqItem q="대량으로 들어왔어요. 한 번에 처리할 방법?">
          <p>
            현재는 1건씩만 처리 가능. 일괄 승인은 산안법·근로기준법 기록 무결성을 위해
            의도적으로 미지원입니다.
          </p>
        </FaqItem>
      </div>
    </ScenarioFrame>
  )
}
