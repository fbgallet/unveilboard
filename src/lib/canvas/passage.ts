// Construire un schéma à partir de son texte source : un passage du texte (sélectionné, ou glissé
// sur le canevas) devient un élément, isolé ou enfant d'un autre, ou l'extrait d'un élément
// existant. Et, quand le texte change, les extraits de la page sont revérifiés.

import type { Editor, TLShape, TLShapeId, TLShapePartial, VecLike } from 'tldraw'
import { joinExcerpt, locateExcerpt, normalizeForSearch, quoteText, splitExcerpt } from '../map/excerpts'
import { exportMap, textOf } from './mapExport'
import { applyPatch } from './mapPatch'

/** Un passage copié du texte, sans les espaces superflus. */
export const cleanPassage = (text: string) => text.replace(/\s+/g, ' ').trim()

/** Identifiant libre (format) pour un nouvel élément. */
function freshRef(editor: Editor): string {
  const taken = new Set([...exportMap(editor).shapes.keys(), ...editor.getCurrentPageShapes().map((s) => String(s.meta.ref ?? ''))])
  let n = 1
  while (taken.has(`p${n}`)) n++
  return `p${n}`
}

/**
 * Crée un élément à partir d'un passage : son texte est le passage, qui en est aussi l'extrait.
 * `parent` : enfant de cet élément (sans relation : à choisir ensuite) ; sinon, isolé, placé à `at`.
 * `layer` : calque libre où le ranger.
 * Une modification annulable ; l'élément créé est sélectionné.
 */
export function createFromPassage(editor: Editor, passage: string, opts: { at?: VecLike; parent?: TLShapeId; layer?: string | null } = {}): TLShapeId | null {
  const text = cleanPassage(passage)
  if (!text) return null
  const exported = exportMap(editor)
  const parentRef = opts.parent && [...exported.shapes].find(([, s]) => s.node === opts.parent)?.[0]
  const id = freshRef(editor)
  applyPatch(editor, {
    format: 'unveilboard/patch',
    version: 1,
    operations: [{ op: 'add', id, text, origin: 'text', excerpt: text, ...(parentRef && { parent: parentRef }) }],
  })
  const shape = editor.getCurrentPageShapes().find((s) => s.meta.ref === id && s.type !== 'arrow')
  if (!shape) return null
  // Rangé d'office dans le calque actif (calques libres du texte source).
  if (opts.layer) editor.updateShape({ id: shape.id, type: shape.type, meta: { ...shape.meta, layer: opts.layer } } as TLShapePartial)
  if (!parentRef && opts.at) {
    const bounds = editor.getShapePageBounds(shape.id)
    if (bounds) {
      // Centré sur `at`, puis décalé vers le bas tant qu'il recouvre une autre forme.
      const others = editor
        .getCurrentPageShapes()
        .filter((s) => s.id !== shape.id)
        .map((s) => editor.getShapePageBounds(s.id))
        .filter((b) => !!b)
      const box = bounds.clone()
      box.x = opts.at.x - bounds.w / 2
      box.y = opts.at.y - bounds.h / 2
      for (let tries = 0; tries < 30 && others.some((b) => b.collides(box)); tries++) box.y += bounds.h + 24
      editor.updateShape({ id: shape.id, type: shape.type, x: box.x, y: box.y })
    }
  }
  editor.select(shape.id)
  return shape.id
}

/** Les passages cités par un élément (son extrait, coupé aux « […] »). */
export function passagesOf(editor: Editor, id: TLShapeId): string[] {
  const excerpt = editor.getShape(id)?.meta.excerpt
  return typeof excerpt === 'string' ? splitExcerpt(excerpt) : []
}

/** Écrit les passages d'un élément : aucun, l'élément n'est plus tiré du texte. */
function setPassages(editor: Editor, id: TLShapeId, passages: string[], mark: string) {
  const shape = editor.getShape(id)
  if (!shape) return
  editor.markHistoryStoppingPoint(mark)
  const meta = passages.length
    ? { ...shape.meta, origin: 'text', excerpt: joinExcerpt(passages), excerptUnverified: null }
    : { ...shape.meta, origin: null, excerpt: null, excerptUnverified: null }
  editor.updateShape({ id, type: shape.type, meta } as TLShapePartial)
}

/**
 * Ajoute un passage aux extraits d'un élément (le premier en devient l'extrait). Les passages sont
 * rangés dans l'ordre du texte, pour que l'extrait (« A […] B ») s'y retrouve ; un passage déjà
 * cité n'est pas ajouté deux fois.
 */
export function addPassage(editor: Editor, id: TLShapeId, passage: string, sourceText?: string) {
  const added = cleanPassage(passage)
  const current = passagesOf(editor, id)
  if (!added || current.includes(added)) return
  const passages = [...current, added]
  if (sourceText) {
    const normalized = normalizeForSearch(sourceText)
    const at = (p: string) => locateExcerpt(normalized, p)?.[0]?.[0] ?? Infinity
    passages.sort((a, b) => at(a) - at(b))
  }
  setPassages(editor, id, passages, 'extrait du texte')
}

/**
 * Retire les passages d'un élément qui couvrent une plage du texte [from, to[ (un surlignage
 * cliqué). Renvoie le nombre de passages retirés.
 */
export function removePassageAt(editor: Editor, id: TLShapeId, sourceText: string, from: number, to: number): number {
  const normalized = normalizeForSearch(sourceText)
  const passages = passagesOf(editor, id)
  const kept = passages.filter((p) => !(locateExcerpt(normalized, p) ?? []).some(([a, b]) => a < to && b > from))
  if (kept.length === passages.length) return 0
  setPassages(editor, id, kept, 'retirer un extrait')
  return passages.length - kept.length
}

/** Retire un passage des extraits d'un élément (et son surlignage). */
export function removePassage(editor: Editor, id: TLShapeId, index: number) {
  setPassages(editor, id, passagesOf(editor, id).filter((_, k) => k !== index), 'retirer un extrait')
}

/** Élément du schéma (boîte) qui peut recevoir un passage : pas une flèche, ni une suggestion. */
export const isPassageTarget = (shape: TLShape | undefined) => !!shape && shape.type === 'geo' && !shape.meta.suggestion

/**
 * Revérifie les extraits (et citations) de la page sur le texte : introuvable, l'élément est marqué
 * « à vérifier » ; retrouvé, la marque est levée. Renvoie les nombres d'extraits retrouvés et non.
 */
export function reverifyExcerpts(editor: Editor, text: string): { found: number; missing: number } {
  const normalized = normalizeForSearch(text)
  let found = 0
  let missing = 0
  const updates: TLShapePartial[] = []
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type === 'arrow' || shape.meta.suggestion) continue
    const passages = [typeof shape.meta.excerpt === 'string' ? shape.meta.excerpt : '', shape.meta.preset === 'quote' ? quoteText(textOf(editor, shape)) : ''].filter(Boolean)
    if (!passages.length) continue
    const ok = passages.every((p) => locateExcerpt(normalized, p))
    if (ok) found++
    else missing++
    if (ok === !shape.meta.excerptUnverified) continue
    updates.push({ id: shape.id, type: shape.type, meta: { ...shape.meta, excerptUnverified: ok ? null : true } } as TLShapePartial)
  }
  if (updates.length) editor.updateShapes(updates)
  return { found, missing }
}
