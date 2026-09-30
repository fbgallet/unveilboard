// Plan d'un schéma riche (« unveilboard/plan ») : la racine et les sections qui en partent, chacune
// avec ce qu'elle doit développer. Une IA le propose, l'utilisateur le relit, puis chaque section
// est développée à part (en parallèle), avant les liens et la séquence (src/lib/ai/staged.ts).
//
// Le plan devient d'abord un squelette (la racine et les têtes de section), qui passe les contrôles
// habituels ; chaque développement est une modification (« unveilboard/patch ») de ce squelette,
// limitée à sa section.

import { z } from 'zod'
import { TREE_DIRECTIONS } from '../tree/layout'
import { checkMap, type KnownVocabulary, type MapIssue } from './check'
import { MAP_FORMAT, MAP_VERSION, type UnveilMap } from './format'
import { extractJson } from './read'
import { PATCH_FORMAT, PatchSchema, previewPatch, type MapPatch } from './patch'

export const PLAN_FORMAT = 'unveilboard/plan'
export const PLAN_VERSION = 1

const Ref = z.string().min(1).max(64).regex(/^\S+$/)
const VocabularyId = z.string().min(1).max(64).regex(/^\S+$/)

export const PlanSectionSchema = z.object({
  id: Ref,
  text: z.string().min(1).max(4000).describe('The head element of the section: a real box (a complete claim, or the notion and its gist), not a title.'),
  type: VocabularyId.optional(),
  relation: VocabularyId.optional().describe('Relation of the section head to the root.'),
  brief: z
    .string()
    .max(2000)
    .describe('What the section must develop (points to make, sources), and what it leaves to the other sections.'),
  size: z.number().int().min(1).max(40).optional().describe('Target number of elements under the section head.'),
  synthesis: z.boolean().optional().describe('Draws on the other sections (overall interpretation, conclusion): developed after them.'),
  paragraphs: z
    .tuple([z.number().int().min(1), z.number().int().min(1)])
    .optional()
    .describe('From a source text: the numbered paragraphs the section analyses, [first, last].'),
})

export const PlanSchema = z
  .object({
    format: z.literal(PLAN_FORMAT),
    version: z.literal(PLAN_VERSION),
    title: z.string().max(200),
    lang: z.string().max(20).optional(),
    kind: z.enum(['argument', 'mindmap']),
    direction: z.enum(TREE_DIRECTIONS).optional(),
    root: z.object({ id: Ref, text: z.string().min(1).max(4000), type: VocabularyId.optional() }),
    pattern: z.string().max(2000).optional().describe('Structure shared by all sections, followed the same way by each.'),
    summary: z.string().max(4000).optional().describe('The logic of the plan, for the user.'),
    sections: z.array(PlanSectionSchema).min(1).max(12),
  })
  .describe('Plan of a rich diagram: the root, and the sections developed separately.')

export type DiagramPlan = z.infer<typeof PlanSchema>
export type PlanSection = z.infer<typeof PlanSectionSchema>

/** Plan gardé avec le schéma construit « en direct » : le plan, et la demande de départ. */
export interface PlanRecord {
  plan: DiagramPlan
  /** La demande de l'utilisateur à l'origine du plan. */
  request: string
  /** Développer au besoin dans la note des éléments (option de la demande). */
  notes?: boolean
  /**
   * Schéma tiré d'un texte : le texte (chaque section en analyse un passage), et sa référence. Gardé
   * à part dans le document (src/lib/canvas/source.ts) : ici, seulement le temps de l'ouvrir.
   */
  source?: { text: string; label?: string }
  /** Écrire la séquence à la finition (par défaut : oui). */
  withSequence?: boolean
}

/**
 * Le squelette du schéma : la racine, et une tête par section. Tiré d'un texte (`source`), elles
 * sont des reconstructions de l'analyse.
 */
export function skeletonMap(plan: DiagramPlan, opts: { source?: boolean } = {}): UnveilMap {
  const origin = opts.source ? { origin: 'reconstruction' as const } : {}
  return {
    format: MAP_FORMAT,
    version: MAP_VERSION,
    title: plan.title,
    ...(plan.lang && { lang: plan.lang }),
    elements: [
      {
        id: plan.root.id,
        text: plan.root.text,
        ...(plan.root.type && { type: plan.root.type }),
        tree: { kind: plan.kind, ...(plan.direction && { direction: plan.direction }) },
        ...origin,
      },
      ...plan.sections.map((s) => ({
        id: s.id,
        text: s.text,
        parent: plan.root.id,
        ...origin,
        ...(s.type && { type: s.type }),
        ...(s.relation && { relation: s.relation }),
      })),
    ],
  }
}

export type PlanResult = { ok: true; plan: DiagramPlan; issues: MapIssue[] } | { ok: false; issues: MapIssue[] }

/**
 * Lit et contrôle un plan (texte d'une IA, ou plan modifié par l'utilisateur). `paragraphs` : plan
 * d'un texte, nombre de ses paragraphes (les plages des sections doivent s'y trouver).
 */
export function readPlan(input: string | unknown, known: KnownVocabulary, opts: { paragraphs?: number } = {}): PlanResult {
  const data = typeof input === 'string' ? extractJson(input) : input
  if (data === undefined) return { ok: false, issues: [{ level: 'error', code: 'invalid_json', path: '' }] }
  if ((data as { format?: unknown } | null)?.format !== PLAN_FORMAT) {
    return { ok: false, issues: [{ level: 'error', code: 'wrong_format', path: 'format', detail: `expected "${PLAN_FORMAT}"` }] }
  }
  const parsed = PlanSchema.safeParse(data)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({
      level: 'error' as const,
      code: 'invalid_format' as const,
      path: i.path.map((p) => (typeof p === 'number' ? `[${p}]` : `.${String(p)}`)).join('').replace(/^\./, ''),
      detail: i.message,
    }))
    return { ok: false, issues }
  }
  const plan = parsed.data
  // Chemins du squelette → chemins du plan (elements[0] : la racine ; elements[k] : sections[k-1]).
  const planPath = (path: string) => path.replace(/^elements\[(\d+)\]/, (_, k) => (k === '0' ? 'root' : `sections[${Number(k) - 1}]`))
  const issues = checkMap(skeletonMap(plan), known)
    .filter((i) => i.code !== 'no_note')
    .map((i) => ({ ...i, path: planPath(i.path) }))
  if (opts.paragraphs) {
    plan.sections.forEach((s, i) => {
      if (s.paragraphs && Math.max(...s.paragraphs) > opts.paragraphs!) {
        issues.push({ level: 'error', code: 'invalid_format', path: `sections[${i}].paragraphs`, detail: `the text has ${opts.paragraphs} paragraphs` })
      }
    })
  }
  if (issues.some((i) => i.level === 'error')) return { ok: false, issues }
  return { ok: true, plan, issues }
}

// ---------- Plan d'un schéma existant ----------

/**
 * Ce qu'il faut ajouter au schéma pour adopter un plan : la racine et les têtes de section qui n'y
 * sont pas encore (les autres sont reprises telles quelles, leur texte mis à jour s'il a changé
 * dans le plan). null : rien à changer.
 */
export function planPatch(plan: DiagramPlan, map: UnveilMap): MapPatch | null {
  const existing = new Map(map.elements.map((e) => [e.id, e]))
  const operations: MapPatch['operations'] = []
  const root = existing.get(plan.root.id)
  if (!root) {
    operations.push({
      op: 'add',
      id: plan.root.id,
      text: plan.root.text,
      ...(plan.root.type && { type: plan.root.type }),
      tree: { kind: plan.kind, ...(plan.direction && { direction: plan.direction }) },
    })
  } else if (root.text !== plan.root.text) operations.push({ op: 'update', id: plan.root.id, text: plan.root.text })
  for (const s of plan.sections) {
    const head = existing.get(s.id)
    if (!head) {
      operations.push({ op: 'add', id: s.id, text: s.text, parent: plan.root.id, ...(s.type && { type: s.type }), ...(s.relation && { relation: s.relation }) })
    } else if (head.text !== s.text) operations.push({ op: 'update', id: s.id, text: s.text })
  }
  return operations.length ? { format: PATCH_FORMAT, version: 1, operations } : null
}

// ---------- Développement d'une section ----------

export type SectionPatchResult =
  | {
      ok: true
      patch: MapPatch
      map: UnveilMap
      added: number
      issues: MapIssue[]
      /** Tiré d'un texte : éléments ajoutés dont l'extrait est introuvable (à vérifier). */
      unverified?: string[]
    }
  | { ok: false; issues: MapIssue[] }

/**
 * Lit la réponse d'une étape (développement d'une section, ou finition) et l'applique au schéma en
 * cours. `allowed` : opérations permises ; `section` : les ajouts doivent descendre de cette tête.
 * Un identifiant déjà pris (par une autre section, développée en parallèle) est renommé.
 */
export function readStepPatch(
  input: string | unknown,
  map: UnveilMap,
  known: KnownVocabulary,
  opts: {
    allowed: MapPatch['operations'][number]['op'][]
    section?: string
    /** Identifiants pris hors du schéma (suggestions en attente sur le canevas). */
    taken?: Iterable<string>
  }
): SectionPatchResult {
  const data = typeof input === 'string' ? extractJson(input) : input
  if (data === undefined) return { ok: false, issues: [{ level: 'error', code: 'invalid_json', path: '' }] }
  if ((data as { format?: unknown } | null)?.format !== PATCH_FORMAT) {
    return { ok: false, issues: [{ level: 'error', code: 'wrong_format', path: 'format', detail: `expected "${PATCH_FORMAT}"` }] }
  }
  const parsed = PatchSchema.safeParse(data)
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((i) => ({ level: 'error', code: 'invalid_format', path: i.path.join('.'), detail: i.message })) }
  }
  const patch = renameTaken(parsed.data, new Set([...map.elements.map((e) => e.id), ...(map.links ?? []).map((l) => l.id), ...(opts.taken ?? [])]))
  const issues: MapIssue[] = []
  const branch = new Set(opts.section ? [opts.section] : [])
  patch.operations.forEach((op, i) => {
    if (!opts.allowed.includes(op.op)) {
      issues.push({ level: 'error', code: 'operation_not_allowed', path: `operations[${i}].op`, detail: `only ${opts.allowed.join(', ')}` })
    } else if (op.op === 'add' && opts.section) {
      if (op.parent && branch.has(op.parent)) branch.add(op.id)
      else issues.push({ level: 'error', code: 'outside_section', path: `operations[${i}].parent`, detail: `must descend from ${opts.section}` })
    }
  })
  if (issues.length) return { ok: false, issues }
  const preview = previewPatch(map, patch, known)
  const errors = preview.issues.filter((i) => i.level === 'error')
  if (errors.length) return { ok: false, issues: errors }
  return { ok: true, patch, map: preview.map, added: patch.operations.filter((o) => o.op === 'add').length, issues: preview.issues }
}

/** Renomme les identifiants ajoutés déjà pris (et leurs mentions plus loin dans la modification). */
export function renameTaken(patch: MapPatch, taken: Set<string>): MapPatch {
  const used = new Set(taken)
  const renamed = new Map<string, string>()
  const ref = (id: string) => renamed.get(id) ?? id
  const operations = patch.operations.map((op) => {
    if (op.op === 'add' || op.op === 'link') {
      let id = op.id
      if (used.has(id)) {
        let n = 2
        while (used.has(`${op.id}-${n}`)) n++
        id = `${op.id}-${n}`
        renamed.set(op.id, id)
      }
      used.add(id)
      if (op.op === 'add') return { ...op, id, ...(op.parent && { parent: ref(op.parent) }) }
      return { ...op, id, from: ref(op.from), to: ref(op.to) }
    }
    return op
  })
  return renamed.size ? { ...patch, operations } : patch
}
