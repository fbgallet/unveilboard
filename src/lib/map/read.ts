// Lecture d'un JSON collé (export, réponse d'une IA) : un schéma entier (« unveilboard/map ») ou
// des modifications du schéma ouvert (« unveilboard/patch »). La réponse d'une IA peut entourer le
// JSON de texte ou d'un bloc de code : on l'en extrait.

import type { z } from 'zod'
import { parseMap, type KnownVocabulary, type MapIssue } from './check'
import { MAP_FORMAT, type UnveilMap } from './format'
import { PATCH_FORMAT, PatchSchema, previewPatch, type MapPatch } from './patch'
import { REVIEW_FORMAT, ReviewSchema, checkReview, type Remark, type Review } from './review'

export type ReadResult =
  | { kind: 'map'; ok: true; map: UnveilMap; issues: MapIssue[] }
  | { kind: 'patch'; ok: true; patch: MapPatch; result: UnveilMap; issues: MapIssue[] }
  | { kind: 'review'; ok: true; review: Review; remarks: Remark[]; issues: MapIssue[] }
  | { kind: 'map' | 'patch' | 'review' | 'unknown'; ok: false; issues: MapIssue[] }

/**
 * Lit un texte (ou un objet déjà lu). `current` : le schéma ouvert, exporté, auquel s'appliquent
 * les modifications (null : pas de schéma ouvert, les modifications sont refusées).
 */
export function readJson(
  input: string | unknown,
  known: KnownVocabulary,
  current: UnveilMap | null,
  /** strict : une correction invalide dans une relecture est une erreur (première réponse d'une IA). */
  opts: { zodError?: z.core.$ZodErrorMap; strict?: boolean } = {}
): ReadResult {
  let data = input
  if (typeof input === 'string') {
    data = extractJson(input)
    if (data === undefined) return { kind: 'unknown', ok: false, issues: [{ level: 'error', code: 'invalid_json', path: '' }] }
  }
  const format = (data as { format?: unknown } | null)?.format
  if (format === MAP_FORMAT) return { kind: 'map', ...parseMap(data, known, opts) }
  if (format === REVIEW_FORMAT && current) {
    const parsed = ReviewSchema.safeParse(data, opts.zodError && { error: opts.zodError })
    if (!parsed.success) return { kind: 'review', ok: false, issues: zodIssues(parsed.error.issues) }
    const { remarks, issues } = checkReview(parsed.data, current, known, !!opts.strict)
    if (issues.some((i) => i.level === 'error')) return { kind: 'review', ok: false, issues }
    return { kind: 'review', ok: true, review: parsed.data, remarks, issues }
  }
  if (format !== PATCH_FORMAT || !current) {
    return { kind: 'unknown', ok: false, issues: [{ level: 'error', code: 'wrong_format', path: 'format' }] }
  }
  const parsed = PatchSchema.safeParse(data, opts.zodError && { error: opts.zodError })
  if (!parsed.success) return { kind: 'patch', ok: false, issues: zodIssues(parsed.error.issues) }
  const { map, issues } = previewPatch(current, parsed.data, known)
  if (issues.some((i) => i.level === 'error')) return { kind: 'patch', ok: false, issues }
  return { kind: 'patch', ok: true, patch: parsed.data, result: map, issues }
}

function zodIssues(issues: z.core.$ZodIssue[]): MapIssue[] {
  return issues.map((i) => ({
    level: 'error',
    code: 'invalid_format',
    path: i.path.map((p) => (typeof p === 'number' ? `[${p}]` : `.${String(p)}`)).join('').replace(/^\./, ''),
    detail: i.message,
  }))
}

/** Le JSON d'un texte : tel quel, sinon le premier bloc de code, sinon de la première « { » à la dernière « } ». */
export function extractJson(text: string): unknown {
  const attempts = [text, text.match(/```(?:json)?\s*\n([\s\S]*?)```/)?.[1], text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)]
  for (const attempt of attempts) {
    if (!attempt?.trim()) continue
    try {
      return JSON.parse(attempt)
    } catch {
      // essai suivant
    }
  }
  return undefined
}
