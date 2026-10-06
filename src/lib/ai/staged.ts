// Création d'un schéma riche en plusieurs temps, pour qu'aucune réponse ne soit trop longue (et que
// chaque partie soit soignée) :
// 1. un plan (la racine, les sections, ce que chacune développe, un motif commun), que
//    l'utilisateur relit, modifie ou fait refaire ;
// 2. chaque section développée à part, en parallèle (les synthèses après les autres), et ajoutée
//    au schéma dès qu'elle est prête ; un échec ne coûte que sa section, qu'on peut relancer ;
// 3. la finition : liens entre sections, et séquence de présentation.
//
// Sans tldraw ni navigateur : l'envoi à l'IA est fourni par l'appelant (`ask`), et le schéma en
// construction aussi (`MapStore`) : en mémoire pour tout générer d'un coup, ou sur le canevas pour
// construire « en direct », section par section, en suggestions. Chaque étape part du schéma du
// moment, valide à tout moment.

import type { KnownVocabulary, MapIssue } from '../map/check'
import { AUTO_LANG } from './language'
import { checkExcerpts } from '../map/excerpts'
import type { MapElement, UnveilMap } from '../map/format'
import { sourceParagraphs } from '../source/paragraphs'
import { readPlan, readStepPatch, skeletonMap, type DiagramPlan, type PlanResult, type SectionPatchResult } from '../map/plan'
import type { ReasoningEffort } from './chat'
import { AiError, toAiError } from './errors'
import type { PromptInput } from './prompts'
import type { AiRun } from './run'

type Checked = { ok: boolean; issues: MapIssue[] }

export type Ask = <R extends Checked>(
  input: PromptInput,
  check: (text: string, attempt: number) => R,
  opts: { reasoning?: ReasoningEffort; onText?: (text: string, thinking: number) => void }
) => Promise<AiRun<R>>

export interface StagedContext {
  ask: Ask
  known: KnownVocabulary
  /** La demande de l'utilisateur : consigne, vocabulaire, langue, notes… */
  base: Omit<PromptInput, 'task'>
  /** Réflexion choisie : pour le plan ; les sections et la finition réfléchissent peu. */
  reasoning: ReasoningEffort
  signal?: AbortSignal
}

/** Sections parallèles en même temps. */
export const CONCURRENCY = 3

/** Réflexion des sections et de la finition : légère (le plan a fait le travail de structure). */
export const stepReasoning = (r: ReasoningEffort): ReasoningEffort => (r === 'off' ? 'off' : 'low')

/** Le plan : proposé, ou revu d'après le précédent et les remarques de l'utilisateur. */
export async function askPlan(
  ctx: StagedContext,
  opts: { previous?: DiagramPlan; remarks?: string; onText?: (text: string, thinking: number) => void } = {}
): Promise<AiRun<PlanResult> & { plan: DiagramPlan }> {
  const input: PromptInput = { ...ctx.base, task: 'plan', ...(opts.previous && { plan: opts.previous, planRemarks: opts.remarks }) }
  // Plan d'un texte : les plages de paragraphes des sections doivent s'y trouver.
  const paragraphs = ctx.base.source ? sourceParagraphs(ctx.base.source.text).length : undefined
  const run = await ctx.ask(input, (text) => readPlan(text, ctx.known, { paragraphs }), { reasoning: ctx.reasoning, onText: opts.onText })
  if (!run.result.ok) throw new AiError('invalid_output')
  const plan = run.result.plan
  // Langue « auto » : celle que le modèle a choisie (le plan la donne), jamais « auto » elle-même.
  const lang = plan.lang ?? (ctx.base.lang === AUTO_LANG ? undefined : ctx.base.lang)
  return { ...run, plan: { ...plan, ...(lang && { lang }) } }
}

/** Où vit le schéma en construction : en mémoire (tout d'un coup), ou sur le canevas (en direct). */
export interface MapStore {
  /** Le schéma tel qu'il est maintenant. */
  get(): UnveilMap
  /** Identifiants pris hors du schéma (suggestions en attente sur le canevas). */
  taken?(): Iterable<string>
  /** Ajoute une étape réussie, contrôlée sur le schéma du moment. */
  commit(result: Extract<SectionPatchResult, { ok: true }>): void
}

/** Schéma en mémoire, parti du squelette du plan : la racine et les têtes de section. */
export function memoryStore(plan: DiagramPlan, opts: { source?: boolean } = {}): MapStore & { map: UnveilMap } {
  const store = {
    map: skeletonMap(plan, opts),
    get: () => store.map,
    commit: (result: Extract<SectionPatchResult, { ok: true }>) => {
      store.map = result.map
    },
  }
  return store
}

export interface SectionEvents {
  onStart(id: string): void
  onText(id: string, chars: number, thinking: number): void
  onDone(id: string, run: AiRun<SectionPatchResult>, added: number): void
  onFail(id: string, error: AiError): void
}

/**
 * Développe des sections (toutes, ou celles à relancer) : les autres d'abord, en parallèle, puis
 * les synthèses. Chaque section réussie est ajoutée au schéma ; une section qui échoue est
 * signalée, sans arrêter les autres. `requests` : précision de l'utilisateur, par section.
 */
export async function developSections(
  ctx: StagedContext,
  plan: DiagramPlan,
  store: MapStore,
  ids: string[],
  events: SectionEvents,
  requests: Record<string, string> = {}
) {
  const synthesis = new Set(plan.sections.filter((s) => s.synthesis).map((s) => s.id))
  const groups = [ids.filter((id) => !synthesis.has(id)), ids.filter((id) => synthesis.has(id))]
  for (const group of groups) await pool(group, CONCURRENCY, (id) => developOne(ctx, plan, store, id, events, requests[id]))
}

async function developOne(ctx: StagedContext, plan: DiagramPlan, store: MapStore, id: string, events: SectionEvents, request?: string) {
  if (ctx.signal?.aborted) return events.onFail(id, new AiError('aborted'))
  events.onStart(id)
  // Contrôle sur le schéma du moment : d'autres sections ont pu s'y ajouter entre-temps.
  const check = (answer: unknown, attempt = 2) =>
    withExcerpts(readStepPatch(answer, store.get(), ctx.known, { allowed: ['add', 'link'], section: id, taken: store.taken?.() }), ctx.base.source?.text, attempt)
  try {
    const run = await ctx.ask({ ...ctx.base, lang: plan.lang ?? ctx.base.lang, task: 'develop', plan, focus: id, map: store.get(), ...(request?.trim() && { sectionRequest: request }) }, check, {
      reasoning: stepReasoning(ctx.reasoning),
      onText: (text, thinking) => events.onText(id, text.length, thinking),
    })
    if (!run.result.ok) throw new AiError('invalid_output')
    // Appliquée au schéma tel qu'il est maintenant (une autre section a pu finir pendant la lecture).
    const merged = check(run.result.patch)
    if (!merged.ok) throw new AiError('invalid_output')
    store.commit(merged)
    events.onDone(id, run, merged.added)
  } catch (e) {
    events.onFail(id, toAiError(e))
  }
}

/**
 * Tiré d'un texte : les extraits des éléments ajoutés sont cherchés dans le texte. Au premier essai,
 * un extrait introuvable est à corriger ; ensuite, l'élément est seulement signalé (à vérifier).
 */
function withExcerpts(result: SectionPatchResult, source: string | undefined, attempt: number): SectionPatchResult {
  if (!result.ok || !source) return result
  const adds = result.patch.operations.flatMap((op, i) => (op.op === 'add' ? [{ op, i }] : []))
  const elements = adds.map(({ op }) => ({ ...op, op: undefined, rationale: undefined }) as unknown as MapElement)
  const excerpts = checkExcerpts({ ...result.map, elements }, source, attempt === 1)
  // elements[k] (les ajouts seuls) → operations[i], pour la correction.
  const issues = excerpts.issues.map((issue) => ({ ...issue, path: issue.path.replace(/^elements\[(\d+)\]/, (_, k) => `operations[${adds[Number(k)].i}]`) }))
  if (issues.some((i) => i.level === 'error')) return { ok: false, issues }
  return { ...result, issues: [...result.issues, ...issues], unverified: excerpts.unverified }
}

/** La finition : liens entre sections et séquence, ajoutés au schéma. */
export async function finishMap(
  ctx: StagedContext,
  plan: DiagramPlan,
  store: MapStore,
  onText?: (text: string, thinking: number) => void
): Promise<AiRun<SectionPatchResult>> {
  const check = (answer: unknown) => readStepPatch(answer, store.get(), ctx.known, { allowed: ['link', 'sequence'], taken: store.taken?.() })
  const run = await ctx.ask({ ...ctx.base, lang: plan.lang ?? ctx.base.lang, task: 'finish', plan, map: store.get() }, check, { reasoning: stepReasoning(ctx.reasoning), onText })
  if (!run.result.ok) throw new AiError('invalid_output')
  const merged = check(run.result.patch)
  if (!merged.ok) throw new AiError('invalid_output')
  store.commit(merged)
  return run
}

/** Exécute `task` sur chaque élément, `size` à la fois. */
async function pool<T>(items: T[], size: number, task: (item: T) => Promise<void>) {
  const queue = [...items]
  const worker = async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await task(item)
  }
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, worker))
}
