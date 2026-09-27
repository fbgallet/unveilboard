'use client'

import { useEffect, useState } from 'react'
import { atom, renderPlaintextFromRichText, useValue, type Editor, type TLRichText, type TLShapeId } from 'tldraw'
import { useT } from '@/i18n/client'
import { aiSettingsAtom, askAi, isAiReady, serverAiAtom } from '@/lib/ai/client'
import { toAiError } from '@/lib/ai/errors'
import { buildPrompt } from '@/lib/ai/prompts'
import { editorPromptInput, readPasted } from '@/lib/canvas/assistant'
import { applyPatch } from '@/lib/canvas/mapPatch'
import type { MapIssue } from '@/lib/map/check'
import type { ReadResult } from '@/lib/map/read'
import { aiSettingsOpenAtom } from './AiSettingsDialog'
import { Markdownish } from './Markdownish'

/** Élément d'où partir (panneau ouvert), ou null. */
export const elementAiAtom = atom<TLShapeId | null>('elementAi', null)

/** Demandes toutes faites : la clé d'une phrase de t.elementAi.quick. */
const QUICK = ['arguments', 'objections', 'answers', 'examples', 'assumptions', 'distinctions', 'definitions', 'consequences'] as const

/** Réponse de l'IA acceptable ici : des modifications (pas un schéma entier). */
function patchOnly(result: ReadResult): ReadResult {
  if (result.kind === 'patch' || !result.ok) return result
  return { kind: 'unknown', ok: false, issues: [{ level: 'error', code: 'wrong_format', path: 'format', detail: 'expected "unveilboard/patch"' }] }
}

/**
 * À partir d'un élément : une consigne pour l'IA (avec ou sans le reste du schéma), qui lui relie de
 * nouveaux éléments, en suggestions à valider (formes estompées) ou directement.
 */
export function ElementAiPanel({ editor }: { editor: Editor }) {
  const id = useValue(elementAiAtom)
  const exists = useValue('element ai target', () => !!id && !!editor.getShape(id), [editor, id])
  useEffect(() => {
    if (id && !exists) elementAiAtom.set(null)
  }, [id, exists])
  if (!id || !exists) return null
  return <ElementAiView key={id} editor={editor} id={id} />
}

function ElementAiView({ editor, id }: { editor: Editor; id: TLShapeId }) {
  const t = useT()
  const settings = useValue(aiSettingsAtom)
  const server = useValue(serverAiAtom)
  const ready = isAiReady(settings, server)
  const close = () => elementAiAtom.set(null)
  const text = useValue(
    'element text',
    () => {
      const shape = editor.getShape(id)
      const rich = shape && (shape.props as { richText?: TLRichText }).richText
      const plain = rich ? renderPlaintextFromRichText(editor, rich).trim().split('\n')[0] : ''
      return plain.length > 60 ? `${plain.slice(0, 59)}…` : plain
    },
    [editor, id]
  )
  const [instruction, setInstruction] = useState('')
  const [wholeMap, setWholeMap] = useState(true)
  const [ghost, setGhost] = useState(true)
  const [notes, setNotes] = useState(true)
  const [run, setRun] = useState<{ chars: number; abort: AbortController } | null>(null)
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')
  const [issues, setIssues] = useState<MapIssue[]>([])
  const [failure, setFailure] = useState<string | null>(null)
  const [done, setDone] = useState<{ added: number; skipped: number; summary?: string } | null>(null)

  const input = () => ({ ...editorPromptInput(editor, 'expand', instruction, { focus: id, wholeMap, delivery: ready ? 'api' : 'clipboard' }), notes })
  const reset = () => {
    setIssues([])
    setFailure(null)
    setDone(null)
  }

  /** Applique une réponse valide : en suggestions, ou directement. */
  function apply(result: ReadResult) {
    if (!result.ok || result.kind !== 'patch') return setIssues(result.issues.filter((i) => i.level === 'error'))
    const added = result.patch.operations.filter((o) => o.op === 'add' || o.op === 'link').length
    const { skipped } = applyPatch(editor, result.patch, { ghost })
    setDone({ added, skipped, summary: result.patch.summary })
    setPasted('')
    setPasting(false)
  }

  async function ask() {
    reset()
    const abort = new AbortController()
    setRun({ chars: 0, abort })
    try {
      const result = await askAi(settings, input(), (answer) => patchOnly(readPasted(editor, answer)), {
        signal: abort.signal,
        onText: (answer) => setRun((r) => r && { ...r, chars: answer.length }),
      })
      apply(result.result)
    } catch (e) {
      const error = toAiError(e)
      setFailure(`${t.ai.errors[error.kind]}${error.detail && error.kind !== 'aborted' ? ` (${error.detail})` : ''}`)
    } finally {
      setRun(null)
    }
  }

  async function copy() {
    reset()
    try {
      await navigator.clipboard.writeText(buildPrompt(input()))
      setPasting(true)
    } catch (e) {
      setFailure(e instanceof Error ? e.message : t.common.genericError)
    }
  }

  return (
    <div className="element-ai" role="dialog" aria-label={t.elementAi.title} onKeyDown={(e) => e.key === 'Escape' && close()}>
      <header className="flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-sm font-semibold">{t.elementAi.heading(text)}</h2>
        <button className="preset-icon" onClick={close} aria-label={t.common.close}>
          ✕
        </button>
      </header>
      <div className="flex flex-wrap gap-1">
        {QUICK.map((k) => (
          <button
            key={k}
            className="btn-xs"
            onClick={() => {
              setInstruction(t.elementAi.quick[k].request)
              reset()
            }}
          >
            {t.elementAi.quick[k].label}
          </button>
        ))}
      </div>
      <textarea
        className="map-json-input assistant-instruction"
        rows={2}
        value={instruction}
        onChange={(e) => {
          setInstruction(e.target.value)
          reset()
        }}
        placeholder={t.elementAi.placeholder}
        aria-label={t.elementAi.instructionLabel}
        autoFocus
      />
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={wholeMap} onChange={(e) => setWholeMap(e.target.checked)} />
        {t.elementAi.wholeMap}
      </label>
      <label className="flex items-center gap-2 text-xs" title={t.ai.notesHint}>
        <input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} />
        {t.ai.notesOption}
      </label>
      <div className="flex flex-wrap items-center gap-3 text-xs" role="radiogroup" aria-label={t.elementAi.resultLabel}>
        <label className="flex items-center gap-1">
          <input type="radio" name="element-ai-mode" checked={ghost} onChange={() => setGhost(true)} />
          {t.elementAi.asSuggestions}
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" name="element-ai-mode" checked={!ghost} onChange={() => setGhost(false)} />
          {t.elementAi.directly}
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {ready ? (
          <button className="btn-primary" disabled={!!run || !instruction.trim()} onClick={() => void ask()}>
            {t.ai.ask}
          </button>
        ) : (
          <button className="btn-primary" disabled={!instruction.trim()} onClick={() => void copy()}>
            {t.assistant.copy}
          </button>
        )}
        <button className="btn-xs" onClick={() => aiSettingsOpenAtom.set(true)}>
          {t.ai.configure}
        </button>
        {run && (
          <>
            <span className="text-xs text-zinc-600" role="status">
              {t.elementAi.running(run.chars)}
            </span>
            <button className="btn-xs" onClick={() => run.abort.abort()}>
              {t.ai.stop}
            </button>
          </>
        )}
      </div>
      {pasting && (
        <div className="grid gap-1">
          <span className="text-xs text-emerald-700">{t.elementAi.copied}</span>
          <textarea
            className="map-json-input"
            rows={4}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={t.mapJson.placeholder}
            aria-label={t.mapJson.pasteLabel}
            spellCheck={false}
          />
          <button className="btn self-start justify-self-start" disabled={!pasted.trim()} onClick={() => apply(patchOnly(readPasted(editor, pasted)))}>
            {ghost ? t.elementAi.addSuggestions : t.mapJson.apply}
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
              {issue.detail && <span className="text-zinc-500"> ({issue.detail})</span>}
            </li>
          ))}
        </ul>
      )}
      {done && (
        <div className="grid gap-1 text-xs">
          <p className="text-emerald-700" role="status">
            {ghost ? t.elementAi.doneGhost(done.added) : t.elementAi.doneDirect(done.added)}
            {done.skipped > 0 && ` ${t.elementAi.skipped(done.skipped)}`}
          </p>
          {done.summary && (
            <div className="patch-summary-text">
              <Markdownish text={done.summary} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
