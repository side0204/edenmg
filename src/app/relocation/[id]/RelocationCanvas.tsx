'use client'

import { useState, type ReactNode } from 'react'
import { Network, Map as MapIcon } from 'lucide-react'
import MapCanvas, { type MapFacility, type MapCable } from './MapCanvas'

// 지장이설 캔버스 — 「도식」(기존 TopologyCanvas) / 「지도」(카카오맵) 토글.
//   도식 모드: 코어구성도·직선도용 schematic 캔버스 (x_hint/y_hint)
//   지도 모드: 실제 GPS 좌표로 시설물 배치·검토 (lat/lng)
// schematic 은 page 에서 만든 TopologyCanvas 엘리먼트를 그대로 받아 토글만 한다.

type ViewMode = 'schematic' | 'map'

export default function RelocationCanvas({
  schematic,
  projectId,
  facilities,
  cables,
}: {
  schematic: ReactNode
  projectId: string
  facilities: MapFacility[]
  cables: MapCable[]
}) {
  const [mode, setMode] = useState<ViewMode>('schematic')

  return (
    <div className="space-y-2">
      {/* 모드 토글 */}
      <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 w-fit">
        <ModeButton
          active={mode === 'schematic'}
          onClick={() => setMode('schematic')}
          icon={<Network className="h-4 w-4" />}
          label="도식"
        />
        <ModeButton
          active={mode === 'map'}
          onClick={() => setMode('map')}
          icon={<MapIcon className="h-4 w-4" />}
          label="지도"
        />
      </div>

      {mode === 'schematic' ? (
        schematic
      ) : (
        <MapCanvas projectId={projectId} facilities={facilities} cables={cables} />
      )}
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ' +
        (active
          ? 'bg-slate-900 text-white shadow-sm'
          : 'text-slate-600 hover:text-slate-900')
      }
    >
      {icon}
      {label}
    </button>
  )
}
