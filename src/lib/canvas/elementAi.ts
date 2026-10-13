// Développer le schéma à partir d'un élément avec l'IA : la demande (élément, visée, ampleur…), son
// application, et le dernier résultat. La boîte « IA à partir de cet élément » se ferme quand la
// réponse est appliquée ; la barre des suggestions prend le relais (compléter, approfondir,
// continuer dans le chat), sans repasser par la boîte.

import { atom, renderPlaintextFromRichText, type Editor, type TLPageId, type TLRichText, type TLShapeId } from 'tldraw'
import type { Amount } from '../ai/aims'
import { aiSettingsAtom, askAi, type AiSettings, type CallOptions } from '../ai/client'
import { estimatedCost } from '../ai/models'
import type { PromptAim, PromptInput, PromptMethod } from '../ai/prompts'
import type { MapIssue } from '../map/check'
import type { ReadResult } from '../map/read'
import { findPrompt, promptLibraryAtom } from '../prompts/library'
import { methodOf, offersTask } from '../prompts/template'
import { editorPromptInput, readPasted } from './assistant'
import { applyPatch } from './mapPatch'
import { reverifyExcerpts } from './passage'
import { readPageMethod } from './pageMethod'
import { readPageSource } from './source'
import { isSuggestion, pendingSuggestions, rejectSuggestion, removeAdded, suggestionOf } from './suggestions'
import { childPlace, getTreeIndex, moveToPlace } from './tree'

export interface ElementRequest {
  /** L'élément d'où partir. */
  focus: TLShapeId
  instruction: string
  /** Envoyer tout le schéma (sinon : l'élément, ses ancêtres et sa branche). */
  wholeMap: boolean
  notes: boolean
  withSource: boolean
  /** En suggestions à accepter ou écarter (sinon : ajouté directement). */
  ghost: boolean
  amount: Amount
  aim?: PromptAim
  method?: PromptMethod
  /** Compléter : ce qui a déjà été proposé à partir de l'élément. */
  avoid?: string[]
  /** Approfondir : les éléments ajoutés à développer. */
  deepen?: TLShapeId[]
  /** Régénérer une proposition, ou toutes (le temps de cette demande). */
  redo?: PromptInput['redo']
}

export interface ElementOutcome {
  /** Éléments et liens ajoutés. */
  added: number
  /** Modifications d'éléments existants ignorées (en suggestions). */
  skipped: number
  summary?: string
  /** Boîtes ajoutées, et leur texte (pour compléter sans répéter). */
  boxes: TLShapeId[]
  texts: string[]
  /** Consommation de la dernière demande (affichée dans la barre). */
  usage?: RunUsage
}

/** Le dernier développement appliqué, sur sa page : la barre des suggestions le prolonge. */
export interface ElementRun {
  page: TLPageId
  request: ElementRequest
  outcome: ElementOutcome
}

export const lastElementRunAtom = atom<ElementRun | null>('lastElementRun', null)

/** La demande à l'IA. */
export function elementPromptInput(editor: Editor, req: ElementRequest, delivery: PromptInput['delivery']): PromptInput {
  return {
    ...editorPromptInput(editor, 'expand', req.instruction, {
      focus: req.focus,
      wholeMap: req.wholeMap,
      delivery,
      withSource: req.withSource,
      ...(req.deepen && { selectionIds: req.deepen }),
    }),
    notes: req.notes,
    amount: req.amount,
    ...(req.aim && { aim: req.aim }),
    ...(req.method && { method: req.method }),
    ...(req.avoid?.length && { avoid: req.avoid }),
    ...(req.redo && { redo: req.redo }),
  }
}

/** Réponse de l'IA acceptable ici : des modifications (pas un schéma entier). */
export function patchOnly(result: ReadResult): ReadResult {
  if (result.kind === 'patch' || !result.ok) return result
  return { kind: 'unknown', ok: false, issues: [{ level: 'error', code: 'wrong_format', path: 'format', detail: 'expected "unveilboard/patch"' }] }
}

/** Lit une réponse (collée, ou reçue de l'IA). */
export const readElementAnswer = (editor: Editor, answer: string) => patchOnly(readPasted(editor, answer))

const plainText = (editor: Editor, id: TLShapeId) => {
  const rich = (editor.getShape(id)?.props as { richText?: TLRichText } | undefined)?.richText
  return rich ? renderPlaintextFromRichText(editor, rich).trim() : ''
}

/** Consommation de la dernière demande : jetons, et coût (donné par le fournisseur, sinon estimé). */
export interface RunUsage {
  tokens: number
  cost?: number
  estimated?: boolean
}

/**
 * Applique une réponse valide, en suggestions ou directement, et la retient comme dernier
 * développement (`into` : ajoutée à celui-ci, pour une proposition régénérée). `replacing` : ce que
 * la réponse remplace, retiré juste avant ; `placed` : reçoit les boîtes ajoutées (pour les mettre
 * en place). Le tout en un seul pas d'annulation. Sinon, renvoie les problèmes trouvés.
 */
export function applyElementAnswer(
  editor: Editor,
  req: ElementRequest,
  result: ReadResult,
  opts: { into?: ElementRun; replacing?: () => void; placed?: (boxes: TLShapeId[]) => void; usage?: RunUsage } = {}
): { run: ElementRun } | { issues: MapIssue[] } {
  if (!result.ok || result.kind !== 'patch') return { issues: result.issues.filter((i) => i.level === 'error') }
  const mark = editor.markHistoryStoppingPoint('développement par l’IA')
  opts.replacing?.()
  const before = new Set(editor.getCurrentPageShapeIds())
  const added = result.patch.operations.filter((o) => o.op === 'add' || o.op === 'link').length
  const { skipped } = applyPatch(editor, result.patch, { ghost: req.ghost })
  // Schéma tiré d'un texte : les extraits ajoutés sont cherchés dans le texte (sinon « à vérifier »).
  const source = readPageSource(editor)
  if (source) reverifyExcerpts(editor, source.text)
  const boxes = [...editor.getCurrentPageShapeIds()].filter((id) => !before.has(id) && editor.getShape(id)?.type === 'geo')
  opts.placed?.(boxes)
  editor.squashToMark(mark)
  const texts = boxes.map((id) => plainText(editor, id)).filter(Boolean)
  // La régénération ne vaut que pour cette demande : Compléter repartira de la demande d'origine.
  const request: ElementRequest = { ...req, redo: undefined }
  const into = opts.into
  const usage = opts.usage && { usage: opts.usage }
  const run: ElementRun = into
    ? {
        ...into,
        outcome: {
          ...into.outcome,
          added: into.outcome.added + added,
          boxes: [...into.outcome.boxes, ...boxes],
          texts: [...into.outcome.texts, ...texts],
          ...usage,
        },
      }
    : { page: editor.getCurrentPageId(), request, outcome: { added, skipped, ...(result.patch.summary && { summary: result.patch.summary }), boxes, texts, ...usage } }
  lastElementRunAtom.set(run)
  return { run }
}

/** Options d'un appel : `settings` remplace les réglages de l'IA le temps de la demande (modèle, réflexion). */
export type ElementCallOptions = CallOptions & { settings?: AiSettings }

/** Modèle demandé, selon le fournisseur (pour estimer le coût quand le fournisseur ne le donne pas). */
function modelOf(settings: AiSettings) {
  return settings.kind === 'openrouter' ? settings.openrouterModel : settings.kind === 'server' ? settings.serverModel : settings.kind === 'custom' ? settings.customModel : ''
}

async function ask(editor: Editor, req: ElementRequest, opts: ElementCallOptions): Promise<{ result: ReadResult; usage: RunUsage }> {
  const { settings: override, ...call } = opts
  const settings = override ?? aiSettingsAtom.get()
  const run = await askAi(settings, elementPromptInput(editor, req, 'api'), (answer) => readElementAnswer(editor, answer), call)
  const tokens = (run.usage.promptTokens ?? 0) + (run.usage.completionTokens ?? 0)
  // Forfait ChatGPT : pas de coût par demande. Sinon, celui du fournisseur, ou estimé d'après le catalogue.
  const estimate = settings.kind === 'chatgpt' || run.usage.cost !== undefined ? undefined : estimatedCost(run.model || modelOf(settings), run.usage)
  const cost = settings.kind === 'chatgpt' ? undefined : (run.usage.cost ?? estimate)
  return { result: run.result, usage: { tokens, ...(cost !== undefined && { cost }), ...(estimate !== undefined && { estimated: true }) } }
}

/** Demande à l'IA (réglée), puis applique sa réponse. */
export async function runElementRequest(editor: Editor, req: ElementRequest, opts: ElementCallOptions = {}) {
  const { result, usage } = await ask(editor, req, opts)
  return applyElementAnswer(editor, req, result, { usage })
}

/** La suggestion en tête de sa branche suggérée : celle qui est rattachée à un élément du schéma. */
function suggestedHead(editor: Editor, id: TLShapeId): { head: TLShapeId; parent?: TLShapeId } {
  const { parent } = getTreeIndex(editor)
  let head = id
  for (let p = parent.get(head); p && isSuggestion(editor.getShape(p)); p = parent.get(head)) head = p
  return { head, parent: parent.get(head) }
}

/** Une branche en liste indentée (son texte, puis celui de ses descendants). */
function branchLines(editor: Editor, id: TLShapeId, depth = 0): string[] {
  const text = plainText(editor, id).replace(/\s+/g, ' ')
  const kids = getTreeIndex(editor).children.get(id) ?? []
  return [`${'  '.repeat(depth)}- ${text}`, ...kids.flatMap((k) => branchLines(editor, k, depth + 1))]
}

/**
 * Textes des suggestions en attente sous un élément (avec leurs branches) : l'IA ne voit pas les
 * suggestions dans le schéma, elle les reçoit pour ne pas les reproposer.
 */
function pendingTexts(editor: Editor, parent: TLShapeId): string[] {
  return pendingSuggestions(editor)
    .filter((s) => s.type !== 'arrow' && suggestedHead(editor, s.id).parent === parent)
    .map((s) => plainText(editor, s.id))
    .filter(Boolean)
}

const unique = (texts: string[]) => [...new Set(texts)]

/** Méthode de la page, si elle vaut pour développer un élément (pour une suggestion venue d'ailleurs). */
function pageMethod(editor: Editor): PromptMethod | undefined {
  const id = readPageMethod(editor)
  const template = id ? findPrompt(promptLibraryAtom.get(), id, '') : undefined
  return template && offersTask(template, 'expand') ? methodOf(template) : undefined
}

/**
 * Régénère une suggestion (avec sa branche) : une seule proposition à sa place, dans la direction
 * voulue (sinon : mieux). Ajoutée au dernier développement s'il part du même élément ; sinon, avec
 * la méthode de la page.
 */
export async function regenerateSuggestion(editor: Editor, id: TLShapeId, direction: string, opts: ElementCallOptions = {}) {
  const { head, parent } = suggestedHead(editor, id)
  if (!parent) return { issues: [{ level: 'error', code: 'wrong_format', path: '', detail: 'no parent' }] as MapIssue[] }
  const last = lastElementRunAtom.get()
  const into = last && last.page === editor.getCurrentPageId() && last.request.focus === parent ? last : undefined
  const base: ElementRequest = into?.request ?? {
    focus: parent,
    instruction: '',
    wholeMap: true,
    notes: true,
    withSource: true,
    ghost: true,
    amount: 'brief',
    ...(pageMethod(editor) && { method: pageMethod(editor) }),
  }
  const [first, ...rest] = branchLines(editor, head)
  const req: ElementRequest = {
    ...base,
    ghost: true,
    deepen: undefined,
    avoid: unique([...(base.avoid ?? []), ...(into?.outcome.texts ?? []), ...pendingTexts(editor, parent)]),
    redo: {
      direction,
      replace: { text: first.replace(/^- /, ''), ...(rest.length && { branch: rest }), rationale: suggestionOf(editor.getShape(head))?.rationale },
    },
  }
  const { result, usage } = await ask(editor, req, opts)
  // La nouvelle proposition prend la place de l'ancienne parmi ses frères.
  const place = childPlace(editor, head)
  return applyElementAnswer(editor, req, result, {
    into,
    usage,
    replacing: () => rejectSuggestion(editor, head),
    placed: (boxes) => {
      const newHead = boxes.find((b) => getTreeIndex(editor).parent.get(b) === parent)
      if (newHead && place) moveToPlace(editor, newHead, place)
    },
  })
}

/**
 * Régénère tout le dernier développement : ce qui est encore en suggestion (ou ce qui a été ajouté
 * directement) est remplacé, dans la direction voulue (sinon : mieux) ; ce qui a été accepté reste.
 */
export async function regenerateRun(editor: Editor, run: ElementRun, direction: string, opts: ElementCallOptions = {}) {
  const avoid = unique([...(run.request.avoid ?? []), ...run.outcome.texts, ...pendingTexts(editor, run.request.focus)])
  const req: ElementRequest = { ...run.request, avoid, redo: { direction } }
  const replaced = run.request.ghost ? run.outcome.boxes.filter((b) => isSuggestion(editor.getShape(b))) : run.outcome.boxes
  const kept = run.outcome.boxes.filter((b) => !replaced.includes(b) && editor.getShape(b))
  const { result, usage } = await ask(editor, req, opts)
  const outcome = applyElementAnswer(editor, req, result, {
    usage,
    replacing: () => (run.request.ghost ? replaced.forEach((b) => editor.getShape(b) && rejectSuggestion(editor, b)) : removeAdded(editor, replaced)),
  })
  // Ce qui avait été accepté reste du développement (à approfondir avec le reste).
  if ('run' in outcome && kept.length) {
    const merged = { ...outcome.run, outcome: { ...outcome.run.outcome, boxes: [...kept, ...outcome.run.outcome.boxes] } }
    lastElementRunAtom.set(merged)
    return { run: merged }
  }
  return outcome
}

/**
 * Compléter : la même demande (approfondir compris), sans répéter ce qui a déjà été proposé, ni les
 * suggestions encore en attente sous l'élément.
 */
export function completeRequest(editor: Editor, run: ElementRun): ElementRequest {
  return { ...run.request, avoid: unique([...(run.request.avoid ?? []), ...run.outcome.texts, ...pendingTexts(editor, run.request.focus)]) }
}

/** Boîtes du dernier développement qu'on peut approfondir : celles qui sont dans le schéma (acceptées). */
export function deepenable(editor: Editor, run: ElementRun): TLShapeId[] {
  return run.outcome.boxes.filter((id) => {
    const shape = editor.getShape(id)
    return !!shape && !shape.meta.suggestion
  })
}
