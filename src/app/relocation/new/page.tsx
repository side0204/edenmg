import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createProject } from '../actions'
import {
  isRelocationCategorySlug,
  RELOCATION_CATEGORY_FROM_SLUG,
  RELOCATION_CATEGORY_LABEL,
  RELOCATION_CATEGORY_VALUES,
  RELOCATION_CATEGORY_SLUG,
  type RelocationCategory,
} from '@/lib/relocation'
import {
  RelocationWorkerPicker,
  type RelocationWorkerCandidate,
} from '../RelocationWorkerPicker'

const SUBSCRIPTION_SUBCATEGORIES = [
  '소호',
  'FTTH',
  '모바일',
  '전용회선',
  '다회선',
  '아파트',
] as const

// 공사 설계 프로젝트 생성 폼.
// 권한: 회사 직원 누구나.
// 카테고리는 URL ?cat= 슬러그로 미리 결정 (카테고리 목록에서 진입).
// 슬러그가 없거나 잘못된 값이면 폼에서 직접 선택.
//
// PC (lg+) 에서는 컴팩트 모드 — 폼 한 화면(풀HD 1080) 안에 보이도록
//   글자/간격을 모바일의 ~3/4 크기로 축소 + 가능한 곳은 2 컬럼 그리드.

type EmployeeMini = {
  id: string
  name: string
  permission: string
}

// 공통 인풋 스타일 — 폼 안에서 일관되게 재사용
const INPUT =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base lg:text-xs lg:px-2.5 lg:py-1.5 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900'
const LABEL = 'block text-sm font-medium text-slate-700 lg:text-[11px]'

export default async function NewRelocationProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>
}) {
  const { cat: catRaw } = await searchParams
  const categoryFromUrl: RelocationCategory | null =
    catRaw && isRelocationCategorySlug(catRaw)
      ? RELOCATION_CATEGORY_FROM_SLUG[catRaw]
      : null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; company_id: string; is_active: boolean } | null
  if (!me || !me.is_active) {
    redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  }

  // 설계자 후보 (회사 활성 직원 전체) + 외선/접속 작업자 후보 (work_type 별)
  const { data: emps } = await supabase
    .from('employees')
    .select('id, name, permission, position, team, work_type')
    .eq('company_id', me.company_id)
    .eq('is_active', true)
    .order('name')

  type EmpRow = EmployeeMini & {
    position: string | null
    team: string | null
    work_type: string | null
  }
  const employees = (emps ?? []) as EmpRow[]
  const outsideCandidates: RelocationWorkerCandidate[] = employees.filter(
    (e) => e.work_type === '외선팀',
  )
  const spliceCandidates: RelocationWorkerCandidate[] = employees.filter(
    (e) => e.work_type === '접속팀',
  )

  // 카테고리가 결정됐으면 목록으로, 아니면 허브로 돌아감.
  const backHref = categoryFromUrl
    ? `/relocation/category/${RELOCATION_CATEGORY_SLUG[categoryFromUrl]}`
    : '/relocation'
  const backLabel = categoryFromUrl
    ? `${RELOCATION_CATEGORY_LABEL[categoryFromUrl]} 목록`
    : '공사 설계'

  // 카테고리 분기 — 청약은 폼 구조가 다름 (전용 필드 8 개)
  const isSubscription = categoryFromUrl === '청약'
  const titleLabel = isSubscription ? '청약명' : '프로젝트 제목'

  return (
    <main className="min-h-screen p-4 sm:p-6 lg:p-4">
      <div className="mx-auto max-w-2xl lg:max-w-4xl space-y-5 lg:space-y-2">
        <header className="lg:space-y-0.5">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm lg:text-xs text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4 lg:h-3 lg:w-3" />
            {backLabel}
          </Link>
          <h1 className="mt-1 text-3xl lg:text-xl font-bold text-slate-900 tracking-tight">
            새 프로젝트 생성
            {categoryFromUrl && (
              <span className="ml-2 text-base lg:text-xs font-medium text-slate-500">
                · {RELOCATION_CATEGORY_LABEL[categoryFromUrl]}
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm lg:text-[11px] text-slate-500">
            안건 1건당 1 프로젝트로 등록합니다.
          </p>
        </header>

        <form
          action={createProject}
          className="rounded-2xl bg-white shadow-sm border border-slate-200 p-6 lg:p-4 space-y-4 lg:space-y-2"
        >
          <div>
            <label className={LABEL}>
              공사 분류 <span className="text-rose-600">*</span>
            </label>
            {categoryFromUrl ? (
              <>
                <input type="hidden" name="category" value={categoryFromUrl} />
                <p className="mt-1 inline-flex items-center rounded-lg bg-slate-100 px-3 py-2 lg:px-2.5 lg:py-1 text-sm lg:text-xs font-medium text-slate-800">
                  {RELOCATION_CATEGORY_LABEL[categoryFromUrl]}
                </p>
              </>
            ) : (
              <select name="category" required defaultValue="지장이설" className={INPUT}>
                {RELOCATION_CATEGORY_VALUES.map((c) => (
                  <option key={c} value={c}>
                    {RELOCATION_CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className={LABEL}>
              {titleLabel} <span className="text-rose-600">*</span>
            </label>
            <input type="text" name="title" required maxLength={200} className={INPUT} />
          </div>

          {/* ── 청약 카테고리 전용 필드 ── */}
          {isSubscription && (
            <>
              <div>
                <label className={LABEL}>
                  청약 분류 <span className="text-rose-600">*</span>
                </label>
                <select name="subcategory" required defaultValue="" className={INPUT}>
                  <option value="" disabled>
                    선택하세요
                  </option>
                  {SUBSCRIPTION_SUBCATEGORIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <p className="mt-0.5 text-xs lg:text-[10px] text-slate-500">
                  작업관리(작업자 일보)에 자동 연동됨
                </p>
              </div>

              <div className="grid gap-3 lg:gap-2 lg:grid-cols-2">
                <div>
                  <label className={LABEL}>청약ID</label>
                  <input
                    type="text"
                    name="subscription_id"
                    maxLength={100}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className={LABEL}>공사번호</label>
                  <input
                    type="text"
                    name="order_no"
                    maxLength={100}
                    className={INPUT}
                  />
                </div>
              </div>

              <div className="grid gap-3 lg:gap-2 lg:grid-cols-2">
                <div>
                  <label className={LABEL}>가입자명</label>
                  <input
                    type="text"
                    name="subscriber_name"
                    maxLength={100}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className={LABEL}>지역</label>
                  <select name="region" defaultValue="" className={INPUT}>
                    <option value="">(선택 없음)</option>
                    <option value="시흥시">시흥시</option>
                    <option value="남동구">남동구</option>
                    <option value="기타">기타</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={LABEL}>가입자 주소</label>
                <input
                  type="text"
                  name="subscriber_address"
                  maxLength={300}
                  className={INPUT}
                />
              </div>

              <div className="grid gap-3 lg:gap-2 lg:grid-cols-2">
                <div>
                  <label className={LABEL}>하위국 담당자</label>
                  <input
                    type="text"
                    name="branch_manager"
                    maxLength={100}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className={LABEL}>하위국 연락처</label>
                  <input
                    type="text"
                    name="branch_contact"
                    maxLength={100}
                    className={INPUT}
                  />
                </div>
              </div>

              <div className="grid gap-3 lg:gap-2 lg:grid-cols-2">
                <div>
                  <label className={LABEL}>청약일</label>
                  <input type="date" name="subscribed_at" className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>개통희망일</label>
                  <input type="date" name="desired_open_at" className={INPUT} />
                </div>
              </div>

              <div className="grid gap-3 lg:gap-2 lg:grid-cols-3">
                <div>
                  <label className={LABEL}>공사계약일</label>
                  <input type="date" name="surveyed_at" className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>준공예정일</label>
                  <input type="date" name="expected_completion_at" className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>작업완료일</label>
                  <input type="date" name="completion_at" className={INPUT} />
                </div>
              </div>

              <div>
                <label className={LABEL}>작업자배정</label>
                <div className="mt-1 grid gap-3 lg:gap-2 lg:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 p-2 lg:p-1.5 bg-orange-50/40">
                    <label className="block text-xs text-orange-700 lg:text-[10px] font-semibold">
                      외선 ({outsideCandidates.length}명 가능)
                    </label>
                    <div className="mt-1">
                      <RelocationWorkerPicker
                        name="outside_worker_ids"
                        label="외선"
                        candidates={outsideCandidates}
                      />
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-2 lg:p-1.5 bg-blue-50/40">
                    <label className="block text-xs text-blue-700 lg:text-[10px] font-semibold">
                      접속 ({spliceCandidates.length}명 가능)
                    </label>
                    <div className="mt-1">
                      <RelocationWorkerPicker
                        name="splice_worker_ids"
                        label="접속"
                        candidates={spliceCandidates}
                      />
                    </div>
                  </div>
                </div>
                <p className="mt-1 text-xs lg:text-[10px] text-slate-500">
                  선택한 작업자에게 자동으로 작업관리(/works)에 작업이 생성되어 일보를 작성할 수
                  있습니다.
                </p>
              </div>
            </>
          )}

          {/* 계획·지장이설 카테고리: 지역 + 공사계약일 */}
          {!isSubscription && (
            <div className="grid gap-3 lg:gap-2 lg:grid-cols-2">
              <div>
                <label className={LABEL}>지역</label>
                <select name="region" defaultValue="" className={INPUT}>
                  <option value="">(선택 없음)</option>
                  <option value="시흥시">시흥시</option>
                  <option value="남동구">남동구</option>
                  <option value="기타">기타</option>
                </select>
              </div>
              <div>
                <label className={LABEL}>공사계약일</label>
                <input type="date" name="surveyed_at" className={INPUT} />
              </div>
            </div>
          )}

          <div className="grid gap-3 lg:gap-2 lg:grid-cols-2">
            <div>
              <label className={LABEL}>설계자</label>
              <select name="designer_id" defaultValue={me.id} className={INPUT}>
                <option value="">(미지정)</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                    {e.id === me.id ? ' (본인)' : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs lg:text-[10px] text-slate-500">
                기본은 본인. 다른 직원으로 변경 가능.
              </p>
            </div>
            <div>
              <label className={LABEL}>상태</label>
              <select name="status" defaultValue="설계중" className={INPUT}>
                <option value="설계중">설계중</option>
                <option value="검증중">검증중</option>
                <option value="확정">확정</option>
                <option value="시공중">시공중</option>
                <option value="완료">완료</option>
                <option value="취소">취소</option>
              </select>
            </div>
          </div>

          <div>
            <label className={LABEL}>비고</label>
            <textarea
              name="notes"
              rows={3}
              maxLength={1000}
              className={INPUT + ' lg:!py-1'}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 lg:pt-1">
            <Link
              href={backHref}
              className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 lg:px-3 lg:py-1.5 text-sm lg:text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              취소
            </Link>
            <button
              type="submit"
              className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 lg:px-3 lg:py-1.5 text-sm lg:text-xs font-medium text-white hover:bg-slate-800"
            >
              생성
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
