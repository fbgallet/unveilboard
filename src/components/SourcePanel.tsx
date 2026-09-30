'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Box, atom, getColorValue, useValue, type Editor, type TLPageId, type TLShapeId } from 'tldraw'
import type { Components } from 'react-markdown'
import { useT } from '@/i18n/client'
import type { Messages } from '@/i18n/config'
import { presetById } from '@/lib/canvas/presets'
import { functionOf } from '@/lib/canvas/tree'
import { presetName, presetRole } from '@/lib/presets/labels'
import { activeLayerAtom, addLayer, layerOfElement, readLayers, removeLayer, setElementLayer, updateLayer, type SourceLayer } from '@/lib/canvas/layers'
import { textOf } from '@/lib/canvas/mapExport'
import { addPassage, cleanPassage, createFromPassage, isPassageTarget, passagesOf, removePassage, removePassageAt, reverifyExcerpts } from '@/lib/canvas/passage'
import { readPageSource, writePageSource } from '@/lib/canvas/source'
import { locateExcerpt, normalizeForSearch, quoteText } from '@/lib/map/excerpts'
import { SOURCE_PANEL_WIDTH, editUnlockedAtom, modeAtom, sourcePanelWidthAtom, stepIndexAtom, storeValue } from '@/lib/presentation/store'
import { computeEditorStage, readSequence } from '@/lib/canvas/adapter'
import { stateOf } from '@/lib/sequence/compute'
import { remarkHighlight, type Highlight } from '@/lib/source/highlight'
import { readSourceFile } from '@/lib/source/read'
import { elementAiAtom, elementAiRequestAtom } from './ElementAi'
import { MarkdownEditor } from './MarkdownEditor'
import { openAssistant } from './MapJsonDialog'
import { openSourceDialogWithPageText } from './SourceDialog'
import { reviewFocusAtom, reviewOpenAtom } from '@/lib/canvas/review'
import { planPanelOpenAtom } from './PlanPanel'
import { Markdownish } from './Markdownish'
import { ResizeHandle } from './ResizeHandle'

const readOpen = () => {
  try {
    return localStorage.getItem('sourcePanelOpen') === 'true'
  } catch {
    return false
  }
}
export const sourcePanelOpenAtom = atom<boolean>('sourcePanelOpen', readOpen())

export function setSourcePanelOpen(open: boolean) {
  sourcePanelOpenAtom.set(open)
  storeValue('sourcePanelOpen', open)
}
export const openSourcePanel = () => setSourcePanelOpen(true)

/**
 * En présentation (et sur la page de lecture), la barre a son propre état : au lancement, celui que
 * le schéma demande (réglage de la séquence), puis au choix (menu « Plus »).
 */
export const sourcePresentOpenAtom = atom<boolean>('sourcePresentOpen', false)

/** Cliquer sur un passage recentre toujours sur ses éléments ; au choix, il les sélectionne aussi. */
const selectOnClickAtom = atom<boolean>('sourceSelectOnClick', (() => {
  try {
    return localStorage.getItem('sourceSelectOnClick') === 'true'
  } catch {
    return false
  }
})())

/** Taille du texte de la barre (%), mémorisée sur cet appareil. */
const SOURCE_TEXT_SCALE = { min: 70, max: 200, step: 10 }
const sourceTextScaleAtom = atom<number>('sourceTextScale', (() => {
  try {
    const v = Number(localStorage.getItem('sourceTextScale'))
    return v >= SOURCE_TEXT_SCALE.min && v <= SOURCE_TEXT_SCALE.max ? v : 100
  } catch {
    return 100
  }
})())
function changeSourceTextScale(delta: number) {
  const { min, max, step } = SOURCE_TEXT_SCALE
  const next = Math.min(max, Math.max(min, sourceTextScaleAtom.get() + delta * step))
  sourceTextScaleAtom.set(next)
  storeValue('sourceTextScale', next)
}

/** Passage cité par un élément, avec sa couleur et son calque. */
interface Cited {
  node: string
  text: string
  color?: string
  /** En présentation : l'élément entre, ou est mis en avant, à l'étape courante. */
  current?: boolean
  layer: string
  layerLabel: string
}

/**
 * Calque d'un élément : sa fonction dans une carte d'argument (justification, objection…), sinon
 * son type (concept, citation, exemple…), sinon « Autres ».
 */
function layerOf(editor: Editor, id: TLShapeId, t: Messages): { layer: string; layerLabel: string } {
  const relation = functionOf(editor, id)
  const role = relation && presetRole(relation, t)
  if (relation && role) return { layer: `function:${relation.id}`, layerLabel: role }
  const preset = presetById(editor, editor.getShape(id)?.meta.preset as string | undefined)
  if (preset) return { layer: `type:${preset.id}`, layerLabel: presetName(preset, t) }
  return { layer: 'other', layerLabel: t.source.layerOther }
}

/** Calques masqués (sur cet appareil). */
const hiddenLayersAtom = atom<string[]>('sourceHiddenLayers', (() => {
  try {
    return JSON.parse(localStorage.getItem('sourceHiddenLayers') ?? '[]') as string[]
  } catch {
    return []
  }
})())
function setHiddenLayers(keys: string[]) {
  hiddenLayersAtom.set(keys)
  try {
    localStorage.setItem('sourceHiddenLayers', JSON.stringify(keys))
  } catch {
    // stockage indisponible : le choix ne sera pas mémorisé
  }
}

/**
 * Recentre sur des éléments sans zoom brutal : une large marge autour (l'élément garde son
 * contexte), et jamais plus que la taille réelle.
 */
function frameGently(editor: Editor, ids: TLShapeId[]) {
  const boxes = ids.map((id) => editor.getShapePageBounds(id)).filter((b) => !!b)
  if (!boxes.length) return
  const bounds = Box.Common(boxes)
  const margin = Math.max(bounds.w, bounds.h) * 0.8 + 120
  editor.zoomToBounds(bounds.clone().expandBy(margin), { animation: { duration: 300 }, targetZoom: 1 })
}

/**
 * Barre « Texte source », à gauche du schéma (mode édition) : le texte de la page, mis en forme
 * (Markdown) et modifiable, avec les passages cités surlignés aux couleurs de leurs éléments (plus
 * fort pour la sélection). Cliquer sur un passage sélectionne ses éléments. Un passage sélectionné
 * devient un élément, un enfant, l'extrait d'un élément, ou une demande à l'IA. Sans texte, on en
 * associe un à la page.
 */
export function SourcePanel({ editor, presenting = false }: { editor: Editor; presenting?: boolean }) {
  const editOpen = useValue(sourcePanelOpenAtom)
  const presentOpen = useValue(sourcePresentOpenAtom)
  const open = presenting ? presentOpen : editOpen
  // En entrant en présentation : ce que le schéma demande.
  useEffect(() => {
    if (presenting) sourcePresentOpenAtom.set(!!readSequence(editor)?.sourceText)
  }, [presenting, editor])
  const width = useValue(sourcePanelWidthAtom)
  const hasSource = useValue('has source', () => !!readPageSource(editor), [editor])
  // En présentation : seulement s'il y a un texte (lecture seule).
  if (!open || (presenting && !hasSource)) return null
  return (
    <aside className="source-sidebar relative flex h-full shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 text-sm text-zinc-800" style={{ width }}>
      <ResizeHandle width={sourcePanelWidthAtom} limits={SOURCE_PANEL_WIDTH} storageKey="sourcePanelWidth" side="left" />
      <SourceView editor={editor} presenting={presenting} />
    </aside>
  )
}

function SourceView({ editor, presenting }: { editor: Editor; presenting: boolean }) {
  const t = useT()
  const source = useValue('source', () => readPageSource(editor), [editor])
  const [draft, setDraft] = useState<string | null>(null)
  const [verification, setVerification] = useState<{ found: number; missing: number } | null>(null)
  const selectOnClick = useValue(selectOnClickAtom)
  const scale = useValue(sourceTextScaleAtom)
  // Autres pages qui ont un texte : on peut reprendre le leur sur cette page.
  const othersJson = useValue(
    'other page sources',
    () =>
      JSON.stringify(
        editor
          .getPages()
          .filter((p) => p.id !== editor.getCurrentPageId() && readPageSource(editor, p.id))
          .map((p) => ({ id: p.id, name: p.name }))
      ),
    [editor]
  )
  const others = useMemo(() => JSON.parse(othersJson) as { id: TLPageId; name: string }[], [othersJson])

  const save = (text: string, label?: string) => {
    writePageSource(editor, { text, ...(label && { label }) })
    setVerification(reverifyExcerpts(editor, text))
    setDraft(null)
  }

  return (
    <div aria-label={t.source.panelTitle} role="complementary" className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <header className="flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-sm font-semibold" title={source?.label}>
          {t.source.panelTitle}
          {source?.label && <span className="font-normal text-zinc-500"> · {source.label}</span>}
        </h2>
        <span className="flex items-center gap-1">
          {source && draft === null && (
            <>
              {/* Taille du texte, comme dans la barre de droite. */}
              <button className="preset-icon source-size" onClick={() => changeSourceTextScale(-1)} title={t.presenter.textSmaller} aria-label={t.presenter.textSmaller}>
                A−
              </button>
              <button className="preset-icon source-size" onClick={() => changeSourceTextScale(1)} title={t.presenter.textLarger} aria-label={t.presenter.textLarger}>
                A+
              </button>
            </>
          )}
          {source && draft === null && !presenting && <SourceAiMenu />}
          {source && draft === null && !presenting && (
            <>
              <button
                className={`preset-icon ${selectOnClick ? 'preset-icon-on' : ''}`}
                aria-pressed={selectOnClick}
                aria-label={t.source.selectOnClick}
                title={t.source.selectOnClick}
                onClick={() => {
                  selectOnClickAtom.set(!selectOnClick)
                  storeValue('sourceSelectOnClick', !selectOnClick)
                }}
              >
                {/* Une flèche de sélection sur un cadre en pointillés. */}
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                  <path d="M2 5V2h3M8 2h2M13 2h1v1M2 8v2M2 13v1h1" strokeDasharray="0" />
                  <path d="M7 7l6.5 2.5-2.8 1.2-1.2 2.8z" fill="currentColor" />
                </svg>
              </button>
              <button className="btn-xs" onClick={() => setDraft(source.text)}>
                {t.source.edit}
              </button>
            </>
          )}
          <button className="preset-icon" onClick={() => (presenting ? sourcePresentOpenAtom.set(false) : setSourcePanelOpen(false))} aria-label={t.common.close}>
            ✕
          </button>
        </span>
      </header>
      {verification && verification.found + verification.missing > 0 && (
        <p className={`text-xs ${verification.missing ? 'text-amber-700' : 'text-emerald-700'}`}>{t.source.reverified(verification.found, verification.missing)}</p>
      )}
      {!source ? (
        <AssociateForm
          onAssociate={save}
          others={others}
          onReuse={(pageId) => {
            const other = readPageSource(editor, pageId)
            if (other) save(other.text, other.label)
          }}
        />
      ) : draft === null ? (
        <SourceText editor={editor} text={source.text} presenting={presenting} scale={scale} />
      ) : (
        <>
          <p className="text-xs text-zinc-500">{t.source.editHint}</p>
          <MarkdownEditor value={draft} onChange={setDraft} fill label={t.source.panelTitle} title={t.source.panelTitle} />
          <div className="flex flex-wrap justify-end gap-2">
            <button
              className="btn-xs mr-auto self-center"
              onClick={() => {
                if (!confirm(t.source.removeConfirm)) return
                writePageSource(editor, null)
                setDraft(null)
                setVerification(null)
              }}
            >
              {t.source.remove}
            </button>
            <button className="btn" onClick={() => setDraft(null)}>
              {t.common.cancel}
            </button>
            <button className="btn-primary" onClick={() => save(draft, source.label)}>
              {t.source.save}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** Pas encore de texte sur cette page : en coller un, ou en lire un d'un fichier. */
function AssociateForm({
  onAssociate,
  others,
  onReuse,
}: {
  onAssociate(text: string, label?: string): void
  /** Autres pages du document qui ont un texte. */
  others: { id: TLPageId; name: string }[]
  onReuse(pageId: TLPageId): void
}) {
  const t = useT()
  const [text, setText] = useState('')
  const [label, setLabel] = useState('')
  const [failure, setFailure] = useState<string | null>(null)

  async function pickFile(file: File | undefined) {
    if (!file) return
    setFailure(null)
    try {
      const read = await readSourceFile(file)
      if (read.kind === 'text') setText(read.text)
      else setFailure(t.source.unsupported(file.name))
    } catch (e) {
      setFailure(e instanceof Error ? e.message : t.common.genericError)
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2">
      <h3 className="preset-group-title">{t.source.associateTitle}</h3>
      {others.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {others.map((page) => (
            <button key={page.id} className="btn-xs" onClick={() => onReuse(page.id)}>
              {t.source.reuseText(page.name)}
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-zinc-500">{t.source.associateIntro}</p>
      <MarkdownEditor value={text} onChange={setText} placeholder={t.source.placeholder} fill label={t.source.textLabel} title={t.source.associateTitle} />
      <label className="btn-xs self-start">
        {t.source.chooseFile}
        <input
          type="file"
          accept=".txt,.md,.markdown,text/plain,text/markdown,application/pdf,.pdf"
          className="sr-only"
          onChange={(e) => void pickFile(e.target.files?.[0])}
        />
      </label>
      <input className="preset-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t.source.labelPlaceholder} aria-label={t.source.labelLabel} />
      {failure && <p className="text-xs text-red-700">{failure}</p>}
      <button className="btn-primary self-start" disabled={!text.trim()} onClick={() => onAssociate(text, label.trim() || undefined)}>
        {t.source.associate}
      </button>
    </section>
  )
}

/** Le texte mis en forme, ses passages cités surlignés, et ce qu'on fait d'un passage sélectionné. */
function SourceText({ editor, text, presenting, scale }: { editor: Editor; text: string; presenting: boolean; scale: number }) {
  const t = useT()
  const body = useRef<HTMLDivElement>(null)
  const [passage, setPassage] = useState<{ text: string; top: number } | null>(null)
  /** Passage surligné cliqué : les éléments qui le citent, pour retirer le surlignage. */
  const [clicked, setClicked] = useState<Clicked | null>(null)

  // Passages cités (extraits, et texte des citations), avec la couleur de leur élément. En chaîne,
  // pour ne redessiner le texte que s'ils changent (pas à chaque déplacement de forme).
  const citedJson = useValue(
    'cited passages',
    () => {
      const colors = editor.getCurrentTheme().colors[editor.getColorMode()]
      const custom = readLayers(editor)
      // En présentation : seulement les éléments déjà dévoilés ; ceux de l'étape ressortent.
      const seq = presenting ? readSequence(editor) : null
      const stage = seq ? computeEditorStage(editor, seq, stepIndexAtom.get()) : null
      const stateAt = (id: string) => (stage ? stateOf(stage, id) : null)
      return JSON.stringify(
        editor
          .getCurrentPageShapes()
          .filter((s) => s.type !== 'arrow' && !s.meta.suggestion && stateAt(s.id)?.visibility !== 'hidden')
          .flatMap((s) => {
            const excerpt = typeof s.meta.excerpt === 'string' ? s.meta.excerpt : ''
            const quote = s.meta.preset === 'quote' ? quoteText(textOf(editor, s)) : ''
            const color = (s.props as { color?: string }).color
            // Le calque : libre s'il y en a un, sinon automatique ; la couleur est toujours celle de l'élément.
            const own = layerOfElement(editor, s.id, custom)
            const layer = own ? { layer: `custom:${own.id}`, layerLabel: own.name } : layerOf(editor, s.id, t)
            const state = stateAt(s.id)
            return [excerpt, quote].filter(Boolean).map((passage) => ({
              node: s.id as string,
              text: passage,
              current: !!state && (state.highlighted || !!state.entering),
              color: color ? getColorValue(colors, color as never, 'solid') : undefined,
              ...layer,
            }))
          })
      )
    },
    [editor, t, presenting]
  )
  const cited = useMemo(() => JSON.parse(citedJson) as Cited[], [citedJson])
  const hidden = useValue(hiddenLayersAtom)
  const [showLayers, setShowLayers] = useState(false)
  // Calques libres, et calques automatiques des autres passages.
  const customJson = useValue('source layers', () => JSON.stringify(readLayers(editor)), [editor])
  const custom = useMemo(() => JSON.parse(customJson) as SourceLayer[], [customJson])
  const activeLayer = useValue(activeLayerAtom)
  const counts = useMemo(() => {
    const all = new Map<string, number>()
    for (const c of cited) all.set(c.layer, (all.get(c.layer) ?? 0) + 1)
    return all
  }, [cited])
  const auto = useMemo(() => {
    const all = new Map<string, { key: string; label: string; color?: string }>()
    for (const c of cited) if (!c.layer.startsWith('custom:') && !all.has(c.layer)) all.set(c.layer, { key: c.layer, label: c.layerLabel, color: c.color })
    return [...all.values()]
  }, [cited])
  const selected = useValue('selected ids', () => editor.getSelectedShapeIds().join(' '), [editor])
  const target = useValue(
    'passage target',
    () => {
      // En présentation, pas d'actions sur le schéma.
      const shape = editor.getOnlySelectedShape() ?? undefined
      return !presenting && isPassageTarget(shape) ? shape!.id : null
    },
    [editor, presenting]
  )
  const targetLayer = useValue('target layer', () => (target ? ((editor.getShape(target)?.meta.layer as string | undefined) ?? '') : ''), [editor, target])
  const targetText = useValue('passage target text', () => (target ? textOf(editor, editor.getShape(target)!) : ''), [editor, target])
  const targetPassages = useValue('passage target excerpts', () => (target ? passagesOf(editor, target).join('\u0000') : ''), [editor, target])
    .split('\u0000')
    .filter(Boolean)
  const normalized = useMemo(() => normalizeForSearch(text), [text])
  const located = useMemo(() => cited.map((c) => ({ ...c, ranges: locateExcerpt(normalized, c.text) })), [cited, normalized])
  const highlights = useMemo<Highlight[]>(() => {
    const active = new Set(selected.split(' '))
    return located
      .filter((c) => !hidden.includes(c.layer))
      .flatMap((c) => (c.ranges ?? []).map(([from, to]) => ({ from, to, nodes: [c.node], active: presenting ? !!c.current : active.has(c.node), color: c.color })))
  }, [located, selected, hidden, presenting])
  const plugins = useMemo(() => [remarkHighlight(text, highlights)], [text, highlights])
  const components = useMemo<Components>(
    () => ({
      mark: ({ className, children, ...props }) => {
        const data = props as Record<string, unknown>
        const nodes = String(data['data-nodes'] ?? '').split(' ')
        const color = data['data-color'] as string | undefined
        const colors = String(data['data-colors'] ?? '').split(' ').filter(Boolean)
        // Calques qui se recouvrent : un soulignement par couleur, empilés.
        const underlines = colors.length > 1 ? colors.map((c, i) => `inset 0 ${-2 * (i + 1)}px 0 ${c}`).join(', ') : undefined
        return (
          <mark
            className={className}
            style={color ? ({ '--mark-color': color, ...(underlines && { boxShadow: underlines }) } as CSSProperties) : undefined}
            onClick={(e) => {
              // En présentation, la caméra suit la séquence ; un clic qui termine une sélection de texte ne fait rien.
              if ((modeAtom.get() === 'present' && !editUnlockedAtom.get()) || window.getSelection()?.toString()) return
              const ids = nodes.filter((id) => editor.getShape(id as TLShapeId)) as TLShapeId[]
              if (!ids.length) return
              if (selectOnClickAtom.get()) editor.select(...ids)
              frameGently(editor, ids)
              // Une petite croix au bout du passage, pour en retirer le surlignement.
              setClicked(clickedAt(e.currentTarget as HTMLElement, ids, data, false))
            }}
            onContextMenu={(e) => {
              if (modeAtom.get() === 'present' && !editUnlockedAtom.get()) return
              const ids = nodes.filter((id) => editor.getShape(id as TLShapeId)) as TLShapeId[]
              if (!ids.length) return
              // Clic droit : les éléments qui citent le passage (sélectionner, retirer le surlignement).
              e.preventDefault()
              setClicked(clickedAt(e.currentTarget as HTMLElement, ids, data, true))
            }}
          >
            {children}
          </mark>
        )
      },
    }),
    [editor]
  )

  /** Où placer la croix (au bout du passage) ou le menu (dessous), dans le texte qui défile. */
  function clickedAt(mark: HTMLElement, nodes: TLShapeId[], data: Record<string, unknown>, menu: boolean): Clicked {
    const frame = body.current!.getBoundingClientRect()
    const rects = mark.getClientRects()
    const last = rects[rects.length - 1] ?? mark.getBoundingClientRect()
    const scroll = body.current!.scrollTop
    return {
      nodes,
      from: Number(data['data-from']),
      to: Number(data['data-to']),
      menu,
      top: (menu ? last.bottom + 4 : last.top) - frame.top + scroll,
      left: Math.min(last.right - frame.left, frame.width - 24),
    }
  }

  // La sélection (ou, en présentation, l'étape) change : le texte défile jusqu'à son premier passage.
  useEffect(() => {
    body.current?.querySelector('.source-mark-active')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [selected, highlights])

  /** Le passage sélectionné dans le texte (ou rien), et où placer ses actions. */
  function readSelection() {
    const selection = window.getSelection()
    const chosen = selection?.toString() ?? ''
    if (!selection || !cleanPassage(chosen) || !body.current?.contains(selection.anchorNode)) return setPassage(null)
    const rect = selection.getRangeAt(0).getBoundingClientRect()
    const frame = body.current.getBoundingClientRect()
    setPassage({ text: chosen, top: rect.bottom - frame.top + body.current.scrollTop + 4 })
  }

  const done = () => {
    window.getSelection()?.removeAllRanges()
    setPassage(null)
  }
  const askAi = (id: TLShapeId, chosen: string) => {
    elementAiRequestAtom.set(t.source.aiFromPassage(cleanPassage(chosen)))
    // Rouvert, pour relire la demande même si le panneau était déjà ouvert sur cet élément.
    elementAiAtom.set(null)
    setTimeout(() => elementAiAtom.set(id))
  }
  const found = located.filter((c) => c.ranges).length

  return (
    <>
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-xs text-zinc-500">
          {[cited.length > 0 && t.source.passages(found, cited.length - found), !presenting && t.source.passageHint].filter(Boolean).join(' · ')}
        </p>
        {!presenting && (
          <button
            className={`preset-icon shrink-0 ${showLayers ? 'preset-icon-on' : ''}`}
            aria-expanded={showLayers}
            aria-label={t.source.layers}
            title={`${t.source.layers}. ${t.source.layersHint}`}
            onClick={() => setShowLayers(!showLayers)}
          >
            {/* Trois plans superposés */}
            <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden>
              <path d="M8 2 14 5 8 8 2 5z" />
              <path d="M2 8l6 3 6-3" />
              <path d="M2 11l6 3 6-3" />
            </svg>
          </button>
        )}
      </div>
      {showLayers && !presenting && (
        <div className="source-layers" aria-label={t.source.layers} role="group">
          <p className="preset-group-title">{t.source.myLayers}</p>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">
            {custom.map((layer) => {
              const key = `custom:${layer.id}`
              return (
                <li key={layer.id} className="flex items-center gap-1.5 text-xs">
                  <input
                    type="radio"
                    name="active-source-layer"
                    checked={activeLayer === layer.id}
                    title={t.source.activeLayer}
                    aria-label={`${t.source.activeLayer} (${layer.name})`}
                    onChange={() => activeLayerAtom.set(layer.id)}
                    onClick={() => activeLayer === layer.id && activeLayerAtom.set(null)}
                  />
                  <input
                    type="checkbox"
                    checked={!hidden.includes(key)}
                    aria-label={layer.name}
                    onChange={(e) => setHiddenLayers(e.target.checked ? hidden.filter((k) => k !== key) : [...hidden, key])}
                  />
                  <input
                    key={layer.name}
                    className="source-layer-name"
                    defaultValue={layer.name}
                    aria-label={t.source.renameLayer}
                    onBlur={(e) => e.target.value.trim() && e.target.value !== layer.name && updateLayer(editor, layer.id, { name: e.target.value.trim() })}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                  <span className="text-zinc-400">{counts.get(key) ?? 0}</span>
                  <button className="preset-icon" title={t.source.deleteLayer} aria-label={t.source.deleteLayer} onClick={() => removeLayer(editor, layer.id)}>
                    ✕
                  </button>
                </li>
              )
            })}
          </ul>
          <button
            className="btn-xs justify-self-start"
            onClick={() => {
              const id = addLayer(editor, t.source.layerName(custom.length + 1))
              activeLayerAtom.set(id)
            }}
          >
            + {t.source.newLayer}
          </button>
          {auto.length > 0 && (
            <>
              <p className="preset-group-title mt-1">{t.source.autoLayers}</p>
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
                {auto.map((layer) => (
                  <li key={layer.key}>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={!hidden.includes(layer.key)}
                        onChange={(e) => setHiddenLayers(e.target.checked ? hidden.filter((k) => k !== layer.key) : [...hidden, layer.key])}
                      />
                      <span className="source-layer-swatch" style={{ background: layer.color ?? 'var(--color-amber-400)' }} />
                      <span className="min-w-0 flex-1 truncate">{layer.label}</span>
                      <span className="text-zinc-400">{counts.get(layer.key) ?? 0}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      <div
        className="source-text relative"
        ref={body}
        onMouseUp={presenting ? undefined : readSelection}
        onKeyUp={presenting ? undefined : readSelection}
        onScroll={() => {
          setPassage(null)
          setClicked(null)
        }}
        style={{ fontSize: `${(14 * scale) / 100}px` }}
      >
        <Markdownish text={text} remarkPlugins={plugins} components={components} />
        {clicked && !presenting && clicked.menu && (
          <ClickedPassage editor={editor} clicked={clicked} sourceText={text} onClose={() => setClicked(null)} />
        )}
        {clicked && !presenting && !clicked.menu && (
          <RemoveMark
            clicked={clicked}
            onRemove={() => {
              for (const id of clicked.nodes) removePassageAt(editor, id, text, clicked.from, clicked.to)
              setClicked(null)
            }}
            onClose={() => setClicked(null)}
          />
        )}
        {passage && !presenting && (
          // Les boutons ne prennent pas le focus : la sélection du texte reste.
          <div className="source-passage-actions" style={{ top: passage.top }} onMouseDown={(e) => e.preventDefault()}>
            <button
              className="btn-xs"
              onClick={() => {
                createFromPassage(editor, passage.text, { at: editor.getViewportPageBounds().center, layer: activeLayer })
                done()
              }}
            >
              {t.source.createElement}
            </button>
            <button
              className="btn-xs"
              disabled={!target}
              title={target ? undefined : t.source.selectFirst}
              onClick={() => {
                createFromPassage(editor, passage.text, { parent: target!, layer: activeLayer })
                done()
              }}
            >
              {t.source.createChild}
            </button>
            <button
              className="btn-xs"
              disabled={!target}
              title={target ? undefined : t.source.selectFirst}
              onClick={() => {
                addPassage(editor, target!, passage.text, text)
                done()
              }}
            >
              {targetPassages.length ? t.source.addExcerpt : t.source.attach}
            </button>
            <button
              className="btn-xs"
              disabled={!target}
              title={target ? undefined : t.source.selectFirst}
              onClick={() => {
                askAi(target!, passage.text)
                done()
              }}
            >
              {t.source.askAi}
            </button>
          </div>
        )}
      </div>
      {/* En bas de la barre : n'écarte pas le texte quand la sélection change. */}
      {target && custom.length > 0 && (
        <label className="flex items-center gap-2 text-xs text-zinc-600">
          {t.source.elementLayer}
          <select className="preset-input py-0.5" value={targetLayer} onChange={(e) => setElementLayer(editor, target, e.target.value || null)}>
            <option value="">{t.source.automaticLayer}</option>
            {custom.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {target && !targetPassages.length && (
        <div className="source-target text-xs" role="status">
          <span className="block truncate" title={targetText}>
            {t.source.targetLabel(targetText)}
          </span>
          <span className="block">{t.source.targetHint}</span>
        </div>
      )}
      {target && targetPassages.length > 0 && (
        <div className="source-target grid grid-cols-[minmax(0,1fr)] gap-1 text-xs" role="status">
          <span>{t.source.excerptsOf}</span>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
            {targetPassages.map((p, i) => (
              <li key={i} className="flex items-start gap-1">
                <span className="min-w-0 flex-1 truncate italic" title={p}>
                  « {p} »
                </span>
                <button className="preset-icon" aria-label={t.source.removeExcerpt} title={t.source.removeExcerpt} onClick={() => removePassage(editor, target, i)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

/** Passage surligné cliqué : ses éléments, sa plage dans le texte, et où afficher la croix ou le menu. */
interface Clicked {
  nodes: TLShapeId[]
  from: number
  to: number
  /** Clic droit : le menu ; sinon, la croix. */
  menu: boolean
  top: number
  left: number
}

/** La petite croix au bout d'un passage cliqué : retire son surlignement. */
function RemoveMark({ clicked, onRemove, onClose }: { clicked: Clicked; onRemove(): void; onClose(): void }) {
  const t = useT()
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const onDown = (e: PointerEvent) => e.target !== ref.current && !(e.target as Element).closest?.('mark') && onClose()
    window.addEventListener('pointerdown', onDown, { capture: true })
    return () => window.removeEventListener('pointerdown', onDown, { capture: true })
  }, [onClose])
  return (
    <button ref={ref} className="source-mark-remove" style={{ top: clicked.top, left: clicked.left }} title={t.source.removeHighlight} aria-label={t.source.removeHighlight} onClick={onRemove}>
      ✕
    </button>
  )
}

/** Clic droit sur un passage surligné : les éléments qui le citent (sélectionner, retirer le surlignement). */
function ClickedPassage({
  editor,
  clicked,
  sourceText,
  onClose,
}: {
  editor: Editor
  clicked: Clicked
  sourceText: string
  onClose(): void
}) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('pointerdown', onDown, { capture: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown, { capture: true })
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  return (
    <div ref={ref} className="source-passage-actions source-clicked" style={{ top: clicked.top }} role="dialog" aria-label={t.source.citedBy}>
      <span className="w-full text-xs text-zinc-500">{t.source.citedBy}</span>
      {clicked.nodes.map((id) => {
        const shape = editor.getShape(id)
        if (!shape) return null
        const name = textOf(editor, shape)
        return (
          <div key={id} className="flex w-full min-w-0 items-center gap-1">
            <span className="min-w-0 flex-1 truncate text-xs" title={name}>
              « {name} »
            </span>
            <button
              className="btn-xs"
              onClick={() => {
                editor.select(id)
                onClose()
              }}
            >
              {t.source.selectElement}
            </button>
            {passagesOf(editor, id).length > 0 && (
              <button
                className="btn-xs"
                onClick={() => {
                  removePassageAt(editor, id, sourceText, clicked.from, clicked.to)
                  onClose()
                }}
              >
                {t.source.removeHighlight}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Menu ✦ de la barre : l'IA à partir du texte de la page (créer, enrichir, structurer, séquencer, relire). */
function SourceAiMenu() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onDown, { capture: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown, { capture: true })
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  const items: { label: string; action(): void }[] = [
    { label: t.source.aiCreate, action: openSourceDialogWithPageText },
    { label: t.source.aiEnrich, action: () => openAssistant('enrich') },
    {
      label: t.source.aiPlan,
      action: () => {
        reviewOpenAtom.set(false)
        planPanelOpenAtom.set(true)
      },
    },
    { label: t.source.aiSequence, action: () => openAssistant('sequence') },
    {
      label: t.source.aiReview,
      action: () => {
        reviewFocusAtom.set([...new Set([...reviewFocusAtom.get(), 'sources' as const])])
        planPanelOpenAtom.set(false)
        reviewOpenAtom.set(true)
      },
    },
  ]
  return (
    <span className="relative" ref={ref}>
      <button className={`preset-icon ${open ? 'preset-icon-on' : ''}`} aria-expanded={open} aria-haspopup="menu" aria-label={t.source.aiMenu} title={t.source.aiMenu} onClick={() => setOpen(!open)}>
        {/* L'icône du menu IA du canevas (en haut à droite), un peu abaissée : sa grande étoile la fait paraître haute. */}
        <svg viewBox="0 -2 24 24" width="15" height="15" aria-hidden>
          <path d="M12 2.5l2.1 6.4 6.4 2.1-6.4 2.1L12 19.5l-2.1-6.4L3.5 11l6.4-2.1z" fill="currentColor" />
          <path d="M19 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div className="ai-launcher-menu" role="menu" aria-label={t.source.aiMenu}>
          <div className="ai-launcher-group" role="group">
            {items.map((item) => (
              <button
                key={item.label}
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  item.action()
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </span>
  )
}
