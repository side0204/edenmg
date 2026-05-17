// 현장소장 후보 목록 — 신규/편집 페이지에서 공유.

import type { createClient } from '@/lib/supabase/server'
import type { ManagerOption } from './SiteForm'

type Permission = 'worker' | 'foreman' | 'admin' | 'ceo'

const PERMISSION_LABEL: Record<Permission, string> = {
  worker: '작업자',
  foreman: '소장',
  admin: '관리자',
  ceo: '대표',
}

export async function fetchManagerCandidates(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<ManagerOption[]> {
  const { data } = await supabase
    .from('employees')
    .select('id, name, permission')
    .in('permission', ['foreman', 'admin', 'ceo'])
    .eq('is_active', true)
    .order('name')

  return ((data ?? []) as { id: string; name: string; permission: Permission }[]).map((e) => ({
    id: e.id,
    name: e.name,
    permission: PERMISSION_LABEL[e.permission],
  }))
}
