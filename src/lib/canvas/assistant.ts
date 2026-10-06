// Travail avec une IA « par le presse-papiers » : consigne à copier pour un assistant, lecture de
// sa réponse (schéma ou modifications), et API de la page pour les agents qui pilotent le
// navigateur (window.unveilboard). Aucun appel réseau : l'IA est celle de l'utilisateur.

import { Box, PageRecordType, type Editor, type TLShapeId } from 'tldraw'
import { z } from 'zod'
import { clientLocale, m } from '@/i18n/client'
import { buildPrompt, type PromptInput, type Task, type VocabularyLine } from '../ai/prompts'
import { formatIssue } from '../map/check'
import type { UnveilMap } from '../map/format'
import { stashPendingMap, type PendingMap } from '../map/pending'
import { readJson, type ReadResult } from '../map/read'
import type { ReviewFocus } from '../map/review'
import { documentStore } from '../storage'
import { storageModeAtom } from '../sync/documentSync'
import { exportMap } from './mapExport'
import { importMap, knownVocabulary } from './mapImport'
import { readSequence, writeSequence } from './adapter'
import { applyPatch } from './mapPatch'
import { setReview } from './review'
import { revealOrder } from './tree'
import { extractAround } from '../map/extract'
import { presetSettingsAtom } from './presets'
import { readPageSource, writePageSource } from './source'

/** Vocabulaire proposé à l'IA : tous les préréglages visibles (pas seulement l'essentiel), avec leur définition. */
export function promptVocabulary(): VocabularyLine[] {
  return presetSettingsAtom
    .get()
    .items.filter((p) => !p.hidden)
    .map((p) => {
      const definition = p.description ?? m().presetHelp[p.id]?.definition
      return {
        id: p.id,
        kind: p.target === 'shape' ? 'type' : 'relation',
        name: p.name,
        ...(definition && { definition }),
        ...(p.target === 'arrow' && { direction: p.towardChild ? 'toChild' : 'toParent' }),
        ...(p.target === 'arrow' && p.childNature && { childType: p.childNature }),
        ...(p.target === 'arrow' && p.role && { function: p.role }),
      } satisfies VocabularyLine
    })
}

/** Identifiants (du format) des éléments sélectionnés. */
export function selectedRefs(editor: Editor): string[] {
  const selected = new Set<string>(editor.getSelectedShapeIds())
  return [...exportMap(editor).shapes].filter(([, s]) => selected.has(s.node)).map(([ref]) => ref)
}

export interface PromptOptions {
  /** Porter l'attention sur les éléments sélectionnés. */
  selection?: boolean
  delivery?: PromptInput['delivery']
  /** « expand » : la forme d'où partir. */
  focus?: TLShapeId
  /** « expand » : envoyer tout le schéma (sinon, l'élément, ses ancêtres et sa branche). Par défaut : oui. */
  wholeMap?: boolean
  /** « review » : ce qu'on attend de la relecture. */
  reviewFocus?: ReviewFocus[]
  /** S'appuyer sur le texte source de la page, s'il y en a un. */
  withSource?: boolean
}

/** Demande pour une tâche, sur le schéma ouvert (le schéma et la sélection compris). */
export function editorPromptInput(editor: Editor, task: Task, instruction: string, opts: PromptOptions = {}): PromptInput {
  const exported = task === 'create' ? undefined : exportMap(editor)
  const refOf = new Map([...(exported?.shapes ?? [])].map(([ref, s]) => [s.node, ref]))
  const focus = opts.focus && refOf.get(opts.focus)
  const partial = !!focus && opts.wholeMap === false
  const map = exported && (partial ? extractAround(exported.map, focus) : exported.map)
  const source = readPageSource(editor)
  return {
    task,
    instruction,
    map,
    selection: opts.selection ? selectedRefs(editor) : undefined,
    ...(focus && { focus }),
    ...(partial && { partial }),
    ...(task === 'sequence' && exported && { order: defaultOrder(editor, exported.map, refOf) }),
    ...(task === 'review' && opts.reviewFocus && { reviewFocus: opts.reviewFocus }),
    ...(opts.withSource && source && { source: { text: source.text, ...(source.label && { label: source.label }) } }),
    vocabulary: promptVocabulary(),
    lang: map?.lang ?? clientLocale(),
    delivery: opts.delivery ?? 'clipboard',
    pasteMenu: m().mapJson.menuImport,
  }
}

/** Ordre par défaut : chaque arbre en profondeur (comme « Dévoiler la carte »), puis les boîtes isolées. */
function defaultOrder(editor: Editor, map: UnveilMap, refOf: Map<string, string>): string[] {
  const shapeOf = new Map([...refOf].map(([shape, ref]) => [ref, shape as TLShapeId]))
  const order: string[] = []
  for (const root of map.elements.filter((e) => !e.parent)) {
    const shape = shapeOf.get(root.id)
    if (!shape) continue
    for (const item of revealOrder(editor, shape)) {
      const ref = refOf.get(item.node)
      if (ref && !order.includes(ref)) order.push(ref)
    }
  }
  return order
}

/** Consigne complète pour une tâche, sur le schéma ouvert. */
export function editorPrompt(...args: Parameters<typeof editorPromptInput>): string {
  return buildPrompt(editorPromptInput(...args))
}

/** Lit un JSON collé : schéma entier, ou modifications du schéma ouvert. */
export function readPasted(editor: Editor, text: string | unknown): ReadResult {
  const zodError = clientLocale() === 'fr' ? z.locales.fr().localeError : undefined
  return readJson(text, knownVocabulary(editor), exportMap(editor).map, { zodError })
}

/** Crée un document pour un schéma : il est construit à son ouverture. Renvoie son identifiant. */
export async function createDocumentFromMap(map: UnveilMap, opts: Omit<PendingMap, 'map'> = {}): Promise<string> {
  const id = await documentStore(storageModeAtom.get()).create(map.title || m().common.untitled)
  stashPendingMap(id, { map, ...opts })
  return id
}

/**
 * Où va un schéma créé (par l'IA, ou collé) : un nouveau document, une nouvelle page du document
 * ouvert, ou la page ouverte, à droite de ce qui s'y trouve.
 */
export type MapDestination = 'document' | 'page' | 'here'

/** Écart entre ce que la page contient déjà et le schéma ajouté à côté. */
const BESIDE_GAP = 300

/**
 * Ajoute un schéma au document ouvert, sur une nouvelle page (nommée d'après son titre) ou sur la
 * page ouverte, à droite de son contenu. Sa séquence devient celle de la nouvelle page, ou s'ajoute
 * à la suite de celle de la page ; le titre du document ne change pas. Un seul Ctrl+Z annule tout.
 * `source` : le texte dont le schéma est tiré, gardé avec la page (si elle n'en a pas déjà un).
 */
export function addMapToDocument(
  editor: Editor,
  map: UnveilMap,
  destination: Exclude<MapDestination, 'document'>,
  opts: Omit<PendingMap, 'map' | 'plan'> = {}
) {
  const mark = editor.markHistoryStoppingPoint('schéma ajouté')
  if (destination === 'page') {
    const page = PageRecordType.createId()
    editor.createPage({ id: page, name: map.title?.trim() || m().common.untitled })
    editor.setCurrentPage(page)
  }
  const content = destination === 'here' ? editor.getCurrentPageBounds() : undefined
  const at = content ? { x: content.maxX + BESIDE_GAP, y: content.minY } : { x: 0, y: 0 }
  const before = readSequence(editor)
  const { shapes, sequence } = importMap(editor, map, { at, unverified: opts.unverified })
  editor.setEditingShape(null)
  editor.selectNone()
  writeSequence(
    editor,
    before
      ? { ...before, steps: [...before.steps, ...sequence.steps], intro: before.intro || sequence.intro }
      : sequence,
    { undoable: true }
  )
  // Langue du contenu : celle du document, s'il n'en avait pas encore.
  const meta = editor.getDocumentSettings().meta
  if (map.lang && !meta.lang) editor.updateDocumentSettings({ meta: { ...meta, lang: map.lang } })
  if (opts.source && !readPageSource(editor)) writePageSource(editor, opts.source)
  editor.squashToMark(mark)

  const bounds = [...shapes.values()].map((s) => editor.getShapePageBounds(s.node as TLShapeId)).filter((b) => !!b)
  if (bounds.length) editor.zoomToBounds(Box.Common(bounds), { inset: 64, animation: { duration: 400 } })
}

// ---------- API de la page, pour les agents qui pilotent le navigateur ----------

export interface UnveilboardApi {
  /** Version de l'API. */
  version: 1
  /** Le schéma ouvert, au format JSON (https://github.com/fbgallet/unveilboard/blob/main/docs/map-format.md). */
  getMap(): UnveilMap
  /** Consigne complète pour une tâche (create, enrich, sequence, review, edit). */
  getPrompt(task: Task, instruction?: string): string
  /**
   * Applique un JSON : des modifications (« unveilboard/patch ») au schéma ouvert, une relecture
   * (« unveilboard/review ») affichée dans le panneau « Relecture », ou un schéma entier
   * (« unveilboard/map »), ouvert comme nouveau schéma. Renvoie les problèmes (en anglais).
   */
  apply(json: string | object): Promise<{ ok: boolean; kind: ReadResult['kind']; problems: string[] }>
}

/** Installe window.unveilboard pour cet éditeur ; renvoie la fonction qui la retire. */
export function installPageApi(editor: Editor, navigate: (url: string) => void) {
  const api: UnveilboardApi = {
    version: 1,
    getMap: () => exportMap(editor).map,
    getPrompt: (task, instruction = '') => editorPrompt(editor, task, instruction, { delivery: 'api' }),
    async apply(json) {
      // Messages de Zod en anglais, pour l'agent.
      const result = readJson(json, knownVocabulary(editor), exportMap(editor).map)
      const problems = result.issues.map(formatIssue)
      if (!result.ok) return { ok: false, kind: result.kind, problems }
      if (result.kind === 'patch') applyPatch(editor, result.patch)
      else if (result.kind === 'review') setReview(result.review.summary, result.remarks)
      else navigate(`/d/${await createDocumentFromMap(result.map)}`)
      return { ok: true, kind: result.kind, problems }
    },
  }
  const w = window as unknown as { unveilboard?: UnveilboardApi }
  w.unveilboard = api
  return () => {
    if (w.unveilboard === api) delete w.unveilboard
  }
}
