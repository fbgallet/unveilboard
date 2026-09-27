'use client'

import { useEditor, useValue, type Editor, type TLShapeId } from 'tldraw'
import { useT } from '@/i18n/client'
import { modeAtom } from '@/lib/presentation/store'
import {
  acceptAllSuggestions,
  acceptSuggestion,
  pendingSuggestions,
  rejectAllSuggestions,
  rejectSuggestion,
  suggestionOf,
} from '@/lib/canvas/suggestions'

/** Sur le canevas : ✓ et ✗ au coin de chaque suggestion de l'IA en attente (boîte ou lien). */
export function SuggestionBadges() {
  const t = useT()
  const editor = useEditor()
  const badges = useValue(
    'suggestion badges',
    () => {
      if (modeAtom.get() !== 'edit') return []
      return pendingSuggestions(editor).flatMap((s) => {
        const b = editor.getShapePageBounds(s.id)
        if (!b || editor.isShapeHidden(s.id)) return []
        // Boîte : coin supérieur droit ; lien : son milieu.
        const at = s.type === 'arrow' ? { x: b.midX, y: b.midY } : { x: b.maxX, y: b.minY }
        return [{ id: s.id, ...at, rationale: suggestionOf(s)?.rationale ?? '' }]
      })
    },
    [editor]
  )
  const zoom = useValue('zoom', () => editor.getZoomLevel(), [editor])
  return (
    <>
      {badges.map((b) => (
        <div
          key={b.id}
          className="suggestion-badges"
          style={{ left: b.x, top: b.y, transform: `scale(${1 / zoom}) translate(-50%, -50%)` }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button className="suggestion-accept" title={[t.suggestions.accept, b.rationale].filter(Boolean).join(' · ')} aria-label={t.suggestions.accept} onClick={() => acceptSuggestion(editor, b.id)}>
            ✓
          </button>
          <button className="suggestion-reject" title={t.suggestions.reject} aria-label={t.suggestions.reject} onClick={() => rejectSuggestion(editor, b.id)}>
            ✕
          </button>
        </div>
      ))}
    </>
  )
}

/** Barre des suggestions en attente : leur nombre, la raison de celle sélectionnée, tout accepter ou tout écarter. */
export function SuggestionBar({ editor }: { editor: Editor }) {
  const t = useT()
  const info = useValue(
    'suggestion bar',
    () => {
      const pending = pendingSuggestions(editor)
      if (!pending.length) return null
      const selected = editor.getOnlySelectedShape()
      const rationale = selected && pending.some((s) => s.id === selected.id) ? (suggestionOf(selected)?.rationale ?? '') : ''
      return { count: pending.length, rationale, selected: selected?.id as TLShapeId | undefined }
    },
    [editor]
  )
  if (!info) return null
  return (
    <div className="suggestion-bar" role="region" aria-label={t.suggestions.title}>
      <strong>{t.suggestions.count(info.count)}</strong>
      {info.rationale && <span className="suggestion-rationale" title={info.rationale}>{info.rationale}</span>}
      <button className="btn-xs" onClick={() => acceptAllSuggestions(editor)}>
        {t.suggestions.acceptAll}
      </button>
      <button className="btn-xs" onClick={() => rejectAllSuggestions(editor)}>
        {t.suggestions.rejectAll}
      </button>
    </div>
  )
}
