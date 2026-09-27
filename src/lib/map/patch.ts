// Modifications d'un schéma (« unveilboard/patch ») : ajouter, modifier, déplacer, supprimer des
// éléments, ajouter des liens, écrire la séquence. Les éléments sont désignés par les identifiants
// de l'export JSON. C'est ce qu'une IA renvoie pour enrichir ou réorganiser un schéma existant.
//
// Une modification est d'abord appliquée au schéma exporté (applyPatchToMap, ici, sans tldraw) :
// le résultat passe les contrôles habituels (checkMap). Elle n'est appliquée au canevas qu'ensuite.

import { z } from 'zod'
import { MODALITIES, REASONINGS } from '../presets/presets'
import { TREE_DIRECTIONS } from '../tree/layout'
import { checkMap, type KnownVocabulary, type MapIssue } from './check'
import { ElementSchema, LinkSchema, StepSchema, VocabularySchema, type MapElement, type UnveilMap } from './format'

export const PATCH_FORMAT = 'unveilboard/patch'
export const PATCH_VERSION = 1

const Ref = z.string().min(1).max(64).regex(/^\S+$/)
const VocabularyId = z.string().min(1).max(64).regex(/^\S+$/)

const Rationale = z.string().max(500).optional().describe('Why you propose it, in one sentence, for the user.')

const AddOp = ElementSchema.omit({ function: true })
  .extend({ op: z.literal('add'), rationale: Rationale })
  .describe('Add an element (a new id). With `parent` (an existing element or one added earlier), it joins that tree.')

const UpdateOp = z
  .object({
    op: z.literal('update'),
    id: Ref,
    text: z.string().max(4000).optional(),
    type: VocabularyId.nullable().optional(),
    relation: VocabularyId.nullable().optional(),
    reasoning: z.enum(REASONINGS).nullable().optional(),
    source: z.string().max(300).nullable().optional(),
    modality: z.enum(MODALITIES).nullable().optional(),
    note: z.string().max(20000).nullable().optional(),
    folded: z.boolean().optional(),
    origin: z.enum(['text', 'reconstruction']).nullable().optional(),
    excerpt: z.string().max(4000).nullable().optional(),
    tree: z
      .object({ kind: z.enum(['argument', 'mindmap']), direction: z.enum(TREE_DIRECTIONS).optional() })
      .nullable()
      .optional(),
  })
  .describe('Change fields of an element; null removes a field. Only the given fields change.')

const MoveOp = z
  .object({
    op: z.literal('move'),
    id: Ref,
    parent: Ref,
    relation: VocabularyId.nullable().optional().describe('Omitted: the element keeps its relation.'),
  })
  .describe('Attach an element (with its branch) to another parent.')

const RemoveOp = z
  .object({ op: z.literal('remove'), id: Ref })
  .describe('Remove an element with its whole branch (and the links that touch them), or a link.')

const LinkOp = LinkSchema.extend({ op: z.literal('link'), rationale: Rationale }).describe('Add an arrow between two elements outside the trees.')

const SequenceOp = z
  .object({
    op: z.literal('sequence'),
    mode: z.enum(['replace', 'append']).describe('replace: the new steps replace the sequence; append: they are added at the end.'),
    title: z.string().max(200).optional(),
    steps: z.array(StepSchema),
  })
  .describe('Write the presentation sequence.')

export const OperationSchema = z.discriminatedUnion('op', [AddOp, UpdateOp, MoveOp, RemoveOp, LinkOp, SequenceOp])

export const PatchSchema = z
  .object({
    format: z.literal(PATCH_FORMAT),
    version: z.literal(PATCH_VERSION),
    summary: z.string().max(4000).optional().describe('What the changes do and why, shown to the user before applying.'),
    vocabulary: z.array(VocabularySchema).optional().describe('New types or relations used by the changes.'),
    operations: z.array(OperationSchema).min(1),
  })
  .describe('Changes to an Unveilboard diagram, applied in order.')

export type MapPatch = z.infer<typeof PatchSchema>

/** JSON Schema des modifications (draft 2020-12). */
export function patchJsonSchema() {
  return z.toJSONSchema(PatchSchema, { target: 'draft-2020-12' })
}
export type PatchOperation = z.infer<typeof OperationSchema>

/** Résultat de l'application au schéma exporté : le schéma modifié, ou les problèmes. */
export interface PatchPreview {
  map: UnveilMap
  issues: MapIssue[]
}

/** Applique les modifications au schéma (copie), puis le contrôle. */
export function previewPatch(map: UnveilMap, patch: MapPatch, known: KnownVocabulary): PatchPreview {
  const issues: MapIssue[] = []
  const next = applyPatchToMap(map, patch, (i, detail) =>
    issues.push({ level: 'error', code: 'unknown_element', path: `operations[${i}].id`, detail })
  )
  // Chemins du schéma modifié (« elements[12] ») → identifiants, plus parlants pour une IA.
  const byIndex = (list: { id: string }[] | undefined, name: string) => (path: string) =>
    path.replace(new RegExp(`^${name}\\[(\\d+)\\]`), (_, k) => `${name}[id=${list?.[Number(k)]?.id ?? k}]`)
  const elementPath = byIndex(next.elements, 'elements')
  const linkPath = byIndex(next.links, 'links')
  for (const issue of checkMap(next, known)) issues.push({ ...issue, path: linkPath(elementPath(issue.path)) })
  return { map: next, issues: issues.sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1)) }
}

/** Nouveau schéma, modifications appliquées dans l'ordre. `missing` : identifiant introuvable. */
export function applyPatchToMap(map: UnveilMap, patch: MapPatch, missing: (op: number, id: string) => void): UnveilMap {
  let elements: MapElement[] = map.elements.map((e) => ({ ...e }))
  let links = [...(map.links ?? [])]
  let sequence = map.sequence ? { ...map.sequence, steps: [...map.sequence.steps] } : undefined
  let title = map.title
  const vocabulary = [...(map.vocabulary ?? [])]
  for (const v of patch.vocabulary ?? []) if (!vocabulary.some((w) => w.id === v.id)) vocabulary.push(v)

  const find = (id: string) => elements.find((e) => e.id === id)
  patch.operations.forEach((op, i) => {
    switch (op.op) {
      case 'add': {
        elements.push(omit(op, ['op', 'rationale']))
        break
      }
      case 'update': {
        const e = find(op.id)
        if (!e) return missing(i, op.id)
        const record = e as Record<string, unknown>
        for (const [key, value] of Object.entries(omit(op, ['op', 'id']))) {
          if (value === undefined) continue
          if (value === null) delete record[key]
          else record[key] = value
        }
        break
      }
      case 'move': {
        const e = find(op.id)
        if (!e) return missing(i, op.id)
        e.parent = op.parent
        delete e.side
        delete e.tree
        if (op.relation === null) delete e.relation
        else if (op.relation) e.relation = op.relation
        break
      }
      case 'remove': {
        if (links.some((l) => l.id === op.id)) {
          links = links.filter((l) => l.id !== op.id)
          sequence = sequence && withoutTargets(sequence, new Set([op.id]))
          break
        }
        if (!find(op.id)) return missing(i, op.id)
        const gone = new Set([op.id])
        for (let grew = true; grew; ) {
          grew = false
          for (const e of elements) {
            if (e.parent && gone.has(e.parent) && !gone.has(e.id)) {
              gone.add(e.id)
              grew = true
            }
          }
        }
        elements = elements.filter((e) => !gone.has(e.id))
        for (const l of links) if (gone.has(l.from) || gone.has(l.to)) gone.add(l.id)
        links = links.filter((l) => !gone.has(l.id))
        sequence = sequence && withoutTargets(sequence, gone)
        break
      }
      case 'link': {
        links.push(omit(op, ['op', 'rationale']))
        break
      }
      case 'sequence': {
        const steps = op.mode === 'append' ? [...(sequence?.steps ?? []), ...op.steps] : op.steps
        sequence = { ...sequence, steps }
        if (op.title) title = op.title
        break
      }
    }
  })
  return {
    ...map,
    ...(title && { title }),
    ...(vocabulary.length && { vocabulary }),
    elements: orderParentsFirst(elements),
    ...(links.length ? { links } : { links: undefined }),
    ...(sequence && { sequence }),
  }
}

function omit<T extends object, K extends keyof T>(value: T, keys: K[]): Omit<T, K> {
  return Object.fromEntries(Object.entries(value).filter(([k]) => !keys.includes(k as K))) as Omit<T, K>
}

/** Les parents avant leurs enfants (un élément ajouté ou déplacé peut avoir changé l'ordre). */
function orderParentsFirst(elements: MapElement[]): MapElement[] {
  const ids = new Set(elements.map((e) => e.id))
  const children = new Map<string, MapElement[]>()
  for (const e of elements) if (e.parent && ids.has(e.parent)) children.set(e.parent, [...(children.get(e.parent) ?? []), e])
  const out: MapElement[] = []
  // Par objet, pas par identifiant : un doublon reste, pour que le contrôle le signale.
  const seen = new Set<MapElement>()
  const visit = (e: MapElement) => {
    if (seen.has(e)) return
    seen.add(e)
    out.push(e)
    for (const c of children.get(e.id) ?? []) visit(c)
  }
  for (const e of elements) if (!e.parent || !ids.has(e.parent)) visit(e)
  // Éléments pris dans un cycle : gardés, pour que le contrôle les signale.
  for (const e of elements) if (!seen.has(e)) out.push(e)
  return out
}

function withoutTargets(sequence: NonNullable<UnveilMap['sequence']>, gone: Set<string>) {
  return {
    ...sequence,
    steps: sequence.steps.map((s) => ({
      ...s,
      actions: s.actions
        .map((a) => ({ ...a, targets: a.targets.filter((t) => !gone.has(t)) }))
        .filter((a) => a.targets.length),
    })),
  }
}
