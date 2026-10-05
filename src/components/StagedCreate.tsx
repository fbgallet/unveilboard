'use client'

import { useEffect, useRef, useState } from 'react'
import type { Editor } from 'tldraw'
import { useT } from '@/i18n/client'
import { askAi, type AiSettings } from '@/lib/ai/client'
import { toAiError, type AiError } from '@/lib/ai/errors'
import type { AiRun } from '@/lib/ai/run'
import { askPlan, developSections, finishMap, memoryStore, type Ask, type StagedContext } from '@/lib/ai/staged'
import type { PromptInput } from '@/lib/ai/prompts'
import { sourceParagraphs } from '@/lib/source/paragraphs'
import { knownVocabulary } from '@/lib/canvas/mapImport'
import type { MapIssue } from '@/lib/map/check'
import type { UnveilMap } from '@/lib/map/format'
import { readPlan, type DiagramPlan, type PlanRecord } from '@/lib/map/plan'
import { PlanEditor } from './PlanEditor'

type Phase = 'idle' | 'planning' | 'review' | 'developing' | 'finishing' | 'done' | 'halted'

interface SectionRun {
  status: 'waiting' | 'running' | 'done' | 'failed'
  chars: number
  thinking: number
  added?: number
  error?: string
}

/**
 * Créer un schéma riche en plusieurs étapes (src/lib/ai/staged.ts) : le plan, relu et modifié au
 * besoin, puis les sections en parallèle, puis les liens et la séquence. Le schéma obtenu (ou
 * partiel, après un arrêt) est remis à `onResult`, pour être vérifié puis créé.
 */
export function StagedCreate({
  editor,
  settings,
  input,
  canStart,
  onResult,
  onLive,
}: {
  editor: Editor
  settings: AiSettings
  /** La demande de création (consigne, options, texte source éventuel). */
  input(): PromptInput
  /** La demande est prête (consigne ou texte donnés). */
  canStart: boolean
  onResult(map: UnveilMap): void
  /** Construire en direct : ouvrir le squelette du plan comme nouveau schéma. */
  onLive(record: PlanRecord): Promise<void>
}) {
  const t = useT()
  const [phase, setPhase] = useState<Phase>('idle')
  const [reviewFirst, setReviewFirst] = useState(false)
  const [plan, setPlan] = useState<DiagramPlan | null>(null)
  const [planIssues, setPlanIssues] = useState<MapIssue[]>([])
  const [remarks, setRemarks] = useState('')
  const [progress, setProgress] = useState({ chars: 0, thinking: 0 })
  const [sections, setSections] = useState<Record<string, SectionRun>>({})
  const [finishFailed, setFinishFailed] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [usage, setUsage] = useState({ tokens: 0, cost: undefined as number | undefined })
  const [seconds, setSeconds] = useState(0)
  const [opening, setOpening] = useState(false)
  const state = useRef<ReturnType<typeof memoryStore> | null>(null)
  const failed = useRef(new Set<string>())
  const abort = useRef<AbortController | null>(null)
  const busy = phase === 'planning' || phase === 'developing' || phase === 'finishing'

  // Chronomètre de l'étape en cours (remis à zéro par `begin`).
  useEffect(() => {
    if (!busy) return
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [busy])

  function begin(next: Phase) {
    setFailure(null)
    setPhase(next)
    setSeconds(0)
  }

  const errorText = (e: AiError) => `${t.ai.errors[e.kind]}${e.detail && e.kind !== 'aborted' ? ` (${e.detail})` : ''}`

  function count(run: AiRun<unknown>) {
    setUsage((u) => ({
      tokens: u.tokens + (run.usage.promptTokens ?? 0) + (run.usage.completionTokens ?? 0),
      cost: run.usage.cost === undefined ? u.cost : (u.cost ?? 0) + run.usage.cost,
    }))
  }

  function context(): StagedContext {
    abort.current = new AbortController()
    const signal = abort.current.signal
    const ask: Ask = (input, check, opts) =>
      askAi({ ...settings, reasoning: opts.reasoning ?? settings.reasoning }, input, check, { signal, onText: opts.onText })
    // La tâche de chaque étape remplace « create ».
    const base = input()
    return { ask, known: knownVocabulary(editor), base, reasoning: settings.reasoning, signal }
  }

  const onText = (text: string, thinking: number) => setProgress({ chars: text.length, thinking })

  async function proposePlan(previous?: DiagramPlan) {
    setPlanIssues([])
    begin('planning')
    setProgress({ chars: 0, thinking: 0 })
    try {
      const run = await askPlan(context(), { previous, remarks, onText })
      count(run)
      setPlan(run.plan)
      setRemarks('')
      if (reviewFirst || previous) setPhase('review')
      else await develop(run.plan)
    } catch (e) {
      setFailure(errorText(toAiError(e)))
      setPhase(previous ? 'review' : 'idle')
    }
  }

  /** Le plan, contrôlé ; sinon ses problèmes s'affichent. */
  function checkedPlan(current: DiagramPlan) {
    const source = input().source
    const checked = readPlan(current, knownVocabulary(editor), { paragraphs: source && sourceParagraphs(source.text).length })
    setPlanIssues(checked.ok ? [] : checked.issues.filter((i) => i.level === 'error'))
    return checked.ok
  }

  async function live(current: DiagramPlan) {
    if (!checkedPlan(current)) return
    setOpening(true)
    try {
      const { instruction, notes, source, withSequence, method } = input()
      await onLive({
        plan: current,
        request: instruction,
        notes: notes !== false,
        ...(source && { source }),
        ...(withSequence === false && { withSequence }),
        ...(method && { method }),
      })
    } catch (e) {
      setFailure(errorText(toAiError(e)))
      setOpening(false)
    }
  }

  async function develop(current: DiagramPlan) {
    if (!checkedPlan(current)) return setPhase('review')
    state.current = memoryStore(current, { source: !!input().source })
    await runSections(
      current,
      current.sections.map((s) => s.id)
    )
  }

  async function runSections(current: DiagramPlan, ids: string[]) {
    begin('developing')
    for (const id of ids) failed.current.delete(id)
    setSections((all) => ({
      ...all,
      ...Object.fromEntries(ids.map((id) => [id, { status: 'waiting', chars: 0, thinking: 0 } as SectionRun])),
    }))
    const update = (id: string, change: Partial<SectionRun>) => setSections((all) => ({ ...all, [id]: { ...all[id], ...change } }))
    await developSections(context(), current, state.current!, ids, {
      onStart: (id) => update(id, { status: 'running' }),
      onText: (id, chars, thinking) => update(id, { chars, thinking }),
      onDone: (id, run, added) => {
        count(run)
        update(id, { status: 'done', added })
      },
      onFail: (id, error) => {
        failed.current.add(id)
        update(id, { status: 'failed', error: errorText(error) })
      },
    })
    if (failed.current.size) setPhase('halted')
    else await finish(current)
  }

  async function finish(current: DiagramPlan) {
    setFinishFailed(false)
    begin('finishing')
    setProgress({ chars: 0, thinking: 0 })
    try {
      count(await finishMap(context(), current, state.current!, onText))
      setPhase('done')
      onResult(state.current!.map)
    } catch (e) {
      setFinishFailed(true)
      setFailure(errorText(toAiError(e)))
      setPhase('halted')
    }
  }

  function takeAsIs() {
    setPhase('done')
    onResult(state.current!.map)
  }

  // ---------- Affichage ----------

  const status = (run: SectionRun | undefined) => {
    if (!run || run.status === 'waiting') return <span className="text-zinc-400">{t.staged.status.waiting}</span>
    if (run.status === 'running')
      return <span className="text-zinc-600">{!run.chars && run.thinking ? t.staged.status.thinking(run.thinking) : t.staged.status.running(run.chars)}</span>
    if (run.status === 'done') return <span className="text-emerald-700">✓ {t.staged.status.done(run.added ?? 0)}</span>
    return <span className="text-red-700">✕</span>
  }
  const stepStatus = (label: string, active: boolean, done: boolean) => (
    <li className="staged-row">
      <span className="staged-row-title">{label}</span>
      {active ? (
        <span className="text-zinc-600">
          {!progress.chars && progress.thinking ? t.staged.status.thinking(progress.thinking) : t.staged.status.running(progress.chars)}
        </span>
      ) : done ? (
        <span className="text-emerald-700">✓</span>
      ) : (
        <span className="text-zinc-400">{t.staged.status.waiting}</span>
      )}
    </li>
  )
  const started = phase !== 'idle' && phase !== 'planning' && phase !== 'review'
  const tokens = usage.tokens > 0 && t.ai.usage(usage.tokens, usage.cost)

  return (
    <div className="grid gap-2">
      {(phase === 'idle' || phase === 'planning') && (
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={busy || !canStart} onClick={() => void proposePlan()}>
            {t.staged.start}
          </button>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={reviewFirst} disabled={busy} onChange={(e) => setReviewFirst(e.target.checked)} />
            {t.staged.reviewFirst}
          </label>
        </div>
      )}

      {phase === 'review' && plan && (
        <section className="staged-plan grid gap-2">
          <PlanEditor plan={plan} onChange={setPlan} issues={planIssues} />
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" disabled={opening} onClick={() => void live(plan)}>
              {t.staged.live}
            </button>
            <button className="btn" disabled={opening} onClick={() => void develop(plan)}>
              {t.staged.develop}
            </button>
          </div>
          <p className="text-xs text-zinc-500">{t.staged.liveHint}</p>
          <label className="grid gap-1 text-xs">
            <span className="text-zinc-500">{t.staged.remarks}</span>
            <textarea
              className="map-json-input assistant-instruction"
              rows={2}
              value={remarks}
              placeholder={t.staged.remarksPlaceholder}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </label>
          <button className="btn justify-self-start" onClick={() => void proposePlan(plan)}>
            {t.staged.replan}
          </button>
        </section>
      )}

      {(phase === 'planning' || started) && (
        <ol className="staged-progress text-xs">
          {stepStatus(t.staged.planning, phase === 'planning', phase !== 'planning')}
          {started &&
            plan?.sections.map((s, i) => (
              <li key={s.id}>
                <div className="staged-row">
                  <span className="staged-row-title">
                    {i + 1}. {s.text}
                  </span>
                  {status(sections[s.id])}
                  {phase === 'halted' && sections[s.id]?.status === 'failed' && (
                    <button className="btn-xs" onClick={() => void runSections(plan, [s.id])}>
                      {t.staged.retry}
                    </button>
                  )}
                </div>
                {sections[s.id]?.status === 'failed' && <p className="pl-4 text-red-700">{sections[s.id].error}</p>}
              </li>
            ))}
          {started && stepStatus(t.staged.finishing, phase === 'finishing', phase === 'done')}
        </ol>
      )}

      {(busy || tokens) && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-600" role="status">
          {busy && <span>{t.staged.elapsed(seconds)}</span>}
          {tokens && <span>{tokens}</span>}
          {busy && (
            <button className="btn-xs" onClick={() => abort.current?.abort()}>
              {t.ai.stop}
            </button>
          )}
        </div>
      )}

      {phase === 'halted' && plan && (
        <div className="flex flex-wrap items-center gap-2">
          {finishFailed ? (
            <button className="btn-primary" onClick={() => void finish(plan)}>
              {t.staged.retryFinish}
            </button>
          ) : (
            <>
              <button className="btn-primary" onClick={() => void runSections(plan, [...failed.current])}>
                {t.staged.retryFailed}
              </button>
              <button className="btn" onClick={() => void finish(plan)}>
                {t.staged.finishAnyway}
              </button>
            </>
          )}
          <button className="btn" onClick={takeAsIs}>
            {t.staged.useAsIs}
          </button>
        </div>
      )}

      {failure && (
        <p className="text-xs text-red-700" role="alert">
          {failure}
        </p>
      )}
      {phase === 'done' && (
        <p className="text-xs text-emerald-700">
          {finishFailed || Object.values(sections).some((r) => r.status === 'failed') ? t.staged.partial : t.staged.done}
        </p>
      )}
    </div>
  )
}
