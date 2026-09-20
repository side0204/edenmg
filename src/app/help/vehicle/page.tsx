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
  const scenario = findScenario('vehicle')!
  return (
    <ScenarioFrame scenario={scenario}>
      <SectionTitle>한 줄로</SectionTitle>
      <p>
        외근 1건 = 이동 1건. 나갈 때 목적·장소·이동수단(업무용 차량 / 자차 / 기타)·동행인을 적고
        「출발하기」, 돌아와서 「도착 · 반납하기」 로 도착시간과 km 만 확인하면 끝. 결재 없음.
      </p>

      <SectionTitle>외근 시작</SectionTitle>
      <div className="space-y-4">
        <Step n={1}>
          <p>하단 탭 「외근·차량」 또는 홈 「외근·차량」 카드의 큰 「외근 시작」 버튼.</p>
          <Screenshot
            file="vehicle-01-home-card.png"
            caption="홈 「외근·차량」 카드 — 내 상태와 지금 외근 중인 직원이 같이 보이는 모습"
            priority="must"
          />
        </Step>
        <Step n={2}>
          <p>
            <b>업무목적 · 외근장소</b> 를 적습니다. 최근 장소는 칩으로 떠서 한 번에 넣을 수 있습니다.
            출발시간은 지금 시각이 기본, 도착 예정은 선택입니다.
          </p>
        </Step>
        <Step n={3}>
          <p>
            <b>이동수단</b> 을 고릅니다. 업무용 차량이면 대기 중인 차량을 하나 선택(사용 중인 차량은 흐리게),
            자차면 프로필의 차량번호가 자동으로 들어가고, 기타는 도보·대중교통·동승 중 선택.
          </p>
          <Screenshot
            file="vehicle-02-checkout-form.png"
            caption="외근 시작 폼 — 이동수단 3택과 차량 선택 목록"
            priority="optional"
          />
        </Step>
        <Step n={4}>
          <p>
            <b>동행인</b> 은 「동행 추가」 로 최대 4명까지. 동행인 홈에도 「외근 중 (동승)」 으로 표시됩니다.
            「출발하기」 누르면 끝. 잘못 눌렀으면 10분 안에 「시작 취소」 가능.
          </p>
        </Step>
      </div>

      <SectionTitle>도착 · 반납</SectionTitle>
      <div className="space-y-4">
        <Step n={1}>
          <p>홈 카드 또는 「외근·차량」 탭 상단의 큰 「도착 · 반납하기」 버튼.</p>
        </Step>
        <Step n={2}>
          <p>
            <b>도착시간</b>(지금 기본) · <b>도착 km</b> 를 넣으면 주행거리가 바로 계산됩니다. 주유했으면 토글을 켜고
            금액, 업무용 차량이면 반납 위치도 적어주세요 (다음 운전자가 찾는 힌트).
          </p>
          <Screenshot
            file="vehicle-03-return-form.png"
            caption="도착 폼 — 도착 km 입력 시 주행거리 자동 표시"
            priority="must"
          />
        </Step>
        <Step n={3}>
          <p>「도착 기록 · 반납하기」 누르면 외근이 완료되고 차량은 「대기」 로 돌아갑니다.</p>
        </Step>
      </div>

      <SectionTitle>차계부</SectionTitle>
      <p>
        「외근·차량」 탭 차량 표에서 차량 옆 책 아이콘 → 차량별 차계부. 운행·주유는 도착 폼에서 자동으로
        들어오고, 정비·보험·검사·세금·통행·주차는 「기록 추가」 로 누구나 입력할 수 있습니다. 정비·검사에
        다음 예정 km·날짜를 적어두면 표에 D-day 로 뜹니다. 자차도 같은 방식입니다.
      </p>

      <SectionTitle>운행 이력 검색·CSV</SectionTitle>
      <p>
        「외근·차량」 헤더의 「운행 이력」 → 월 또는 임의 기간 + 차량·운전자·주유 필터로 검색. CSV 에는
        구분(업무용/자차/기타)·장소·동행인이 함께 나갑니다.
      </p>

      <Tip>
        외근 현황은 회사 전원이 봅니다. 「오늘 외근」 표에서 누가 어디에 언제 갔는지, 어떤 차로 갔는지 한 줄씩
        비교할 수 있습니다.
      </Tip>

      <Warning>
        한 사람은 동시에 외근 1건, 한 차량은 동시에 1명만 사용할 수 있습니다. 외근 기록은 삭제되지 않습니다
        — 잘못 입력했으면 관리자에게 수정 요청.
      </Warning>

      <SectionTitle>자주 묻는 질문</SectionTitle>
      <div className="space-y-2">
        <FaqItem q="예전 「차량」 서브탭이 없어졌어요">
          <p>차량 출고·반납이 외근과 합쳐져 하단 「외근·차량」 탭으로 올라왔습니다. 차량 등록·수정은 관리자가 헤더 「차량 관리」 에서 합니다.</p>
        </FaqItem>
        <FaqItem q="휴가 신청서의 「외근」 종류가 안 보여요">
          <p>외근은 더 이상 결재 신청서가 아닙니다. 「외근·차량」 탭에서 바로 시작하세요. 예전에 승인된 외근 신청서는 그대로 조회됩니다.</p>
        </FaqItem>
        <FaqItem q="자차 차량번호가 자동으로 안 들어가요">
          <p>설정 → 내 프로필에 차량번호를 저장해 두면 다음부터 자동 입력됩니다. 그 전엔 시작 폼에서 직접 적어도 됩니다.</p>
        </FaqItem>
        <FaqItem q="영수증 사진은 어디에 붙이나요?">
          <p>차계부 사진 첨부는 다음 단계입니다. 지금은 금액·업체명만 입력하고 영수증은 별도 보관하세요.</p>
        </FaqItem>
      </div>
    </ScenarioFrame>
  )
}
