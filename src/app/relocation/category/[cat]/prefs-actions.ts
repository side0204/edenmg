'use server'

import { createClient } from '@/lib/supabase/server'

// 공사 설계 목록 — 사용자별 컬럼 prefs 저장 (DB 동기화).
//
// 저장 위치: employees.relocation_list_prefs jsonb (마이그 0069)
// 형식:
//   { "청약": { order, hidden, widths }, "계획": {...}, "지장이설": {...} }
//
// 클라이언트는 debounce 한 뒤 호출 (변경 후 ~500ms)
// 권한: 본인 row 만 update (RLS employees_update_self)

type Cat = '청약' | '계획' | '지장이설'

type CategoryPrefs = {
  order: string[]
  hidden: string[]
  widths: Record<string, number>
}

function isCat(v: string): v is Cat {
  return v === '청약' || v === '계획' || v === '지장이설'
}

function sanitizeCategoryPrefs(raw: unknown): CategoryPrefs | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { order?: unknown; hidden?: unknown; widths?: unknown }
  const order = Array.isArray(r.order)
    ? r.order.filter((v): v is string => typeof v === 'string').slice(0, 100)
    : []
  const hidden = Array.isArray(r.hidden)
    ? r.hidden.filter((v): v is string => typeof v === 'string').slice(0, 100)
    : []
  const widths: Record<string, number> = {}
  if (r.widths && typeof r.widths === 'object') {
    for (const [k, v] of Object.entries(r.widths as Record<string, unknown>)) {
      if (typeof k !== 'string' || k.length > 40) continue
      if (typeof v !== 'number' || !isFinite(v)) continue
      // 합리적 범위로 clamp (60~800 px)
      widths[k] = Math.max(60, Math.min(800, Math.round(v)))
    }
  }
  return { order, hidden, widths }
}

export async function saveRelocationListPrefs(
  category: string,
  prefs: { order: string[]; hidden: string[]; widths: Record<string, number> },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isCat(category)) return { ok: false, error: 'invalid category' }
  const sanitized = sanitizeCategoryPrefs(prefs)
  if (!sanitized) return { ok: false, error: 'invalid prefs' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, relocation_list_prefs')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; relocation_list_prefs: unknown } | null
  if (!me) return { ok: false, error: 'no employee row' }

  const current =
    me.relocation_list_prefs && typeof me.relocation_list_prefs === 'object'
      ? (me.relocation_list_prefs as Record<string, unknown>)
      : {}
  const next = { ...current, [category]: sanitized }

  const { error } = await supabase
    .from('employees')
    .update({ relocation_list_prefs: next })
    .eq('id', me.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
