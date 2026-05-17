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

## 진행 상태 (2026-05-17 기준)

### ✅ 완료 (부트스트랩)
- 로컬 환경 (Node 20, Git)
- Supabase 프로젝트 생성 (`alhsklyqsbekfgwnyzap.supabase.co`)
  - 보안 설정: Data API ON, 자동 expose OFF, **자동 RLS ON**
- Vercel 계정 + GitHub 저장소 (`side0204/edenmg`) + 자동 배포 파이프라인
- Next.js 14 스캐폴딩 + Supabase 클라이언트 (`src/lib/supabase/client.ts`)
- 첫 화면: 환경 설정 상태 표시 (`src/app/page.tsx`)

### 🟢 다음: M1 — 조직·계정 모듈 (PRD §4.1)

다음 세션 첫 작업은 **Supabase 스키마 + 로그인·회원관리 화면**.

순서:
1. **Supabase 테이블 생성** (SQL Editor에서 실행)
   - `companies` (회사 — 단일 row로 시작)
   - `employees` (직원 — Supabase Auth `auth.users`와 1:1 연결, `auth_user_id` FK)
   - 모든 테이블에 `company_id` + RLS 정책
2. **트리거**: `auth.users` 생성 시 `employees`에 자동 행 생성
3. **이메일 템플릿** 한국어화 (Supabase Dashboard → Authentication → Email Templates)
4. **화면 구현** (와이어프레임은 본 세션 대화 참조)
   - `/login` — 이메일/비밀번호 로그인
   - `/invite/[token]` — 초대 수락 + 비밀번호 설정
   - `/` — 역할별 홈 (작업자/소장/관리자/대표 분기)
   - `/admin/employees` — 직원 목록 (관리자만)
   - `/admin/employees/invite` — 직원 초대 모달
5. **미들웨어**: 비로그인 시 `/login` 리다이렉트, 역할별 라우트 보호
6. **`@supabase/ssr` 서버 클라이언트** 추가 (`src/lib/supabase/server.ts`)

### 📋 이후 모듈 (PRD §3.1)
- M2 근태·결재 (W3-4)
- M3 작업관리 (W5-6 중반)
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
- (추후 필요 시) `SUPABASE_SERVICE_ROLE_KEY` ← 서버 전용. 절대 브라우저 노출 금지

Vercel 환경변수에도 동일 키 2개 등록 완료. 변수 추가 시 양쪽 동기화 필요.

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
