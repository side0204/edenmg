import { redirect } from 'next/navigation'
import { RELOCATION_CATEGORY_SLUG } from '@/lib/relocation'

// 공사 목록 — owner 2026-05-26: 3 카테고리 허브 카드 제거.
//   /relocation 진입 시 청약 목록을 바로 노출. 다른 카테고리는 카테고리
//   페이지 상단의 「더보기」 드롭다운으로 전환.
export default function RelocationIndexPage() {
  redirect(`/relocation/category/${RELOCATION_CATEGORY_SLUG['청약']}`)
}
