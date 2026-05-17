import 'server-only'
import { createClient } from '@supabase/supabase-js'

// 서비스 롤 키를 사용하는 클라이언트.
// auth.admin.* 류 (inviteUserByEmail 등) 는 이 클라이언트로만 호출할 수 있다.
// 절대 브라우저 코드에서 import 하지 말 것.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error('.env.local 에 NEXT_PUBLIC_SUPABASE_URL 이 없습니다')
  }
  if (!key) {
    throw new Error(
      '.env.local 에 SUPABASE_SERVICE_ROLE_KEY 가 없습니다. ' +
        'Supabase Dashboard → Project Settings → API → service_role 키를 복사해 추가해주세요.',
    )
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
