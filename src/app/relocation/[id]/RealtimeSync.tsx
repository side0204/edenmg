'use client'

// 지장이설 프로젝트 동시 작업 — Supabase Realtime 동기화.
//
// 동작
//   1) 같은 프로젝트의 relocation_* 테이블 변경을 구독 → 200ms debounce 후 router.refresh()
//      로 다른 사람 작업을 자동 반영. (auto-assign 같은 일괄 작업은 30+ 이벤트가 한 번에
//      터지므로 debounce 가 필수.)
//   2) Presence — 같은 채널에 접속한 직원들을 실시간 추적. 화면 상단 floating 배지에
//      현재 작업 중 사람 수 + 이름을 표시.
//
// 비용
//   Supabase 무료 플랜 한도(동시 접속 200 · 월 메시지 2M) 안에서 충분 (마이그 0059 코멘트 참조).
//
// 충돌 처리
//   - DB exclusion constraint(코어 중복 등) 가 같은 자원 동시 변경을 자동 거부 + 친절 메시지.
//   - 그 외 필드는 last-write-wins. 동시에 같은 시설 위치를 드래그하면 늦은 쪽이 덮어씀.
//   - 본인이 일으킨 변경도 refresh 대상이지만 router.refresh 가 캐시를 재검증하는 정도라
//     성능 영향 미미.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Users } from 'lucide-react'

// 프로젝트 단위로 구독할 테이블 — 모두 project_id 컬럼 보유.
// 자식 테이블(splitter_ports/phase_tasks/task_pairs/migration_circuits) 은 부모 변경으로
// 자연스럽게 refresh 가 일어나 굳이 등록 안 함 (이벤트 노이즈 축소).
const RELOCATION_TABLES = [
  'relocation_projects',
  'relocation_facilities',
  'relocation_cables',
  'relocation_circuits',
  'relocation_core_assignments',
  'relocation_splices',
  'relocation_splitters',
  'relocation_facility_tasks',
  'relocation_facility_materials',
  'relocation_phases',
  'relocation_migrations',
] as const

type PresencePayload = {
  employee_id: string
  name: string
  online_at: string
}

export default function RealtimeSync({
  projectId,
  selfEmployeeId,
  selfName,
}: {
  projectId: string
  selfEmployeeId: string
  selfName: string
}) {
  const router = useRouter()
  const [others, setOthers] = useState<PresencePayload[]>([])

  useEffect(() => {
    const supabase = createClient()
    let refreshTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleRefresh = (eventInfo?: { table: string; type: string }) => {
      if (eventInfo) {
        // eslint-disable-next-line no-console
        console.log('[RealtimeSync] event', eventInfo)
      }
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => {
        // eslint-disable-next-line no-console
        console.log('[RealtimeSync] router.refresh()')
        router.refresh()
        refreshTimer = null
      }, 200)
    }

    // 채널 이름은 프로젝트 단위 — 다른 프로젝트의 변경·presence 와 격리.
    const channel = supabase.channel(`relocation:${projectId}`, {
      config: { presence: { key: selfEmployeeId } },
    })

    // 1) DB 변경 구독 — relocation_* 테이블 중 project_id 필드가 있는 것 전부.
    //    relocation_projects 는 id 가 project_id 역할 → 별도 필터.
    for (const table of RELOCATION_TABLES) {
      const filter =
        table === 'relocation_projects'
          ? `id=eq.${projectId}`
          : `project_id=eq.${projectId}`
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter },
        (payload) => {
          const p = payload as { table?: string; eventType?: string }
          scheduleRefresh({
            table: p.table ?? table,
            type: p.eventType ?? '?',
          })
        },
      )
    }

    // 2) Presence — 같은 채널 접속 직원 추적.
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<PresencePayload>()
      const list: PresencePayload[] = []
      for (const key of Object.keys(state)) {
        if (key === selfEmployeeId) continue // 본인 제외
        const rows = state[key]
        if (rows && rows.length > 0) list.push(rows[0])
      }
      setOthers(list)
    })

    channel.subscribe(async (status, err) => {
      // eslint-disable-next-line no-console
      console.log('[RealtimeSync] subscribe status:', status, err ?? '')
      if (status === 'SUBSCRIBED') {
        // eslint-disable-next-line no-console
        console.log(
          '[RealtimeSync] subscribed channel: relocation:' + projectId,
          'tables:',
          RELOCATION_TABLES.length,
        )
        await channel.track({
          employee_id: selfEmployeeId,
          name: selfName,
          online_at: new Date().toISOString(),
        })
      }
    })

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      supabase.removeChannel(channel)
    }
  }, [projectId, selfEmployeeId, selfName, router])

  // 현재 다른 작업자가 없으면 표시 안 함 — 화면 차지 안 하도록.
  if (others.length === 0) return null

  return (
    <div className="fixed top-16 right-4 z-30 rounded-full border border-emerald-300 bg-white/95 shadow-md backdrop-blur-sm">
      <div
        className="flex items-center gap-1.5 px-3 py-1.5"
        title={`동시 작업 중: ${others.map((o) => o.name).join(', ')}`}
      >
        <Users className="h-3.5 w-3.5 text-emerald-600" />
        <span className="text-[11px] font-semibold text-emerald-700">
          동시 작업 {others.length}명
        </span>
        <span className="text-[11px] text-slate-600 max-w-[12rem] truncate">
          {others.map((o) => o.name).join(', ')}
        </span>
      </div>
    </div>
  )
}
