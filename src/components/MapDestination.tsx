'use client'

import { useState } from 'react'
import { useValue, type Editor } from 'tldraw'
import { useT } from '@/i18n/client'
import type { MapDestination } from '@/lib/canvas/assistant'

const KEY = 'mapDestination'
const DESTINATIONS: MapDestination[] = ['document', 'page', 'here']

function stored(): MapDestination {
  try {
    const v = localStorage.getItem(KEY) as MapDestination | null
    return v && DESTINATIONS.includes(v) ? v : 'document'
  } catch {
    return 'document'
  }
}

/**
 * Destination d'un schéma créé : la dernière choisie, sauf sur une page vide, où il se pose
 * d'emblée (plutôt que d'ouvrir un autre document).
 */
export function useMapDestination(editor: Editor) {
  const [destination, setDestination] = useState<MapDestination>(() =>
    editor.getCurrentPageShapeIds().size === 0 ? 'here' : stored()
  )
  const choose = (d: MapDestination) => {
    setDestination(d)
    try {
      localStorage.setItem(KEY, d)
    } catch {
      // stockage indisponible : le choix vaut pour cette fois
    }
  }
  return [destination, choose] as const
}

/** Choix « nouveau schéma / nouvelle page / cette page ». `hereBlocked` : raison d'écarter « cette page ». */
export function MapDestinationPicker({
  editor,
  value,
  onChange,
  hereBlocked,
}: {
  editor: Editor
  value: MapDestination
  onChange(d: MapDestination): void
  hereBlocked?: string
}) {
  const t = useT()
  const empty = useValue('page empty', () => editor.getCurrentPageShapeIds().size === 0, [editor])
  const label = (d: MapDestination) => (d === 'here' && empty ? t.mapJson.destinations.emptyPage : t.mapJson.destinations[d])
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" role="radiogroup" aria-label={t.mapJson.destinationLabel}>
      <span className="text-zinc-500">{t.mapJson.destinationLabel}</span>
      {DESTINATIONS.map((d) => (
        <label key={d} className="flex items-center gap-1" title={d === 'here' ? hereBlocked : undefined}>
          <input
            type="radio"
            name="map-destination"
            checked={value === d}
            disabled={d === 'here' && !!hereBlocked}
            onChange={() => onChange(d)}
          />
          {label(d)}
        </label>
      ))}
    </div>
  )
}
