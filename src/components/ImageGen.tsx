'use client'

import { useEffect, useState } from 'react'
import { atom, useEditor, useValue, type Editor, type TLShapeId } from 'tldraw'
import { useT } from '@/i18n/client'
import { aiSettingsAtom, generateImage, imageGenerationAvailable, serverAiAtom } from '@/lib/ai/client'
import { toAiError } from '@/lib/ai/errors'
import { ASPECT_RATIOS, IMAGE_STYLES, MAX_REFERENCES, type AspectRatio, type ImageStyle } from '@/lib/ai/imageGen'
import { IMAGE_MODEL, IMAGE_MODELS } from '@/lib/ai/models'
import { addGeneratedImage, aspectOf, creditMetaOf, generatedOf, pictureSubject, readImageStyle, referenceImages, selectionSketch, writeImageStyle, type TextTarget } from '@/lib/canvas/imageGen'
import { modeAtom, shapeClassesAtom } from '@/lib/presentation/store'
import { aiSettingsOpenAtom } from './AiSettingsDialog'

/**
 * Boîte « image » ouverte : mettre un élément en image (`target`, sans `sources`), modifier une image
 * (une source), en composer une à partir de plusieurs, ou dessiner à partir d'une sélection (`sketch`,
 * rendue en image). `text` : l'image va en tête d'un texte de la présentation (image d'ouverture),
 * `subject` : la demande proposée.
 */
export interface ImageGenOpen {
  target?: TLShapeId
  sources: TLShapeId[]
  sketch?: TLShapeId[]
  text?: TextTarget
  subject?: string
}
export const imageGenAtom = atom<ImageGenOpen | null>('imageGen', null)

/** Modèle d'image choisi, retenu sur l'appareil. */
const MODEL_KEY = 'image-generation-model'
function readModel() {
  try {
    const id = localStorage.getItem(MODEL_KEY)
    return IMAGE_MODELS.some((m) => m.id === id) ? id! : IMAGE_MODEL
  } catch {
    return IMAGE_MODEL
  }
}

export function ImageGenPanel({ editor }: { editor: Editor }) {
  const open = useValue(imageGenAtom)
  const exists = useValue(
    'image gen targets',
    () => !!open && [...(open.target ? [open.target] : []), ...open.sources, ...(open.sketch ?? [])].every((id) => editor.getShape(id)),
    [editor, open]
  )
  useEffect(() => {
    if (open && !exists) imageGenAtom.set(null)
  }, [open, exists])
  if (!open || !exists) return null
  return <ImageGenView key={JSON.stringify(open)} editor={editor} open={{ ...open, sources: open.sources.slice(0, MAX_REFERENCES) }} />
}

function ImageGenView({ editor, open }: { editor: Editor; open: ImageGenOpen }) {
  const { target, sources, sketch, text } = open
  const t = useT()
  const g = t.imageGen
  const settings = useValue(aiSettingsAtom)
  const server = useValue(serverAiAtom)
  const available = imageGenerationAvailable(settings, server)
  const mode = sketch?.length ? 'sketch' : sources.length === 0 ? 'create' : sources.length === 1 ? 'edit' : 'compose'
  const close = () => imageGenAtom.set(null)
  const [initial] = useState(() =>
    open.subject !== undefined ? { subject: open.subject, context: '' } : mode === 'create' && target ? pictureSubject(editor, target) : { subject: '', context: '' }
  )
  const [subject, setSubject] = useState(initial.subject)
  const [docStyle] = useState(() => readImageStyle(editor))
  const [style, setStyle] = useState<ImageStyle>(docStyle.style)
  const [styleNote, setStyleNote] = useState(docStyle.note)
  const [aspect, setAspect] = useState<AspectRatio>(() => (mode === 'edit' ? aspectOf(editor, sources) : mode === 'sketch' ? aspectOf(editor, sketch!) : '4:3'))
  const [model, setModel] = useState(readModel)
  const [run, setRun] = useState<{ abort: AbortController; started: number } | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [failure, setFailure] = useState<string | null>(null)
  useEffect(() => {
    if (!run) return
    const timer = setInterval(() => setSeconds(Math.round((Date.now() - run.started) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [run])

  const chooseStyle = (next: { style: ImageStyle; note: string }) => {
    setStyle(next.style)
    setStyleNote(next.note)
    // Le style vaut pour tout le document : ses images vont ensemble.
    writeImageStyle(editor, next)
  }
  const chooseModel = (id: string) => {
    setModel(id)
    try {
      localStorage.setItem(MODEL_KEY, id)
    } catch {
      // stockage indisponible : le choix vaut pour cette fois
    }
  }

  async function generate() {
    setFailure(null)
    const abort = new AbortController()
    setSeconds(0)
    setRun({ abort, started: Date.now() })
    try {
      const references = sketch?.length ? [await selectionSketch(editor, sketch)] : await referenceImages(editor, sources)
      const { dataUri } = await generateImage(
        settings,
        {
          subject,
          ...(initial.context && { context: initial.context }),
          style,
          ...(styleNote.trim() && { styleNote }),
          aspect,
          ...(references.length && { references }),
          ...(sketch?.length && { sketch: true }),
        },
        { model, signal: abort.signal }
      )
      const near = target ?? sources[sources.length - 1] ?? sketch?.[sketch.length - 1]
      await addGeneratedImage(editor, dataUri, {
        model,
        request: subject.trim(),
        place: text ? { text } : { near, ...(mode === 'create' && target && { illustrates: target }) },
        ...(sources.length && { from: sources }),
      })
      close()
    } catch (e) {
      const error = toAiError(e)
      if (error.kind !== 'aborted') setFailure(`${t.ai.errors[error.kind]}${error.detail ? ` (${error.detail})` : ''}`)
    } finally {
      setRun(null)
    }
  }

  const price = IMAGE_MODELS.find((m) => m.id === model)?.perImage
  return (
    <div className="element-ai" role="dialog" aria-label={g.titles[mode]} onKeyDown={(e) => e.key === 'Escape' && close()}>
      <header className="flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-sm font-semibold">{text ? g.openingTitle : mode === 'create' && !target ? g.freeTitle : g.titles[mode]}</h2>
        <button className="preset-icon" onClick={close} aria-label={t.common.close}>
          ✕
        </button>
      </header>
      <p className="text-xs text-zinc-500">{g.hints[mode]}</p>
      <textarea
        className="map-json-input assistant-instruction"
        rows={3}
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder={g.placeholders[mode]}
        aria-label={g.subjectLabel}
        autoFocus
      />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {mode !== 'edit' && (
          <label className="flex items-center gap-1" title={g.styleHint}>
            <span className="text-zinc-600">{g.style}</span>
            <select className="preset-input" value={style} onChange={(e) => chooseStyle({ style: e.target.value as ImageStyle, note: styleNote })} aria-label={g.style}>
              {IMAGE_STYLES.map((s) => (
                <option key={s} value={s}>
                  {g.styles[s]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-1">
          <span className="text-zinc-600">{g.aspect}</span>
          <select className="preset-input" value={aspect} onChange={(e) => setAspect(e.target.value as AspectRatio)} aria-label={g.aspect}>
            {ASPECT_RATIOS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 items-center gap-1">
          <span className="text-zinc-600">{g.model}</span>
          <select className="preset-input min-w-0 max-w-[14rem]" value={model} onChange={(e) => chooseModel(e.target.value)} aria-label={g.model}>
            {IMAGE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {mode !== 'edit' && style === 'free' && (
        <input
          className="preset-input text-xs"
          value={styleNote}
          onChange={(e) => setStyleNote(e.target.value)}
          onBlur={() => chooseStyle({ style, note: styleNote })}
          placeholder={g.styleNotePlaceholder}
          aria-label={g.styleNotePlaceholder}
        />
      )}
      <p className="text-xs text-zinc-500">{[price !== undefined && g.cost(price, mode !== 'create'), g.marked].filter(Boolean).join(' ')}</p>
      <div className="flex flex-wrap items-center gap-2">
        {available ? (
          <button className="btn-primary" disabled={!!run || !subject.trim()} onClick={() => void generate()}>
            {g.generate[mode]}
          </button>
        ) : (
          <>
            <span className="text-xs text-amber-700">{g.unavailable}</span>
            <button className="btn-xs" onClick={() => aiSettingsOpenAtom.set(true)}>
              {t.ai.configure}
            </button>
          </>
        )}
        {run && (
          <>
            <span className="text-xs text-zinc-500" role="status">
              {g.working(seconds)}
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
    </div>
  )
}

/**
 * Badges des images, en édition comme en présentation : « IA » sur une image générée (on doit le
 * savoir), la licence d'une image trouvée sur Wikimedia Commons (un clic ouvre sa page).
 */
export function ImageBadges() {
  const t = useT()
  const editor = useEditor()
  const badges = useValue(
    'image badges',
    () => {
      // En présentation : seulement sur les images visibles à cette étape.
      const classes = shapeClassesAtom.get()
      const editing = modeAtom.get() === 'edit'
      return editor.getCurrentPageShapes().flatMap((s) => {
        const generated = generatedOf(s)
        const credit = creditMetaOf(s)
        const b = (generated || credit) && editor.getShapePageBounds(s.id)
        if (!b || (editing && editor.isShapeHidden(s.id))) return []
        if (!editing && classes && (classes.byId.get(s.id) ?? classes.fallback).className.includes('pres-hidden')) return []
        return [{ id: s.id, x: b.minX, y: b.maxY, generated, credit }]
      })
    },
    [editor]
  )
  const zoom = useValue('zoom', () => editor.getZoomLevel(), [editor])
  const style = (b: { x: number; y: number }) => ({ left: b.x, top: b.y, transform: `scale(${1 / zoom}) translate(6px, calc(-100% - 6px))` })
  return (
    <>
      {badges.map((b) =>
        b.generated ? (
          <span key={b.id} className="generated-badge" style={style(b)} title={t.imageGen.badgeHint(IMAGE_MODELS.find((m) => m.id === b.generated!.model)?.label ?? b.generated.model)}>
            {t.imageGen.badge}
          </span>
        ) : (
          <a
            key={b.id}
            className="generated-badge"
            style={style(b)}
            href={b.credit!.page}
            target="_blank"
            rel="noreferrer"
            onPointerDown={(e) => e.stopPropagation()}
            title={t.imageSearch.creditHint(b.credit!.author, b.credit!.license)}
          >
            {b.credit!.license === 'Public domain' ? t.imageSearch.publicDomain : b.credit!.license}
          </a>
        )
      )}
    </>
  )
}
