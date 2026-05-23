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
  const scenario = findScenario('daily-report')!
  return (
    <ScenarioFrame scenario={scenario}>
      <SectionTitle>한 줄로</SectionTitle>
      <p>
        외선팀·기타 작업자가 오늘 작업을 「시작」 으로 체크인한 뒤, 그 작업에 일보 한 장을
        작성하고 사용한 자재를 기록 — 담당자가 결재합니다.
      </p>

      <SectionTitle>오늘 작업 체크인</SectionTitle>
      <p>
        홈 「오늘 작업」 카드에서 본인 배정 미시작 작업이 체크박스로 나열됩니다. 시작할
        작업들을 골라 「시작하기」 누르면 작업 상태가 자동으로 「진행중」 으로 바뀝니다.
        체크인은 의사결정 기록용이라 일보 작성과는 분리되어 있습니다 (체크 없이도 일보
        작성 가능).
      </p>
      <Screenshot
        file="daily-report-01-today-checkin.png"
        caption="홈 「오늘 작업」 카드 — 미시작 작업 체크박스 다중 선택 + 「시작하기」 버튼"
        priority="must"
      />

      <SectionTitle>일보 작성 단계별 흐름</SectionTitle>
      <div className="space-y-4">
        <Step n={1}>
          <p>
            BottomNav 「작업」 → 작업 카드를 탭. 본인이 배정자면 바로 「일보 작성」
            화면으로 직행합니다 (작업 상세 건너뜀).
          </p>
        </Step>
        <Step n={2}>
          <p>
            작업 지시사항(노란 박스)·작업자 구분·담당자가 상단에 표시. 본인 정보로 자동
            채워집니다.
          </p>
        </Step>
        <Step n={3}>
          <p>
            <b>작업내역·진행률·특이사항</b> 작성. 진행률은 시작전 / 진행중 / 완료 3단계.
            특이사항은 다음 작업자가 참고할 메모.
          </p>
        </Step>
        <Step n={4}>
          <p>
            <b>사용 자재</b> 섹션 — 본인 보유 자재(holding) 중에서 골라 사용 수량 입력. 마스터
            자재 또는 직접 입력도 가능. 사용 자재 모드는 3가지:
          </p>
          <ul className="list-disc pl-5 text-sm text-slate-600 space-y-0.5">
            <li>본인 보유 → 자동 차감</li>
            <li>회사 자재 마스터 → 취득 사유 입력 (현장구매·이전잔여·임시차용·기타)</li>
            <li>직접 입력 (마스터에 없는 비규격) → 취득 사유 입력</li>
          </ul>
          <Screenshot
            file="daily-report-02-report-form.png"
            caption="일보 작성 폼 — 사용 자재 섹션 펼침 (3가지 모드 토글 보이는 상태)"
            priority="must"
          />
          <Screenshot
            file="daily-report-03-holding-picker.png"
            caption="HoldingPicker 풀스크린 모달 — 본인 보유 자재 검색·선택 화면"
            priority="must"
          />
        </Step>
        <Step n={5}>
          <p>
            「제출」 누르면 담당자에게 결재 요청. 담당자가 승인하면 사용한 자재
            holding 이 실제로 차감됩니다.
          </p>
        </Step>
      </div>

      <SectionTitle>오늘 마감</SectionTitle>
      <p>
        하루 끝에 홈 「오늘 작업」 카드의 진행 중 항목들을 「본인 분 완료」 또는 「내일
        이어서」 로 라디오 선택 후 「마감하기」. 의사결정이 기록되어 다음날 누가 어디서
        이어받을지 확인 가능.
      </p>
      <Screenshot
        file="daily-report-04-today-close.png"
        caption="오늘 마감 라디오 — 「본인 분 완료」 / 「내일 이어서」 토글 + 마감 버튼"
        priority="optional"
      />

      <Tip>
        한 작업·한 날에 본인 일보 1장이 원칙. 다른 작업자도 같은 작업·같은 날에 본인
        몫의 일보를 따로 1장 쓸 수 있습니다 (작업+날짜+작성자 unique).
      </Tip>

      <Warning>
        자재 사용에서 본인 holding 의 잔량을 초과해 입력하면 자동승인이 안 되고 자재담당자
        승인 대기로 들어갑니다. 초과 사유 입력이 필수.
      </Warning>

      <SectionTitle>자주 묻는 질문</SectionTitle>
      <div className="space-y-2">
        <FaqItem q="자재가 보유 자재 목록에 없는데 사용했어요">
          <p>
            자재 마스터에 있으면 「마스터」 모드로, 마스터에도 없는 비규격이면 「직접
            입력」 모드로 작성. 두 모드 다 「취득 사유」 가 필수 (어디서 가져왔는지) — 별도
            승인 대기로 들어가니 자재담당자가 사후 검토합니다.
          </p>
        </FaqItem>
        <FaqItem q="일보 제출 후 수정 가능한가요?">
          <p>
            「대기」 상태인 동안 본인이 수정 가능. 담당자가 승인·반려한 뒤엔 담당자만
            수정할 수 있습니다.
          </p>
        </FaqItem>
        <FaqItem q="접속팀인데 이 가이드를 봐도 되나요?">
          <p>
            접속팀은 별도 「접속일보 — 함체·코어·자재·사진까지」 가이드를 참고하세요.
            함체·접속 코어 등 추가 입력이 있습니다.
          </p>
        </FaqItem>
      </div>
    </ScenarioFrame>
  )
}
