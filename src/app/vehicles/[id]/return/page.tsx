import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// 2026-09-20 외근·차량 통합 — 반납은 「도착 · 반납」(/trips/[tripId]/end) 으로 일원화.
export default async function ReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('vehicle_trips')
    .select('id')
    .eq('vehicle_id', id)
    .is('returned_at', null)
    .maybeSingle()
  const trip = data as { id: string } | null
  if (!trip) redirect('/trips?err=' + encodeURIComponent('이 차량은 지금 사용 중이 아닙니다'))
  redirect(`/trips/${trip.id}/end`)
}
