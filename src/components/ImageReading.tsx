'use client'

import { useEffect, useState } from 'react'
import { useValue, type Editor, type TLShapeId } from 'tldraw'
import { useT } from '@/i18n/client'
import { aiSettingsAtom, isAiReady, serverAiAtom, type AiSettings, type ServerAi } from '@/lib/ai/client'
import { toAiError } from '@/lib/ai/errors'
import { MODELS, TRANSCRIPTION_MODEL } from '@/lib/ai/models'
import { checkVision, visionAtom } from '@/lib/ai/vision'
import { identifyImageShape, imageReadingOf, isImage, readImageShape, readingImagesAtom, readingModelAtom, setImageReading, setReadingModel } from '@/lib/canvas/imageReading'
import type { ImageReading } from '@/lib/map/format'
import { applyPresetTo, presetById, presetSettingsAtom } from '@/lib/canvas/presets'
import { presetName } from '@/lib/presets/labels'
import { offeredPresets } from '@/lib/presets/presets'
import { modelLabel } from './AiSettingsDialog'

/** Images d'un objet : lui-même, ou celles qu'il contient (cadre, groupe), dans l'ordre de la page. */
function imagesOf(editor: Editor, id: TLShapeId): TLShapeId[] {
  const shape = editor.getShape(id)
  if (!shape) return []
  if (isImage(shape)) return [id]
  return editor.getSortedChildIdsForParent(id).flatMap((child) => imagesOf(editor, child))
}

/**
 * Modèles qu'on peut choisir pour lire une image : ceux du catalogue OpenRouter (ou de l'instance,
 * si elle passe par OpenRouter). Aucun choix pour ChatGPT ou un serveur compatible OpenAI : leur
 * modèle réglé lit l'image.
 */
function readingModels(settings: AiSettings, server: ServerAi | null): string[] {
  const all =
    settings.kind === 'openrouter'
      ? [TRANSCRIPTION_MODEL, settings.openrouterModel, ...MODELS.map((m) => m.id)]
      : settings.kind === 'server' && server?.openrouter
        ? server.models
        : []
  return [...new Set(all.filter(Boolean))]
}

/** Zone de saisie à la hauteur de son contenu (jusqu'à un plafond, puis elle défile). */
function grow(el: HTMLTextAreaElement | null) {
  // Pas encore affichée (panneau masqué, détails repliés) : sa hauteur par défaut, en attendant.
  if (!el || !el.offsetParent) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + 2}px`
}

/**
 * Lectures des images d'un objet (onglet Élément) : l'image elle-même, ou celles d'un cadre ou d'un
 * groupe. Rien si l'objet n'en a pas.
 */
export function ImageReadings({ editor, id }: { editor: Editor; id: TLShapeId }) {
  const t = useT()
  const images = useValue('images of shape', () => imagesOf(editor, id), [editor, id])
  // Repliée, une ligne : ce qu'est la (première) image, ou le début de sa description.
  const summary = useValue(
    'image reading summary',
    () => {
      const reading = images.map((image) => imageReadingOf(editor.getShape(image))).find(Boolean)
      return reading ? reading.identification || reading.description.split('\n').find((l) => l.trim())?.replace(/^[-\s]+/, '') || '' : ''
    },
    [editor, images]
  )
  const [open, setOpen] = useState(readReadingOpen)
  if (!images.length) return null
  const toggle = () => {
    setOpen(!open)
    try {
      localStorage.setItem(READING_OPEN_KEY, String(!open))
    } catch {
      // stockage indisponible : le choix vaut pour la séance
    }
  }
  return (
    <section className="mt-2 flex flex-col gap-2 border-t border-zinc-200 px-1 pt-2">
      <button className="flex items-center gap-2 text-left" onClick={toggle} aria-expanded={open}>
        <span className={`text-[10px] text-zinc-400 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true">
          ▶
        </span>
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{t.imageReading.title}</span>
      </button>
      {!open && <p className={`truncate px-1 text-xs ${summary ? 'text-zinc-600' : 'text-zinc-400'}`}>{summary || t.imageReading.notReadShort}</p>}
      {open &&
        images.map((image, i) => (
          // Une seule image : le titre de la section suffit.
          <ImageReadingBox key={image} editor={editor} id={image} title={images.length > 1 ? t.imageReading.titleOf(i + 1) : null} />
        ))}
    </section>
  )
}

/** Section « Ce que l'IA voit » de l'onglet Élément dépliée (cet appareil) : oui par défaut. */
const READING_OPEN_KEY = 'imageReadingOpen'
function readReadingOpen() {
  try {
    return localStorage.getItem(READING_OPEN_KEY) !== 'false'
  } catch {
    return true
  }
}

/**
 * Ce que l'IA voit dans une image (panneau « IA à partir de cet élément », onglet Élément) : lue à
 * la demande, ou avant la première demande qui l'envoie ; modifiable. C'est ce qui part avec les demandes.
 */
export function ImageReadingBox({ editor, id, title }: { editor: Editor; id: TLShapeId; title?: string | null }) {
  const t = useT()
  const r = t.imageReading
  const settings = useValue(aiSettingsAtom)
  const server = useValue(serverAiAtom)
  const ready = isAiReady(settings, server)
  const reading = useValue('image reading', () => imageReadingOf(editor.getShape(id)), [editor, id])
  const busy = useValue('image being read', () => readingImagesAtom.get().has(id), [id])
  const vision = useValue(visionAtom)
  const chosen = useValue(readingModelAtom)
  const [identifying, setIdentifying] = useState(false)
  const [alternatives, setAlternatives] = useState<string[]>([])
  const [failure, setFailure] = useState<string | null>(null)

  // Modèles proposés : sans ceux dont OpenRouter dit qu'ils ne voient pas les images.
  const candidates = readingModels(settings, server)
  const candidateKey = candidates.join(',')
  useEffect(() => {
    candidateKey.split(',').filter(Boolean).forEach((m) => void checkVision(m))
  }, [candidateKey])
  const models = candidates.filter((m) => vision[m.split(':')[0]]?.image !== false)
  const fallback = settings.kind === 'server' ? (server?.models.includes(TRANSCRIPTION_MODEL) ? TRANSCRIPTION_MODEL : server?.model) : TRANSCRIPTION_MODEL
  const model = models.includes(chosen) ? chosen : (fallback ?? '')

  const fail = (e: unknown) => {
    const error = toAiError(e)
    if (error.kind !== 'aborted') setFailure(`${t.ai.errors[error.kind]}${error.detail ? ` (${error.detail})` : ''}`)
  }
  const read = () => {
    setFailure(null)
    setAlternatives([])
    readImageShape(editor, id).catch(fail)
  }

  /** Correction de l'utilisateur (ou identification proposée) ; tout vide : la lecture est effacée. */
  const save = (patch: Partial<ImageReading>) => {
    const current = imageReadingOf(editor.getShape(id))
    const next: ImageReading = { ...(current ?? { description: '' }), ...patch }
    const text = next.text?.trim()
    const identification = next.identification?.trim()
    const clean: ImageReading = {
      ...(next.kind && { kind: next.kind }),
      description: next.description.trim(),
      ...(text && { text }),
      ...(identification && { identification, ...(next.certainty && { certainty: next.certainty }) }),
    }
    if (JSON.stringify(clean) === JSON.stringify(current ?? null)) return
    setImageReading(editor, id, clean.description || text || identification ? clean : null)
  }

  const identify = async () => {
    setFailure(null)
    setIdentifying(true)
    try {
      const found = await identifyImageShape(editor, id)
      save({ identification: found.identification, certainty: found.certainty })
      setAlternatives(found.alternatives)
    } catch (e) {
      fail(e)
    } finally {
      setIdentifying(false)
    }
  }

  // Champs non contrôlés : remis à jour quand la lecture change (nouvelle lecture, annulation).
  const version = JSON.stringify(reading ?? null)

  return (
    <section className="image-reading" aria-label={r.title}>
      {/* null : pas de titre (celui de la section qui l'entoure suffit) ; la nature de l'image reste. */}
      {(title !== null || reading?.kind) && (
        <h3 className="text-xs font-semibold">
          {title ?? (title === null ? '' : r.title)}
          {reading?.kind && <span className="image-reading-kind">{r.kinds[reading.kind]}</span>}
        </h3>
      )}
      {ready && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button className="btn-xs" disabled={busy} onClick={read} title={reading ? r.rereadHint : undefined}>
            {reading ? r.reread : r.read}
          </button>
          {models.length > 1 && (
            <label className="flex min-w-0 items-center gap-1" title={r.modelHint}>
              <span className="text-zinc-600">{r.model}</span>
              <select className="preset-input min-w-0 max-w-[16rem]" value={model} onChange={(e) => setReadingModel(e.target.value)} aria-label={r.model}>
                {models.map((m) => (
                  <option key={m} value={m}>
                    {modelLabel(m, t)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {busy && (
            <span className="text-zinc-500" role="status">
              {r.reading}
            </span>
          )}
        </div>
      )}
      {!busy && (
        <>
          <textarea
            key={`d${version}`}
            ref={grow}
            onInput={(e) => grow(e.currentTarget)}
            className="map-json-input assistant-instruction image-reading-field"
            rows={2}
            defaultValue={reading?.description ?? ''}
            onBlur={(e) => save({ description: e.target.value })}
            placeholder={r.descriptionPlaceholder}
            aria-label={r.description}
          />
          <div className="grid gap-1 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-zinc-600">{r.identification}</span>
              {reading?.identification && reading.certainty && reading.certainty !== 'established' && <span className="text-amber-700">· {r.toCheck}</span>}
            </div>
            <div className="flex items-center gap-1">
              <textarea
                key={`i${version}`}
                ref={grow}
                onInput={(e) => grow(e.currentTarget)}
                // Une seule ligne logique : Entrée valide.
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
                rows={1}
                className="preset-input image-reading-field min-w-0 flex-1"
                defaultValue={reading?.identification ?? ''}
                // Corrigée par l'utilisateur : elle n'est plus « à vérifier ».
                onBlur={(e) => e.target.value.trim() !== (reading?.identification ?? '') && save({ identification: e.target.value, certainty: undefined })}
                placeholder={r.identificationPlaceholder}
                aria-label={r.identification}
              />
              {ready && (
                <button className="btn-xs" disabled={identifying || busy} onClick={() => void identify()} title={r.suggestHint}>
                  {identifying ? r.identifying : r.suggest}
                </button>
              )}
            </div>
            {alternatives.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-zinc-500">{r.alternatives}</span>
                {alternatives.map((a) => (
                  <button
                    key={a}
                    className="btn-xs"
                    onClick={() => {
                      // L'identification remplacée rejoint les autres possibles.
                      const previous = imageReadingOf(editor.getShape(id))?.identification
                      save({ identification: a, certainty: 'uncertain' })
                      setAlternatives((list) => [...list.filter((x) => x !== a), ...(previous ? [previous] : [])])
                    }}
                  >
                    {a}
                  </button>
                ))}
              </div>
            )}
          </div>
          {reading?.text && (
            <details className="text-xs" onToggle={(e) => grow(e.currentTarget.querySelector('textarea'))}>
              <summary className="cursor-pointer text-zinc-600">{r.visibleText}</summary>
              <textarea
                key={`t${version}`}
                ref={grow}
                onInput={(e) => grow(e.currentTarget)}
                className="map-json-input assistant-instruction image-reading-field mt-1"
                rows={2}
                defaultValue={reading.text}
                onBlur={(e) => save({ text: e.target.value })}
                aria-label={r.visibleText}
              />
            </details>
          )}
        </>
      )}
      <p className="text-xs text-zinc-500">{!ready ? r.needsAi : reading ? r.hint : busy ? '' : r.notRead}</p>
      {failure && (
        <p className="text-xs text-red-700" role="alert">
          {r.failed(failure)}
        </p>
      )}
    </section>
  )
}

/**
 * Type d'une image (onglet Élément) : un fait, un exemple, une citation… Pour qu'elle compte comme
 * telle dans le schéma (un document à l'appui d'un argument). Seul son meta change.
 */
export function ImageTypeField({ editor, id }: { editor: Editor; id: TLShapeId }) {
  const t = useT()
  const current = useValue('image type', () => editor.getShape(id)?.meta.preset as string | undefined, [editor, id])
  const types = useValue('image types', () => offeredPresets(presetSettingsAtom.get()).filter((p) => p.target === 'shape'), [])
  return (
    <label className="flex items-center gap-2 px-1 text-xs">
      <span className="text-zinc-600">{t.imageReading.type}</span>
      <select
        className="preset-input min-w-0 flex-1"
        value={current ?? ''}
        onChange={(e) => {
          const shape = editor.getShape(id)
          if (!shape) return
          editor.markHistoryStoppingPoint('type d’une image')
          const preset = presetById(editor, e.target.value || undefined)
          if (preset) applyPresetTo(editor, preset, [shape])
          else editor.updateShape({ id, type: shape.type, meta: { ...shape.meta, preset: null } })
        }}
        aria-label={t.imageReading.type}
      >
        <option value="">{t.imageReading.noType}</option>
        {types.map((p) => (
          <option key={p.id} value={p.id}>
            {presetName(p, t)}
          </option>
        ))}
      </select>
    </label>
  )
}
