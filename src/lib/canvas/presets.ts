// Application des préréglages aux formes tldraw, et leur persistance.
// Les préréglages sont communs (SettingsStore) ; chaque document garde aussi une copie
// de ceux qu'il utilise (document.meta.presets), pour rester lisible ailleurs.

import {
  ArrowShapeArrowheadEndStyle,
  ArrowShapeArrowheadStartStyle,
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultFontStyle,
  DefaultSizeStyle,
  atom,
  getColorValue,
  toRichText,
  type Editor,
  type JsonObject,
  type StyleProp,
  type TLShape,
  type TLShapePartial,
} from 'tldraw'
import {
  ARROW_STYLE_KEYS,
  PRESETS_SETTING_KEY,
  SHAPE_STYLE_KEYS,
  defaultPresetSettings,
  normalizePresetSettings,
  type Preset,
  type PresetSettings,
  type PresetTarget,
  type StyleKey,
} from '../presets/presets'
import type { SettingsStore } from '../storage/types'

const STYLE_PROPS: Record<StyleKey, StyleProp<string>> = {
  color: DefaultColorStyle,
  fill: DefaultFillStyle,
  dash: DefaultDashStyle,
  size: DefaultSizeStyle,
  font: DefaultFontStyle,
  arrowheadStart: ArrowShapeArrowheadStartStyle,
  arrowheadEnd: ArrowShapeArrowheadEndStyle,
}

// ---------- Persistance des préréglages communs ----------

export const presetSettingsAtom = atom<PresetSettings>('presetSettings', defaultPresetSettings())
/** Erreur de la dernière sauvegarde (affichée dans le gestionnaire). */
export const presetErrorAtom = atom<string | null>('presetError', null)

const CACHE_KEY = 'presets-cache'

/** Charge les préréglages communs (copie locale si le stockage est injoignable). */
export async function loadPresetSettings(store: SettingsStore) {
  try {
    const value = await store.get(PRESETS_SETTING_KEY)
    presetSettingsAtom.set(normalizePresetSettings(value))
    writeCache(presetSettingsAtom.get())
  } catch {
    presetSettingsAtom.set(normalizePresetSettings(readCache()))
  }
}

export async function savePresetSettings(store: SettingsStore, next: PresetSettings) {
  presetSettingsAtom.set(next)
  writeCache(next)
  try {
    await store.set(PRESETS_SETTING_KEY, next)
    presetErrorAtom.set(null)
  } catch (e) {
    presetErrorAtom.set(e instanceof Error ? e.message : 'Enregistrement impossible.')
  }
}

function readCache(): unknown {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null')
  } catch {
    return null
  }
}

function writeCache(value: PresetSettings) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value))
  } catch {
    // stockage indisponible
  }
}

// ---------- Application aux formes ----------

const targetOf = (shape: TLShape): PresetTarget => (shape.type === 'arrow' ? 'arrow' : 'shape')

const hasText = (richText: unknown) => JSON.stringify(richText ?? '').includes('"text"')

/**
 * Applique un préréglage aux formes sélectionnées qu'il concerne (formes ou flèches).
 * Sans sélection, il devient le style des prochaines formes créées.
 */
export function applyPreset(editor: Editor, preset: Preset) {
  const targets = editor.getSelectedShapes().filter((s) => targetOf(s) === preset.target)
  editor.markHistoryStoppingPoint('préréglage')
  if (!editor.getSelectedShapeIds().length) {
    for (const [key, value] of Object.entries(preset.style)) editor.setStyleForNextShapes(STYLE_PROPS[key as StyleKey], value)
    return
  }
  if (!targets.length) return
  editor.run(() => {
    const updates: TLShapePartial[] = targets.map((shape) => {
      const props: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(preset.style)) if (key in shape.props) props[key] = value
      if (preset.label && shape.type === 'arrow' && !hasText(shape.props.richText)) props.richText = toRichText(preset.label)
      return { id: shape.id, type: shape.type, props, meta: { ...shape.meta, preset: preset.id } }
    })
    editor.updateShapes(updates)
    keepDocumentCopy(editor, preset)
  })
}

/** Style de la première forme sélectionnée du bon type, pour créer ou mettre à jour un préréglage. */
export function styleFromSelection(editor: Editor, target: PresetTarget): Preset['style'] | null {
  const shape = editor.getSelectedShapes().find((s) => targetOf(s) === target)
  if (!shape) return null
  const keys = target === 'arrow' ? ARROW_STYLE_KEYS : SHAPE_STYLE_KEYS
  const props = shape.props as Record<string, unknown>
  const style: Preset['style'] = {}
  for (const key of keys) if (typeof props[key] === 'string') style[key] = props[key] as string
  return style
}

/** Préréglage commun à toutes les formes sélectionnées (pour le signaler dans la palette). */
export function selectedPresetId(editor: Editor): string | null {
  const ids = new Set(editor.getSelectedShapes().map((s) => s.meta.preset as string | undefined))
  return ids.size === 1 ? ([...ids][0] ?? null) : null
}

export function swatchColor(editor: Editor, preset: Preset) {
  const colors = editor.getCurrentTheme().colors[editor.getColorMode()]
  return getColorValue(colors, preset.style.color ?? 'black', 'solid')
}

// ---------- Copie dans le document ----------

export function documentPresets(editor: Editor): Record<string, Preset> {
  return (editor.getDocumentSettings().meta.presets as unknown as Record<string, Preset> | undefined) ?? {}
}

function keepDocumentCopy(editor: Editor, preset: Preset) {
  const current = documentPresets(editor)
  if (JSON.stringify(current[preset.id]) === JSON.stringify(preset)) return
  const meta = editor.getDocumentSettings().meta
  editor.updateDocumentSettings({ meta: { ...meta, presets: { ...current, [preset.id]: preset } as unknown as JsonObject } })
}
