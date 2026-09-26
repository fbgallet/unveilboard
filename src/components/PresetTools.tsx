'use client'

import {
  atom,
  DefaultStylePanel,
  DefaultStylePanelContent,
  useEditor,
  useValue,
  type Editor,
  type TLShapeId,
  type TLUiStylePanelProps,
} from 'tldraw'
import {
  applyPreset,
  armedPresetAtom,
  documentPresets,
  presetById,
  presetErrorAtom,
  presetSettingsAtom,
  savePresetSettings,
  selectedPresetId,
  styleFromSelection,
  swatchColor,
} from '@/lib/canvas/presets'
import {
  MODAL_NATURES,
  MODALITIES,
  PRESET_GEOS,
  defaultPresetSettings,
  newPresetId,
  type Preset,
  type PresetSettings,
  type PresetTarget,
} from '@/lib/presets/presets'
import { settingsStore } from '@/lib/storage'
import { storageModeAtom } from '@/lib/sync/documentSync'
import { useT } from '@/i18n/client'

export const presetManagerOpenAtom = atom<boolean>('presetManagerOpen', false)

const save = (next: PresetSettings) => savePresetSettings(settingsStore(storageModeAtom.get()), next)

/** Panneau de styles de tldraw, précédé de la palette des préréglages. */
export function PresetStylePanel(props: TLUiStylePanelProps) {
  const enabled = useValue('presets enabled', () => presetSettingsAtom.get().enabled, [])
  return (
    <DefaultStylePanel {...props}>
      {enabled && <PresetPalette />}
      <DefaultStylePanelContent />
    </DefaultStylePanel>
  )
}

function PresetPalette() {
  const t = useT()
  const editor = useEditor()
  const view = useValue(
    'preset palette',
    () => {
      const shapes = editor.getSelectedShapes()
      const targets = new Set<PresetTarget>(shapes.map((s) => (s.type === 'arrow' ? 'arrow' : 'shape')))
      if (!shapes.length) targets.add('shape')
      const common = presetSettingsAtom.get().items
      const known = new Set(common.map((p) => p.id))
      // Préréglages de ce schéma absents des préréglages communs (schéma venu d'ailleurs).
      const fromDoc = Object.values(documentPresets(editor)).filter((p) => !known.has(p.id))
      return {
        items: [...common, ...fromDoc].filter((p) => targets.has(p.target)),
        docOnly: new Set(fromDoc.map((p) => p.id)),
        active: selectedPresetId(editor) ?? armedPresetAtom.get(),
        armed: presetById(editor, armedPresetAtom.get() ?? undefined)?.name,
      }
    },
    [editor]
  )

  return (
    <div className="preset-section">
      <div className="preset-chips">
        {view.items.map((p) => (
          <button
            key={p.id}
            className={`preset-chip ${view.active === p.id ? 'preset-chip-active' : ''} ${view.docOnly.has(p.id) ? 'preset-chip-doc' : ''}`}
            onClick={() => applyPreset(editor, p)}
            title={view.docOnly.has(p.id) ? t.presets.docOnly(p.name) : p.name}
          >
            <Swatch editor={editor} preset={p} />
            {p.name}
          </button>
        ))}
      </div>
      {view.armed && <p className="preset-armed">{t.presets.armed(view.armed)}</p>}
      <button className="preset-manage" onClick={() => presetManagerOpenAtom.set(true)}>
        {t.presets.manage}
      </button>
    </div>
  )
}

function Swatch({ editor, preset }: { editor: Editor; preset: Preset }) {
  const color = swatchColor(editor, preset)
  if (preset.target === 'arrow') {
    const dash = preset.style.dash === 'dashed' ? '3 2' : preset.style.dash === 'dotted' ? '1 2' : undefined
    return (
      <svg className="preset-swatch" viewBox="0 0 14 10" aria-hidden>
        <line x1="1" y1="5" x2="12" y2="5" stroke={color} strokeWidth="1.8" strokeDasharray={dash} />
        {preset.style.arrowheadEnd !== 'none' && <path d="M9 2 L13 5 L9 8" fill="none" stroke={color} strokeWidth="1.5" />}
      </svg>
    )
  }
  const fill = preset.style.fill && preset.style.fill !== 'none' ? `color-mix(in srgb, ${color} 22%, transparent)` : 'none'
  const dash = preset.style.dash === 'dashed' ? '2.5 1.5' : preset.style.dash === 'dotted' ? '0.8 1.4' : undefined
  const stroke = preset.style.dash === 'none' ? 'none' : color
  const common = { fill, stroke, strokeWidth: 1.4, strokeDasharray: dash }
  const outline = {
    oval: <rect x="1" y="1" width="14" height="8" rx="4" {...common} />,
    ellipse: <ellipse cx="8" cy="5" rx="7" ry="4" {...common} />,
    diamond: <path d="M8 0.8 L15 5 L8 9.2 L1 5 Z" {...common} />,
    hexagon: <path d="M4 1 L12 1 L15 5 L12 9 L4 9 L1 5 Z" {...common} />,
    cloud: <path d="M4 9 A3 3 0 0 1 3.5 3.5 A3.5 3.5 0 0 1 10 2.5 A3 3 0 0 1 12.5 9 Z" {...common} />,
  }[preset.style.geo ?? ''] ?? <rect x="1" y="1" width="14" height="8" rx="1.5" {...common} />
  return (
    <svg className="preset-swatch preset-swatch-shape" viewBox="0 0 16 10" aria-hidden>
      {outline}
      {preset.style.dash === 'none' && <text x="8" y="8.2" fontSize="8" textAnchor="middle" fill={color} fontFamily="serif">«»</text>}
    </svg>
  )
}

/** Gestionnaire des préréglages communs : renommer, mettre à jour d'après la sélection, ajouter, supprimer. */
export function PresetManager({ editor }: { editor: Editor }) {
  const t = useT()
  const open = useValue(presetManagerOpenAtom)
  const settings = useValue(presetSettingsAtom)
  const error = useValue(presetErrorAtom)
  const selection = useValue(
    'preset selection',
    () => ({ shape: !!styleFromSelection(editor, 'shape'), arrow: !!styleFromSelection(editor, 'arrow') }),
    [editor]
  )
  const fromDoc = useValue(
    'doc presets',
    () => {
      const known = new Set(presetSettingsAtom.get().items.map((p) => p.id))
      return Object.values(documentPresets(editor)).filter((p) => !known.has(p.id))
    },
    [editor]
  )
  if (!open) return null

  const items = settings.items
  const update = (id: string, patch: Partial<Preset>) =>
    save({ ...settings, items: items.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
  const remove = (p: Preset) => {
    if (confirm(t.presets.confirmDelete(p.name)))
      save({ ...settings, items: items.filter((x) => x.id !== p.id) })
  }
  const move = (id: string, delta: -1 | 1) => {
    const i = items.findIndex((p) => p.id === id)
    const j = i + delta
    if (j < 0 || j >= items.length || items[j].target !== items[i].target) return
    const next = [...items]
    ;[next[i], next[j]] = [next[j], next[i]]
    save({ ...settings, items: next })
  }
  const create = (target: PresetTarget) => {
    const style = styleFromSelection(editor, target)
    const name = style && prompt(target === 'arrow' ? t.presets.promptArrow : t.presets.promptShape)
    if (!style || !name?.trim()) return
    const preset: Preset = { id: newPresetId(name), name: name.trim(), target, style, ...(target === 'arrow' && { label: name.trim() }) }
    save({ ...settings, items: [...items, preset] })
    applyPreset(editor, preset)
  }

  const group = (target: PresetTarget, title: string) => (
    <section>
      <h3 className="preset-group-title">{title}</h3>
      <ul className="space-y-1">
        {items
          .filter((p) => p.target === target)
          .map((p) => (
            <li key={p.id} className="preset-row">
              <Swatch editor={editor} preset={p} />
              <input
                className="preset-input flex-1"
                defaultValue={p.name}
                aria-label={t.presets.name}
                onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && update(p.id, { name: e.target.value.trim() })}
              />
              {target === 'shape' && (
                <>
                  <select
                    className="preset-input"
                    value={p.style.geo ?? ''}
                    aria-label={t.presets.geometry}
                    title={t.presets.geometry}
                    onChange={(e) => update(p.id, { style: { ...p.style, geo: e.target.value || undefined } })}
                  >
                    <option value="">—</option>
                    {PRESET_GEOS.map((g) => (
                      <option key={g} value={g}>{t.presets.geos[g]}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-[11px] text-zinc-500" title={t.presets.tagHint}>
                    <input type="checkbox" checked={p.tag !== false} onChange={(e) => update(p.id, { tag: e.target.checked })} />
                    {t.presets.tag}
                  </label>
                </>
              )}
              {target === 'arrow' && (
                <>
                  <select
                    className="preset-input"
                    value={p.towardChild ? 'child' : 'parent'}
                    aria-label={t.presets.treeDirection}
                    title={t.presets.treeDirection}
                    onChange={(e) => update(p.id, { towardChild: e.target.value === 'child' || undefined })}
                  >
                    <option value="parent">{t.presets.towardParent}</option>
                    <option value="child">{t.presets.towardChild}</option>
                  </select>
                  <select
                    className="preset-input"
                    value={p.childNature ?? ''}
                    aria-label={t.presets.childNature}
                    title={t.presets.childNature}
                    onChange={(e) => update(p.id, { childNature: e.target.value || undefined })}
                  >
                    <option value="">—</option>
                    {items
                      .filter((n) => n.target === 'shape')
                      .map((n) => (
                        <option key={n.id} value={n.id}>{n.name}</option>
                      ))}
                  </select>
                </>
              )}
              {target === 'arrow' && (
                <input
                  className="preset-input w-28"
                  defaultValue={p.label ?? ''}
                  placeholder={t.presets.noLabel}
                  title={t.presets.labelHint}
                  onBlur={(e) => e.target.value !== (p.label ?? '') && update(p.id, { label: e.target.value.trim() || undefined })}
                />
              )}
              <button
                className="btn-xs"
                disabled={!selection[target]}
                onClick={() => update(p.id, { style: styleFromSelection(editor, target)! })}
                title={t.presets.fromSelectionHint}
              >
                {t.presets.fromSelection}
              </button>
              <button className="preset-icon" onClick={() => move(p.id, -1)} title={t.common.moveUp}>↑</button>
              <button className="preset-icon" onClick={() => move(p.id, 1)} title={t.common.moveDown}>↓</button>
              <button className="preset-icon" onClick={() => remove(p)} title={t.common.delete}>✕</button>
            </li>
          ))}
      </ul>
      <button className="btn-xs mt-2" disabled={!selection[target]} onClick={() => create(target)}>
        {target === 'arrow' ? t.presets.newFromArrow : t.presets.newFromShape}
      </button>
    </section>
  )

  return (
    <div className="preset-overlay" onPointerDown={(e) => e.target === e.currentTarget && presetManagerOpenAtom.set(false)}>
      <div className="preset-dialog" role="dialog" aria-label={t.presets.title}>
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{t.presets.title}</h2>
          <button className="preset-icon" onClick={() => presetManagerOpenAtom.set(false)} aria-label={t.common.close}>✕</button>
        </header>
        <p className="text-xs text-zinc-500">
          {t.presets.intro}
        </p>
        {error && <p className="text-xs text-red-600">{t.presets.notSaved(error)}</p>}
        <div className="grid gap-4 overflow-y-auto">
          {group('shape', t.presets.shapes)}
          {group('arrow', t.presets.arrows)}
          {fromDoc.length > 0 && (
            <section>
              <h3 className="preset-group-title">{t.presets.docOnlyTitle}</h3>
              <ul className="space-y-1">
                {fromDoc.map((p) => (
                  <li key={p.id} className="preset-row">
                    <Swatch editor={editor} preset={p} />
                    <span className="flex-1">{p.name}</span>
                    <button className="btn-xs" onClick={() => save({ ...settings, items: [...items, p] })}>
                      {t.presets.addToMine}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-3 text-xs">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.enabled} onChange={(e) => save({ ...settings, enabled: e.target.checked })} />
            {t.presets.showInPanel}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.showTags} onChange={(e) => save({ ...settings, showTags: e.target.checked })} />
            {t.presets.showTags}
          </label>
          <button
            className="btn-xs"
            onClick={() => confirm(t.presets.confirmReset) && save(defaultPresetSettings(t.presetDefaults, t.presetRoles))}
          >
            {t.presets.reset}
          </button>
        </footer>
      </div>
    </div>
  )
}

/** Auteur et modalité d'une forme dotée d'une nature (affichés dans son étiquette). */
export function NatureFields({ editor, id }: { editor: Editor; id: TLShapeId }) {
  const t = useT()
  const info = useValue(
    'nature fields',
    () => {
      const shape = editor.getShape(id)
      const preset = presetById(editor, shape?.meta.preset as string | undefined)
      if (!shape || !preset || preset.target !== 'shape') return null
      return {
        name: preset.name,
        statement: MODAL_NATURES.includes(preset.id),
        author: typeof shape.meta.author === 'string' ? shape.meta.author : '',
        modality: typeof shape.meta.modality === 'string' ? shape.meta.modality : '',
      }
    },
    [editor, id]
  )
  if (!info) return null
  const setMeta = (patch: Record<string, string | null>) => {
    const shape = editor.getShape(id)
    if (shape) editor.updateShape({ id, type: shape.type, meta: { ...shape.meta, ...patch } })
  }
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 px-1 text-[11px] text-zinc-500">
      <span className="font-semibold uppercase tracking-wide">{info.name}</span>
      <input
        className="preset-input min-w-0 flex-1"
        value={info.author}
        placeholder={t.presets.authorPlaceholder}
        aria-label={t.presets.author}
        title={t.presets.author}
        onChange={(e) => setMeta({ author: e.target.value || null })}
      />
      {info.statement && (
        <select
          className="preset-input"
          value={info.modality}
          aria-label={t.presets.modality}
          title={t.presets.modality}
          onChange={(e) => setMeta({ modality: e.target.value || null })}
        >
          <option value="">{t.presets.noModality}</option>
          {MODALITIES.map((m) => (
            <option key={m} value={m}>{t.presets.modalities[m]}</option>
          ))}
        </select>
      )}
    </div>
  )
}
