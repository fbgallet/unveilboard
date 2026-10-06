// Aspect propre d'une boîte (forme, couleur, fond, trait, taille, police) : ce qui la distingue de
// l'aspect que lui donne son type (son préréglage), ou de celui d'une boîte sans type. C'est le
// champ `style` du format JSON ; une IA s'en sert pour mettre un schéma en forme.

import type { Editor, TLShape, TLShapeId, TLShapePartial } from 'tldraw'
import { ElementStyleSchema, type ElementStyle } from '../map/format'
import { LINKED } from '../presets/presets'
import { presetById } from './presets'
import { functionColorOf } from './tree'

const KEYS = ['geo', 'color', 'fill', 'dash', 'size', 'font'] as const

/** Aspect d'une boîte sans type. La police n'en fait pas partie : « draw » ou « sans » selon l'origine de la boîte. */
const PLAIN: ElementStyle = { geo: 'rectangle', color: 'black', fill: 'none', dash: 'draw', size: 'm' }

/** Ce qui distingue la boîte de l'aspect de son type ; undefined si rien. */
export function ownStyle(editor: Editor, shape: TLShape): ElementStyle | undefined {
  if (shape.type !== 'geo') return undefined
  const preset = presetById(editor, shape.meta.preset as string | undefined)
  if (preset?.id === LINKED) return undefined
  const base: Record<string, unknown> = { ...PLAIN, ...(preset?.target === 'shape' ? preset.style : {}) }
  // Carte d'argument : la couleur (et le fond) d'un nœud relié disent sa fonction, pas son aspect propre.
  const byFunction = !!functionColorOf(editor, shape.id)
  const props = shape.props as unknown as Record<string, unknown>
  const own: Record<string, unknown> = {}
  for (const key of KEYS) {
    if (byFunction && (key === 'color' || key === 'fill')) continue
    if (key === 'font' && base.font === undefined && (props.font === 'draw' || props.font === 'sans')) continue
    // Valeurs hors du format (une forme de tldraw qu'il ne connaît pas) : laissées de côté.
    if (props[key] !== undefined && props[key] !== base[key] && ElementStyleSchema.shape[key].safeParse(props[key]).success) own[key] = props[key]
  }
  return Object.keys(own).length ? (own as ElementStyle) : undefined
}

/** Donne à la boîte l'aspect demandé (seules les clés données). */
export function applyOwnStyle(editor: Editor, id: TLShapeId, style: ElementStyle | undefined) {
  const shape = editor.getShape(id)
  if (!shape || shape.type !== 'geo' || !style) return
  const props = Object.fromEntries(Object.entries(style).filter(([, v]) => v !== undefined))
  if (Object.keys(props).length) editor.updateShape({ id, type: 'geo', props } as TLShapePartial)
}

/** Rend à la boîte l'aspect de son type (ou d'une boîte sans type). */
export function resetOwnStyle(editor: Editor, id: TLShapeId) {
  const shape = editor.getShape(id)
  if (!shape || shape.type !== 'geo') return
  const preset = presetById(editor, shape.meta.preset as string | undefined)
  applyOwnStyle(editor, id, { ...PLAIN, ...(preset?.target === 'shape' ? (preset.style as ElementStyle) : {}) })
}
