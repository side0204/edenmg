@AGENTS.md

# edenMG — 광케이블 시공 SME 통합관리 웹앱

> 자세한 제품 요구사항은 [PRD.md](./PRD.md) 참조 (v0.1, 2026-05-17)

## 한 줄 요약
광케이블 설치·유지보수 SME의 **근태·작업·자재·안전**을 모바일 브라우저 하나로 처리하는 반응형 웹앱. MVP 6~10주 사내 베타 목표.

## 사용자
이 프로젝트의 owner는 **광케이블 시공 SME 관리자(비개발자)**이며, Claude Code와 함께 바이브코딩 방식으로 직접 개발 중. 한국어 의사소통, 전문 용어보다는 실용 가이드 선호.

## 기술 스택 (확정)
- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS v4
- **Backend(BaaS)**: Supabase (PostgreSQL + Auth + Storage + Realtime + Edge Functions)
- **인증**: Supabase Auth — **이메일 + 비밀번호 + 관리자 초대** 방식 (v1)
  - 전화 OTP는 v2 (한국 SMS 게이트웨이 비용 회피)
- **배포**: Vercel (자동) + Supabase Cloud
- **Region**: Northeast Asia (Seoul) — Supabase 프로젝트 위치
- **PWA / 오프라인**: 후순위 (M3 작업일보 모듈 들어갈 때 추가)

## 진행 상태 (2026-05-18 기준)

### ✅ 완료 (부트스트랩)
- 로컬 환경 (Node 20, Git)
- Supabase 프로젝트 생성 (`alhsklyqsbekfgwnyzap.supabase.co`)
  - 보안 설정: Data API ON, 자동 expose OFF, **자동 RLS ON**
- Vercel 계정 + GitHub 저장소 (`side0204/edenmg`) + 자동 배포 파이프라인
- Next.js 16 스캐폴딩 + 브라우저용 Supabase 클라이언트

### ✅ 완료 (M1 — 코드 일체)
- **DB 마이그레이션 SQL**
  - [`0001_init_organizations.sql`](./supabase/migrations/0001_init_organizations.sql) — `companies`, `employees`, `employee_role` enum, RLS 4개, `auth.users` insert 트리거, `current_employee()` 헬퍼, GRANT 블록
  - [`0002_add_position_team_work_type.sql`](./supabase/migrations/0002_add_position_team_work_type.sql) — `role` → `permission` 으로 컬럼·타입 이름 변경, `position`(직급)·`team`(팀)·`work_type`(분야) enum 3개 + 컬럼 3개 추가, RLS·트리거 함수 새 컬럼명에 맞춰 재작성
- **Supabase 클라이언트 3종**: 브라우저(`src/lib/supabase/client.ts`), SSR 서버(`src/lib/supabase/server.ts`), 서비스 롤(`src/lib/supabase/admin.ts`).
- **인증 게이트**: `src/proxy.ts` (Next.js 16 부터 `middleware.ts` → `proxy.ts`. 세션 갱신 + 비로그인 보호 경로 리다이렉트).
- **화면 + Server Actions** (모두 모바일 우선 Tailwind)
  - `/login` — 이메일/비밀번호 로그인, 에러 메시지 한국어화
  - `/` — 인증 게이트 + 역할별(작업자/소장/관리자/대표) 분기 + 로그아웃
  - `/admin/employees` — 관리자/대표만, 직원 목록 + 활성/비활성/초대 미수락 배지. **권한·직급·팀·분야를 행 단위 인라인 드롭다운으로 즉시 편집** (본인 권한은 락아웃 방지로 변경 차단)
  - `/admin/employees/invite` — 이름·이메일·휴대폰·권한 + 직급·팀·분야(선택) 입력 → `auth.admin.inviteUserByEmail`
  - `/auth/confirm` — 이메일 링크 도착지. PKCE(`?code=`)/OTP(`?token_hash=&type=`) 둘 다 처리
  - `/welcome` — 초대 수락 후 비밀번호 설정 + `employees.accepted_at` 갱신

### ✅ 완료 (M2 — 코드 일체, 2026-05-17)

PRD §4.2 보강 결정사항 (코드 들어가기 전 owner 와 확정):

| 항목 | 결정 | 비고 |
|---|---|---|
| **결재선** | 2단: 신청자 → 현장소장 → 관리자/대표 | PRD M2-04 |
| **긴급 전결** | 관리자/대표는 결재선 무관 단독 승인 가능. `leave_action` enum 의 `전결` 로 기록 (소장 단계에서 관리자가 승인하면 자동 전결) | UI 라벨도 인디고색 "전결" |
| **신청서 종류** | 연차 / 반차(오전·오후) / 반반차(오전·오후) / 병가 / 공가 / 외근 — 한국어 enum value | M2-03 |
| **첨부파일** | 신청서당 1개 예정 (Supabase Storage `leave-attachments` 버킷). **현재 컬럼만 있고 UI·버킷 미생성** — 실제 필요할 때 |
| **알림** | **인앱 배지만** (홈 카드 + 결재함 카운트). 푸시·메일·알림톡 v2 |
| **GPS 반경** | 기본 **500m**, 현장별 개별 설정 가능. 반경 벗어나면 사유 입력 강제 |
| **현장 매칭** | 클라이언트 Haversine 으로 가장 가까운 활성 현장 자동 선택 (`src/app/attendance/geo.ts`) |
| **연차 자동 부여** | MVP 미포함. 잔여 일수는 관리자 수동 입력 컬럼만 둠 → v2 |
| **야간/주말 라벨** | MVP 미포함. CSV 내보낼 때 후처리 → v2 |

- **DB 마이그레이션 SQL**
  - [`0003_sites_attendances.sql`](./supabase/migrations/0003_sites_attendances.sql) — `sites`(현장 마스터, radius_m 기본 500) + `attendances`(직원당 work_date UNIQUE, **delete GRANT 자체 미부여**) + `touch_updated_at()` 트리거 + RLS 5개
  - [`0004_leave_requests.sql`](./supabase/migrations/0004_leave_requests.sql) — `leave_requests` + `leave_request_approvals`(append-only audit) + enum 4개 (`leave_type`/`leave_status`/`leave_stage`/`leave_action`) + RLS 5개. approvals 는 update/delete GRANT 미부여.
- **공통 유틸**: [`src/lib/leave.ts`](./src/lib/leave.ts) — `LEAVE_TYPE_LABEL`·`LEAVE_TYPE_META`(multiDay/needsTime)·`STATUS_COLOR`·`formatPeriod`. 폼 동적 분기·표시 일관성을 위해 server/client 양쪽에서 import.
- **화면 + Server Actions** (모두 모바일 우선 Tailwind)
  - `/admin/sites` + `/new` + `/[id]` — 현장 CRUD. 📍 현재 위치로 채우기, 행 클릭 → 편집. ⚠️ **owner 가 별도 보강 예정** (아래 후속 참조)
  - `/attendance` — 출퇴근 1탭. GPS → 매칭 → 반경 밖이면 사유 강제. 한국 시간 기준 `work_date`. 출근 insert / 퇴근은 동일 row update.
  - `/requests` + `/new` + `/[id]` — 신청 목록·작성(종류별 동적 폼 분기)·상세 + 결재 이력·본인 취소
  - `/approvals` + `/[id]` — 결재함 (긴급 우선·소장은 본인 단계만/관리자·대표는 전사) + 승인/반려/전결 액션 페이지
  - `/` — 홈 보강. **오늘 근태** 카드 (상태별 큰 액션 버튼) + **결재** 카드 (내 신청 대기 노란 배지 + 결재함 빨간 카운트)

### ✅ 검증 완료 (Supabase 대시보드 작업)
- 0001 + 0002 + **0003 + 0004** 마이그레이션 실행 + GRANT 보완 SQL 실행
- 회사·대표 시드 (회사명: `(주)이든정보기술`, side0204@gmail.com → CEO/관리자)
- `SUPABASE_SERVICE_ROLE_KEY` `.env.local` + Vercel 등록
- Redirect URLs: `http://localhost:3000/auth/confirm` 등록
- "Invite user" 이메일 템플릿 한국어화 (`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/welcome` 패턴 사용 — 기본 `{{ .ConfirmationURL }}` 은 해시 토큰을 서버가 못 받아서 작동 안 함)
- 로그인 → 초대 → 메일 수신 → 비밀번호 설정 → 가입 완료 흐름 직접 확인
- `/admin/employees` 4개 드롭다운(권한·직급·팀·분야) 정상 동작 확인
- M2 화면 빌드+린트 통과. UI 실동작 검증은 owner 가 진행 중 (현장 등록·출퇴근·신청·결재 흐름).

### ✅ 완료 (M2-06 CSV 리포트, 2026-05-18)

PRD §4.2 보강 결정사항 (owner 와 확정):

| 항목 | 결정 | 비고 |
|---|---|---|
| **데이터 분리** | 출퇴근 / 신청서 각각 별도 CSV (파일 2개) | 급여·장부 입력 흐름이 따로라 합치면 오히려 손해 |
| **기간 단위** | 월(`YYYY-MM`) — `<input type="month">` 한 컨트롤 | 임의 구간은 v2 |
| **다운로드 권한** | 관리자/대표는 전사, 소장은 본인 관리 현장(`sites.manager_employee_id`)·1차 결재자 지정 신청(`leave_requests.assigned_foreman_id`)만 | worker 는 진입 자체 차단 |
| **인코딩** | UTF-8 + BOM, 줄바꿈 CRLF | 한글 Windows Excel 호환 최우선 |
| **신청서 거름 기준** | 신청 기간(start~end)이 대상 월과 겹치는 행 | 월 경계 휴가는 양쪽 모두에 잡힘 (이중계산 주의) |

- **공통 유틸**: [`src/lib/csv.ts`](./src/lib/csv.ts) — `buildCsv` (RFC 4180 escape + BOM + CRLF), `csvResponse` (Content-Disposition RFC 5987), `monthRangeKST`, `dateTimeKST`, `durationMinutes`.
- **Route Handler 2종** (Next.js 16 `app/api/.../route.ts`)
  - [`/api/reports/attendance`](./src/app/api/reports/attendance/route.ts) — 출퇴근 CSV. 컬럼: 일자·직원명·권한·직급·팀·분야·현장명·출근시각·출근위치·출근반경밖사유·퇴근시각·퇴근위치·퇴근반경밖사유·근무시간(H:MM)
  - [`/api/reports/leaves`](./src/app/api/reports/leaves/route.ts) — 신청서 CSV. 컬럼: 신청일시·직원명·권한·직급·팀·분야·종류·시작일·종료일·시작시각·종료시각·긴급·1차결재자(소장)·상태·사유·최종처리자·최종처리시각
  - 둘 다 권한 확인 → 회사 스코프 → foreman 인 경우 추가 좁히기. RLS 가 한 번 더 막아주는 이중 안전망.
- **화면**: [`/admin/reports`](./src/app/admin/reports/page.tsx) + [`ReportPanel.tsx`](./src/app/admin/reports/ReportPanel.tsx) — 월 input + 다운로드 anchor 2개. 권한별 안내 문구 분기. 홈 카드에 admin/ceo 는 "월별 리포트", foreman 은 별도 "리포트" 카드로 노출.

### ✅ 완료 (M2 첨부파일, 2026-05-18)

PRD §4.2 보강 결정사항 (owner 와 확정):

| 항목 | 결정 | 비고 |
|---|---|---|
| **대상 종류** | 병가·공가 (둘 다 선택, 필수 아님) | 다른 종류는 폼에 input 아예 안 보임 |
| **크기/형식** | 10MB · 이미지(JPG/PNG/WEBP/HEIC) + PDF | 버킷 메타로 1차 차단 + server action 으로 2차 검증 |
| **다운로드 권한** | 신청자 본인 + assigned_foreman + 회사 admin/ceo | RLS 가 `leave_requests` 와 join 해 자동 판단 |
| **업로드/교체/삭제** | 신청자 본인 + `status='대기'` 동안만 | 결재 시작 이후엔 고정 |
| **경로 규칙** | `{leave_request_id}/{uuid}.{ext}` — 표시명은 `attachment_filename` 컬럼 분리 | 다운로드 시 원본 파일명으로 받게 signedUrl 옵션 `download` 사용 |

- **DB 마이그레이션 SQL**
  - [`0005_leave_attachments.sql`](./supabase/migrations/0005_leave_attachments.sql) — `leave_requests.attachment_filename` 컬럼 추가 + `leave-attachments` 버킷(10MB, MIME 화이트리스트, private) 생성 + `storage.objects` RLS 4종 (select/insert/update/delete). select 정책은 `split_part(name,'/',1)::uuid` 로 신청서 id 추출 후 `leave_requests` 와 join.
- **공유 상수**: [`src/lib/leave.ts`](./src/lib/leave.ts) 에 `ATTACHMENT_ALLOWED_TYPES` 추가. `'use server'` 파일은 async 함수만 export 가능해서 상수는 lib 으로 빼야 함 (Next.js 16 규칙).
- **Server actions** ([`src/app/requests/actions.ts`](./src/app/requests/actions.ts)):
  - `submitRequest` — 파일 검증 → 신청 insert → Storage upload → `attachment_path/filename` 컬럼 갱신 순서 (RLS 가 신청서 존재 + 본인 확인). 업로드 실패해도 신청 자체는 유지하고 상세 페이지에서 재시도 안내.
  - `replaceAttachment` — 대기 중 첨부 교체. 새 파일 업로드 → 이전 파일 `remove`.
  - `removeAttachment` — 대기 중 첨부 삭제.
  - `getAttachmentUrl` — signedUrl 5분 발급. RLS 가 권한 분기 담당.
- **화면**
  - `/requests/new` — 종류가 병가/공가일 때만 첨부 input 표시. ATTACHMENT_ALLOWED_TYPES 로 동적 분기.
  - `/requests/[id]` — 첨부 섹션: 다운로드 링크 + (본인+대기) 교체 폼 + 삭제 버튼.
  - `/approvals/[id]` — 결재자용. 본문 안 "증빙" 행에 다운로드 링크 (있을 때만).

### ✅ 완료 (업무용 차량 모듈, 2026-05-18)

PRD 외 추가 모듈. owner 결정사항:

| 항목 | 결정 | 비고 |
|---|---|---|
| **사용 흐름** | 출고·반납 2단계. `vehicle_trips.returned_at IS NULL` = "사용 중" | 결재·사전신청 없음 |
| **주유** | 운행 기록 안 체크박스 + 금액(원, 선택). 별도 테이블 안 만듦 | 체크 안 되면 금액 무시 |
| **차량 마스터 필드** | 차량번호 · 차명 (+ 활성 · 비고). 연식·종류·연료·담당자 다 제외 | 회사별 차량번호 unique |
| **권한** | 회사 내 전 직원 운행 기록 SELECT. 마스터 CUD 만 admin/ceo. 운행 INSERT 본인만, UPDATE 본인+admin/ceo | RLS 로 강제 |
| **동시 사용** | 한 차량당 사용 중 1명 (partial unique index). 본인은 동시 1대만 (UI 차단) | DB 가 race 안전망 |
| **append-only** | `vehicle_trips` delete GRANT 미부여 | 운행 이력 보존 |

- **DB 마이그레이션 SQL**: [`0006_vehicles.sql`](./supabase/migrations/0006_vehicles.sql) — `vehicles` + `vehicle_trips` + RLS 5개 + partial unique index + GRANT.
- **Server actions** ([`src/app/vehicles/actions.ts`](./src/app/vehicles/actions.ts)): `createVehicle`/`updateVehicle` (admin), `checkoutVehicle`/`returnVehicle` (본인). 차량 활성/본인 다른 차량 사용 중/이미 사용 중 중복 체크.
- **화면** (모두 모바일 우선 Tailwind)
  - `/vehicles` — 차량 카드 리스트 + 상태 배지(내가 사용 중/타인 사용 중/대기/비활성) + 액션 버튼(출고/반납/수정). 최근 운행 10건 표시. admin/ceo 만 "+ 차량 등록".
  - `/vehicles/new`·`/[id]/edit` — admin/ceo 전용. VehicleForm 공유.
  - `/[id]/checkout` — 출발 km(선택)·목적(선택). 이전 반납 km 를 placeholder 로 표시.
  - `/[id]/return` — 도착 km · 주유 체크박스 + 금액 · 메모. 본인 또는 admin/ceo 만 진입.
- **홈 카드** ([`src/app/page.tsx`](./src/app/page.tsx)): "오늘 근태" 와 "결재" 사이. 내가 사용 중이면 차량명·출고시각 + 큰 "반납하기" 버튼, 아니면 "차량 출고·반납 →" 링크.

#### 운행일지 검색·CSV (owner 결정)

| 항목 | 결정 | 비고 |
|---|---|---|
| **권한 범위** | 전원 공개 (차량 모듈 정책과 일관) | RLS 의 `vehicle_trips_select` 가 같은 회사 전직원 허용 |
| **기간 필터** | 월(YYYY-MM) / 임의 기간(시작·종료) 두 가지 탭 토글 | URL 파라미터 `mode=month` / `mode=range` 로 결정 |
| **추가 필터** | 차량별 · 운전자별 · 주유한 운행만 | 모두 GET 쿼리 파라미터, 검색 페이지와 CSV API 가 동일 키 사용 |
| **CSV 컬럼** | 출고일시 · 반납일시 · 운행시간(H:MM) · 차량번호 · 차명 · 운전자 · 권한 · 직급 · 팀 · 분야 · 출발km · 도착km · 주행km · 목적 · 주유(O/X) · 주유금액 | UTF-8 + BOM + CRLF (csv.ts 공통 빌더 재사용) |
| **결과 상한** | 화면 표시 500건 (CSV 다운은 제한 없음) | 월/기간 단위라 보통 충분 |

- **Route Handler**: [`/api/reports/vehicle-trips/route.ts`](./src/app/api/reports/vehicle-trips/route.ts) — `mode=month|range` + `month` 또는 `start`/`end` + 선택 `vehicle_id`/`driver_id`/`refueled=1`. 기준은 출고일시(`departed_at`).
- **검색 페이지**: [`/vehicles/trips`](./src/app/vehicles/trips/page.tsx) — 탭 토글, 통계 4셀(기간·건수·총 주행거리·주유 합계), 결과 테이블, 우상단 ⬇ CSV 버튼 (현재 필터 그대로 같은 쿼리 파라미터로 다운로드).
- **진입점**: [`/vehicles`](./src/app/vehicles/page.tsx) 헤더 "🔍 운행 이력" 버튼 + 최근 운행 섹션 헤더의 "전체 검색·CSV →" 링크.

### 🟡 M2 후속 / 미완

- **`/admin/sites` 수정사항** — owner 가 별도로 보강 예정 (현장 등록 폼·목록 UX). 다음 세션에서 owner 요청 기반으로 진행. 현 구현은 SiteForm + 인라인 편집 패턴.
- **알림** — 의도적으로 인앱 배지만. PWA 푸시는 M3 들어갈 때 같이 도입 검토.
- **차량 모듈 운영 검증** — owner 가 Supabase 에서 0006 마이그레이션 실행한 뒤 출고/반납/주유 흐름 실측 필요.

### 도메인 용어 — 헷갈리기 쉬운 부분
- **권한 (permission)** : 시스템 접근 제어. 작업자/소장/관리자/대표 4개 enum. 관리자/대표만 직원 관리 화면 진입 가능.
- **직급 (position)** : 회사 내 위계. 이사/부장/차장/과장/대리/사원. 권한과 1:1 아님.
- **팀 (team)** : 소속 부서. 지장/계획/공가/청약/정산/자재/지원.
- **분야 (work_type)** : 현장 작업 종류. 공무/외선/접속. 사용자가 평소 "역할" 이라고 부르는 항목 — UI 라벨은 "분야" 로 통일.
- 직급·팀·분야 enum 값은 **한국어 그대로** 사용 (DB·코드 양쪽). 본인의 권한은 락아웃 방지로 본인이 직접 못 바꿈.

### 📋 이후 모듈 (PRD §3.1)
- M3 작업관리 (W5-6 중반) — PWA + 오프라인 캐싱은 여기서 도입
- M4 자재 입출고 (W5-6 후반)
- M5 안전관리 (W7) — 산안법·중대재해처벌법 증빙 강조 → audit log 필수
- M6 대시보드 (W8)

## 자주 쓰는 명령

```powershell
# 로컬 dev 서버 (포트 3000)
npm run dev

# 빌드 검증 (배포 전 점검)
npm run build

# 린트
npm run lint

# 커밋·배포 (push 시 Vercel 자동 빌드)
git add .
git commit -m "메시지"
git push
```

## 환경변수 (.env.local — git에 커밋되지 않음)
- `NEXT_PUBLIC_SUPABASE_URL` ← 설정됨
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` ← 설정됨
- `SUPABASE_SERVICE_ROLE_KEY` ← 설정됨 (서버 전용, 브라우저 노출 금지)

Vercel 환경변수에도 동일 키 등록. 변수 추가 시 양쪽 동기화 필요.

## 보안·규제 메모
- **개인정보**: 주민번호 미수집. 휴대폰·계좌는 컬럼 단위 암호화 (M2 들어갈 때 설계)
- **위치정보**: 출퇴근·일보 외 추적 안 함. 동의 UI 필수
- **산안법/중대재해처벌법**: 안전 기록은 5년 보존, **append-only audit log**, 소프트 삭제만
- **RLS**: 모든 비즈니스 테이블에 회사·역할별 정책 강제 (Supabase 프로젝트 설정에서 자동 RLS ON 상태)

## 의사결정 컨벤션
- **빠른 MVP 우선**: 정식 자체 백엔드보다 Supabase 위에서 빠르게 구현. 추상화 미루기.
- **모바일 우선 반응형**: 모든 화면을 320~430px 폭에서 먼저 설계, 데스크톱은 그 다음.
- **한국어 UI**: 식별자(변수·테이블)는 영어, 사용자에게 보이는 모든 문구는 한국어.
- **간결한 코드**: 미래 가정용 추상화·feature flag·과도한 에러 처리 금지. 시스템 경계에서만 검증.
