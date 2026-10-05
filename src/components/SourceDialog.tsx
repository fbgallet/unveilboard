'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { atom, useValue, type Editor } from 'tldraw'
import { useT } from '@/i18n/client'
import { aiSettingsAtom, askAi, isAiReady, modelName, serverAiAtom, transcribeFile } from '@/lib/ai/client'
import { toAiError } from '@/lib/ai/errors'
import { buildPrompt, type PromptInput } from '@/lib/ai/prompts'
import { createDocumentFromMap, editorPromptInput, readPasted } from '@/lib/canvas/assistant'
import type { MapIssue } from '@/lib/map/check'
import { checkExcerpts, type ExcerptCheck } from '@/lib/map/excerpts'
import type { ReadResult } from '@/lib/map/read'
import { LONG_SOURCE_CHARS, MAX_SOURCE_CHARS, MAX_TRANSCRIBE_BYTES, estimateTokens, fileToDataUri, readSourceFile } from '@/lib/source/read'
import { aiSettingsOpenAtom } from './AiSettingsDialog'
import { PromptPicker, usePromptChoice } from './PromptPicker'
import { planPanelOpenAtom } from './PlanPanel'
import { openSourcePanel } from './SourcePanel'
import { readPageSource } from '@/lib/canvas/source'
import { StagedCreate } from './StagedCreate'
import { skeletonMap } from '@/lib/map/plan'

export const sourceDialogOpenAtom = atom<boolean>('sourceDialogOpen', false)

/** Ouvre la boîte, remplie avec le texte source de la page (barre « Texte source »). */
export function openSourceDialogWithPageText() {
  prefillPageTextAtom.set(true)
  sourceDialogOpenAtom.set(true)
}
const prefillPageTextAtom = atom<boolean>('sourceDialogPrefill', false)

type Checked = ReadResult & { excerpts?: ExcerptCheck }

/**
 * Créer un schéma à partir d'un texte (collé, fichier texte ou Markdown, PDF, photo) : l'IA en tire
 * une carte d'argument ou une carte mentale, avec sa séquence ; chaque extrait cité est vérifié dans
 * le texte, et ce qui ne s'y trouve pas est signalé.
 */
export function SourceDialog({ editor }: { editor: Editor }) {
  const open = useValue(sourceDialogOpenAtom)
  if (!open) return null
  return <SourceView editor={editor} />
}

function SourceView({ editor }: { editor: Editor }) {
  const t = useT()
  const router = useRouter()
  const settings = useValue(aiSettingsAtom)
  const server = useValue(serverAiAtom)
  const ready = isAiReady(settings, server)
  const close = () => sourceDialogOpenAtom.set(false)

  const pageSource = useValue('page source', () => readPageSource(editor), [editor])
  // Ouverte depuis la barre du texte : remplie avec le texte de la page.
  const [prefilled] = useState(() => {
    const on = prefillPageTextAtom.get()
    prefillPageTextAtom.set(false)
    return on ? readPageSource(editor) : null
  })
  const [text, setText] = useState(prefilled?.text ?? '')
  const [label, setLabel] = useState(prefilled?.label ?? '')
  const [fileNote, setFileNote] = useState<string | null>(null)
  const [toTranscribe, setToTranscribe] = useState<{ file: File; reason: 'image' | 'scanned' } | null>(null)
  const [kind, setKind] = useState<NonNullable<PromptInput['kind']>>('auto')
  const [withSequence, setWithSequence] = useState(true)
  const [notes, setNotes] = useState(true)
  const [instruction, setInstruction] = useState('')
  const [run, setRun] = useState<{ what: 'transcribe' | 'generate'; chars: number; thinking: number; abort: AbortController } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [staged, setStaged] = useState(false)
  const [keepText, setKeepText] = useState(true)
  const prompt = usePromptChoice('create')

  const input = (delivery: PromptInput['delivery']): PromptInput => ({
    ...editorPromptInput(editor, 'create', instruction, { delivery }),
    source: { text, ...(label.trim() && { label: label.trim() }) },
    kind,
    withSequence,
    notes,
    ...(prompt.method && { method: prompt.method }),
  })

  /** Réponse de l'IA : un schéma entier, dont les extraits sont vérifiés dans le texte. */
  const check = (answerText: string, attempt: number): Checked => {
    const result = readPasted(editor, answerText)
    if (result.kind !== 'map') {
      return { kind: 'unknown', ok: false, issues: [{ level: 'error', code: 'wrong_format', path: 'format', detail: 'expected "unveilboard/map"' }] }
    }
    if (!result.ok) return result
    // Premier essai : un extrait introuvable est une erreur (le modèle est invité à corriger) ;
    // ensuite, un avertissement (le schéma s'ouvre, les éléments en cause sont signalés).
    const excerpts = checkExcerpts(result.map, text, attempt === 1)
    const issues = [...result.issues, ...excerpts.issues]
    if (excerpts.issues.some((i) => i.level === 'error')) return { kind: 'map', ok: false, issues }
    return { ...result, issues, excerpts }
  }
  // Réponse collée à la main : pas de correction possible, les extraits introuvables sont signalés.
  const checked = useMemo(() => (answer.trim() && text.trim() ? check(answer, 2) : null), [answer, text]) // eslint-disable-line react-hooks/exhaustive-deps

  async function pickFile(file: File | undefined) {
    if (!file) return
    setFailure(null)
    setToTranscribe(null)
    try {
      const read = await readSourceFile(file)
      if (read.kind === 'text') {
        setText(read.text)
        setFileNote(t.source.fileRead(read.name))
      } else if (read.kind === 'transcribe') {
        if (file.size > MAX_TRANSCRIBE_BYTES) return setFailure(t.source.tooBig)
        setToTranscribe({ file, reason: read.reason })
        setFileNote(read.reason === 'image' ? t.source.isImage(read.name) : t.source.isScanned(read.name))
      } else {
        setFailure(t.source.unsupported(read.name))
      }
    } catch (e) {
      setFailure(e instanceof Error ? e.message : t.common.genericError)
    }
  }

  async function transcribe() {
    if (!toTranscribe) return
    setFailure(null)
    const abort = new AbortController()
    setRun({ what: 'transcribe', chars: 0, thinking: 0, abort })
    try {
      const { file } = toTranscribe
      const dataUri = await fileToDataUri(file)
      const result = await transcribeFile(settings, { name: file.name, type: file.type || 'application/pdf', dataUri }, {
        signal: abort.signal,
        onText: (s, thinking) => setRun((r) => r && { ...r, chars: s.length, thinking }),
      })
      setText(result.text)
      if (result.reference && !label.trim()) setLabel(result.reference)
      setToTranscribe(null)
      setFileNote(t.source.transcribed(file.name))
    } catch (e) {
      setFailure(errorText(e))
    } finally {
      setRun(null)
    }
  }

  async function generate() {
    setFailure(null)
    setAnswer('')
    const abort = new AbortController()
    setRun({ what: 'generate', chars: 0, thinking: 0, abort })
    try {
      const result = await askAi(settings, input('api'), check, {
        signal: abort.signal,
        onText: (s, thinking) => setRun((r) => r && { ...r, chars: s.length, thinking }),
      })
      setAnswer(result.text)
    } catch (e) {
      setFailure(errorText(e))
    } finally {
      setRun(null)
    }
  }

  async function copy() {
    setFailure(null)
    try {
      await navigator.clipboard.writeText(buildPrompt(input('clipboard')))
      setCopied(true)
    } catch (e) {
      setFailure(e instanceof Error ? e.message : t.common.genericError)
    }
  }

  async function openDiagram() {
    if (!checked?.ok || checked.kind !== 'map') return
    setBusy(true)
    try {
      const id = await createDocumentFromMap(checked.map, {
        unverified: checked.excerpts?.unverified,
        ...(keepText && { source: { text, ...(label.trim() && { label: label.trim() }) } }),
      })
      if (keepText) openSourcePanel()
      close()
      router.push(`/d/${id}`)
    } catch (e) {
      setFailure(e instanceof Error ? e.message : t.common.genericError)
      setBusy(false)
    }
  }

  const errorText = (e: unknown) => {
    const error = toAiError(e)
    return `${t.ai.errors[error.kind]}${error.detail && error.kind !== 'aborted' ? ` (${error.detail})` : ''}`
  }

  const tooLong = text.length > MAX_SOURCE_CHARS
  const canGenerate = !!text.trim() && !tooLong && !run
  const issueLine = (issue: MapIssue, i: number) => (
    <li key={i}>
      {issue.path && <code className="text-zinc-500">{issue.path}</code>} {t.mapJson.issues[issue.code]}
      {issue.detail && <span className="text-zinc-500"> ({issue.detail})</span>}
    </li>
  )
  const errors = checked?.issues.filter((i) => i.level === 'error') ?? []
  const warnings = checked?.issues.filter((i) => i.level === 'warning') ?? []

  return (
    <div className="preset-overlay" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="preset-dialog share-dialog assistant-dialog" role="dialog" aria-label={t.source.title}>
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{t.source.title}</h2>
          <button className="preset-icon" onClick={close} aria-label={t.common.close}>
            ✕
          </button>
        </header>
        <p className="text-xs text-zinc-500">{t.source.intro}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
          <span>{t.ai.using(t.ai.providers[ready ? settings.kind : 'clipboard'], ready ? modelName(settings, server) : '')}</span>
          <button className="btn-xs" onClick={() => aiSettingsOpenAtom.set(true)}>
            {t.ai.configure}
          </button>
        </div>

        <section className="grid gap-2">
          <h3 className="preset-group-title">{t.source.step1}</h3>
          <textarea
            className="map-json-input assistant-instruction"
            rows={8}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setCopied(false)
            }}
            placeholder={t.source.placeholder}
            aria-label={t.source.textLabel}
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="btn-xs">
              {t.source.chooseFile}
              <input
                type="file"
                accept=".txt,.md,.markdown,text/plain,text/markdown,application/pdf,.pdf,image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => void pickFile(e.target.files?.[0])}
              />
            </label>
            {pageSource && text !== pageSource.text && (
              <button
                className="btn-xs"
                onClick={() => {
                  setText(pageSource.text)
                  if (pageSource.label) setLabel(pageSource.label)
                  setFileNote(null)
                }}
              >
                {t.source.usePageText}
              </button>
            )}
            {fileNote && <span className="text-xs text-zinc-600">{fileNote}</span>}
            {toTranscribe &&
              (ready ? (
                <button className="btn-xs" disabled={!!run} onClick={() => void transcribe()}>
                  {t.source.transcribe}
                </button>
              ) : (
                <span className="text-xs text-amber-700">{t.source.transcribeNeedsAi}</span>
              ))}
          </div>
          {text && (
            <p className={`text-xs ${tooLong ? 'text-red-700' : text.length > LONG_SOURCE_CHARS ? 'text-amber-700' : 'text-zinc-500'}`}>
              {t.source.size(text.length, estimateTokens(text))}
              {tooLong ? ` ${t.source.tooLong(MAX_SOURCE_CHARS)}` : text.length > LONG_SOURCE_CHARS ? ` ${t.source.long}` : ''}
            </p>
          )}
          <input
            className="preset-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t.source.labelPlaceholder}
            aria-label={t.source.labelLabel}
          />
        </section>

        <section className="grid gap-2">
          <h3 className="preset-group-title">{t.source.step2}</h3>
          <div className="flex flex-wrap items-center gap-3 text-xs" role="radiogroup" aria-label={t.source.kindLabel}>
            {(['auto', 'argument', 'mindmap'] as const).map((k) => (
              <label key={k} className="flex items-center gap-1">
                <input type="radio" name="source-kind" checked={kind === k} onChange={() => setKind(k)} />
                {t.source.kinds[k]}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={withSequence} onChange={(e) => setWithSequence(e.target.checked)} />
            {t.source.withSequence}
          </label>
          <label className="flex items-center gap-2 text-xs" title={t.ai.notesHint}>
            <input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} />
            {t.ai.notesOption}
          </label>
          <PromptPicker choice={prompt} disabled={!!run} />
          <textarea
            className="map-json-input assistant-instruction"
            rows={2}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={prompt.template?.placeholder ?? t.source.instructionPlaceholder}
            aria-label={t.source.instructionLabel}
          />
          {ready && (
            <label className="grid gap-0.5 text-xs">
              <span className="flex items-center gap-2">
                <input type="checkbox" checked={staged} disabled={!!run} onChange={(e) => setStaged(e.target.checked)} />
                {t.staged.option}
              </span>
              <span className="pl-5 text-zinc-500">{t.staged.hintSource}</span>
            </label>
          )}
          {ready && staged ? (
            <StagedCreate
              editor={editor}
              settings={settings}
              input={() => input('api')}
              canStart={!!text.trim() && !tooLong}
              onResult={(map) => setAnswer(JSON.stringify(map, null, 2))}
              onLive={async (record) => {
                const id = await createDocumentFromMap(skeletonMap(record.plan, { source: true }), {
                  plan: { ...record, source: undefined },
                  source: record.source,
                })
                planPanelOpenAtom.set(true)
                openSourcePanel()
                close()
                router.push(`/d/${id}`)
              }}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              {ready && (
                <button className="btn-primary" disabled={!canGenerate} onClick={() => void generate()}>
                  {t.source.generate}
                </button>
              )}
              <button className={ready ? 'btn' : 'btn-primary'} disabled={!canGenerate} onClick={() => void copy()}>
                {t.assistant.copy}
              </button>
              {run && (
                <>
                  <span className="text-xs text-zinc-600" role="status">
                    {!run.chars && run.thinking
                      ? t.ai.thinking(run.thinking)
                      : run.what === 'transcribe'
                        ? t.source.transcribing(run.chars)
                        : t.source.generating(run.chars)}
                  </span>
                  <button className="btn-xs" onClick={() => run.abort.abort()}>
                    {t.ai.stop}
                  </button>
                </>
              )}
              {copied && <span className="text-xs text-emerald-700">{t.source.copied}</span>}
            </div>
          )}
          {failure && (
            <p className="text-xs text-red-700" role="alert">
              {failure}
            </p>
          )}
          {failure && ready && !staged && text.trim() && (
            <button className="btn-xs justify-self-start" onClick={() => setStaged(true)}>
              {t.staged.tryIt}
            </button>
          )}
        </section>

        {(copied || answer) && (
          <section className="grid gap-2 border-t border-zinc-200 pt-3">
            <h3 className="preset-group-title">{t.source.step3}</h3>
            <textarea
              className="map-json-input"
              rows={6}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={t.mapJson.placeholder}
              aria-label={t.mapJson.pasteLabel}
              spellCheck={false}
            />
            {checked?.ok && checked.kind === 'map' && (
              <p className="text-xs text-emerald-700" role="status">
                {t.source.result(
                  checked.map.elements.length,
                  checked.map.sequence?.steps.length ?? 0,
                  checked.excerpts?.verified.length ?? 0,
                  checked.excerpts?.unverified.length ?? 0
                )}
              </p>
            )}
            {errors.length > 0 && <ul className="map-json-issues text-xs text-red-700">{errors.map(issueLine)}</ul>}
            {warnings.length > 0 && <ul className="map-json-issues text-xs text-amber-700">{warnings.map(issueLine)}</ul>}
            <footer className="flex flex-wrap items-center justify-end gap-2">
              <label className="mr-auto flex items-center gap-2 text-xs">
                <input type="checkbox" checked={keepText} onChange={(e) => setKeepText(e.target.checked)} />
                {t.source.keepText}
              </label>
              <button className="btn" onClick={close}>
                {t.common.cancel}
              </button>
              <button className="btn-primary" disabled={!checked?.ok || busy} onClick={() => void openDiagram()}>
                {busy ? t.mapJson.creating : t.mapJson.create}
              </button>
            </footer>
          </section>
        )}
      </div>
    </div>
  )
}
