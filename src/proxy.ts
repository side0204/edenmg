import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Next.js 16 에서 middleware 는 proxy 로 이름이 바뀌었다 (동작 동일).
// 이 파일은 모든 요청에 대해:
//   1) Supabase 세션 쿠키를 읽고 필요하면 갱신해 응답 쿠키에 다시 쓰고
//   2) 비로그인 사용자가 보호 경로에 접근하면 /login 으로 리다이렉트한다.
//   3) 현장 직원이 사무 그룹(근태·차량·결재) URL 직접 접근 시 홈으로 리다이렉트.

const PUBLIC_PREFIXES = ['/login', '/signup', '/auth/'] as const

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
