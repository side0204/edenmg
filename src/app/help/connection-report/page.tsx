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
  const scenario = findScenario('connection-report')!
  return (
    <ScenarioFrame scenario={scenario}>
      <SectionTitle>한 줄로</SectionTitle>
      <p>
        접속팀 전용 일보 — 작업구간(chain) 단위로 함체·케이블·접속 코어·공종·자재를
        기록하고 현장 사진(EXIF 자동 추출)을 첨부합니다.
      </p>

      <SectionTitle>접속팀 작업의 구조</SectionTitle>
      <ul className="list-disc pl-5 space-y-1 text-slate-700">
        <li>
          <b>작업구간(chain)</b> — 상위국 → 함체들 → 하위국 트리. 한 작업에 1:N
        </li>
        <li>
          <b>접속일보</b> — 작업구간 위에서 케이블·코어·공종·자재 입력. 1:N
        </li>
        <li>
          <b>사진</b> — 일보 단위 첨부. 촬영시각·GPS 가 EXIF 에서 자동 추출
        </li>
      </ul>

      <SectionTitle>일보 작성 단계별 흐름</SectionTitle>
      <div className="space-y-4">
        <Step n={1}>
          <p>
            BottomNav 「작업」 → 본인 배정 작업 탭. 작업 카드를 탭하면 바로
            「접속일보 작성」 화면으로 직행합니다.
          </p>
        </Step>
        <Step n={2}>
          <p>
            <b>작업구간 선택</b> — 등록된 작업구간 트리에서 작업할 노드(함체) 옆에 있는
            케이블·접속 코어를 입력합니다. 작업구간 자체 추가/수정은 담당자·관리자만
            가능. 작업자는 등록된 구간에서만 작업.
          </p>
          <Screenshot
            file="connection-report-01-chain-tree.png"
            caption="작업구간(chain) 트리 — 상위국 → 함체들 → 하위국 들여쓰기 트리"
            priority="must"
          />
        </Step>
        <Step n={3}>
          <p>
            <b>케이블 규격</b>·<b>케이블 ID</b>·<b>사용선번</b> 입력. 케이블 ID 는 회사
            마스터에서 자동완성 (마스터에 등록된 케이블이면 규격도 자동 채움). 사용선번은
            "1-6", "1,3,5", "1-6,12-18" 같은 자유 텍스트 — 입력 즉시 접속 코어수가 라이브로
            계산됩니다. 같은 케이블 안에서 중복·역순·음수는 빨강 경고.
          </p>
          <Screenshot
            file="connection-report-02-unified-form.png"
            caption="접속일보 통합 작성 폼 — 케이블·노드·공종·자재 한 화면 입력"
            priority="must"
          />
          <Screenshot
            file="connection-report-03-live-cores.png"
            caption="사용선번 입력 즉시 접속 코어수가 라이브로 표시되는 화면"
            priority="must"
          />
        </Step>
        <Step n={4}>
          <p>
            <b>노드별 공종</b> 추가. 공종 select(14종 + 기타) + 공종 수. 「+ 행 추가」 로
            여러 공종 누적.
          </p>
        </Step>
        <Step n={5}>
          <p>
            <b>노드별 자재</b> 추가. 본인 보유 holding 우선 → 회사 마스터 → 직접 입력.
            (자재 흐름은 「일반 일보」 시나리오와 동일)
          </p>
        </Step>
        <Step n={6}>
          <p>「제출」 후 일보 상세 페이지에서 사진 업로드.</p>
        </Step>
      </div>

      <SectionTitle>사진 첨부</SectionTitle>
      <p>
        일보 상세 페이지 갤러리 섹션 → 「📷 사진 추가」 → 여러 장 한 번에 선택. 자동으로
        촬영시각·GPS 가 EXIF 에서 추출됩니다. EXIF 는 사진에 자동으로 함께 저장되는
        부가 정보(촬영시각·위치·기종 등)로, 시스템이 이를 읽어 갤러리에 자동
        표시합니다. 형식: JPG·PNG·WEBP·HEIC, 10MB/장.
      </p>
      <Screenshot
        file="connection-report-04-gallery.png"
        caption="일보 상세 갤러리 — 사진별 촬영시각·GPS map 링크가 보이는 모양"
        priority="optional"
      />

      <Tip>
        다른 작업자가 작업구간(chain)을 만들지 않은 상태라면 작업 진행이 안 됩니다.
        담당자에게 「상위국·하위국·함체」 골격 등록을 부탁하세요.
      </Tip>

      <Tip>
        본인 분 외에 추가 함체를 다는 「+ 사이 끼우기」 권한은 배정 작업자에게도
        있습니다. 함체 「수정」 권한은 담당자·관리자만.
      </Tip>

      <Warning>
        같은 케이블·같은 회선(세그먼트)은 코어 1개만 사용합니다. 2코어 회선·이원화
        회선은 코어마다 별도 행으로 나눠 입력하세요.
      </Warning>

      <SectionTitle>자주 묻는 질문</SectionTitle>
      <div className="space-y-2">
        <FaqItem q="외선팀과의 합동 작업입니다. 어느 일보를 써야 하나요?">
          <p>
            본인 분야 일보를 각자 1장씩. 접속팀 작업자는 접속일보, 외선팀 작업자는 외선
            일보(현재는 일반 일보). 같은 작업·같은 날 두 일보가 공존합니다.
          </p>
        </FaqItem>
        <FaqItem q="작업구간 트리가 너무 깊어서 길을 잃었어요">
          <p>
            트리는 부모/자식 들여쓰기로 표시됩니다. 작업하려는 함체 위치를 작업 상세에서
            확인 후 일보로 진입.
          </p>
        </FaqItem>
        <FaqItem q="사진의 GPS 가 비어 있어요">
          <p>
            카메라 앱에서 「위치 정보 포함」 설정이 꺼져 있을 가능성. 안드로이드 기본
            카메라 → 설정 → 위치 태그 ON. iOS → 설정 → 카메라 → 위치 정보 「Always」.
          </p>
        </FaqItem>
      </div>
    </ScenarioFrame>
  )
}
