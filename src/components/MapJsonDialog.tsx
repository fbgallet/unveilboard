'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { atom, useValue, type Editor } from 'tldraw'
import { m, useT } from '@/i18n/client'
import { ASSISTANT_TASKS, buildPrompt, type Task } from '@/lib/ai/prompts'
import { readSequence } from '@/lib/canvas/adapter'
import { createDocumentFromMap, editorPromptInput, readPasted, selectedRefs } from '@/lib/canvas/assistant'
import { aiSettingsAtom, askAi, isAiReady, modelName, serverAiAtom } from '@/lib/ai/client'
import { toAiError } from '@/lib/ai/errors'
import type { AiRun } from '@/lib/ai/run'
import { aiSettingsOpenAtom } from './AiSettingsDialog'
import { sourceDialogOpenAtom } from './SourceDialog'
import { exportMap } from '@/lib/canvas/mapExport'
import { applyPatch } from '@/lib/canvas/mapPatch'
import { setReview } from '@/lib/canvas/review'
import type { MapIssue } from '@/lib/map/check'
import type { MapPatch } from '@/lib/map/patch'
import { Markdownish } from './Markdownish'
import { StagedCreate } from './StagedCreate'
import { planPanelOpenAtom } from './PlanPanel'
import { skeletonMap } from '@/lib/map/plan'

export const mapImportOpenAtom = atom<boolean>('mapImportOpen', false)
export const assistantOpenAtom = atom<boolean>('assistantOpen', false)
/** Tâche proposée à l'ouverture de la boîte (null : selon le schéma). */
const assistantTaskAtom = atom<Task | null>('assistantTask', null)

/** Ouvre la boîte « Consigne pour une IA », sur une tâche donnée. */
export function openAssistant(task?: Task) {
  assistantTaskAtom.set(task ?? null)
  assistantOpenAtom.set(true)
}

/** Le schéma ouvert au format JSON (src/lib/map/format.ts), indenté. */
export function mapJsonText(editor: Editor) {
  return JSON.stringify(exportMap(editor).map, null, 2) + '\n'
}

/** Télécharge le schéma ouvert au format JSON (« titre.unveilboard.json »). */
export function downloadMapJson(editor: Editor) {
  const fallback = m().files.defaultName
  const title = readSequence(editor)?.title || fallback
  const name = `${title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || fallback}.unveilboard.json`
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([mapJsonText(editor)], { type: 'application/json' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function Dialog({ title, onClose, wide, children }: { title: string; onClose(): void; wide?: boolean; children: React.ReactNode }) {
  const t = useT()
  return (
    <div className="preset-overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`preset-dialog share-dialog ${wide ? 'assistant-dialog' : ''}`} role="dialog" aria-label={title}>
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button className="preset-icon" onClick={onClose} aria-label={t.common.close}>
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}

/** Coller du JSON : un schéma entier (ouvert comme nouveau schéma) ou des modifications du schéma ouvert. */
export function MapImportDialog({ editor }: { editor: Editor }) {
  const open = useValue(mapImportOpenAtom)
  if (!open) return null
  return <MapImportView editor={editor} />
}

function MapImportView({ editor }: { editor: Editor }) {
  const t = useT()
  const [text, setText] = useState('')
  const close = () => mapImportOpenAtom.set(false)
  return (
    <Dialog title={t.mapJson.title} onClose={close}>
      <p className="text-xs text-zinc-500">
        {t.mapJson.intro}{' '}
        <a className="underline" href={t.mapJson.formatUrl} target="_blank" rel="noreferrer">
          {t.mapJson.formatLink}
        </a>
      </p>
      <JsonPastePanel editor={editor} onDone={close} text={text} setText={setText} />
    </Dialog>
  )
}

/** Zone de collage, contrôle et application d'un JSON (partagée par les deux boîtes de dialogue). */
function JsonPastePanel({ editor, onDone, text, setText }: { editor: Editor; onDone(): void; text: string; setText(text: string): void }) {
  const t = useT()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const result = useMemo(() => (text.trim() ? readPasted(editor, text) : null), [text, editor])

  async function pickFile(file: File | undefined) {
    if (file) setText(await file.text())
  }

  async function run() {
    if (!result?.ok) return
    if (result.kind === 'patch') {
      applyPatch(editor, result.patch)
      return onDone()
    }
    if (result.kind === 'review') {
      setReview(result.review.summary, result.remarks)
      return onDone()
    }
    setBusy(true)
    setFailure(null)
    try {
      const id = await createDocumentFromMap(result.map)
      onDone()
      router.push(`/d/${id}`)
    } catch (e) {
      setFailure(e instanceof Error ? e.message : t.common.genericError)
      setBusy(false)
    }
  }

  const issueLine = (issue: MapIssue, i: number) => (
    <li key={i}>
      {issue.path && <code className="text-zinc-500">{issue.path}</code>} {t.mapJson.issues[issue.code]}
      {issue.detail && <span className="text-zinc-500"> ({issue.detail})</span>}
    </li>
  )
  const errors = result?.issues.filter((i) => i.level === 'error') ?? []
  const warnings = result?.issues.filter((i) => i.level === 'warning') ?? []

  return (
    <>
      <textarea
        className="map-json-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t.mapJson.placeholder}
        aria-label={t.mapJson.pasteLabel}
        spellCheck={false}
        rows={10}
      />
      <label className="btn-xs self-start justify-self-start">
        {t.mapJson.chooseFile}
        <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => void pickFile(e.target.files?.[0])} />
      </label>
      {result?.ok && result.kind === 'map' && (
        <p className="text-xs text-emerald-700">{t.mapJson.valid(result.map.elements.length, result.map.sequence?.steps.length ?? 0)}</p>
      )}
      {result?.ok && result.kind === 'patch' && <PatchSummary patch={result.patch} />}
      {result?.ok && result.kind === 'review' && <p className="text-xs text-emerald-700">{t.review.valid(result.remarks.length)}</p>}
      {errors.length > 0 && (
        <section className="text-xs text-red-700">
          <h3 className="preset-group-title">{t.mapJson.errors}</h3>
          <ul className="map-json-issues">{errors.map(issueLine)}</ul>
        </section>
      )}
      {warnings.length > 0 && (
        <section className="text-xs text-amber-700">
          <h3 className="preset-group-title">{t.mapJson.warnings}</h3>
          <ul className="map-json-issues">{warnings.map(issueLine)}</ul>
        </section>
      )}
      {failure && <p className="text-xs text-red-700">{failure}</p>}
      <footer className="flex justify-end gap-2">
        <button className="btn" onClick={onDone}>
          {t.common.cancel}
        </button>
        <button className="btn-primary" disabled={!result?.ok || busy} onClick={() => void run()}>
          {busy ? t.mapJson.creating : result?.kind === 'patch' ? t.mapJson.apply : result?.kind === 'review' ? t.review.show : t.mapJson.create}
        </button>
      </footer>
    </>
  )
}

/** Ce que font les modifications : le résumé de l'IA, puis le compte des opérations. */
function PatchSummary({ patch }: { patch: MapPatch }) {
  const t = useT()
  const count = (op: MapPatch['operations'][number]['op']) => patch.operations.filter((o) => o.op === op).length
  const sequence = patch.operations.filter((o) => o.op === 'sequence').at(-1)
  const parts = [
    t.mapJson.counts.add(count('add')),
    t.mapJson.counts.update(count('update')),
    t.mapJson.counts.move(count('move')),
    t.mapJson.counts.remove(count('remove')),
    t.mapJson.counts.link(count('link')),
    sequence ? t.mapJson.counts.sequence(sequence.mode, sequence.steps.length) : '',
  ].filter(Boolean)
  return (
    <section className="patch-summary">
      <p className="text-xs font-medium text-emerald-700">{t.mapJson.patchValid(parts.join(', '))}</p>
      {patch.summary && (
        <div className="patch-summary-text">
          <Markdownish text={patch.summary} />
        </div>
      )}
    </section>
  )
}

/**
 * Consigne pour une IA : choisir une tâche, la préciser, copier la consigne (schéma compris) pour un
 * assistant ou un agent, puis coller sa réponse.
 */
export function AssistantDialog({ editor }: { editor: Editor }) {
  const open = useValue(assistantOpenAtom)
  if (!open) return null
  return <AssistantView editor={editor} />
}

function AssistantView({ editor }: { editor: Editor }) {
  const t = useT()
  const router = useRouter()
  const close = () => assistantOpenAtom.set(false)
  const settings = useValue(aiSettingsAtom)
  const server = useValue(serverAiAtom)
  const ready = isAiReady(settings, server)
  const [task, setTask] = useState<Task>(() => assistantTaskAtom.get() ?? (editor.getCurrentPageShapes().length ? 'enrich' : 'create'))
  const [instruction, setInstruction] = useState('')
  const [selection] = useState(() => selectedRefs(editor))
  const [useSelection, setUseSelection] = useState(selection.length > 0)
  const [notes, setNotes] = useState(true)
  const [staged, setStaged] = useState(false)
  const [copied, setCopied] = useState<number | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [answer, setAnswer] = useState('')
  const [run, setRun] = useState<{ chars: number; thinking: number; seconds: number; abort: AbortController } | null>(null)
  const [outcome, setOutcome] = useState<AiRun<unknown> & { seconds: number } | null>(null)

  const input = () => ({ ...editorPromptInput(editor, task, instruction, { selection: useSelection && task !== 'create' }), notes })
  const changed = () => {
    setCopied(null)
    setFailure(null)
  }

  async function copy() {
    changed()
    try {
      const prompt = buildPrompt(input())
      await navigator.clipboard.writeText(prompt)
      setCopied(prompt.length)
    } catch (e) {
      setFailure(e instanceof Error ? e.message : t.common.genericError)
    }
  }

  async function ask() {
    changed()
    setOutcome(null)
    const abort = new AbortController()
    const started = Date.now()
    const seconds = () => Math.round((Date.now() - started) / 1000)
    setRun({ chars: 0, thinking: 0, seconds: 0, abort })
    const timer = setInterval(() => setRun((r) => r && { ...r, seconds: seconds() }), 1000)
    try {
      const result = await askAi(settings, input(), (text) => readPasted(editor, text), {
        signal: abort.signal,
        onText: (text, thinking) => setRun((r) => r && { ...r, chars: text.length, thinking }),
      })
      setAnswer(result.text)
      setOutcome({ ...result, seconds: seconds() })
    } catch (e) {
      const error = toAiError(e)
      setFailure(`${t.ai.errors[error.kind]}${error.detail && error.kind !== 'aborted' ? ` (${error.detail})` : ''}`)
    } finally {
      clearInterval(timer)
      setRun(null)
    }
  }

  const tokens = (outcome?.usage.promptTokens ?? 0) + (outcome?.usage.completionTokens ?? 0)

  return (
    <Dialog title={t.assistant.title} onClose={close} wide>
      <p className="text-xs text-zinc-500">{t.assistant.intro}</p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
        <span>{t.ai.using(t.ai.providers[ready ? settings.kind : 'clipboard'], ready ? modelName(settings, server) : '')}</span>
        <button className="btn-xs" onClick={() => aiSettingsOpenAtom.set(true)}>
          {t.ai.configure}
        </button>
      </div>
      <section className="grid gap-2">
        <h3 className="preset-group-title">{ready ? t.assistant.step1Ai : t.assistant.step1}</h3>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={t.assistant.taskLabel}>
          {ASSISTANT_TASKS.map((k) => (
            <button
              key={k}
              role="radio"
              aria-checked={task === k}
              className={`btn-xs ${task === k ? 'assistant-task-on' : ''}`}
              onClick={() => {
                setTask(k)
                changed()
              }}
            >
              {t.assistant.tasks[k]}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-500">
          {t.assistant.taskHints[task]}
          {task === 'create' && (
            <>
              {' '}
              <button
                className="underline"
                onClick={() => {
                  close()
                  sourceDialogOpenAtom.set(true)
                }}
              >
                {t.assistant.fromSource}
              </button>
            </>
          )}
        </p>
        <textarea
          className="map-json-input assistant-instruction"
          value={instruction}
          onChange={(e) => {
            setInstruction(e.target.value)
            changed()
          }}
          placeholder={t.assistant.placeholders[task]}
          aria-label={t.assistant.instructionLabel}
          rows={task === 'create' ? 6 : 3}
        />
        {task !== 'sequence' && (
          <label className="flex items-center gap-2 text-xs" title={t.ai.notesHint}>
            <input
              type="checkbox"
              checked={notes}
              onChange={(e) => {
                setNotes(e.target.checked)
                changed()
              }}
            />
            {t.ai.notesOption}
          </label>
        )}
        {task === 'create' && ready && (
          <label className="grid gap-0.5 text-xs">
            <span className="flex items-center gap-2">
              <input type="checkbox" checked={staged} disabled={!!run} onChange={(e) => setStaged(e.target.checked)} />
              {t.staged.option}
            </span>
            <span className="pl-5 text-zinc-500">{t.staged.hint}</span>
          </label>
        )}
        {task !== 'create' && selection.length > 0 && (
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={useSelection} onChange={(e) => setUseSelection(e.target.checked)} />
            {t.assistant.useSelection(selection.length)}
          </label>
        )}
        {task === 'create' && ready && staged ? (
          <StagedCreate
            editor={editor}
            settings={settings}
            input={() => ({ ...editorPromptInput(editor, 'create', instruction, { delivery: 'api' }), notes })}
            canStart={!!instruction.trim()}
            onResult={(map) => setAnswer(JSON.stringify(map, null, 2))}
            onLive={async (record) => {
              const id = await createDocumentFromMap(skeletonMap(record.plan, { source: !!record.source }), { plan: record })
              planPanelOpenAtom.set(true)
              close()
              router.push(`/d/${id}`)
            }}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {ready && (
              <button className="btn-primary" disabled={!!run || (task === 'create' && !instruction.trim())} onClick={() => void ask()}>
                {t.ai.ask}
              </button>
            )}
            <button
              className={ready ? 'btn' : 'btn-primary'}
              disabled={!!run || (task === 'create' && !instruction.trim())}
              onClick={() => void copy()}
            >
              {t.assistant.copy}
            </button>
            {run && (
              <>
                <span className="text-xs text-zinc-600" role="status">
                  {!run.chars && run.thinking ? t.ai.thinking(run.thinking, run.seconds) : t.ai.running(run.chars, run.seconds)}
                </span>
                <button className="btn-xs" onClick={() => run.abort.abort()}>
                  {t.ai.stop}
                </button>
              </>
            )}
            {copied !== null && <span className="text-xs text-emerald-700">{t.assistant.copied(Math.ceil(copied / 1000))}</span>}
            {failure && (
              <span className="text-xs text-red-700" role="alert">
                {failure}
              </span>
            )}
            {failure && task === 'create' && ready && (
              <button className="btn-xs" onClick={() => setStaged(true)}>
                {t.staged.tryIt}
              </button>
            )}
          </div>
        )}
        {outcome && (
          <p className="text-xs text-zinc-600">
            {t.ai.done(outcome.model ?? '', outcome.seconds)}
            {outcome.attempts > 1 && ` ${t.ai.retried}`}
            {tokens > 0 && ` (${t.ai.usage(tokens, outcome.usage.cost)})`}
          </p>
        )}
      </section>
      <section className="grid gap-2 border-t border-zinc-200 pt-3">
        <h3 className="preset-group-title">{ready ? t.assistant.step2Ai : t.assistant.step2}</h3>
        <JsonPastePanel editor={editor} onDone={close} text={answer} setText={setAnswer} />
      </section>
    </Dialog>
  )
}
