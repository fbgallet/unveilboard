// Contrôle d'un schéma au format « unveilboard/map » : structure (Zod), puis cohérence (références,
// arbre, vocabulaire, séquence simulée par le moteur). Données pures, sans tldraw.
//
// Chaque problème a un code et un chemin (« elements[3].parent ») : l'interface les traduit
// (src/i18n), et une IA peut s'en servir pour corriger sa réponse (formatIssue, en anglais).

import type { z } from 'zod'
import { computeStage, stateOf } from '../sequence/compute'
import { MODAL_NATURES } from '../presets/presets'
import { SEQUENCE_VERSION, type ShapeRef } from '../sequence/types'
import { MapSchema, NODE_ONLY_ACTIONS, type UnveilMap } from './format'
import { toEngineSteps, type RefShapes } from './sequence'

export type IssueCode =
  | 'invalid_json'
  | 'invalid_format'
  | 'duplicate_id'
  | 'unknown_parent'
  | 'cycle'
  | 'relation_without_parent'
  | 'reasoning_without_relation'
  | 'unknown_type'
  | 'unknown_relation'
  | 'tree_on_child'
  | 'modality_ignored'
  | 'unknown_link_end'
  | 'unknown_target'
  | 'part_ignored'
  | 'no_note'
  | 'shown_but_hidden'
  | 'unknown_element'
  | 'wrong_format'
  | 'excerpt_not_found'
  | 'quote_not_found'
  | 'operation_not_allowed'
  | 'outside_section'
  | 'size_elements'
  | 'size_levels'

export interface MapIssue {
  level: 'error' | 'warning'
  code: IssueCode
  /** Chemin dans le JSON (« elements[3].parent »), vide pour le document entier. */
  path: string
  /** Détail : identifiant en cause, message de Zod… */
  detail?: string
}

/** Vocabulaire connu de l'instance (préréglages communs et copies du document). */
export interface KnownVocabulary {
  types: Iterable<string>
  relations: Iterable<string>
}

export type ParseResult = { ok: true; map: UnveilMap; issues: MapIssue[] } | { ok: false; issues: MapIssue[] }

/** Lit un texte JSON (ou un objet déjà lu) et le contrôle. Refusé s'il y a au moins une erreur. */
export function parseMap(
  input: string | unknown,
  known: KnownVocabulary,
  /** Messages de Zod dans une autre langue (ex. : z.locales.fr().localeError). */
  opts: { zodError?: z.core.$ZodErrorMap } = {}
): ParseResult {
  let data = input
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input)
    } catch (e) {
      return { ok: false, issues: [{ level: 'error', code: 'invalid_json', path: '', detail: e instanceof Error ? e.message : undefined }] }
    }
  }
  const parsed = MapSchema.safeParse(data, opts.zodError && { error: opts.zodError })
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (i): MapIssue => ({ level: 'error', code: 'invalid_format', path: pathString(i.path), detail: i.message })
    )
    return { ok: false, issues }
  }
  const issues = checkMap(parsed.data, known)
  return issues.some((i) => i.level === 'error') ? { ok: false, issues } : { ok: true, map: parsed.data, issues }
}

function pathString(path: PropertyKey[]) {
  return path.map((p, i) => (typeof p === 'number' ? `[${p}]` : `${i ? '.' : ''}${String(p)}`)).join('')
}

/** Contrôles de cohérence d'un schéma dont la structure est valide. */
export function checkMap(map: UnveilMap, known: KnownVocabulary): MapIssue[] {
  const issues: MapIssue[] = []
  const error = (code: IssueCode, path: string, detail?: string) => issues.push({ level: 'error', code, path, detail })
  const warn = (code: IssueCode, path: string, detail?: string) => issues.push({ level: 'warning', code, path, detail })

  const types = new Set(known.types)
  const relations = new Set(known.relations)
  for (const v of map.vocabulary ?? []) (v.kind === 'type' ? types : relations).add(v.id)

  // Identifiants : un seul espace de noms pour les éléments, les liens et les autres formes.
  const kinds = new Map<string, 'element' | 'link' | 'other'>()
  const claim = (id: string, kind: 'element' | 'link' | 'other', path: string) => {
    if (kinds.has(id)) error('duplicate_id', path, id)
    else kinds.set(id, kind)
  }
  map.elements.forEach((e, i) => claim(e.id, 'element', `elements[${i}].id`))
  map.links?.forEach((l, i) => claim(l.id, 'link', `links[${i}].id`))
  map.others?.forEach((o, i) => claim(o.id, 'other', `others[${i}].id`))

  // Éléments : parent, relation, type.
  const parent = new Map<string, string>()
  map.elements.forEach((e, i) => {
    const at = `elements[${i}]`
    if (e.parent !== undefined) {
      if (kinds.get(e.parent) !== 'element') error('unknown_parent', `${at}.parent`, e.parent)
      else parent.set(e.id, e.parent)
    } else {
      if (e.relation) error('relation_without_parent', `${at}.relation`, e.relation)
    }
    if (e.parent !== undefined && e.tree) warn('tree_on_child', `${at}.tree`, e.id)
    if (e.reasoning && !e.relation) warn('reasoning_without_relation', `${at}.reasoning`, e.id)
    if (e.type && !types.has(e.type)) error('unknown_type', `${at}.type`, e.type)
    if (e.relation && !relations.has(e.relation)) error('unknown_relation', `${at}.relation`, e.relation)
    if (e.modality && e.type && !MODAL_NATURES.includes(e.type) && types.has(e.type)) warn('modality_ignored', `${at}.modality`, e.id)
  })
  map.elements.forEach((e, i) => {
    const seen = new Set<string>([e.id])
    for (let p = parent.get(e.id); p !== undefined; p = parent.get(p)) {
      if (seen.has(p)) {
        error('cycle', `elements[${i}].parent`, e.id)
        break
      }
      seen.add(p)
    }
  })

  map.links?.forEach((l, i) => {
    if (kinds.get(l.from) !== 'element') error('unknown_link_end', `links[${i}].from`, l.from)
    if (kinds.get(l.to) !== 'element') error('unknown_link_end', `links[${i}].to`, l.to)
    if (l.relation && !relations.has(l.relation)) error('unknown_relation', `links[${i}].relation`, l.relation)
  })

  // Séquence : cibles, puis simulation par le moteur (un élément montré doit être visible).
  const steps = map.sequence?.steps ?? []
  const withNote = new Set(map.elements.filter((e) => e.note?.trim()).map((e) => e.id))
  steps.forEach((step, s) =>
    step.actions.forEach((a, k) => {
      const at = `sequence.steps[${s}].actions[${k}]`
      a.targets.forEach((t, j) => {
        const kind = kinds.get(t)
        if (!kind) return error('unknown_target', `${at}.targets[${j}]`, t)
        if (a.do === 'note' && !withNote.has(t)) warn('no_note', `${at}.targets[${j}]`, t)
        if (a.part && (kind !== 'element' || NODE_ONLY_ACTIONS.includes(a.do) || (a.part === 'edge' && !parent.has(t)))) {
          warn('part_ignored', `${at}.part`, t)
        }
      })
    })
  )
  if (!issues.some((i) => i.level === 'error') && steps.length) {
    for (const hidden of simulate(map, parent)) warn('shown_but_hidden', `sequence.steps[${hidden.step}]`, hidden.ref)
  }
  return issues.sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1))
}

/** Éléments qu'une étape montre mais qui restent cachés (un ancêtre caché ou replié). */
function simulate(map: UnveilMap, parent: Map<string, string>): { step: number; ref: string }[] {
  // Formes virtuelles : la boîte porte l'identifiant de l'élément, sa flèche « id> ».
  const shapes = new Map<string, RefShapes>()
  for (const e of map.elements) shapes.set(e.id, { kind: 'element', node: e.id, ...(parent.has(e.id) && { edge: `${e.id}>` }) })
  for (const l of map.links ?? []) shapes.set(l.id, { kind: 'link', node: l.id })
  for (const o of map.others ?? []) shapes.set(o.id, { kind: 'other', node: o.id })
  let n = 0
  const steps = toEngineSteps(map.sequence!.steps, (ref) => shapes.get(ref), () => `s${n++}`)
  const seq = { version: SEQUENCE_VERSION, id: 'check', title: '', steps }

  const dependencies = new Map<ShapeRef, ShapeRef[]>()
  for (const [child, p] of parent) dependencies.set(`${child}>`, [child, p])
  for (const l of map.links ?? []) dependencies.set(l.id, [l.from, l.to])
  const folded = new Set(map.elements.filter((e) => e.folded).map((e) => e.id))

  const out: { step: number; ref: string }[] = []
  map.sequence!.steps.forEach((step, i) => {
    const stage = computeStage(seq, i, { dependencies, tree: parent, folded })
    for (const a of step.actions) {
      if (a.do !== 'show' || a.part === 'edge') continue
      for (const t of a.targets) {
        if (shapes.get(t)?.kind === 'element' && stateOf(stage, t).visibility === 'hidden') out.push({ step: i, ref: t })
      }
    }
  })
  return out
}

const MESSAGES: Record<IssueCode, string> = {
  invalid_json: 'The text is not valid JSON',
  invalid_format: 'Does not match the format',
  duplicate_id: 'Identifier used twice',
  unknown_parent: 'Parent is not an element of the map',
  cycle: 'The parents form a cycle',
  relation_without_parent: 'A relation needs a parent (use `links` for an arrow outside the tree)',
  reasoning_without_relation: 'A type of reasoning needs a relation; it will be ignored',
  unknown_type: 'Unknown element type (add it to `vocabulary`)',
  unknown_relation: 'Unknown relation (add it to `vocabulary`)',
  tree_on_child: '`tree` only applies to a root; it will be ignored',
  modality_ignored: 'Modality only applies to statements and assumptions',
  unknown_link_end: 'A link must connect two elements',
  unknown_target: 'Step target is not an identifier of the map',
  part_ignored: '`part` does not apply here; it will be ignored',
  no_note: 'This element has no note to show',
  shown_but_hidden: 'Shown by this step but still hidden: an ancestor is hidden or folded',
  unknown_element: 'No element or link has this identifier in the current diagram',
  wrong_format: 'Expected "format": "unveilboard/map" (a whole diagram) or "unveilboard/patch" (changes)',
  excerpt_not_found: 'The excerpt is not in the source text: copy it character for character (or remove it and set "origin": "reconstruction")',
  quote_not_found: 'This quotation is not in the source text: copy it exactly, or make it a statement',
  operation_not_allowed: 'This operation is not allowed at this step',
  outside_section: 'Added elements must descend from the section being developed (its head, or an element added before in these changes)',
  size_elements: 'The number of elements is outside the bounds set by the user: add or remove elements (group, merge or develop) to fit them',
  size_levels: 'The depth of the diagram (levels below the root) is outside the bounds set by the user: restructure the tree to fit them',
}

/** Problème en une ligne, en anglais (pour une IA, ou les journaux). */
export function formatIssue(issue: MapIssue) {
  const where = issue.path ? `${issue.path}: ` : ''
  const detail = issue.detail ? ` (${issue.detail})` : ''
  return `${issue.level === 'error' ? 'Error' : 'Warning'}: ${where}${MESSAGES[issue.code]}${detail}`
}
