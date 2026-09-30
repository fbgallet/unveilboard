'use client'

import { useRef, useState } from 'react'
import { atom, useValue, type Editor } from 'tldraw'
import { useT } from '@/i18n/client'
import { aiSettingsAtom, askAi, isAiReady, modelName, serverAiAtom } from '@/lib/ai/client'
import { toAiError, type AiError } from '@/lib/ai/errors'
import type { AiRun } from '@/lib/ai/run'
import { askPlan, developSections, finishMap, type Ask, type StagedContext } from '@/lib/ai/staged'
import { editorPromptInput } from '@/lib/canvas/assistant'
import { exportMap, textOf } from '@/lib/canvas/mapExport'
import { knownVocabulary } from '@/lib/canvas/mapImport'
import { canvasStore, readPlanRecord, sectionStates, shapeOfRef, writePlanRecord } from '@/lib/canvas/plan'
import { readPageSource } from '@/lib/canvas/source'
import type { MapIssue } from '@/lib/map/check'
import { planPatch, readPlan, type DiagramPlan } from '@/lib/map/plan'
import { previewPatch } from '@/lib/map/patch'
import { applyPatch } from '@/lib/canvas/mapPatch'
import { PlanEditor } from './PlanEditor'
import { aiSettingsOpenAtom } from './AiSettingsDialog'

export const planPanelOpenAtom = atom<boolean>('planPanelOpen', false)

/**
 * Panneau « Plan du schéma » : construire un schéma riche en direct, à partir de son plan (gardé
 * dans le document). Chaque section se développe depuis sa tête, en suggestions sur le canevas ;
 * puis les liens et la séquence.
 */
export function PlanPanel({ editor }: { editor: Editor }) {
  const open = useValue(planPanelOpenAtom)
  const hasPlan = useValue('has plan', () => !!readPlanRecord(editor), [editor])
  if (!open) return null
  return hasPlan ? <PlanView editor={editor} /> : <PlanProposal editor={editor} />
}

/** Pas encore de plan : l'IA en propose un pour le schéma ouvert, qu'on relit avant de l'adopter. */
function PlanProposal({ editor }: { editor: Editor }) {
  const t = useT()
  const settings = useValue(aiSettingsAtom)
  const server = useValue(serverAiAtom)
  const ready = isAiReady(settings, server)
  const [request, setRequest] = useState('')
  const [plan, setPlan] = useState<DiagramPlan | null>(null)
  const [existing, setExisting] = useState(new Set<string>())
  const [issues, setIssues] = useState<MapIssue[]>([])
  const [remarks, setRemarks] = useState('')
  const [run, setRun] = useState<{ chars: number; thinking: number; abort: AbortController } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  async function propose(previous?: DiagramPlan) {
    setFailure(null)
    setIssues([])
    const abort = new AbortController()
    setRun({ chars: 0, thinking: 0, abort })
    const ask: Ask = (input, check, opts) =>
      askAi({ ...settings, reasoning: opts.reasoning ?? settings.reasoning }, input, check, { signal: abort.signal, onText: opts.onText })
    const base = editorPromptInput(editor, 'plan', request, { delivery: 'api', withSource: true })
    try {
      const result = await askPlan(
        { ask, known: knownVocabulary(editor), base, reasoning: settings.reasoning, signal: abort.signal },
        { previous, remarks, onText: (text, thinking) => setRun((r) => r && { ...r, chars: text.length, thinking }) }
      )
      setPlan(result.plan)
      setRemarks('')
      setExisting(new Set(exportMap(editor).map.elements.map((e) => e.id)))
    } catch (e) {
      const error = toAiError(e)
      setFailure(`${t.ai.errors[error.kind]}${error.detail && error.kind !== 'aborted' ? ` (${error.detail})` : ''}`)
    } finally {
      setRun(null)
    }
  }

  /** Ajoute au schéma les têtes qui manquent (une modification annulable), puis garde le plan. */
  function adopt(current: DiagramPlan) {
    const known = knownVocabulary(editor)
    const checked = readPlan(current, known)
    if (!checked.ok) return setIssues(checked.issues.filter((i) => i.level === 'error'))
    const map = exportMap(editor).map
    const patch = planPatch(current, map)
    if (patch) {
      const errors = previewPatch(map, patch, known).issues.filter((i) => i.level === 'error')
      if (errors.length) return setIssues(errors)
      applyPatch(editor, patch)
    }
    writePlanRecord(editor, { plan: current, request, notes: true })
    editor.zoomToFit({ animation: { duration: 300 } })
  }

  return (
    <aside className="review-panel plan-panel" aria-label={t.plan.title}>
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t.plan.title}</h2>
        <button className="preset-icon" onClick={() => planPanelOpenAtom.set(false)} aria-label={t.common.close}>
          ✕
        </button>
      </header>
      <p className="text-xs text-zinc-500">{t.plan.proposeIntro}</p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
        <span>{t.ai.using(t.ai.providers[ready ? settings.kind : 'clipboard'], ready ? modelName(settings, server) : '')}</span>
        <button className="btn-xs" onClick={() => aiSettingsOpenAtom.set(true)}>
          {t.ai.configure}
        </button>
      </div>
      <textarea
        className="map-json-input assistant-instruction"
        rows={3}
        value={request}
        aria-label={t.plan.request}
        placeholder={t.plan.requestPlaceholder}
        onChange={(e) => setRequest(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button className={plan ? 'btn' : 'btn-primary'} disabled={!ready || !!run} onClick={() => void propose()}>
          {t.plan.propose}
        </button>
        {run && (
          <>
            <span className="text-xs text-zinc-600" role="status">
              {!run.chars && run.thinking ? t.staged.status.thinking(run.thinking) : t.staged.status.running(run.chars)}
            </span>
            <button className="btn-xs" onClick={() => run.abort.abort()}>
              {t.ai.stop}
            </button>
          </>
        )}
      </div>
      {failure && (
        <p className="text-xs text-red-700" role="alert">
          {failure}
        </p>
      )}
      {plan && !run && (
        <section className="grid gap-2">
          <PlanEditor plan={plan} onChange={setPlan} issues={issues} existing={existing} />
          <button className="btn-primary justify-self-start" onClick={() => adopt(plan)}>
            {t.plan.adopt}
          </button>
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
          <button className="btn justify-self-start" onClick={() => void propose(plan)}>
            {t.staged.replan}
          </button>
        </section>
      )}
    </aside>
  )
}

function PlanView({ editor }: { editor: Editor }) {
  const t = useT()
  const settings = useValue(aiSettingsAtom)
  const server = useValue(serverAiAtom)
  const ready = isAiReady(settings, server)
  const live = useValue(
    'plan sections',
    () => {
      const record = readPlanRecord(editor)
      return record && { record, states: sectionStates(editor, record) }
    },
    [editor]
  )
  const [running, setRunning] = useState<Record<string, { chars: number; thinking: number }>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [requests, setRequests] = useState<Record<string, string>>({})
  const [direct, setDirect] = useState(false)
  const [finishing, setFinishing] = useState<{ chars: number; thinking: number } | null>(null)
  const [finished, setFinished] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [usage, setUsage] = useState({ tokens: 0, cost: undefined as number | undefined })
  const aborts = useRef(new Set<AbortController>())
  if (!live) return null
  const { record, states } = live
  const plan = record.plan
  const busy = Object.keys(running).length > 0 || !!finishing
  const pending = states.reduce((n, s) => n + s.pending, 0)

  const errorText = (e: AiError) => `${t.ai.errors[e.kind]}${e.detail && e.kind !== 'aborted' ? ` (${e.detail})` : ''}`
  const count = (run: AiRun<unknown>) =>
    setUsage((u) => ({
      tokens: u.tokens + (run.usage.promptTokens ?? 0) + (run.usage.completionTokens ?? 0),
      cost: run.usage.cost === undefined ? u.cost : (u.cost ?? 0) + run.usage.cost,
    }))

  /** Le plan tel qu'il est : les textes des têtes et de la racine sont ceux du canevas. */
  const currentPlan = (): DiagramPlan => {
    const root = shapeOfRef(editor, plan.root.id)
    return {
      ...plan,
      root: { ...plan.root, text: (root && textOf(editor, root)) || plan.root.text },
      sections: plan.sections.map((s, i) => ({ ...s, text: states[i].text })),
    }
  }

  function context(): { ctx: StagedContext; done(): void } {
    const abort = new AbortController()
    aborts.current.add(abort)
    const ask: Ask = (input, check, opts) =>
      askAi({ ...settings, reasoning: opts.reasoning ?? settings.reasoning }, input, check, { signal: abort.signal, onText: opts.onText })
    // La tâche de chaque étape remplace « develop ». Le texte source est gardé dans le document.
    const source = record.source ?? readPageSource(editor) ?? undefined
    const base = {
      ...editorPromptInput(editor, 'develop', record.request, { delivery: 'api' }),
      notes: record.notes !== false,
      // Schéma tiré d'un texte : chaque section reçoit son passage, et ses extraits sont vérifiés.
      ...(source && { source }),
      ...(record.withSequence === false && { withSequence: false }),
    }
    return {
      ctx: { ask, known: knownVocabulary(editor), base, reasoning: settings.reasoning, signal: abort.signal },
      done: () => aborts.current.delete(abort),
    }
  }

  async function develop(ids: string[]) {
    setFailure(null)
    setFinished(false)
    setErrors((all) => Object.fromEntries(Object.entries(all).filter(([id]) => !ids.includes(id))))
    setRunning((all) => ({ ...all, ...Object.fromEntries(ids.map((id) => [id, { chars: 0, thinking: 0 }])) }))
    const stop = (id: string) => setRunning((all) => Object.fromEntries(Object.entries(all).filter(([k]) => k !== id)))
    const { ctx, done } = context()
    await developSections(
      ctx,
      currentPlan(),
      canvasStore(editor, { ghost: !direct }),
      ids,
      {
        onStart: () => {},
        onText: (id, chars, thinking) => setRunning((all) => (all[id] ? { ...all, [id]: { chars, thinking } } : all)),
        onDone: (id, run) => {
          count(run)
          stop(id)
          // Les nouvelles branches (souvent hors de l'écran) : on recadre sur tout le schéma.
          editor.zoomToFit({ animation: { duration: 300 } })
          setRequests((all) => ({ ...all, [id]: '' }))
        },
        onFail: (id, error) => {
          stop(id)
          setErrors((all) => ({ ...all, [id]: errorText(error) }))
        },
      },
      requests
    )
    done()
  }

  async function finish() {
    setFailure(null)
    setFinished(false)
    setFinishing({ chars: 0, thinking: 0 })
    const { ctx, done } = context()
    try {
      count(await finishMap(ctx, currentPlan(), canvasStore(editor, { ghost: false }), (text, thinking) => setFinishing({ chars: text.length, thinking })))
      setFinished(true)
    } catch (e) {
      setFailure(errorText(toAiError(e)))
    } finally {
      setFinishing(null)
      done()
    }
  }

  const saveBrief = (i: number, brief: string) => {
    if (brief === plan.sections[i].brief) return
    writePlanRecord(editor, { ...record, plan: { ...plan, sections: plan.sections.map((s, k) => (k === i ? { ...s, brief } : s)) } })
  }
  const show = (id: string) => {
    const head = shapeOfRef(editor, id)
    if (!head) return
    editor.select(head.id)
    editor.zoomToSelection({ animation: { duration: 300 } })
  }
  const progress = (p: { chars: number; thinking: number }) => (!p.chars && p.thinking ? t.staged.status.thinking(p.thinking) : t.staged.status.running(p.chars))
  // Sections restantes : ni développées ni en attente ; en suggestions, les synthèses attendent les autres.
  const remaining = states.filter((s, i) => s.exists && !s.developed && !s.pending && !running[s.id] && (direct || !plan.sections[i].synthesis))
  // Prochaine étape, pour guider : développer, trancher les suggestions, la synthèse, puis liens et séquence.
  const synthesis = states.findIndex((s, i) => plan.sections[i].synthesis && s.exists && !s.developed && !s.pending && !running[s.id])
  const next = busy
    ? null
    : remaining.length
      ? t.plan.next.develop
      : pending > 0
        ? t.plan.next.decide
        : synthesis >= 0
          ? t.plan.next.synthesis(synthesis + 1)
          : finished
            ? t.plan.next.done
            : t.plan.next.finish
  const finishNext = !busy && !remaining.length && !pending && synthesis < 0 && !finished

  return (
    <aside className="review-panel plan-panel" aria-label={t.plan.title}>
      <header className="flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-sm font-semibold">
          {t.plan.title} · {plan.title}
        </h2>
        <button className="preset-icon" onClick={() => planPanelOpenAtom.set(false)} aria-label={t.common.close}>
          ✕
        </button>
      </header>
      <p className="text-xs text-zinc-500">{t.plan.intro}</p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
        <span>{t.ai.using(t.ai.providers[ready ? settings.kind : 'clipboard'], ready ? modelName(settings, server) : '')}</span>
        <button className="btn-xs" onClick={() => aiSettingsOpenAtom.set(true)}>
          {t.ai.configure}
        </button>
      </div>
      {plan.pattern && <p className="patch-summary-text text-xs">{plan.pattern}</p>}

      <ol className="grid grid-cols-1 gap-2">
        {plan.sections.map((section, i) => {
          const state = states[i]
          const run = running[section.id]
          return (
            <li key={section.id} className="staged-section grid grid-cols-1 gap-1 text-xs">
              <div className="staged-row">
                <span className="staged-row-title font-medium" title={state.text}>
                  {i + 1}. {state.text}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {run ? (
                  <span className="text-zinc-600">{progress(run)}</span>
                ) : !state.exists ? (
                  <span className="text-zinc-400">{t.plan.status.missing}</span>
                ) : state.pending ? (
                  <span className="text-amber-700">{t.plan.status.pending(state.pending)}</span>
                ) : state.developed ? (
                  <span className="text-emerald-700">✓ {t.plan.status.developed(state.developed)}</span>
                ) : (
                  <span className="text-zinc-500">{t.plan.status.todo}</span>
                )}
                <span className="flex-1" />
                <button className="btn-xs" disabled={!state.exists} onClick={() => show(section.id)}>
                  {t.plan.show}
                </button>
                <button className="btn-xs" disabled={!ready || !state.exists || !!state.pending || !!run} onClick={() => void develop([section.id])}>
                  {state.developed ? t.plan.complete : t.plan.develop}
                </button>
              </div>
              {errors[section.id] && <p className="text-red-700">✕ {errors[section.id]}</p>}
              {section.synthesis && !direct && !state.developed && <p className="text-zinc-500">{t.plan.synthesisLater}</p>}
              <details>
                <summary className="cursor-pointer text-zinc-500">{t.plan.details}</summary>
                <div className="mt-1 grid gap-1">
                  <textarea
                    key={section.brief}
                    className="map-json-input assistant-instruction"
                    rows={2}
                    defaultValue={section.brief}
                    aria-label={t.plan.brief}
                    placeholder={t.plan.brief}
                    onBlur={(e) => saveBrief(i, e.target.value)}
                  />
                  <input
                    className="preset-input"
                    value={requests[section.id] ?? ''}
                    aria-label={t.plan.precision}
                    placeholder={t.plan.precisionPlaceholder}
                    onChange={(e) => setRequests((all) => ({ ...all, [section.id]: e.target.value }))}
                  />
                </div>
              </details>
            </li>
          )
        })}
      </ol>

      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={direct} onChange={(e) => setDirect(e.target.checked)} />
        {t.plan.direct}
      </label>
      {next && (
        <p className="plan-next text-xs" role="status">
          <strong>{t.plan.next.label}</strong> {next}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          className={finishNext ? 'btn' : 'btn-primary'}
          disabled={!ready || !remaining.length}
          onClick={() => void develop(remaining.map((s) => s.id))}
        >
          {t.plan.developAll}
        </button>
        <button className={finishNext ? 'btn-primary' : 'btn'} disabled={!ready || !!finishing} onClick={() => void finish()}>
          {t.plan.finish}
        </button>
      </div>
      {pending > 0 && <p className="text-xs text-amber-700">{t.plan.finishPending}</p>}
      {finishing && (
        <p className="text-xs text-zinc-600" role="status">
          {t.staged.finishing} · {progress(finishing)}
        </p>
      )}
      {(busy || usage.tokens > 0) && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-600">
          {usage.tokens > 0 && <span>{t.ai.usage(usage.tokens, usage.cost)}</span>}
          {busy && (
            <button className="btn-xs" onClick={() => aborts.current.forEach((a) => a.abort())}>
              {t.ai.stop}
            </button>
          )}
        </div>
      )}
      {finished && <p className="text-xs text-emerald-700">{t.plan.finished}</p>}
      {failure && (
        <p className="text-xs text-red-700" role="alert">
          {failure}
        </p>
      )}
      <button
        className="btn-xs justify-self-start"
        disabled={busy}
        onClick={() => {
          writePlanRecord(editor, null)
          planPanelOpenAtom.set(false)
        }}
      >
        {t.plan.forget}
      </button>
    </aside>
  )
}
