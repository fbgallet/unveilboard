// Taille voulue d'un schéma créé par l'IA : nombre d'éléments et de niveaux, bornes facultatives
// (réglages de l'IA, modifiables à la création). Données pures, sans tldraw.
//
// Les niveaux se comptent sous la racine, comme le repli par niveau : 1, la racine et ses enfants ;
// la profondeur d'un schéma est celle de sa branche la plus longue.

import type { MapIssue } from './check'
import type { UnveilMap } from './format'

export interface DiagramSize {
  minElements?: number
  maxElements?: number
  minLevels?: number
  maxLevels?: number
}

export const SIZE_LIMITS = { elements: 500, levels: 12 }

/** Bornes lisibles : entiers dans les limites, min et max remis dans l'ordre ; le reste est ignoré. */
export function normalizeSize(raw: unknown): DiagramSize {
  const r = (raw ?? {}) as Record<string, unknown>
  const int = (v: unknown, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= max ? v : undefined)
  const pair = (lo: unknown, hi: unknown, max: number) => {
    const a = int(lo, max)
    const b = int(hi, max)
    return a !== undefined && b !== undefined && a > b ? [b, a] : [a, b]
  }
  const [minElements, maxElements] = pair(r.minElements, r.maxElements, SIZE_LIMITS.elements)
  const [minLevels, maxLevels] = pair(r.minLevels, r.maxLevels, SIZE_LIMITS.levels)
  return Object.fromEntries(
    Object.entries({ minElements, maxElements, minLevels, maxLevels }).filter(([, v]) => v !== undefined)
  ) as DiagramSize
}

export const hasSize = (size: DiagramSize | undefined) => !!size && Object.keys(size).length > 0

/** Nombre d'éléments (boîtes) et de niveaux sous la racine (branche la plus longue). */
export function mapStats(map: Pick<UnveilMap, 'elements'>): { elements: number; levels: number } {
  const parent = new Map(map.elements.filter((e) => e.parent).map((e) => [e.id, e.parent!]))
  let levels = 0
  for (const e of map.elements) {
    let depth = 0
    const seen = new Set<string>()
    for (let p = parent.get(e.id); p && !seen.has(p); p = parent.get(p)) {
      seen.add(p)
      depth++
    }
    levels = Math.max(levels, depth)
  }
  return { elements: map.elements.length, levels }
}

const range = (min: number | undefined, max: number | undefined) =>
  min !== undefined && max !== undefined ? (min === max ? `${min}` : `${min} to ${max}`) : min !== undefined ? `at least ${min}` : `at most ${max}`

/**
 * Schéma hors des bornes. `strict` : des erreurs (le modèle est invité à corriger) ; sinon des
 * avertissements (le schéma reste utilisable).
 */
export function sizeIssues(map: Pick<UnveilMap, 'elements'>, size: DiagramSize | undefined, strict: boolean): MapIssue[] {
  if (!hasSize(size)) return []
  const { elements, levels } = mapStats(map)
  const level = strict ? 'error' : 'warning'
  const issues: MapIssue[] = []
  const { minElements, maxElements, minLevels, maxLevels } = size!
  if ((minElements !== undefined && elements < minElements) || (maxElements !== undefined && elements > maxElements)) {
    issues.push({ level, code: 'size_elements', path: 'elements', detail: `${elements}, expected ${range(minElements, maxElements)}` })
  }
  if ((minLevels !== undefined && levels < minLevels) || (maxLevels !== undefined && levels > maxLevels)) {
    issues.push({ level, code: 'size_levels', path: 'elements', detail: `${levels}, expected ${range(minLevels, maxLevels)}` })
  }
  return issues
}

/**
 * Consigne de taille, pour la création et son plan ; pour une section développée à part, seule la
 * profondeur compte (la taille de la section est donnée par le plan).
 */
export function sizeText(size: DiagramSize | undefined, scope: 'diagram' | 'plan' | 'section'): string {
  if (!hasSize(size)) return ''
  const { minElements, maxElements, minLevels, maxLevels } = size!
  const elements = minElements !== undefined || maxElements !== undefined
  const levels = minLevels !== undefined || maxLevels !== undefined
  if (scope === 'section' && !levels) return ''
  const lines = [
    scope !== 'section' && elements
      ? `- **Elements**: ${range(minElements, maxElements)} boxes in all, the root included${scope === 'plan' ? ' (the root, the section heads and their sizes add up to this)' : ''}.`
      : '',
    levels
      ? `- **Levels**: the longest branch goes ${range(minLevels, maxLevels)} level${maxLevels === 1 || (maxLevels === undefined && minLevels === 1) ? '' : 's'} below the root (level 1: the root's children)${scope === 'section' ? '; the section head is at level 1' : ''}.`
      : '',
  ].filter(Boolean)
  return `**Size set by the user.** These bounds take precedence over the guidance on depth and width above:\n${lines.join('\n')}`
}
