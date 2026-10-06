'use client'

import { useState } from 'react'
import { renderPlaintextFromRichText, useValue, type Editor, type TLRichText } from 'tldraw'
import { useT } from '@/i18n/client'
import { branchTarget, type MapDestination } from '@/lib/canvas/assistant'

const KEY = 'mapDestination'
const DESTINATIONS: MapDestination[] = ['document', 'page', 'here', 'under']

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
export function useMapDestination(editor: Editor, opts: { under?: boolean } = {}) {
  const [destination, setDestination] = useState<MapDestination>(() => {
    if (editor.getCurrentPageShapeIds().size === 0) return 'here'
    const last = stored()
    // « Sous l'élément sélectionné » : seulement là où on l'offre, et s'il y a une boîte sélectionnée.
    return last === 'under' && !(opts.under && branchTarget(editor)) ? 'document' : last
  })
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

/**
 * Choix « nouveau schéma / nouvelle page / cette page / sous l'élément sélectionné ».
 * `hereBlocked` : raison d'écarter « cette page » ; `under` : offrir d'ajouter sous la boîte sélectionnée.
 */
export function MapDestinationPicker({
  editor,
  value,
  onChange,
  hereBlocked,
  under,
}: {
  editor: Editor
  value: MapDestination
  onChange(d: MapDestination): void
  hereBlocked?: string
  under?: boolean
}) {
  const t = useT()
  const empty = useValue('page empty', () => editor.getCurrentPageShapeIds().size === 0, [editor])
  // Texte (première ligne) de la boîte sélectionnée, sous laquelle ajouter.
  const target = useValue(
    'branch target',
    () => {
      const id = under ? branchTarget(editor) : null
      const shape = id && editor.getShape(id)
      if (!shape) return null
      const text = renderPlaintextFromRichText(editor, (shape.props as { richText: TLRichText }).richText).split('\n')[0].trim()
      return text.length > 32 ? `${text.slice(0, 31)}…` : text || '…'
    },
    [editor, under]
  )
  const label = (d: MapDestination) =>
    d === 'here' && empty ? t.mapJson.destinations.emptyPage : d === 'under' ? t.mapJson.underElement(target ?? '') : t.mapJson.destinations[d]
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" role="radiogroup" aria-label={t.mapJson.destinationLabel}>
      <span className="text-zinc-500">{t.mapJson.destinationLabel}</span>
      {DESTINATIONS.filter((d) => d !== 'under' || target !== null).map((d) => (
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
