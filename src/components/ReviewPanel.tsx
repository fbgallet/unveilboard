'use client'

import { useState } from 'react'
import { atom, renderPlaintextFromRichText, useEditor, useValue, type Editor, type TLRichText, type TLShapeId } from 'tldraw'
import { useT } from '@/i18n/client'
import type { Messages } from '@/i18n/config'
import { aiSettingsAtom, askAi, isAiReady, modelName, serverAiAtom } from '@/lib/ai/client'
import { toAiError } from '@/lib/ai/errors'
import { buildPrompt } from '@/lib/ai/prompts'
import { editorPromptInput, selectedRefs } from '@/lib/canvas/assistant'
import { exportMap } from '@/lib/canvas/mapExport'
import { knownVocabulary } from '@/lib/canvas/mapImport'
import { presetById } from '@/lib/canvas/presets'
import { applyRemark, dismissRemark, focusRemark, remarkShapes, reviewAtom, reviewFocusAtom, reviewOpenAtom, setReview, toggleReviewFocus } from '@/lib/canvas/review'
import { checkMap, type MapIssue } from '@/lib/map/check'
import { FOCUS_OF_AUTO, REVIEW_FOCUS, autoRemarks, nameRefs, summarizeOperations, type OperationSummary, type Remark, type StrengthNote } from '@/lib/map/review'
import { readJson, type ReadResult } from '@/lib/map/read'
import { modeAtom } from '@/lib/presentation/store'
import { aiSettingsOpenAtom } from './AiSettingsDialog'
import { Markdownish } from './Markdownish'

/** Remarque mise en avant (cliquée sur le canevas ou dans la liste). */
const activeRemarkAtom = atom<string | null>('activeRemark', null)
/** Vérifications automatiques ignorées pendant la séance. */
const ignoredAutoAtom = atom<string[]>('ignoredAuto', [])

const RANK = { high: 0, medium: 1, low: 2 } as const

/** Remarques à afficher, numérotées : celles de l'IA et du programme, par priorité. */
function useRemarks(editor: Editor): Remark[] {
  return useValue(
    'review remarks',
    () => {
      if (!reviewOpenAtom.get()) return []
      const map = exportMap(editor).map
      const hidden = checkMap(map, knownVocabulary(editor))
        .filter((i) => i.code === 'shown_but_hidden' && i.detail)
        .map((i) => i.detail!)
      const ignored = new Set(ignoredAutoAtom.get())
      // Vérifications automatiques : seulement celles des axes cochés.
      const focus = new Set(reviewFocusAtom.get())
      const auto = autoRemarks(map, hidden).filter((r) => !ignored.has(r.id) && (!r.code || focus.has(FOCUS_OF_AUTO[r.code])))
      const ids = new Set(map.elements.map((e) => e.id))
      // Remarques de l'IA dont les éléments ont tous disparu : sans objet.
      const ai = reviewAtom.get().remarks.filter((r) => !r.targets.length || r.targets.some((t) => ids.has(t)))
      return [...ai, ...auto].sort((a, b) => RANK[a.priority] - RANK[b.priority])
    },
    [editor]
  )
}

/** Sur le canevas : le numéro de chaque remarque, au coin des éléments qu'elle vise. */
export function ReviewBadges() {
  const t = useT()
  const editor = useEditor()
  const remarks = useRemarks(editor)
  const active = useValue(activeRemarkAtom)
  const badges = useValue(
    'review badges',
    () => {
      if (modeAtom.get() !== 'edit' || !reviewOpenAtom.get()) return []
      const byShape = new Map<TLShapeId, { n: number; id: string }[]>()
      remarks.forEach((r, i) => {
        for (const shape of remarkShapes(editor, r)) byShape.set(shape, [...(byShape.get(shape) ?? []), { n: i + 1, id: r.id }])
      })
      // Force estimée des raisons et objections, à côté des numéros de remarques.
      const shapes = exportMap(editor).shapes
      const strengthOf = new Map<TLShapeId, StrengthNote>()
      for (const note of reviewAtom.get().strengths ?? []) {
        const s = shapes.get(note.target)
        if (s) strengthOf.set(s.node as TLShapeId, note)
      }
      return [...new Set([...byShape.keys(), ...strengthOf.keys()])].flatMap((shape) => {
        const b = editor.getShapePageBounds(shape)
        // Coin supérieur droit : le coin gauche porte déjà les numéros d'étape.
        return b && !editor.isShapeHidden(shape) ? [{ shape, x: b.maxX, y: b.minY, list: byShape.get(shape) ?? [], strength: strengthOf.get(shape) }] : []
      })
    },
    [editor, remarks]
  )
  const zoom = useValue('zoom', () => editor.getZoomLevel(), [editor])
  return (
    <>
      {badges.map((b) => (
        <div key={b.shape} className="review-badges" style={{ left: b.x, top: b.y, transform: `scale(${1 / zoom}) translate(-40%, -60%)` }}>
          {b.strength && (
            <span className={`review-strength review-strength-${b.strength.strength}`} title={b.strength.reason}>
              {t.review.strengths[b.strength.strength]}
            </span>
          )}
          {b.list.map(({ n, id }) => (
            <button
              key={id}
              className={`review-badge ${active === id ? 'review-badge-active' : ''}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => activeRemarkAtom.set(id)}
              aria-label={t.review.badge(n)}
            >
              {t.review.badge(n)}
            </button>
          ))}
        </div>
      ))}
    </>
  )
}

/** Panneau « Relecture critique » : demander une relecture à l'IA, trancher chaque remarque. */
export function ReviewPanel({ editor }: { editor: Editor }) {
  const open = useValue(reviewOpenAtom)
  if (!open) return null
  return <ReviewView editor={editor} />
}

function ReviewView({ editor }: { editor: Editor }) {
  const t = useT()
  const settings = useValue(aiSettingsAtom)
  const server = useValue(serverAiAtom)
  const ready = isAiReady(settings, server)
  const review = useValue(reviewAtom)
  const focus = useValue(reviewFocusAtom)
  const remarks = useRemarks(editor)
  const active = useValue(activeRemarkAtom)
  const [instruction, setInstruction] = useState('')
  const [selection] = useState(() => selectedRefs(editor))
  const [useSelection, setUseSelection] = useState(false)
  const [run, setRun] = useState<{ chars: number; thinking: number; abort: AbortController } | null>(null)
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')
  const [failure, setFailure] = useState<string | null>(null)
  const [issues, setIssues] = useState<MapIssue[]>([])
  /** Remarques dont la correction ne s'applique plus (le schéma a changé depuis la relecture). */
  const [stale, setStale] = useState<string[]>([])

  const input = (delivery: 'api' | 'clipboard') =>
    editorPromptInput(editor, 'review', instruction, { selection: useSelection, delivery, reviewFocus: focus, withSource: true })
  /** Réponse : une relecture ; première réponse d'une IA : une correction invalide est à corriger. */
  const check = (answer: string, attempt: number): ReadResult => {
    const result = readJson(answer, knownVocabulary(editor), exportMap(editor).map, { strict: attempt === 1 })
    if (result.kind === 'review' || !result.ok) return result
    return { kind: 'unknown', ok: false, issues: [{ level: 'error', code: 'wrong_format', path: 'format', detail: 'expected "unveilboard/review"' }] }
  }
  const accept = (result: ReadResult) => {
    if (!result.ok || result.kind !== 'review') return setIssues(result.issues.filter((i) => i.level === 'error'))
    setIssues([])
    setReview(result.review.summary, result.remarks, result.strengths)
    setPasting(false)
    setPasted('')
  }

  async function ask() {
    setFailure(null)
    setIssues([])
    const abort = new AbortController()
    setRun({ chars: 0, thinking: 0, abort })
    try {
      const result = await askAi(settings, input('api'), check, { signal: abort.signal, onText: (s, thinking) => setRun((r) => r && { ...r, chars: s.length, thinking }) })
      accept(result.result)
    } catch (e) {
      const error = toAiError(e)
      setFailure(`${t.ai.errors[error.kind]}${error.detail && error.kind !== 'aborted' ? ` (${error.detail})` : ''}`)
    } finally {
      setRun(null)
    }
  }

  async function copy() {
    setFailure(null)
    try {
      await navigator.clipboard.writeText(buildPrompt(input('clipboard')))
      setPasting(true)
    } catch (e) {
      setFailure(e instanceof Error ? e.message : t.common.genericError)
    }
  }

  const textOf = (ref: string) => {
    const shape = exportMap(editor).shapes.get(ref)
    const s = shape && editor.getShape(shape.node as TLShapeId)
    const rich = s && (s.props as { richText?: TLRichText }).richText
    const text = rich ? renderPlaintextFromRichText(editor, rich).trim().split('\n')[0] : ref
    return text.length > 48 ? `${text.slice(0, 47)}…` : text
  }
  const nameOf = (id: string | null | undefined) => (id ? (presetById(editor, id)?.name ?? id) : '')
  // Identifiants laissés par le modèle dans son texte (« def1 ») : le texte de l'élément à la place.
  const readable = (text: string) => {
    const refs = exportMap(editor).shapes
    return nameRefs(text, (id) => (refs.has(id) ? textOf(id) : undefined))
  }

  return (
    <aside className="review-panel" aria-label={t.review.title}>
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t.review.title}</h2>
        <button className="preset-icon" onClick={() => reviewOpenAtom.set(false)} aria-label={t.common.close}>
          ✕
        </button>
      </header>
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
        <span>{t.ai.using(t.ai.providers[ready ? settings.kind : 'clipboard'], ready ? modelName(settings, server) : '')}</span>
        <button className="btn-xs" onClick={() => aiSettingsOpenAtom.set(true)}>
          {t.ai.configure}
        </button>
      </div>
      <fieldset className="review-focus">
        <legend>{t.review.focusLabel}</legend>
        {REVIEW_FOCUS.map((f) => (
          <label key={f} className={`review-focus-item ${focus.includes(f) ? 'review-focus-on' : ''}`} title={t.review.focusHints[f]}>
            <input type="checkbox" checked={focus.includes(f)} onChange={() => toggleReviewFocus(f)} disabled={focus.length === 1 && focus.includes(f)} />
            {t.review.focus[f]}
          </label>
        ))}
      </fieldset>
      <textarea
        className="map-json-input assistant-instruction"
        rows={2}
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder={t.review.placeholder}
        aria-label={t.review.instructionLabel}
      />
      {selection.length > 0 && (
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={useSelection} onChange={(e) => setUseSelection(e.target.checked)} />
          {t.assistant.useSelection(selection.length)}
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {ready ? (
          <button className="btn-primary" disabled={!!run} onClick={() => void ask()}>
            {t.review.ask}
          </button>
        ) : (
          <button className="btn-primary" onClick={() => void copy()}>
            {t.assistant.copy}
          </button>
        )}
        {run && (
          <>
            <span className="text-xs text-zinc-600" role="status">
              {!run.chars && run.thinking ? t.ai.thinking(run.thinking) : t.review.running(run.chars)}
            </span>
            <button className="btn-xs" onClick={() => run.abort.abort()}>
              {t.ai.stop}
            </button>
          </>
        )}
      </div>
      {pasting && (
        <div className="grid gap-1">
          <span className="text-xs text-emerald-700">{t.review.copied}</span>
          <textarea
            className="map-json-input"
            rows={4}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            aria-label={t.mapJson.pasteLabel}
            placeholder={t.mapJson.placeholder}
            spellCheck={false}
          />
          <button className="btn self-start justify-self-start" disabled={!pasted.trim()} onClick={() => accept(check(pasted, 2))}>
            {t.review.show}
          </button>
        </div>
      )}
      {failure && (
        <p className="text-xs text-red-700" role="alert">
          {failure}
        </p>
      )}
      {issues.length > 0 && (
        <ul className="map-json-issues text-xs text-red-700" role="alert">
          {issues.map((issue, i) => (
            <li key={i}>
              {issue.path && <code className="text-zinc-500">{issue.path}</code>} {t.mapJson.issues[issue.code]}
            </li>
          ))}
        </ul>
      )}
      {review.summary && (
        <div className="patch-summary-text">
          <Markdownish text={readable(review.summary)} />
        </div>
      )}
      {!!review.strengths?.length && (
        <details className="review-strengths" open>
          <summary>{t.review.strengthsTitle}</summary>
          <ul>
            {review.strengths.map((n) => (
              <li key={n.target}>
                <span className={`review-strength review-strength-${n.strength}`}>{t.review.strengths[n.strength]}</span>
                <button className="review-target" onClick={() => focusRemark(editor, { id: n.target, origin: 'ai', kind: 'other', priority: 'low', targets: [n.target] })}>
                  {textOf(n.target)}
                </button>
                <span className="text-xs text-zinc-700">{readable(n.reason)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <ol className="review-list">
        {remarks.map((r, i) => (
          <li key={r.id} className={`review-item ${active === r.id ? 'review-item-active' : ''}`} ref={(el) => void (active === r.id && el?.scrollIntoView({ block: 'nearest' }))}>
            <div className="flex flex-wrap items-center gap-1 text-[11px]">
              <span className="review-badge">{t.review.badge(i + 1)}</span>
              <span className="font-semibold uppercase tracking-wide">{t.review.kinds[r.kind]}</span>
              {r.name && <span className="review-name">{r.name}</span>}
              <span className={`review-priority review-priority-${r.priority}`}>{t.review.priorities[r.priority]}</span>
              <span className="text-zinc-400">{r.origin === 'auto' ? t.review.auto.origin : t.review.aiOrigin}</span>
            </div>
            <p className="text-xs text-zinc-800">{r.code ? t.review.auto[r.code] : readable(r.message ?? '')}</p>
            {r.targets.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {r.targets.map((ref) => (
                  <button
                    key={ref}
                    className="review-target"
                    onClick={() => {
                      activeRemarkAtom.set(r.id)
                      focusRemark(editor, { ...r, targets: [ref] })
                    }}
                  >
                    {textOf(ref)}
                  </button>
                ))}
              </div>
            )}
            {r.operations && (
              <ul className="review-fix">
                {summarizeOperations(r.operations, exportMap(editor).map).map((op, k) => (
                  <li key={k}>{describe(op, t, nameOf)}</li>
                ))}
              </ul>
            )}
            {r.fixIssues && <p className="text-[11px] text-amber-700">{t.review.fixInvalid}</p>}
            {stale.includes(r.id) && <p className="text-[11px] text-red-700">{t.review.fixStale}</p>}
            <div className="flex flex-wrap gap-1">
              {r.operations && (
                <button
                  className="btn-xs"
                  onClick={() => {
                    if (applyRemark(editor, r).length) setStale((l) => [...l, r.id])
                  }}
                >
                  {t.review.applyFix}
                </button>
              )}
              <button
                className="btn-xs"
                onClick={() => (r.origin === 'auto' ? ignoredAutoAtom.update((l) => [...l, r.id]) : dismissRemark(r.id))}
              >
                {t.review.dismiss}
              </button>
            </div>
          </li>
        ))}
      </ol>
      {!remarks.length && <p className="text-xs text-zinc-500">{review.remarks.length || review.summary ? t.review.noneLeft : t.review.none}</p>}
    </aside>
  )
}

/** Une opération de correction, en mots. */
function describe(op: OperationSummary, t: Messages, nameOf: (id: string | null | undefined) => string): string {
  const quote = (s: string) => (s.length > 60 ? `${s.slice(0, 59)}…` : s)
  switch (op.op) {
    case 'add':
      return t.review.ops.add(quote(op.text), nameOf(op.type), nameOf(op.relation), op.parent ? quote(op.parent) : '')
    case 'update':
      return t.review.ops.update(
        quote(op.target),
        op.fields.map(({ key, value }) =>
          value === null
            ? t.review.ops.cleared(t.review.fields[key] ?? key)
            : t.review.ops.field(t.review.fields[key] ?? key, typeof value === 'string' ? quote(key === 'type' || key === 'relation' ? nameOf(value) : value) : JSON.stringify(value))
        )
      )
    case 'move':
      return t.review.ops.move(quote(op.target), quote(op.parent), op.relation ? nameOf(op.relation) : '')
    case 'remove':
      return t.review.ops.remove(quote(op.target))
    case 'link':
      return t.review.ops.link(quote(op.from), nameOf(op.relation), quote(op.to))
    case 'sequence':
      return t.review.ops.sequence(op.mode, op.steps)
  }
}
