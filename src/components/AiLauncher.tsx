'use client'

import { useEffect, useRef, useState } from 'react'
import { useEditor, useValue, type TLShapeId } from 'tldraw'
import { useT } from '@/i18n/client'
import { reviewAtom, reviewOpenAtom } from '@/lib/canvas/review'
import { modeAtom } from '@/lib/presentation/store'
import { aiSettingsOpenAtom } from './AiSettingsDialog'
import { elementAiAtom } from './ElementAi'
import { mapImportOpenAtom, openAssistant } from './MapJsonDialog'
import { sourceDialogOpenAtom } from './SourceDialog'

/**
 * Accès permanent à l'IA, en haut à droite du canevas (en édition) : une icône discrète qui ouvre
 * un menu (relecture critique, à partir de la sélection, séquence, consigne, texte source, JSON,
 * réglages). Le menu ☰ garde les mêmes entrées.
 */
export function AiLauncher() {
  const t = useT()
  const editor = useEditor()
  const mode = useValue(modeAtom)
  const reviewOpen = useValue(reviewOpenAtom)
  const remarks = useValue('pending remarks', () => reviewAtom.get().remarks.length, [])
  const selected = useValue(
    'ai selection',
    () => {
      const shape = editor.getOnlySelectedShape()
      return shape?.type === 'geo' ? shape.id : null
    },
    [editor]
  )
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onDown, { capture: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown, { capture: true })
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (mode !== 'edit') return null
  const run = (action: () => void) => () => {
    setOpen(false)
    action()
  }
  const items: { id: string; label: string; action: () => void; disabled?: boolean; hint?: string }[] = [
    {
      id: 'review',
      label: remarks ? t.launcher.reviewCount(remarks) : t.review.menu,
      action: () => reviewOpenAtom.set(!reviewOpen),
    },
    {
      id: 'element',
      label: t.launcher.fromSelection,
      action: () => selected && elementAiAtom.set(selected as TLShapeId),
      disabled: !selected,
      hint: selected ? undefined : t.launcher.selectFirst,
    },
    { id: 'sequence', label: t.tree.sequenceAi, action: () => openAssistant('sequence') },
    { id: 'assistant', label: t.assistant.menu, action: () => openAssistant() },
    { id: 'source', label: t.source.menu, action: () => sourceDialogOpenAtom.set(true) },
    { id: 'json', label: t.mapJson.menuImport, action: () => mapImportOpenAtom.set(true) },
    { id: 'settings', label: t.ai.settingsMenu, action: () => aiSettingsOpenAtom.set(true) },
  ]

  return (
    <div className="ai-launcher" ref={ref}>
      <button
        className={`ai-launcher-icon ${open ? 'ai-launcher-icon-on' : ''}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t.launcher.menuLabel}
        title={t.launcher.menuLabel}
        onClick={() => setOpen(!open)}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
          <path d="M12 2.5l2.1 6.4 6.4 2.1-6.4 2.1L12 19.5l-2.1-6.4L3.5 11l6.4-2.1z" fill="currentColor" />
          <path d="M19 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" fill="currentColor" />
        </svg>
        {/* Remarques de relecture en attente : un point (le nombre est dans le menu). */}
        {remarks > 0 && <span className="ai-launcher-dot" />}
      </button>
      {open && (
        <div className="ai-launcher-menu" role="menu" aria-label={t.launcher.menuLabel}>
          {items.map((item) => (
            <button key={item.id} role="menuitem" disabled={item.disabled} title={item.hint} onClick={run(item.action)}>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
