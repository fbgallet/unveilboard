'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { atom, useValue, type Editor } from 'tldraw'
import { z } from 'zod'
import { useLocale, useT } from '@/i18n/client'
import { exportMap } from '@/lib/canvas/mapExport'
import { knownVocabulary } from '@/lib/canvas/mapImport'
import { readSequence } from '@/lib/canvas/adapter'
import { parseMap, type MapIssue } from '@/lib/map/check'
import { stashPendingMap } from '@/lib/map/pending'
import { documentStore } from '@/lib/storage'
import { storageModeAtom } from '@/lib/sync/documentSync'
import { m } from '@/i18n/client'

export const mapImportOpenAtom = atom<boolean>('mapImportOpen', false)

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

/** Import d'un schéma JSON (collé ou choisi), contrôlé, puis ouvert comme nouveau schéma. */
export function MapImportDialog({ editor }: { editor: Editor }) {
  const open = useValue(mapImportOpenAtom)
  if (!open) return null
  return <MapImportView editor={editor} />
}

function MapImportView({ editor }: { editor: Editor }) {
  const t = useT()
  const [locale] = useLocale()
  const router = useRouter()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const close = () => mapImportOpenAtom.set(false)

  const result = useMemo(() => {
    if (!text.trim()) return null
    const zodError = locale === 'fr' ? z.locales.fr().localeError : undefined
    return parseMap(text, knownVocabulary(editor), { zodError })
  }, [text, locale, editor])

  async function pickFile(file: File | undefined) {
    if (file) setText(await file.text())
  }

  async function create() {
    if (!result?.ok) return
    setBusy(true)
    setFailure(null)
    try {
      const id = await documentStore(storageModeAtom.get()).create(result.map.title || t.common.untitled)
      stashPendingMap(id, result.map)
      close()
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
    <div className="preset-overlay" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="preset-dialog share-dialog" role="dialog" aria-label={t.mapJson.title}>
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{t.mapJson.title}</h2>
          <button className="preset-icon" onClick={close} aria-label={t.common.close}>
            ✕
          </button>
        </header>
        <p className="text-xs text-zinc-500">
          {t.mapJson.intro}{' '}
          <a className="underline" href={t.mapJson.formatUrl} target="_blank" rel="noreferrer">
            {t.mapJson.formatLink}
          </a>
        </p>
        <textarea
          className="map-json-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t.mapJson.placeholder}
          aria-label={t.mapJson.title}
          spellCheck={false}
          rows={12}
        />
        <label className="btn-xs self-start">
          {t.mapJson.chooseFile}
          <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => void pickFile(e.target.files?.[0])} />
        </label>
        {result?.ok && (
          <p className="text-xs text-emerald-700">{t.mapJson.valid(result.map.elements.length, result.map.sequence?.steps.length ?? 0)}</p>
        )}
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
          <button className="btn" onClick={close}>
            {t.common.cancel}
          </button>
          <button className="btn-primary" disabled={!result?.ok || busy} onClick={() => void create()}>
            {busy ? t.mapJson.creating : t.mapJson.create}
          </button>
        </footer>
      </div>
    </div>
  )
}
