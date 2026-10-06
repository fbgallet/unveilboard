'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Components } from 'react-markdown'
import { useValue, type Editor, type TLShapeId } from 'tldraw'
import { useT } from '@/i18n/client'
import { aiSettingsAtom, askAi, isAiReady, modelName, serverAiAtom } from '@/lib/ai/client'
import { conversationMarkdown, historyForModel, partialReply, plainRefs, readChatAnswer, type ChatAnswer } from '@/lib/ai/chatAnswer'
import { toAiError } from '@/lib/ai/errors'
import type { MapIssue } from '@/lib/map/check'
import type { MapPatch } from '@/lib/map/patch'
import { editorPromptInput, readPasted } from '@/lib/canvas/assistant'
import {
  addChatEntry,
  applyChatChanges,
  canRevert,
  chatEntriesAtom,
  chatGhostAtom,
  clearChat,
  revertChatChanges,
  setChatGhost,
  shapeOfRef,
  updateChatChanges,
  type ChatEntry,
} from '@/lib/canvas/chat'
import { reverifyExcerpts } from '@/lib/canvas/passage'
import { readPageSource } from '@/lib/canvas/source'
import { noteOf, resolveTextImage, setNote, shapeLabel } from '@/lib/canvas/notes'
import { openElementTab } from '@/lib/presentation/store'
import { aiSettingsOpenAtom } from './AiSettingsDialog'
import { Markdownish } from './Markdownish'
import { PromptPicker, usePromptChoice } from './PromptPicker'

/** Réponse contrôlée : le message, et les modifications lues sur le schéma actuel. */
interface Checked {
  ok: boolean
  issues: MapIssue[]
  answer: ChatAnswer
  patch?: MapPatch
}

function checkAnswer(editor: Editor, text: string): Checked {
  const answer = readChatAnswer(text)
  if (answer.patch === undefined) {
    // Ni message ni modifications : JSON illisible ou coupé.
    if (!answer.reply) return { ok: false, issues: [{ level: 'error', code: 'invalid_json', path: '' }], answer }
    return { ok: true, issues: [], answer }
  }
  const read = readPasted(editor, answer.patch)
  if (!read.ok || read.kind !== 'patch') {
    const issues = read.ok ? [{ level: 'error' as const, code: 'wrong_format' as const, path: 'patch.format' }] : read.issues
    return { ok: false, issues, answer }
  }
  return { ok: true, issues: read.issues, answer, patch: read.patch }
}

/**
 * Onglet Chat : une conversation avec l'IA sur le schéma ouvert. Elle voit le schéma tel qu'il est
 * à chaque message (et la sélection, le texte source), répond, et le modifie sur demande : les
 * modifications sont appliquées aussitôt, annulables une à une.
 */
export function ChatPane({ editor }: { editor: Editor }) {
  const t = useT()
  const entries = useValue(chatEntriesAtom)
  const ghost = useValue(chatGhostAtom)
  const settings = useValue(aiSettingsAtom)
  const server = useValue(serverAiAtom)
  const ready = isAiReady(settings, server)
  const selectionCount = useValue('selection count', () => editor.getSelectedShapeIds().length, [editor])
  const hasSource = useValue('has source', () => !!readPageSource(editor), [editor])
  const [draft, setDraft] = useState('')
  const [withSelection, setWithSelection] = useState(true)
  const [withSource, setWithSource] = useState(true)
  const [run, setRun] = useState<{ text: string; thinking: number; abort: AbortController } | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [copied, setCopied] = useState(false)
  // Élément sélectionné (un seul) : une réponse de l'IA peut s'ajouter à sa note.
  const noteTarget = useValue(
    'chat note target',
    () => {
      const shape = editor.getOnlySelectedShape()
      return shape ? { id: shape.id, title: shapeLabel(editor, shape) } : null
    },
    [editor]
  )

  async function copyConversation() {
    const markdown = conversationMarkdown(chatEntriesAtom.get(), { user: t.chat.you, ai: t.chat.ai, status: t.chat.status })
    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // presse-papiers refusé : rien à faire de plus
    }
  }
  // Méthode de la bibliothèque de prompts (la dernière choisie pour le chat, sur cet appareil).
  const prompt = usePromptChoice('chat', { source: withSource && hasSource })
  const list = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const resolveSrc = useMemo(() => resolveTextImage(editor), [editor])

  // Défile vers le bas à chaque nouveau message, et pendant que la réponse arrive.
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight })
  }, [entries.length, run?.text])

  // Références « el:… » des messages de l'IA : un clic montre l'élément sur le schéma.
  const components = useMemo<Components>(
    () => ({
      a: ({ href, children }) => {
        if (!href?.startsWith('el:')) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-amber-700 underline decoration-amber-300 underline-offset-2">
              {children}
            </a>
          )
        }
        return (
          <button
            className="chat-ref"
            onClick={() => {
              const id = shapeOfRef(editor, href.slice(3))
              if (!id) return
              editor.select(id)
              editor.zoomToSelection({ animation: { duration: 300 } })
            }}
          >
            {children}
          </button>
        )
      },
    }),
    [editor]
  )

  async function send(text = draft) {
    const message = text.trim()
    if (!message || run) return
    const history = historyForModel(chatEntriesAtom.get().filter((e) => !e.error))
    addChatEntry({ role: 'user', text: message })
    setDraft('')
    const abort = new AbortController()
    setRun({ text: '', thinking: 0, abort })
    try {
      const promptInput = {
        ...editorPromptInput(editor, 'chat', message, { selection: withSelection && selectionCount > 0, delivery: 'api', withSource: withSource && hasSource }),
        history,
        ...(prompt.method && { method: prompt.method }),
      }
      const { result } = await askAi(settings, promptInput, (answer) => checkAnswer(editor, answer), {
        signal: abort.signal,
        onText: (answer, thinking) => setRun((r) => r && { ...r, text: answer, thinking }),
      })
      const { answer, patch } = result
      if (!result.ok) {
        addChatEntry({
          role: 'assistant',
          text: answer.reply,
          ...(answer.patch !== undefined && { changes: { summary: '', status: 'failed', operations: 0 } }),
          ...(!answer.reply && answer.patch === undefined && { error: t.chat.unreadable }),
        })
        return
      }
      if (!patch) {
        addChatEntry({ role: 'assistant', text: answer.reply })
        return
      }
      const entry = addChatEntry({
        role: 'assistant',
        text: answer.reply,
        changes: { summary: patch.summary ?? '', status: ghost ? 'suggested' : 'applied', operations: patch.operations.length },
      })
      const { skipped } = applyChatChanges(editor, entry.id, patch, ghost)
      const source = readPageSource(editor)
      if (source) reverifyExcerpts(editor, source.text)
      const warnings = result.issues.filter((i) => i.level === 'warning').length
      if (skipped || warnings) updateChatChanges(entry.id, { skipped, warnings })
    } catch (e) {
      const error = toAiError(e)
      if (error.kind !== 'aborted') {
        addChatEntry({ role: 'assistant', text: '', error: `${t.ai.errors[error.kind]}${error.detail ? ` (${error.detail})` : ''}` })
      }
    } finally {
      setRun(null)
      input.current?.focus()
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send()
    }
  }

  const streaming = run ? partialReply(run.text) : ''

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-1.5 text-[11px] text-zinc-500">
        {/* Le modèle utilisé : un clic ouvre les réglages de l'IA (fournisseur, modèle, réflexion). */}
        <button
          className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-zinc-200/70 hover:text-zinc-900"
          onClick={() => aiSettingsOpenAtom.set(true)}
          title={t.chat.settingsHint}
        >
          <span className="truncate">{ready ? modelName(settings, server) || t.chat.instanceAi : t.chat.noAi}</span>
          <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <circle cx="8" cy="8" r="2" />
            <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
          </svg>
        </button>
        <label className="flex items-center gap-1" title={t.chat.ghostHint}>
          <input type="checkbox" checked={ghost} onChange={(e) => setChatGhost(e.target.checked)} />
          {t.chat.ghost}
        </label>
        <button
          className={`icon-btn ${copied ? 'icon-btn-on' : ''}`}
          onClick={() => void copyConversation()}
          disabled={!entries.length}
          title={copied ? t.chat.copied : t.chat.copy}
          aria-label={t.chat.copy}
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {copied ? <path d="m3.5 8.5 3 3 6-7" /> : <path d="M5.5 5.5V3h7.5v7.5h-2.5M3 5.5h7.5V13H3Z" />}
          </svg>
        </button>
        <button
          className="icon-btn"
          onClick={() => setConfirmClear(true)}
          disabled={!entries.length || !!run}
          title={t.chat.clear}
          aria-label={t.chat.clear}
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div ref={list} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3" aria-live="polite">
        {!entries.length && !run && (
          <div className="flex flex-col gap-2 p-1 text-[12px] leading-relaxed text-zinc-500">
            <p>{t.chat.intro}</p>
            <div className="flex flex-wrap gap-1">
              {t.chat.examples.map((example) => (
                <button key={example} className="btn-xs" onClick={() => (ready ? void send(example) : setDraft(example))}>
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}
        {entries.map((entry) => (
          <Message key={entry.id} entry={entry} editor={editor} components={components} resolveSrc={resolveSrc} noteTarget={noteTarget} />
        ))}
        {run && (
          <div className="chat-bubble chat-bubble-ai">
            {streaming ? (
              <Markdownish text={streaming} components={components} resolveSrc={resolveSrc} />
            ) : (
              <p className="chat-pending">{run.thinking ? t.chat.thinking : t.chat.waiting}</p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5 border-t border-zinc-200 p-3">
        {ready ? (
          <>
            <PromptPicker choice={prompt} disabled={!!run} />
            {(selectionCount > 0 || hasSource) && (
              <div className="flex flex-wrap gap-1 text-[11px]">
                {selectionCount > 0 && (
                  <button className={`chat-chip ${withSelection ? 'chat-chip-on' : ''}`} onClick={() => setWithSelection(!withSelection)} aria-pressed={withSelection} title={t.chat.selectionHint}>
                    {t.chat.selection(selectionCount)}
                  </button>
                )}
                {hasSource && (
                  <button className={`chat-chip ${withSource ? 'chat-chip-on' : ''}`} onClick={() => setWithSource(!withSource)} aria-pressed={withSource} title={t.chat.sourceHint}>
                    {t.chat.source}
                  </button>
                )}
              </div>
            )}
            <div className="flex items-end gap-1.5">
              <textarea
                ref={input}
                className="chat-input"
                rows={Math.min(6, Math.max(2, draft.split('\n').length))}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={t.chat.placeholder}
                aria-label={t.chat.inputLabel}
              />
              {run ? (
                <button className="btn" onClick={() => run.abort.abort()}>
                  {t.chat.stop}
                </button>
              ) : (
                <button className="btn-primary" onClick={() => void send()} disabled={!draft.trim()}>
                  {t.chat.send}
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-2 text-[12px] text-zinc-500">
            <span>{t.chat.setupHint}</span>
            <button className="btn shrink-0 text-xs" onClick={() => aiSettingsOpenAtom.set(true)}>
              {t.chat.setup}
            </button>
          </div>
        )}
      </div>

      {confirmClear && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-900/20 p-6" onPointerDown={(e) => e.target === e.currentTarget && setConfirmClear(false)}>
          <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 text-sm shadow-lg" role="alertdialog" aria-labelledby="chat-clear-title">
            <p id="chat-clear-title" className="font-medium text-zinc-900">
              {t.chat.clearTitle}
            </p>
            <p className="text-[12px] leading-relaxed text-zinc-500">{t.chat.clearBody}</p>
            <div className="flex justify-end gap-2">
              <button className="btn" onClick={() => setConfirmClear(false)} autoFocus>
                {t.common.cancel}
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  clearChat()
                  setConfirmClear(false)
                }}
              >
                {t.chat.clearConfirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Message({
  entry,
  editor,
  components,
  resolveSrc,
  noteTarget,
}: {
  entry: ChatEntry
  editor: Editor
  components: Components
  resolveSrc: (src: string) => string | undefined
  /** Élément sélectionné, à la note duquel la réponse peut s'ajouter. */
  noteTarget: { id: TLShapeId; title: string } | null
}) {
  const t = useT()
  const [added, setAdded] = useState<string | null>(null)
  if (entry.role === 'user') return <div className="chat-bubble chat-bubble-user">{entry.text}</div>
  const changes = entry.changes
  // Annuler / rétablir : seulement pendant la séance où les modifications ont été appliquées.
  const revertible = !!changes && changes.status !== 'failed' && canRevert(entry.id)
  return (
    <div className="chat-bubble chat-bubble-ai">
      {entry.error && <p className="text-red-700">{entry.error}</p>}
      {entry.text && <Markdownish text={entry.text} components={components} resolveSrc={resolveSrc} />}
      {changes && (
        <div className={`chat-changes chat-changes-${changes.status}`}>
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1">
              <span className="font-medium">{t.chat.status[changes.status]}</span>
              {changes.summary && <span className="text-zinc-600"> · {changes.summary}</span>}
            </p>
            {revertible && (
              <button className="btn-xs shrink-0" onClick={() => revertChatChanges(editor, entry.id, changes.status !== 'undone')}>
                {changes.status === 'undone' ? t.chat.redo : t.chat.undo}
              </button>
            )}
          </div>
          {!!changes.skipped && <p className="text-zinc-500">{t.chat.skipped(changes.skipped)}</p>}
          {!!changes.warnings && <p className="text-zinc-500">{t.chat.warnings(changes.warnings)}</p>}
        </div>
      )}
      {entry.text && (
        <div className="chat-actions">
          {added ? (
            <span>
              {t.chat.addedToNote(added)}{' '}
              <button className="underline underline-offset-2 hover:text-zinc-900" onClick={() => openElementTab()}>
                {t.chat.seeNote}
              </button>
            </span>
          ) : (
            <button
              className="chat-action"
              disabled={!noteTarget}
              title={noteTarget ? t.chat.toNoteHint(noteTarget.title || t.panel.elementUntitled) : t.chat.toNoteSelect}
              onClick={() => {
                if (!noteTarget) return
                // Ajoutée à la suite de la note (Ctrl/⌘ + Z l'annule) ; les références deviennent du texte.
                const note = noteOf(editor.getShape(noteTarget.id))
                setNote(editor, noteTarget.id, [note.trim(), plainRefs(entry.text).trim()].filter(Boolean).join('\n\n'))
                setAdded(noteTarget.title || t.panel.elementUntitled)
              }}
            >
              ¶ {t.chat.toNote}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
