import { createServerClient } from '@supabase/ssr'
import { NextResponse, after, type NextRequest } from 'next/server'

// Next.js 16 에서 middleware 는 proxy 로 이름이 바뀌었다 (동작 동일).
// 이 파일은 모든 요청에 대해:
//   1) Supabase 세션 쿠키를 읽고 필요하면 갱신해 응답 쿠키에 다시 쓰고
//   2) 비로그인 사용자가 보호 경로에 접근하면 /login 으로 리다이렉트한다.
//   3) 현장 직원이 사무 그룹(근태·차량·결재) URL 직접 접근 시 홈으로 리다이렉트.
//   4) 베타 모니터링 — 마지막 활동 시각 + 페이지 방문 기록 (after() 로 비동기).

const PUBLIC_PREFIXES = ['/login', '/signup', '/auth/'] as const

// 실제 페이지 네비게이션인지 판별 — 프리페치·API·자산 요청은 제외.
//   하드 로드: Accept 에 text/html / 소프트 네비게이션: rsc 헤더.
//   프리페치(next-router-prefetch)는 실제 방문이 아니므로 제외.
function isPageNavigation(request: NextRequest, path: string): boolean {
  if (request.method !== 'GET') return false
  if (path.startsWith('/api/')) return false
  const h = request.headers
  if (h.get('next-router-prefetch') || h.get('next-router-segment-prefetch')) {
    return false
  }
  if (h.get('rsc') != null) return true
  return (h.get('accept') ?? '').includes('text/html')
}

// 현장(workplace_type='현장') 직원이 접근 불가한 경로
const FIELD_BLOCKED_PREFIXES = [
  '/attendance',
  '/vehicles',
  '/requests',
  '/approvals',
] as const

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // createServerClient 호출과 getUser 사이에는 다른 작업을 끼워넣지 말 것.
  // (세션 갱신 타이밍이 어긋나면 setAll 이 응답에 반영되지 못해 로그아웃이 튄다.)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isPublic = PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p))

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && path === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // 베타 모니터링 — 접속 현황 + 페이지 방문 기록.
  //   em_seen 쿠키(값 = employeeId.companyId, 5분 만료)로 직원 조회를 캐시한다.
  //   - 쿨다운이 만료됐을 때만 employees 를 조회하고 last_seen_at 을 갱신
  //   - 페이지 네비게이션마다 page_views 1행 — after() 로 응답 후 실행해 지연 0
  if (user) {
    let empId: string | null = null
    let companyId: string | null = null

    const seen = request.cookies.get('em_seen')?.value
    const dot = seen ? seen.indexOf('.') : -1
    if (seen && dot > 0) {
      empId = seen.slice(0, dot)
      companyId = seen.slice(dot + 1)
    } else {
      const { data } = await supabase
        .from('employees')
        .select('id, company_id')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      const emp = data as { id: string; company_id: string } | null
      if (emp) {
        empId = emp.id
        companyId = emp.company_id
        response.cookies.set('em_seen', `${emp.id}.${emp.company_id}`, {
          maxAge: 300,
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
        })
        after(async () => {
          await supabase
            .from('employees')
            .update({ last_seen_at: new Date().toISOString() })
            .eq('id', emp.id)
        })
      }
    }

    if (empId && companyId && isPageNavigation(request, path)) {
      const cid = companyId
      const eid = empId
      after(async () => {
        await supabase
          .from('page_views')
          .insert({ company_id: cid, employee_id: eid, path })
      })
    }
  }

  // 현장 직원의 사무 그룹 URL 직접 접근 차단 — 차단 prefix 일 때만 DB 조회
  if (user && FIELD_BLOCKED_PREFIXES.some((p) => path === p || path.startsWith(p + '/') || path === p)) {
    const { data } = await supabase
      .from('employees')
      .select('workplace_type')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    const workplace = (data as { workplace_type?: string } | null)?.workplace_type
    if (workplace === '현장') {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      url.search =
        '?err=' + encodeURIComponent('현장 직원은 사무 그룹 페이지에 접근할 수 없습니다')
      return NextResponse.redirect(url)
    }
  }

  return response
}

export const config = {
  matcher: [
    // _next 정적 자원과 이미지 확장자를 제외한 모든 경로
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
