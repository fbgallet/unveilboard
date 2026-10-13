'use client'

import { useState } from 'react'
import { atom, renderPlaintextFromRichText, useEditor, useValue, type Editor, type TLRichText, type TLShapeId } from 'tldraw'
import { useT } from '@/i18n/client'
import { deepenText } from '@/lib/ai/aims'
import { REASONING_EFFORTS, type ReasoningEffort } from '@/lib/ai/chat'
import { aiSettingsAtom, isAiReady, serverAiAtom, type AiSettings } from '@/lib/ai/client'
import { MODELS } from '@/lib/ai/models'
import { toAiError } from '@/lib/ai/errors'
import {
  completeRequest,
  deepenable,
  lastElementRunAtom,
  regenerateRun,
  regenerateSuggestion,
  runElementRequest,
  type ElementCallOptions,
  type ElementRequest,
  type ElementRun,
} from '@/lib/canvas/elementAi'
import type { MapIssue } from '@/lib/map/check'
import { modeAtom, panelTabAtom, sequencePanelOpenAtom, storeValue } from '@/lib/presentation/store'
import {
  acceptAllSuggestions,
  acceptSuggestion,
  pendingSuggestions,
  rejectAllSuggestions,
  rejectSuggestion,
  removeAdded,
  suggestionOf,
} from '@/lib/canvas/suggestions'
import { modelLabel } from './AiSettingsDialog'
import { Markdownish } from './Markdownish'

/** Régénération demandée : une suggestion (boîte), ou tout le dernier développement. */
type RedoTarget = { kind: 'one'; id: TLShapeId } | { kind: 'all' }
const redoTargetAtom = atom<RedoTarget | null>('redoTarget', null)

/** Sur le canevas : ✓ et ✗ au coin de chaque suggestion de l'IA en attente (boîte ou lien). */
export function SuggestionBadges() {
  const t = useT()
  const editor = useEditor()
  const badges = useValue(
    'suggestion badges',
    () => {
      if (modeAtom.get() !== 'edit') return []
      return pendingSuggestions(editor).flatMap((s) => {
        const b = editor.getShapePageBounds(s.id)
        if (!b || editor.isShapeHidden(s.id)) return []
        // Boîte : coin supérieur droit ; lien : son milieu.
        const at = s.type === 'arrow' ? { x: b.midX, y: b.midY } : { x: b.maxX, y: b.minY }
        return [{ id: s.id, ...at, rationale: suggestionOf(s)?.rationale ?? '', box: s.type !== 'arrow' }]
      })
    },
    [editor]
  )
  const zoom = useValue('zoom', () => editor.getZoomLevel(), [editor])
  const settings = useValue(aiSettingsAtom)
  const server = useValue(serverAiAtom)
  const ready = isAiReady(settings, server)
  return (
    <>
      {badges.map((b) => (
        <div
          key={b.id}
          className="suggestion-badges"
          style={{ left: b.x, top: b.y, transform: `scale(${1 / zoom}) translate(-50%, -50%)` }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button className="suggestion-accept" title={[t.suggestions.accept, b.rationale].filter(Boolean).join(' · ')} aria-label={t.suggestions.accept} onClick={() => acceptSuggestion(editor, b.id)}>
            ✓
          </button>
          <button className="suggestion-reject" title={t.suggestions.reject} aria-label={t.suggestions.reject} onClick={() => rejectSuggestion(editor, b.id)}>
            ✕
          </button>
          {ready && b.box && (
            <button
              className="suggestion-redo"
              title={t.elementAi.follow.redoOne}
              aria-label={t.elementAi.follow.redoOne}
              onClick={() => redoTargetAtom.set({ kind: 'one', id: b.id })}
            >
              ↻
            </button>
          )}
        </div>
      ))}
    </>
  )
}

/**
 * Barre des suggestions en attente : leur nombre, la raison de celle sélectionnée, tout accepter ou
 * tout écarter. Après un développement à partir d'un élément, elle le prolonge sans rouvrir la
 * boîte : son résumé, compléter (sans répéter), approfondir (les éléments acceptés), continuer
 * dans le chat ; ajouté directement, retirer les ajouts.
 */
export function SuggestionBar({ editor }: { editor: Editor }) {
  const t = useT()
  const info = useValue(
    'suggestion bar',
    () => {
      const pending = pendingSuggestions(editor)
      if (!pending.length) return null
      const selected = editor.getOnlySelectedShape()
      const rationale = selected && pending.some((s) => s.id === selected.id) ? (suggestionOf(selected)?.rationale ?? '') : ''
      return { count: pending.length, rationale, selected: selected?.id as TLShapeId | undefined }
    },
    [editor]
  )
  // Dernier développement, s'il porte sur cette page et que son élément de départ existe encore.
  const run = useValue(
    'element run',
    () => {
      const r = lastElementRunAtom.get()
      return r && r.page === editor.getCurrentPageId() && editor.getShape(r.request.focus) ? r : null
    },
    [editor]
  )
  const remaining = useValue('run boxes', () => (run ? run.outcome.boxes.filter((id) => editor.getShape(id)).length : 0), [editor, run])
  const toDeepen = useValue('run deepenable', () => (run ? deepenable(editor, run) : []), [editor, run])
  const settings = useValue(aiSettingsAtom)
  const server = useValue(serverAiAtom)
  const ready = isAiReady(settings, server)
  const [busy, setBusy] = useState<{ chars: number; thinking: number; abort: AbortController } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  // Résumé déplié pour ce développement-là (replié pour le suivant).
  const [summaryOf, setSummaryOf] = useState<ElementRun | null>(null)
  const summaryOpen = !!run && summaryOf === run
  // Régénération demandée (sur une suggestion qui existe encore, ou sur le dernier développement).
  const redo = useValue(
    'redo target',
    () => {
      const target = redoTargetAtom.get()
      if (target?.kind === 'one') return editor.getShape(target.id) ? target : null
      return target
    },
    [editor]
  )
  if (!info && !run && !busy && !failure) return null
  const f = t.elementAi.follow

  /** Lance une demande de suivi (compléter, approfondir, régénérer) : progression et erreurs dans la barre. */
  async function track(call: (opts: ElementCallOptions) => Promise<{ issues: MapIssue[] } | { run: ElementRun }>) {
    setFailure(null)
    const abort = new AbortController()
    setBusy({ chars: 0, thinking: 0, abort })
    try {
      const outcome = await call({
        signal: abort.signal,
        onText: (answer, thinking) => setBusy((b) => b && { ...b, chars: answer.length, thinking }),
      })
      if ('issues' in outcome) setFailure(outcome.issues.map((i) => t.mapJson.issues[i.code]).join(' '))
    } catch (e) {
      const error = toAiError(e)
      if (error.kind !== 'aborted') setFailure(`${t.ai.errors[error.kind]}${error.detail ? ` (${error.detail})` : ''}`)
    } finally {
      setBusy(null)
    }
  }

  const follow = (req: ElementRequest) => track((opts) => runElementRequest(editor, req, opts))

  function regenerate(target: RedoTarget, direction: string, settings: AiSettings) {
    redoTargetAtom.set(null)
    void track((opts) =>
      target.kind === 'one'
        ? regenerateSuggestion(editor, target.id, direction, { ...opts, settings })
        : run
          ? regenerateRun(editor, run, direction, { ...opts, settings })
          : Promise.resolve({ issues: [] })
    )
  }

  const deepen = (r: ElementRun) =>
    follow({ ...r.request, avoid: undefined, deepen: toDeepen, aim: { label: f.deepen, text: deepenText(r.request.aim?.label) } })

  /** Dans le chat, avec les éléments ajoutés (sinon l'élément de départ) sélectionnés. */
  function toChat(r: ElementRun) {
    const ids = r.outcome.boxes.filter((id) => editor.getShape(id))
    editor.select(...(ids.length ? ids : [r.request.focus]))
    panelTabAtom.set('chat')
    sequencePanelOpenAtom.set(true)
    storeValue('sequencePanelOpen', true)
    lastElementRunAtom.set(null)
  }

  return (
    <div className="suggestion-bar" role="region" aria-label={t.suggestions.title}>
      {info ? (
        <>
          <strong>{t.suggestions.count(info.count)}</strong>
          {info.rationale && <span className="suggestion-rationale" title={info.rationale}>{info.rationale}</span>}
          <button className="btn-xs" onClick={() => acceptAllSuggestions(editor)}>
            {t.suggestions.acceptAll}
          </button>
          <button className="btn-xs" onClick={() => rejectAllSuggestions(editor)}>
            {t.suggestions.rejectAll}
          </button>
        </>
      ) : (
        run && !busy && <strong>{f.added(remaining)}</strong>
      )}
      {run && !busy && (
        <>
          {run.outcome.usage && run.outcome.usage.tokens > 0 && (
            <span className="suggestion-usage" title={f.usageHint}>
              {t.ai.usage(run.outcome.usage.tokens, run.outcome.usage.cost, run.outcome.usage.estimated)}
            </span>
          )}
          {info && <span className="suggestion-bar-sep" aria-hidden />}
          {run.outcome.summary && (
            <button className={`btn-xs ${summaryOpen ? 'btn-xs-on' : ''}`} aria-expanded={summaryOpen} onClick={() => setSummaryOf(summaryOpen ? null : run)}>
              {f.summary}
            </button>
          )}
          {!run.request.ghost && remaining > 0 && (
            <button
              className="btn-xs"
              onClick={() => {
                removeAdded(editor, run.outcome.boxes)
                lastElementRunAtom.set(null)
              }}
            >
              {f.remove}
            </button>
          )}
          {ready && (
            <button className="btn-xs" title={f.completeHint} onClick={() => void follow(completeRequest(editor, run))}>
              {f.complete}
            </button>
          )}
          {ready && remaining > 0 && (
            <button className="btn-xs" disabled={!toDeepen.length} title={toDeepen.length ? f.deepenHint : f.deepenPending} onClick={() => void deepen(run)}>
              {f.deepen}
            </button>
          )}
          {ready && remaining > 0 && (
            <button className={`btn-xs ${redo?.kind === 'all' ? 'btn-xs-on' : ''}`} title={f.redoAllHint} onClick={() => redoTargetAtom.set(redo?.kind === 'all' ? null : { kind: 'all' })}>
              {f.redo}…
            </button>
          )}
          <button className="btn-xs" title={f.chatHint} onClick={() => toChat(run)}>
            {f.chat}
          </button>
          <button className="preset-icon" aria-label={f.dismiss} title={f.dismiss} onClick={() => lastElementRunAtom.set(null)}>
            ✕
          </button>
        </>
      )}
      {busy && (
        <>
          <span role="status">{!busy.chars && busy.thinking ? t.ai.thinking(busy.thinking) : t.elementAi.running(busy.chars)}</span>
          <button className="btn-xs" onClick={() => busy.abort.abort()}>
            {t.ai.stop}
          </button>
        </>
      )}
      {failure && (
        <>
          <span className="suggestion-failure" role="alert" title={failure}>
            {failure}
          </span>
          {!run && (
            <button className="preset-icon" aria-label={f.dismiss} onClick={() => setFailure(null)}>
              ✕
            </button>
          )}
        </>
      )}
      {redo && !busy && <RedoPanel editor={editor} target={redo} onRedo={regenerate} />}
      {!redo && summaryOpen && run?.outcome.summary && (
        <div className="suggestion-summary patch-summary-text">
          <Markdownish text={run.outcome.summary} />
        </div>
      )}
    </div>
  )
}

/** Texte d'une boîte, abrégé (titre du panneau de régénération). */
function shortText(editor: Editor, id: TLShapeId) {
  const rich = (editor.getShape(id)?.props as { richText?: TLRichText } | undefined)?.richText
  const text = rich ? renderPlaintextFromRichText(editor, rich).trim().split('\n')[0] : ''
  return text.length > 50 ? `${text.slice(0, 49)}…` : text
}

/**
 * Régénérer une suggestion, ou tout le dernier développement : une direction facultative (sinon,
 * mieux), et le modèle et la réflexion pour cette demande seulement.
 */
function RedoPanel({ editor, target, onRedo }: { editor: Editor; target: RedoTarget; onRedo(target: RedoTarget, direction: string, settings: AiSettings): void }) {
  const t = useT()
  const f = t.elementAi.follow
  const settings = useValue(aiSettingsAtom)
  const server = useValue(serverAiAtom)
  const [direction, setDirection] = useState('')
  // Modèles qu'on peut choisir ici : ceux de l'instance, ou du catalogue OpenRouter (avec le modèle réglé).
  const models =
    settings.kind === 'server' && server
      ? server.models
      : settings.kind === 'openrouter'
        ? [...new Set([settings.openrouterModel, ...MODELS.map((m) => m.id)].filter(Boolean))]
        : []
  const current = settings.kind === 'server' ? settings.serverModel || server?.model || '' : settings.openrouterModel
  const [model, setModel] = useState(current)
  const [effort, setEffort] = useState<ReasoningEffort>(settings.reasoning)
  const go = () => {
    const override: AiSettings = {
      ...settings,
      reasoning: effort,
      ...(settings.kind === 'server' && { serverModel: model }),
      ...(settings.kind === 'openrouter' && { openrouterModel: model }),
    }
    onRedo(target, direction.trim(), override)
  }
  return (
    <div className="suggestion-summary redo-panel" role="dialog" aria-label={f.redo} onKeyDown={(e) => e.key === 'Escape' && redoTargetAtom.set(null)}>
      <strong className="truncate">{target.kind === 'one' ? f.redoOneTitle(shortText(editor, target.id)) : f.redoAllTitle}</strong>
      <textarea
        className="map-json-input"
        rows={2}
        value={direction}
        onChange={(e) => setDirection(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && go()}
        placeholder={f.redoPlaceholder}
        aria-label={f.redoPlaceholder}
        autoFocus
      />
      <div className="flex flex-wrap items-center gap-2 text-xs" title={f.overrideHint}>
        {models.length > 1 && (
          <label className="flex min-w-0 items-center gap-1">
            <span className="text-zinc-600">{f.model}</span>
            <select className="preset-input min-w-0 max-w-[16rem]" value={model} onChange={(e) => setModel(e.target.value)} aria-label={f.model}>
              {models.map((m) => (
                <option key={m} value={m}>
                  {modelLabel(m, t)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-1">
          <span className="text-zinc-600">{f.effort}</span>
          <select className="preset-input" value={effort} onChange={(e) => setEffort(e.target.value as ReasoningEffort)} aria-label={f.effort}>
            {REASONING_EFFORTS.map((r) => (
              <option key={r} value={r}>
                {t.ai.reasoningLevels[r]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button className="btn-primary" onClick={go}>
          {f.redo}
        </button>
        <button className="btn-xs" onClick={() => redoTargetAtom.set(null)}>
          {t.common.cancel}
        </button>
      </div>
    </div>
  )
}
