// 현장팀장 후보 목록 — 신규/편집 페이지에서 공유.

import type { createClient } from '@/lib/supabase/server'
import type { ManagerOption } from './SiteForm'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

const PERMISSION_LABEL: Record<Permission, string> = {
  worker: '작업자',
  team_leader: '팀장',
  team_member: '팀원',
  admin: '관리자',
}

export async function fetchManagerCandidates(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<ManagerOption[]> {
  const { data } = await supabase
    .from('employees')
    .select('id, name, permission')
    .in('permission', ['team_leader', 'admin'])
    .eq('is_active', true)
    .order('name')

  return ((data ?? []) as { id: string; name: string; permission: Permission }[]).map((e) => ({
    id: e.id,
    name: e.name,
    permission: PERMISSION_LABEL[e.permission],
  }))
}
