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

// 프로젝트 단위로 구독할 테이블 — 캔버스 동시 작업에 정말 필요한 핵심만.
// (2026-05-25 축소: 11 → 4) 다른 사람이 차수·자재·직선도 등 별도 탭 작업 중일 때
// 캔버스가 새로고침되면 편집 흐름이 끊기는 문제 + WAL 폴링·router.refresh() 부하 ↓.
// 빠진 테이블 변경은 본인이 해당 탭 진입할 때 자연스럽게 최신화됨.
const RELOCATION_TABLES = [
  'relocation_facilities',       // 시설 드래그·추가·삭제·종류 변경
  'relocation_cables',           // 케이블 연결·waypoint·삭제
  'relocation_core_assignments', // 회선·코어·종단 표시
  'relocation_circuits',         // 회선 추가·이름 변경
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
    let cancelled = false
    let channelRef: ReturnType<typeof supabase.channel> | null = null

    const scheduleRefresh = (eventInfo?: { table: string; type: string }) => {
      if (eventInfo) {
        // eslint-disable-next-line no-console
        console.log('[RealtimeSync] event', eventInfo)
      }
      if (refreshTimer) clearTimeout(refreshTimer)
      // 500ms debounce — auto-assign 등 일괄 변경(30+ 이벤트) 안정화 + 빠른 연속
      // 드래그·waypoint 편집 시 router.refresh() 빈도 ↓ (편집 끊김 회피).
      refreshTimer = setTimeout(() => {
        // eslint-disable-next-line no-console
        console.log('[RealtimeSync] router.refresh()')
        router.refresh()
        refreshTimer = null
      }, 500)
    }

    ;(async () => {
      // Realtime 웹소켓이 RLS 필터링을 적용하려면 사용자 JWT 가 필요.
      // @supabase/ssr 의 browserClient 가 auto-attach 해야 하지만,
      // 채널을 만들기 전에 명시적으로 setAuth 호출해 anonymous 접속 가능성 차단.
      const { data: sessionRes } = await supabase.auth.getSession()
      const token = sessionRes.session?.access_token
      // eslint-disable-next-line no-console
      console.log('[RealtimeSync] session token present:', !!token)
      if (token) {
        try {
          await supabase.realtime.setAuth(token)
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[RealtimeSync] setAuth failed', e)
        }
      }
      if (cancelled) return

      // 채널 이름은 프로젝트 단위 — 다른 프로젝트의 변경·presence 와 격리.
      const channel = supabase.channel(`relocation:${projectId}`, {
        config: { presence: { key: selfEmployeeId } },
      })
      channelRef = channel

      // 1) DB 변경 구독 — 모두 project_id 컬럼 보유.
      for (const table of RELOCATION_TABLES) {
        channel.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table,
            filter: `project_id=eq.${projectId}`,
          },
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
    })()

    return () => {
      cancelled = true
      if (refreshTimer) clearTimeout(refreshTimer)
      if (channelRef) supabase.removeChannel(channelRef)
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
