'use client'

import { useState } from 'react'
import { useValue } from 'tldraw'
import { useT } from '@/i18n/client'
import { settingsStore } from '@/lib/storage'
import { storageModeAtom } from '@/lib/sync/documentSync'
import {
  SHARED_LIBRARY,
  collectionTitle,
  enabledCollections,
  withCollection,
  newPromptId,
  promptLibraryAtom,
  promptLibraryErrorAtom,
  promptLibraryOpenAtom,
  savePromptLibrary,
  type CustomPrompt,
  type PromptLibrarySettings,
} from '@/lib/prompts/library'
import { PROMPT_TASKS, parsePromptFile, serializeBody, serializeFrontmatter, type PromptTemplate } from '@/lib/prompts/template'
import { TASKS, type Task } from '@/lib/ai/prompts'

/** Bibliothèque de prompts : collections partagées affichées, prompts personnels. */
export function PromptLibraryDialog() {
  const open = useValue(promptLibraryOpenAtom)
  if (!open) return null
  return <PromptLibraryView />
}

const save = (next: PromptLibrarySettings) => savePromptLibrary(settingsStore(storageModeAtom.get()), next)

/** Le corps d'un prompt, marqueurs de variantes compris (pour l'éditer comme un prompt personnel). */
const sourceOf = (template: PromptTemplate) => serializeBody(template.body, template.variants)

function download(name: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }))
  a.download = `${name.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'prompt'}.md`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function PromptLibraryView() {
  const t = useT()
  const settings = useValue(promptLibraryAtom)
  const error = useValue(promptLibraryErrorAtom)
  const cloud = useValue(storageModeAtom) === 'cloud'
  const [editing, setEditing] = useState<CustomPrompt | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const close = () => promptLibraryOpenAtom.set(false)
  const enabled = enabledCollections(settings)

  // Collections qui contiennent des prompts (directement), avec leur titre complet.
  const collections = SHARED_LIBRARY.collections
    .map((c) => ({ ...c, prompts: SHARED_LIBRARY.prompts.filter((p) => p.collection === c.id) }))
    .filter((c) => c.prompts.length)

  function toggle(id: string, on: boolean) {
    void save(withCollection(settings, id, on))
  }

  function upsert(prompt: CustomPrompt) {
    const exists = settings.custom.some((p) => p.id === prompt.id)
    const stamped = { ...prompt, updatedAt: new Date().toISOString() }
    void save({ ...settings, custom: exists ? settings.custom.map((p) => (p.id === prompt.id ? stamped : p)) : [...settings.custom, stamped] })
  }

  function copyShared(template: PromptTemplate) {
    upsert({
      id: newPromptId(),
      title: `${template.title}${t.prompts.copySuffix}`,
      ...(template.description && { description: template.description }),
      ...(template.tasks && { tasks: template.tasks }),
      ...(template.placeholder && { placeholder: template.placeholder }),
      source: sourceOf(template),
    })
    setNotice(t.prompts.copied)
  }

  async function importFile(file: File | undefined) {
    if (!file) return
    const name = file.name.replace(/\.md$/i, '')
    const { template, problems } = parsePromptFile(await file.text(), `import/${name}`)
    if (problems.includes('empty prompt')) return setNotice(t.prompts.importFailed)
    setEditing({
      id: newPromptId(),
      title: template.title,
      ...(template.description && { description: template.description }),
      ...(template.tasks && { tasks: template.tasks }),
      ...(template.placeholder && { placeholder: template.placeholder }),
      source: sourceOf(template),
    })
  }

  function exportPrompt(p: CustomPrompt) {
    download(p.title, `${serializeFrontmatter({ ...p, source: undefined })}\n${p.source}\n`)
  }

  return (
    <div className="preset-overlay" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="preset-dialog share-dialog assistant-dialog" role="dialog" aria-label={t.prompts.title}>
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{t.prompts.title}</h2>
          <button className="preset-icon" onClick={close} aria-label={t.common.close}>
            ✕
          </button>
        </header>
        {editing ? (
          <PromptEditor
            prompt={editing}
            onCancel={() => setEditing(null)}
            onSave={(p) => {
              upsert(p)
              setEditing(null)
            }}
          />
        ) : (
          <>
            <p className="text-xs text-zinc-500">{t.prompts.intro}</p>
            {error && (
              <p className="text-xs text-red-700" role="alert">
                {t.prompts.saveFailed} {error}
              </p>
            )}
            {notice && (
              <p className="text-xs text-emerald-700" role="status">
                {notice}
              </p>
            )}
            <section className="grid gap-2">
              <h3 className="preset-group-title">{t.prompts.mine}</h3>
              <p className="text-xs text-zinc-500">{t.prompts.mineHint(cloud)}</p>
              {settings.custom.length ? (
                <ul className="grid gap-1">
                  {[...settings.custom]
                    .sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '') || a.title.localeCompare(b.title))
                    .map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate">
                          {p.group && <span className="text-zinc-500">{p.group} › </span>}
                          {p.title}
                        </span>
                        <button className="btn-xs" onClick={() => setEditing(p)}>
                          {t.prompts.edit}
                        </button>
                        <button className="btn-xs" onClick={() => exportPrompt(p)}>
                          {t.prompts.export}
                        </button>
                        <button
                          className="btn-xs"
                          onClick={() => confirm(t.prompts.confirmRemove(p.title)) && void save({ ...settings, custom: settings.custom.filter((c) => c.id !== p.id) })}
                        >
                          {t.prompts.remove}
                        </button>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="text-xs text-zinc-500">{t.prompts.noMine}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <button className="btn-xs" onClick={() => setEditing({ id: newPromptId(), title: '', source: '' })}>
                  {t.prompts.add}
                </button>
                <label className="btn-xs">
                  {t.prompts.import}
                  <input type="file" accept=".md,.markdown,text/markdown,text/plain" className="sr-only" onChange={(e) => void importFile(e.target.files?.[0])} />
                </label>
              </div>
            </section>
            <section className="grid gap-2 border-t border-zinc-200 pt-3">
              <h3 className="preset-group-title">{t.prompts.shared}</h3>
              <p className="text-xs text-zinc-500">{t.prompts.sharedHint}</p>
              {!collections.length && <p className="text-xs text-zinc-500">{t.prompts.noShared}</p>}
              {collections.map((c) => (
                <details key={c.id} className="grid gap-1">
                  <summary className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={enabled.has(c.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => toggle(c.id, e.target.checked)}
                      aria-label={collectionTitle(c.id)}
                    />
                    <span className="min-w-0 flex-1">
                      {collectionTitle(c.id)} <span className="text-xs text-zinc-500">({t.prompts.count(c.prompts.length)})</span>
                    </span>
                  </summary>
                  {c.description && <p className="pl-6 text-xs text-zinc-500">{c.description}</p>}
                  <ul className="grid gap-1 pl-6">
                    {c.prompts.map((p) => (
                      <li key={p.id} className="grid gap-0.5 text-xs">
                        <span className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 font-medium">{p.title}</span>
                          <button className="btn-xs" onClick={() => copyShared(p)}>
                            {t.prompts.copy}
                          </button>
                        </span>
                        {p.description && <span className="text-zinc-500">{p.description}</span>}
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </section>
            <footer className="flex justify-end">
              <button className="btn" onClick={close}>
                {t.common.close}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  )
}

function PromptEditor({ prompt, onSave, onCancel }: { prompt: CustomPrompt; onSave(p: CustomPrompt): void; onCancel(): void }) {
  const t = useT()
  const [draft, setDraft] = useState(prompt)
  const set = (patch: Partial<CustomPrompt>) => setDraft((d) => ({ ...d, ...patch }))
  const tasks = new Set<Task>(draft.tasks ?? [])
  const toggleTask = (task: Task, on: boolean) => {
    const next = new Set(tasks)
    if (on) next.add(task)
    else next.delete(task)
    set({ tasks: TASKS.filter((k) => next.has(k)) })
  }
  const field = (label: string, value: string | undefined, key: 'title' | 'group' | 'description' | 'placeholder', placeholder?: string) => (
    <label className="grid gap-1">
      <span className="text-xs text-zinc-500">{label}</span>
      <input className="preset-input" value={value ?? ''} placeholder={placeholder} onChange={(e) => set({ [key]: e.target.value })} />
    </label>
  )
  const clean = (v?: string) => v?.trim() || undefined
  return (
    <div className="grid gap-3">
      {field(t.prompts.fields.title, draft.title, 'title')}
      {field(t.prompts.fields.group, draft.group, 'group', t.prompts.defaultGroup)}
      {field(t.prompts.fields.description, draft.description, 'description')}
      {field(t.prompts.fields.placeholder, draft.placeholder, 'placeholder')}
      <fieldset className="grid gap-1">
        <legend className="text-xs text-zinc-500">{t.prompts.fields.tasks}</legend>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {PROMPT_TASKS.filter((k) => k !== 'plan').map((k) => (
            <label key={k} className="flex items-center gap-1">
              <input type="checkbox" checked={tasks.has(k)} onChange={(e) => toggleTask(k, e.target.checked)} />
              {t.prompts.tasks[k]}
            </label>
          ))}
        </div>
        <span className="text-xs text-zinc-500">{t.prompts.fields.tasksHint}</span>
      </fieldset>
      <div className="grid gap-1">
        <label className="grid gap-1">
          <span className="text-xs text-zinc-500">{t.prompts.fields.source}</span>
          <textarea
            className="map-json-input"
            rows={14}
            value={draft.source}
            onChange={(e) => set({ source: e.target.value })}
            aria-describedby="prompt-source-hint"
            spellCheck
          />
        </label>
        <span id="prompt-source-hint" className="text-xs text-zinc-500">
          {t.prompts.fields.sourceHint}
        </span>
      </div>
      <footer className="flex justify-end gap-2">
        <button className="btn" onClick={onCancel}>
          {t.common.cancel}
        </button>
        <button
          className="btn-primary"
          disabled={!draft.title.trim() || !draft.source.trim()}
          onClick={() =>
            onSave({
              id: draft.id,
              title: draft.title.trim(),
              source: draft.source.trim(),
              ...(clean(draft.group) && { group: clean(draft.group) }),
              ...(clean(draft.description) && { description: clean(draft.description) }),
              ...(clean(draft.placeholder) && { placeholder: clean(draft.placeholder) }),
              ...(draft.tasks?.length && { tasks: draft.tasks }),
            })
          }
        >
          {t.prompts.save}
        </button>
      </footer>
    </div>
  )
}
