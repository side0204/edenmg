import { redirect } from 'next/navigation'

// 2026-09-20 외근·차량 통합 — 차량 출고는 「외근 시작」(/trips/new) 으로 일원화.
export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/trips/new?vehicle=${encodeURIComponent(id)}`)
}
