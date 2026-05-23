# 사용법 시나리오 스크린샷

각 시나리오 페이지에 박혀 있는 `<Screenshot file="..." />` 자리표시에 대응하는 PNG 파일을 여기에 드롭하면 자동으로 표시됩니다. 코드 편집 불필요.

## 파일명 규칙
- `<시나리오-슬러그>-<번호>-<짧은-설명>.png`
- 모두 소문자·하이픈(-). 공백·한글 파일명 금지.

## 필요한 파일 (24개)

### 출퇴근 (attendance) — 3개
- ★ `attendance-01-home-card.png` — 홈 「오늘 근태」 카드 (출근 전, 초록 「출근하기 →」 버튼)
- ☆ `attendance-02-matched.png` — 출퇴근 페이지, 현장 자동 매칭 (반경 안)
- ★ `attendance-03-out-of-radius.png` — 반경 밖일 때 「반경 밖 사유」 입력란 열린 상태

### 휴가·외근 신청 (leave-request) — 4개
- ★ `leave-request-01-form.png` — 신청 폼 전체 + 종류 select 펼친 모습 (6종 보임)
- ★ `leave-request-02-substitute-modal.png` — 대무자 풀스크린 검색 모달
- ★ `leave-request-03-detail.png` — 신청 상세, 결재 진행 흐름 보이는 상태
- ☆ `leave-request-04-my-leaves.png` — /my-leaves 잔여 카드 + 다음 회차 미리보기

### 차량 (vehicle) — 3개
- ★ `vehicle-01-home-card.png` — 홈 「업무용 차량」 카드, 사용 중·대기 동시 보임
- ☆ `vehicle-02-checkout-form.png` — 출고 폼, 이전 km placeholder 보이는 상태
- ★ `vehicle-03-return-form.png` — 반납 폼 (도착 km·주유·메모·반납 위치)

### 일반 일보 (daily-report) — 4개
- ★ `daily-report-01-today-checkin.png` — 홈 「오늘 작업」 카드, 체크박스 + 「시작하기」
- ★ `daily-report-02-report-form.png` — 일보 작성 폼, 사용 자재 섹션 펼침
- ★ `daily-report-03-holding-picker.png` — HoldingPicker 풀스크린 모달
- ☆ `daily-report-04-today-close.png` — 오늘 마감 라디오 (본인 완료 / 내일 이어서)

### 접속일보 (connection-report) — 4개
- ★ `connection-report-01-chain-tree.png` — 작업구간(chain) 트리
- ★ `connection-report-02-unified-form.png` — 접속일보 통합 작성 폼
- ★ `connection-report-03-live-cores.png` — 사용선번 입력 즉시 코어수 라이브 표시
- ☆ `connection-report-04-gallery.png` — 일보 상세 사진 갤러리 (EXIF 라벨)

### 결재함 (approval) — 3개
- ★ `approval-01-inbox.png` — 결재함 목록, 긴급 우선 정렬 + 배지
- ★ `approval-02-leave-detail.png` — 휴가 결재 상세, 승인/반려/전결 3버튼
- ☆ `approval-03-report-detail.png` — 일보 결재 상세

### 직원 가입 승인 (admin-onboarding) — 3개
- ★ `admin-01-signup-pending.png` — 「가입 승인 대기」 신청자 카드, 권한·토글 펼침
- ★ `admin-02-active-employee-card.png` — 활성 직원 카드, 드롭다운·토글 위치
- ☆ `admin-03-resign.png` — 퇴사 처리 details 메뉴 펼친 상태

## 캡처 팁

- **모바일 화면**: 폭 320~430px (실제 폰 사이즈). 데스크톱 캡처는 모바일에서 너무 크게 보임.
- **권장 도구**: Windows + Shift + S (영역 캡처) → 페인트로 자르기 → "이름 다른 형식" → PNG 저장.
- **민감 정보 가리기**: 다른 직원 이름·전화·이메일이 같이 찍히면 페인트 등으로 가려서 저장.
- **용량**: 1장 200KB ~ 1MB 사이면 적정. 너무 크면 (5MB 이상) 페이지 로딩이 느려집니다.

## 확인 방법

1. 파일을 이 폴더에 저장
2. `npm run dev` (이미 실행 중이면 자동 HMR)
3. `/help/<시나리오-슬러그>` 열어 자리표시가 사진으로 바뀌었는지 확인

자리표시(amber 박스)가 그대로 남아 있으면 파일명 오타·확장자(`.png`) 확인.
