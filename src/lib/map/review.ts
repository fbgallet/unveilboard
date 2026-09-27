// Relecture critique d'un schéma (« unveilboard/review ») : des remarques (incohérence, lacune,
// confusion, type ou relation douteux…) qui visent des éléments, chacune avec, au besoin, une
// correction faite d'opérations de modification (src/lib/map/patch.ts), à appliquer une à une.
// S'y ajoutent des vérifications automatiques, faites par le programme, sans IA. Données pures.

import { z } from 'zod'
import type { KnownVocabulary, MapIssue } from './check'
import type { UnveilMap } from './format'
import { OperationSchema, PATCH_FORMAT, PATCH_VERSION, previewPatch, type PatchOperation } from './patch'

export const REVIEW_FORMAT = 'unveilboard/review'
export const REVIEW_VERSION = 1

export const REMARK_KINDS = [
  'inconsistency',
  'gap',
  'confusion',
  'type',
  'relation',
  'structure',
  'redundancy',
  'wording',
  'sequence',
  'faithfulness',
  'other',
] as const
export type RemarkKind = (typeof REMARK_KINDS)[number]
export const PRIORITIES = ['high', 'medium', 'low'] as const
export type Priority = (typeof PRIORITIES)[number]

const Ref = z.string().min(1).max(64).regex(/^\S+$/)

export const RemarkSchema = z.object({
  id: Ref,
  kind: z.enum(REMARK_KINDS),
  priority: z.enum(PRIORITIES).optional(),
  targets: z.array(Ref).max(20).describe('Elements (or links) the remark is about.'),
  message: z.string().min(1).max(2000).describe('The remark, for the teacher: what is wrong and why, in a few sentences.'),
  operations: z.array(OperationSchema).max(30).optional().describe('The correction, if any: changes applied in order when the user accepts it.'),
})

export const ReviewSchema = z
  .object({
    format: z.literal(REVIEW_FORMAT),
    version: z.literal(REVIEW_VERSION),
    summary: z.string().max(4000).optional().describe('Overall judgement, in a few sentences: strengths and main problems.'),
    remarks: z.array(RemarkSchema).max(60),
  })
  .describe('A critical review of an Unveilboard diagram.')

export type Review = z.infer<typeof ReviewSchema>

/** Vérifications automatiques : leurs codes (messages dans src/i18n, t.review.auto). */
export type AutoCode = 'objection_unanswered' | 'thesis_unsupported' | 'relation_missing' | 'shown_before_parent' | 'long_box'

/** Une remarque à trancher : de l'IA (message écrit) ou du programme (code). */
export interface Remark {
  id: string
  origin: 'ai' | 'auto'
  kind: RemarkKind
  priority: Priority
  targets: string[]
  message?: string
  code?: AutoCode
  operations?: PatchOperation[]
  /** Correction refusée au contrôle (elle n'est pas proposée). */
  fixIssues?: MapIssue[]
}

/**
 * Contrôle une relecture sur le schéma ouvert : cibles connues, corrections valides. `strict` : une
 * correction invalide est une erreur (pour demander au modèle de la corriger) ; sinon, la remarque
 * reste, sans sa correction.
 */
export function checkReview(review: Review, current: UnveilMap, known: KnownVocabulary, strict: boolean): { remarks: Remark[]; issues: MapIssue[] } {
  const ids = new Set([...current.elements.map((e) => e.id), ...(current.links ?? []).map((l) => l.id), ...(current.others ?? []).map((o) => o.id)])
  const issues: MapIssue[] = []
  const remarks = review.remarks.map((r, i): Remark => {
    const targets = r.targets.filter((t) => ids.has(t))
    r.targets.forEach((t, j) => {
      if (!ids.has(t)) issues.push({ level: 'warning', code: 'unknown_target', path: `remarks[${i}].targets[${j}]`, detail: t })
    })
    let fixIssues: MapIssue[] | undefined
    if (r.operations?.length) {
      const preview = previewPatch(current, { format: PATCH_FORMAT, version: PATCH_VERSION, operations: r.operations }, known)
      const errors = preview.issues.filter((x) => x.level === 'error')
      if (errors.length) {
        fixIssues = errors
        for (const e of errors) issues.push({ ...e, level: strict ? 'error' : 'warning', path: `remarks[${i}].${e.path}` })
      }
    }
    return {
      id: r.id,
      origin: 'ai',
      kind: r.kind,
      priority: r.priority ?? 'medium',
      targets,
      message: r.message,
      ...(r.operations?.length && !fixIssues && { operations: r.operations }),
      ...(fixIssues && { fixIssues }),
    }
  })
  return { remarks, issues }
}

/** Longueur au-delà de laquelle une boîte gagnerait à passer son développement en note. */
const LONG_BOX = 220

/**
 * Vérifications du programme, sans IA : objection sans réponse, thèse sans justification, relation
 * manquante dans une carte d'argument, élément montré avant son parent, boîte trop longue.
 * `hiddenShown` : les éléments que la séquence montre alors qu'un ancêtre est caché (checkMap).
 */
export function autoRemarks(map: UnveilMap, hiddenShown: string[] = []): Remark[] {
  const out: Remark[] = []
  const add = (code: AutoCode, kind: RemarkKind, priority: Priority, targets: string[]) =>
    out.push({ id: `auto-${code}-${targets.join('-')}`, origin: 'auto', kind, priority, targets, code })
  const byId = new Map(map.elements.map((e) => [e.id, e]))
  const children = (id: string) => map.elements.filter((e) => e.parent === id)
  const rootOf = (id: string) => {
    let e = byId.get(id)
    const seen = new Set<string>()
    while (e?.parent && byId.has(e.parent) && !seen.has(e.id)) {
      seen.add(e.id)
      e = byId.get(e.parent)
    }
    return e
  }
  const inArgument = (id: string) => rootOf(id)?.tree?.kind === 'argument'

  for (const e of map.elements) {
    if (!inArgument(e.id)) continue
    if (e.relation === 'objects' && !children(e.id).some((c) => c.relation === 'answers' || c.relation === 'refutes')) {
      add('objection_unanswered', 'gap', 'medium', [e.id])
    }
    // Thèse : une réponse à la question racine, ou la racine elle-même quand c'est un énoncé.
    const isThesis = (!e.parent && e.type !== 'question') || (e.relation === 'answers' && byId.get(e.parent ?? '')?.type === 'question')
    if (isThesis && !children(e.id).some((c) => c.relation === 'supports')) add('thesis_unsupported', 'gap', 'medium', [e.id])
    if (e.parent && !e.relation) add('relation_missing', 'relation', 'low', [e.id])
  }
  for (const id of new Set(hiddenShown)) if (byId.has(id)) add('shown_before_parent', 'sequence', 'high', [id])
  for (const e of map.elements) if (e.text.length > LONG_BOX) add('long_box', 'wording', 'low', [e.id])
  return out
}

/** Une opération de correction, en données pour l'interface (qui la met en mots). */
export type OperationSummary =
  | { op: 'add'; text: string; parent?: string; relation?: string; type?: string }
  | { op: 'update'; target: string; fields: { key: string; value: unknown }[] }
  | { op: 'move'; target: string; parent: string; relation?: string | null }
  | { op: 'remove'; target: string }
  | { op: 'link'; from: string; to: string; relation?: string }
  | { op: 'sequence'; mode: 'replace' | 'append'; steps: number }

/** Résumé des opérations ; les éléments sont désignés par leur texte (ou leur identifiant). */
export function summarizeOperations(ops: PatchOperation[], map: UnveilMap): OperationSummary[] {
  const texts = new Map(map.elements.map((e) => [e.id, e.text]))
  for (const op of ops) if (op.op === 'add') texts.set(op.id, op.text)
  const name = (id: string) => texts.get(id) ?? id
  return ops.map((op): OperationSummary => {
    switch (op.op) {
      case 'add':
        return { op: 'add', text: op.text, ...(op.parent && { parent: name(op.parent) }), ...(op.relation && { relation: op.relation }), ...(op.type && { type: op.type }) }
      case 'update':
        return {
          op: 'update',
          target: name(op.id),
          fields: Object.entries(op)
            .filter(([k, v]) => k !== 'op' && k !== 'id' && v !== undefined)
            .map(([key, value]) => ({ key, value })),
        }
      case 'move':
        return { op: 'move', target: name(op.id), parent: name(op.parent), ...(op.relation !== undefined && { relation: op.relation }) }
      case 'remove':
        return { op: 'remove', target: name(op.id) }
      case 'link':
        return { op: 'link', from: name(op.from), to: name(op.to), ...(op.relation && { relation: op.relation }) }
      case 'sequence':
        return { op: 'sequence', mode: op.mode, steps: op.steps.length }
    }
  })
}

/** JSON Schema de la relecture (draft 2020-12). */
export function reviewJsonSchema() {
  return z.toJSONSchema(ReviewSchema, { target: 'draft-2020-12' })
}
