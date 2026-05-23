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
  const scenario = findScenario('admin-onboarding')!
  return (
    <ScenarioFrame scenario={scenario}>
      <SectionTitle>한 줄로</SectionTitle>
      <p>
        신규 직원이 /signup 으로 자율 가입한 뒤, 관리자가 /admin/employees 에서 가입 신청을
        검토·승인하면서 권한·토글까지 한 번에 부여합니다. 퇴사 처리도 같은 페이지에서.
      </p>

      <SectionTitle>가입 신청 → 승인 흐름</SectionTitle>
      <div className="space-y-4">
        <Step n={1}>
          <p>
            직원이 /signup 에서 이름·이메일·비밀번호·전화·직무(접속팀이면 차량번호 필수)를
            입력해 가입 신청. 시스템이 즉시 user 를 생성하지만 <b>is_active=false</b> 로
            로그인 자체가 차단된 상태.
          </p>
        </Step>
        <Step n={2}>
          <p>
            관리자가 /admin/employees 상단 <b>「가입 승인 대기」</b> 섹션에서 신청자 카드
            확인. 이름·이메일·전화·직무·차량번호가 표시됩니다.
          </p>
        </Step>
        <Step n={3}>
          <p>
            <b>권한 select</b> 와 <b>토글 4종</b> 을 한 번에 지정합니다:
          </p>
          <ul className="list-disc pl-5 text-sm text-slate-600 space-y-0.5">
            <li>권한: 작업자 · 팀원 · 팀장 · 관리자</li>
            <li>작업관리(rose) — 작업 등록·수정 권한</li>
            <li>작업삭제(amber) — 작업 삭제 권한 (작업관리 위에)</li>
            <li>통계조회(blue) — /works/stats 등 전사 통계</li>
            <li>자재관리(violet) — /stock 입출고·승인</li>
          </ul>
        </Step>
        <Step n={4}>
          <p>
            「승인」 누르면 is_active=true·accepted_at 갱신 + 권한·토글이 즉시 적용. 직원이
            로그인 가능.
          </p>
        </Step>
        <Step n={5}>
          <p>
            「거부」 는 user 와 employees row 모두 삭제합니다. 같은 이메일로 다시 가입
            신청 가능.
          </p>
        </Step>
      </div>

      <SectionTitle>활성 직원 인라인 편집</SectionTitle>
      <p>활성 직원 카드 안에서 직접 변경 가능 (드롭다운 즉시 저장):</p>
      <ul className="list-disc pl-5 space-y-1 text-slate-700">
        <li>권한 · 직급 · 팀 · 분야 (work_type)</li>
        <li>권한 토글 4종</li>
        <li>차량번호 (접속팀·외선팀 만 노출, 접속팀은 필수)</li>
        <li>입사일 (연차 자동 부여 기준)</li>
      </ul>

      <SectionTitle>퇴사 처리</SectionTitle>
      <p>
        활성 직원 카드 푸터의 「퇴사 처리」 details 메뉴 펼침 → 퇴사일(기본 오늘) 입력 →
        「퇴사 처리」. 본인 카드에서는 안 보입니다 (락아웃 방지).
      </p>
      <ul className="list-disc pl-5 space-y-1 text-slate-700">
        <li>퇴사 처리 = is_active=false + resigned_at 기록 + 로그인 차단</li>
        <li>모든 일보·근태·작업·휴가 이력은 그대로 보존 (산안법 5년)</li>
        <li>재입사 시 「퇴사자 목록」 페이지에서 「재입사 처리」 (같은 row 재활용)</li>
      </ul>

      <Tip>
        관리자만 권한·토글을 부여할 수 있습니다. 본인은 본인의 권한·토글을 못 바꿉니다
        (락아웃 방지).
      </Tip>

      <Warning>
        가입 흐름은 누구나 이메일로 시도할 수 있습니다 (squatting 가능성). 회사·이메일이
        맞는지 확인 후 승인하세요. 의심스러우면 거부 후 본인 확인 거쳐 재신청.
      </Warning>

      <SectionTitle>자주 묻는 질문</SectionTitle>
      <div className="space-y-2">
        <FaqItem q="기존 직원이 비밀번호를 잊었어요">
          <p>
            현재 「비밀번호 재설정」 자동 흐름은 미지원. Supabase Dashboard 의 Auth →
            Users 에서 해당 user → Send password recovery 로 직접 발송하거나, 임시
            비밀번호로 재설정 후 직원에게 전달.
          </p>
        </FaqItem>
        <FaqItem q="권한을 잘못 부여했어요">
          <p>
            활성 직원 카드의 권한 select 를 다시 바꾸면 즉시 반영. 토글도 같은
            방식으로 끌 수 있습니다. 변경 이력은 별도 audit log 가 없으니
            (개선 후순위) 신중히 부여하세요.
          </p>
        </FaqItem>
        <FaqItem q="직원이 차량번호를 안 적었어요">
          <p>
            접속팀은 차량번호 필수, 외선팀은 선택. 활성 직원 카드의 차량번호 input 에서
            직접 추가 가능. 다른 직무는 차량번호 input 자체가 안 보입니다.
          </p>
        </FaqItem>
      </div>
    </ScenarioFrame>
  )
}
