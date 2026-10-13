'use client'

import { useEffect, useState } from 'react'
import { atom, renderPlaintextFromRichText, useValue, type Editor, type TLRichText, type TLShapeId } from 'tldraw'
import { useT } from '@/i18n/client'
import type { Messages } from '@/i18n/config'
import { AIM_FAMILIES, AIM_SEES, AIM_TEXT, AIM_WEB, AIM_WHOLE, AMOUNTS, DEFAULT_AMOUNT, FAMILY_AIMS, familyFor, IMAGE_FAMILY, type AimFamily, type AimId, type Amount } from '@/lib/ai/aims'
import { aiSettingsAtom, checkSeesImages, imageGenerationAvailable, isAiReady, seesImages, serverAiAtom, webSearchAvailable } from '@/lib/ai/client'
import { visionAtom } from '@/lib/ai/vision'
import { toAiError } from '@/lib/ai/errors'
import { buildPrompt } from '@/lib/ai/prompts'
import { applyElementAnswer, elementPromptInput, readElementAnswer, runElementRequest, type ElementRequest } from '@/lib/canvas/elementAi'
import { isImage } from '@/lib/canvas/imageReading'
import { readPageSource } from '@/lib/canvas/source'
import { isArgumentTree } from '@/lib/canvas/tree'
import type { MapIssue } from '@/lib/map/check'
import type { PromptTemplate } from '@/lib/prompts/template'
import { aiSettingsOpenAtom } from './AiSettingsDialog'
import { AiProgress, progressCallbacks, startProgress, type AiProgressState } from './AiProgress'
import { PromptPicker, usePromptChoice } from './PromptPicker'
import { ImageReadingBox } from './ImageReading'
import { imageGenAtom } from './ImageGen'
import { imageSearchAtom } from './ImageSearch'
import { pictureSubject } from '@/lib/canvas/imageGen'
import { WebToggle, webUnavailableText } from './WebSearch'

/** Élément d'où partir (panneau ouvert), ou null. */
export const elementAiAtom = atom<TLShapeId | null>('elementAi', null)
/** Demande préremplie à l'ouverture (ex. : à partir d'un passage du texte source). */
export const elementAiRequestAtom = atom<string>('elementAiRequest', '')

/** Visée choisie à l'ouverture (menu ✦ de l'onglet Élément) : son groupe et sa clé. */
export const elementAiAimAtom = atom<{ group: string; key: string } | null>('elementAiAim', null)

/** Une visée proposée : de l'app (src/lib/ai/aims.ts) ou de la méthode choisie (« ## @quick »). */
export interface AimOption {
  key: string
  label: string
  hint?: string
  text: string
  /** S'appuie sur le web (visées de l'app, AIM_WEB). */
  web?: 'required' | 'useful'
  /** Couvre tout ce qu'il y a à prendre (AIM_WHOLE) : sans ampleur. */
  whole?: boolean
  /** Demande de voir l'image (AIM_SEES). */
  sees?: boolean
}

/** Un groupe de visées : une famille de l'app, ou celles de la méthode choisie (« method »). */
export interface AimGroup {
  id: AimFamily | 'method'
  title: string
  aims: AimOption[]
}

/**
 * Visées proposées : celles de la méthode choisie d'abord, puis les familles de l'app ; « Observer »
 * seulement pour une image.
 */
export function aimGroups(template: PromptTemplate | undefined, t: Messages, image = false): AimGroup[] {
  const method: AimGroup[] = template?.quick?.length
    ? [{ id: 'method', title: template.title, aims: template.quick.map((q, i) => ({ key: `method:${i}`, label: q.label, text: q.request })) }]
    : []
  const families = AIM_FAMILIES.filter((f) => image || f !== IMAGE_FAMILY).map((f) => ({
    id: f,
    title: t.elementAi.families[f],
    aims: FAMILY_AIMS[f].map((a) => ({
      key: a,
      label: t.elementAi.aims[a].label,
      hint: t.elementAi.aims[a].hint,
      text: AIM_TEXT[a],
      ...(AIM_WEB[a] && { web: AIM_WEB[a] }),
      ...(AIM_WHOLE.includes(a) && { whole: true }),
      ...(AIM_SEES.includes(a) && { sees: true }),
    })),
  }))
  return [...method, ...families]
}

/**
 * Groupe proposé d'abord pour un élément : « Observer » pour une image, puis la méthode, sinon la
 * famille de son type (ou de son arbre).
 */
export function firstAimGroup(editor: Editor, id: TLShapeId, groups: AimGroup[]): AimGroup['id'] {
  if (isImage(editor.getShape(id))) return IMAGE_FAMILY
  if (groups[0]?.id === 'method') return 'method'
  const type = editor.getShape(id)?.meta.preset
  return familyFor(typeof type === 'string' ? type : undefined, isArgumentTree(editor, id))
}

/** Ampleur d'un développement : la dernière choisie sur cet appareil. */
const AMOUNT_KEY = 'element-ai-amount'

function readAmount(): Amount {
  try {
    const value = localStorage.getItem(AMOUNT_KEY)
    return AMOUNTS.includes(value as Amount) ? (value as Amount) : DEFAULT_AMOUNT
  } catch {
    return DEFAULT_AMOUNT
  }
}

function writeAmount(amount: Amount) {
  try {
    localStorage.setItem(AMOUNT_KEY, amount)
  } catch {
    // stockage indisponible
  }
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
  const image = useValue('element is image', () => isImage(editor.getShape(id)), [editor, id])
  // Une image : on demande à OpenRouter si le modèle choisi la voit (l'indication suit sa réponse).
  useValue(visionAtom)
  useEffect(() => {
    if (image) void checkSeesImages(settings, server)
  }, [image, settings, server])
  const [instruction, setInstruction] = useState(() => {
    const request = elementAiRequestAtom.get()
    elementAiRequestAtom.set('')
    return request
  })
  const [wholeMap, setWholeMap] = useState(true)
  const [ghost, setGhost] = useState(true)
  const [notes, setNotes] = useState(true)
  const [run, setRun] = useState<{ progress: AiProgressState; abort: AbortController } | null>(null)
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')
  const [issues, setIssues] = useState<MapIssue[]>([])
  const [failure, setFailure] = useState<string | null>(null)

  const pageSource = useValue('page source', () => readPageSource(editor), [editor])
  const [useSource, setUseSource] = useState(true)
  const prompt = usePromptChoice('expand', { source: useSource && !!pageSource }, editor)
  // Visée : préchoisie depuis le menu ✦, sinon aucune ; groupe affiché : celui de l'élément.
  const [preset] = useState(() => {
    const aim = elementAiAimAtom.get()
    elementAiAimAtom.set(null)
    return aim
  })
  const groups = aimGroups(prompt.template, t, image)
  const [groupId, setGroupId] = useState<string | null>(preset?.group ?? null)
  const first = firstAimGroup(editor, id, groups)
  const shown = groups.find((g) => g.id === groupId) ?? groups.find((g) => g.id === first) ?? groups[0]
  const [aimKey, setAimKey] = useState<string | null>(preset?.key ?? null)
  const aim = aimKey ? (shown.aims.find((a) => a.key === aimKey) ?? groups.flatMap((g) => g.aims).find((a) => a.key === aimKey)) : undefined
  const [amount, setAmount] = useState(readAmount)
  // Recherche sur le web : demandée par le bouton globe, ou par la visée.
  const canSearch = webSearchAvailable(settings, server)
  const [web, setWeb] = useState(() => !!preset && canSearch && !!AIM_WEB[preset.key as AimId])
  const webRequired = aim?.web === 'required'
  const request = (): ElementRequest => ({
    focus: id,
    instruction,
    wholeMap,
    notes,
    withSource: useSource,
    ghost,
    ...(!aim?.whole && { amount }),
    ...(aim?.sees && { sees: true }),
    ...(aim && { aim: { label: aim.label, text: aim.text } }),
    ...(prompt.method && { method: prompt.method }),
    ...(canSearch && (web || webRequired) && { web: true }),
  })
  const reset = () => {
    setIssues([])
    setFailure(null)
  }

  /**
   * Réponse appliquée (en suggestions ou directement) : la boîte se ferme, et la barre des
   * suggestions prend le relais (résumé, compléter, approfondir). Sinon, les problèmes restent affichés.
   */
  function settle(outcome: ReturnType<typeof applyElementAnswer>) {
    if ('issues' in outcome) return setIssues(outcome.issues)
    close()
  }

  async function ask() {
    reset()
    const abort = new AbortController()
    setRun({ progress: startProgress(), abort })
    try {
      settle(
        await runElementRequest(editor, request(), {
          signal: abort.signal,
          ...progressCallbacks((next) => setRun((r) => r && { ...r, progress: next(r.progress) })),
        })
      )
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
      await navigator.clipboard.writeText(buildPrompt(elementPromptInput(editor, request(), 'clipboard')))
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
      {image && <ImageReadingBox editor={editor} id={id} />}
      <PromptPicker choice={prompt} disabled={!!run} />
      <div className="grid gap-1.5">
        <div className="panel-tabs" role="tablist">
          {groups.map((g) => (
            <button
              key={g.id}
              role="tab"
              aria-selected={g.id === shown.id}
              className={`panel-tab min-w-0 truncate ${g.id === shown.id ? 'panel-tab-active' : ''}`}
              onClick={() => setGroupId(g.id)}
              title={g.title}
            >
              {g.title}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {shown.aims.map((a) => (
            <button
              key={a.key}
              className={`btn-xs ${aimKey === a.key ? 'btn-xs-on' : ''}`}
              aria-pressed={aimKey === a.key}
              // Sans recherche possible, une visée qui en dépend n'a pas de sens.
              disabled={a.web === 'required' && !canSearch}
              title={a.web === 'required' && !canSearch ? webUnavailableText(settings.kind, t) : (a.hint ?? a.text)}
              onClick={() => {
                const next = aimKey === a.key ? null : a.key
                setAimKey(next)
                if (next && a.web && canSearch) setWeb(true)
                reset()
              }}
            >
              {a.label}
            </button>
          ))}
          {/* Illustrer : aussi par une vraie image (cherchée), ou générée (ce qui est imaginaire seulement). */}
          {shown.id === 'illustrate' && !image && (
            <button
              className="btn-xs"
              title={t.imageSearch.searchHint}
              onClick={() => {
                close()
                imageSearchAtom.set({ target: id, query: pictureSubject(editor, id).subject })
              }}
            >
              {t.imageSearch.searchButton}
            </button>
          )}
          {shown.id === 'illustrate' && !image && imageGenerationAvailable(settings, server) && (
            <button
              className="btn-xs"
              title={t.imageGen.pictureHint}
              onClick={() => {
                close()
                imageGenAtom.set({ target: id, sources: [] })
              }}
            >
              {t.imageGen.pictureButton}
            </button>
          )}
        </div>
      </div>
      <textarea
        className="map-json-input assistant-instruction"
        rows={2}
        value={instruction}
        onChange={(e) => {
          setInstruction(e.target.value)
          reset()
        }}
        placeholder={aim ? t.elementAi.placeholderAim : prompt.method ? t.elementAi.placeholderMethod : t.elementAi.placeholder}
        aria-label={t.elementAi.instructionLabel}
        autoFocus
      />
      {image && ready && (
        // Ce que le modèle reçoit : l'image elle-même, ou seulement sa lecture.
        <p className="text-xs text-zinc-500">
          {seesImages(settings, server) ? t.elementAi.imageSent : aim?.sees ? t.elementAi.imageReadingModel : t.elementAi.imageReadingOnly}
        </p>
      )}
      {aim?.whole ? (
        <p className="text-xs text-zinc-500">{t.elementAi.wholeAim}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-xs" title={t.elementAi.amountHint}>
          <span className="text-zinc-600">{t.elementAi.amountLabel}</span>
          <div className="seq-mode" role="radiogroup" aria-label={t.elementAi.amountLabel}>
            {AMOUNTS.map((a) => (
              <button
                key={a}
                role="radio"
                aria-checked={amount === a}
                className={`seq-mode-btn ${amount === a ? 'seq-mode-on' : ''}`}
                onClick={() => {
                  setAmount(a)
                  writeAmount(a)
                }}
              >
                {t.elementAi.amounts[a]}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 text-xs">
        <WebToggle on={web} onChange={setWeb} required={webRequired} clipboard={!ready} unavailable={canSearch ? undefined : webUnavailableText(settings.kind, t)} />
        <span className="text-zinc-500">{webRequired && canSearch ? t.web.required : ''}</span>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={wholeMap} onChange={(e) => setWholeMap(e.target.checked)} />
        {t.elementAi.wholeMap}
      </label>
      <label className="flex items-center gap-2 text-xs" title={t.ai.notesHint}>
        <input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} />
        {t.ai.notesOption}
      </label>
      {pageSource && (
        <label className="flex items-center gap-2 text-xs" title={t.source.useSourceHint}>
          <input type="checkbox" checked={useSource} onChange={(e) => setUseSource(e.target.checked)} />
          {t.source.useSource}
        </label>
      )}
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
          <button className="btn-primary" disabled={!!run || (!instruction.trim() && !prompt.method && !aim)} onClick={() => void ask()}>
            {t.ai.ask}
          </button>
        ) : (
          <button className="btn-primary" disabled={!instruction.trim() && !prompt.method && !aim} onClick={() => void copy()}>
            {t.assistant.copy}
          </button>
        )}
        <button className="btn-xs" onClick={() => aiSettingsOpenAtom.set(true)}>
          {t.ai.configure}
        </button>
        {run && (
          <>
            <AiProgress state={run.progress} />
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
          <button className="btn self-start justify-self-start" disabled={!pasted.trim()} onClick={() => settle(applyElementAnswer(editor, request(), readElementAnswer(editor, pasted)))}>
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
    </div>
  )
}
