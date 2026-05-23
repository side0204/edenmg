import { findScenario } from '@/lib/help-scenarios'
import {
  ScenarioFrame,
  Step,
  SectionTitle,
  Tip,
  Warning,
  FaqItem,
} from '../ScenarioFrame'
import { Screenshot } from '../Screenshot'

export default function Page() {
  const scenario = findScenario('leave-request')!
  return (
    <ScenarioFrame scenario={scenario}>
      <SectionTitle>한 줄로</SectionTitle>
      <p>
        연차·반차·반반차·병가·공가·외근을 모바일에서 신청. <b>대무자</b> 와{' '}
        <b>1차 결재자(팀장)</b> 를 지정하면 결재함으로 자동 전달됩니다.
      </p>

      <SectionTitle>사전 준비</SectionTitle>
      <ul className="list-disc pl-5 space-y-1 text-slate-700">
        <li>본인 연차 잔여 — 홈 「내 연차 잔여」 카드 또는 /my-leaves 에서 확인</li>
        <li>병가·공가는 진단서·증빙 사진(JPG·PDF, 10MB 까지) 미리 준비</li>
        <li>대무자 후보 — 같은 회사 활성 직원 중 1명</li>
      </ul>

      <SectionTitle>신청 단계별 흐름</SectionTitle>
      <div className="space-y-4">
        <Step n={1}>
          <p>
            홈 「결재」 카드 또는 BottomNav 「사무 → 결재」 에서 「+ 새 신청」.
          </p>
        </Step>
        <Step n={2}>
          <p>
            <b>종류</b> 선택. 종류에 따라 입력 칸이 달라집니다.
          </p>
          <ul className="list-disc pl-5 text-sm text-slate-600 space-y-0.5">
            <li>연차 — 시작일·종료일 (반차는 오전/오후, 반반차는 시간 선택)</li>
            <li>병가·공가 — 시작/종료일 + 증빙 첨부 (선택)</li>
            <li>외근 — 시작/종료 시각, 사유, 장소</li>
          </ul>
          <Screenshot
            file="leave-request-01-form.png"
            caption="신청 폼 전체 — 종류 select 펼친 모습 (6가지 종류와 동적 분기 칸)"
            priority="must"
          />
        </Step>
        <Step n={3}>
          <p>
            <b>1차 결재자(팀장)</b> 선택 — 본인 팀의 팀장을 고르세요. 관리자가
            전결할 때도 결재함에 이 사람이 노출됩니다.
          </p>
        </Step>
        <Step n={4}>
          <p>
            <b>대무자</b> 선택 — 풀스크린 검색 모달이 열립니다. 이름·직급·팀·분야로
            검색 가능. 본인은 선택 못 합니다. 모든 휴가에 대무자가 필수입니다.
          </p>
          <Screenshot
            file="leave-request-02-substitute-modal.png"
            caption="대무자 풀스크린 검색 모달 — 검색창 + 결과 리스트 보이는 상태"
            priority="must"
          />
        </Step>
        <Step n={5}>
          <p>「제출」 누르면 결재함으로 전달되고 본인에겐 「대기 중」 표시.</p>
        </Step>
      </div>

      <SectionTitle>결재 진행 확인</SectionTitle>
      <p>
        홈 「결재」 카드의 노란 배지 = 본인 신청 대기 건수. 결재 진행 흐름:
      </p>
      <ul className="list-disc pl-5 space-y-1 text-slate-700">
        <li>대기 → 팀장 승인 → 관리자 최종 승인 (2단)</li>
        <li>관리자가 「전결」 로 단독 승인 가능 (긴급 시)</li>
        <li>반려 시 사유가 표시됨 → 정정해 다시 신청</li>
      </ul>
      <Screenshot
        file="leave-request-03-detail.png"
        caption="신청 상세 — 결재 진행 흐름이 보이는 상태 (대기 → 팀장 승인 → 관리자 승인)"
        priority="must"
      />
      <Screenshot
        file="leave-request-04-my-leaves.png"
        caption="/my-leaves — 본인 연차 잔여 큰 카드 + 다음 회차 미리보기"
        priority="optional"
      />

      <SectionTitle>본인 취소</SectionTitle>
      <p>
        「대기」 상태인 동안만 본인이 취소 가능. 결재 시작된 뒤엔 결재자가 반려해야
        취소됩니다.
      </p>

      <Tip>
        잔여 연차가 부족해도 신청·승인은 가능합니다. 음수 잔여는 관리자가 추후
        조정할 수 있습니다. 신청 폼 상단에 「승인 시 예상 잔여」 가 미리
        표시되니 참고하세요.
      </Tip>

      <Warning>
        첨부파일은 신청 「대기」 동안만 교체·삭제할 수 있습니다. 결재가 시작되면 고정.
        병가·공가에서 다른 종류로 바꿀 땐 첨부도 자동 삭제됩니다.
      </Warning>

      <SectionTitle>자주 묻는 질문</SectionTitle>
      <div className="space-y-2">
        <FaqItem q="대무자가 누구를 골라야 할지 모르겠어요">
          <p>
            본인 휴가 동안 작업이 안 멈추도록 같은 팀에서 1명을 정해주세요. 같은 팀이
            없으면 직무가 가까운 직원으로.
          </p>
        </FaqItem>
        <FaqItem q="연차 자동 부여는 어떻게 되나요?">
          <p>
            입사일 기준으로 자동 부여됩니다. 1년 미만은 매월 1일씩 (최대 11일), 1년
            이상은 매 1주년에 15일 + 가산. 자세한 잔여는 <b>/my-leaves</b> 에서 확인.
          </p>
        </FaqItem>
        <FaqItem q="월 경계에 걸친 휴가는 어떻게 잡히나요?">
          <p>
            CSV 리포트에서는 시작·종료 기간이 대상 월에 걸치면 양쪽 월에 모두
            잡힙니다. 잔여 차감은 한 번만 됩니다.
          </p>
        </FaqItem>
      </div>
    </ScenarioFrame>
  )
}
