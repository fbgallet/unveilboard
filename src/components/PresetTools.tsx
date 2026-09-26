'use client'

import { atom, DefaultStylePanel, DefaultStylePanelContent, useEditor, useValue, type Editor, type TLUiStylePanelProps } from 'tldraw'
import {
  applyPreset,
  documentPresets,
  presetErrorAtom,
  presetSettingsAtom,
  savePresetSettings,
  selectedPresetId,
  styleFromSelection,
  swatchColor,
} from '@/lib/canvas/presets'
import { defaultPresetSettings, newPresetId, type Preset, type PresetSettings, type PresetTarget } from '@/lib/presets/presets'
import { settingsStore } from '@/lib/storage'
import { storageModeAtom } from '@/lib/sync/documentSync'

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
        active: selectedPresetId(editor),
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
            title={view.docOnly.has(p.id) ? `${p.name} (préréglage de ce schéma)` : p.name}
          >
            <Swatch editor={editor} preset={p} />
            {p.name}
          </button>
        ))}
      </div>
      <button className="preset-manage" onClick={() => presetManagerOpenAtom.set(true)}>
        Gérer les préréglages…
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
  return (
    <span
      className="preset-swatch"
      style={{
        borderColor: color,
        borderStyle: preset.style.dash === 'dashed' ? 'dashed' : 'solid',
        background: preset.style.fill && preset.style.fill !== 'none' ? `color-mix(in srgb, ${color} 22%, white)` : 'white',
      }}
    />
  )
}

/** Gestionnaire des préréglages communs : renommer, mettre à jour d'après la sélection, ajouter, supprimer. */
export function PresetManager({ editor }: { editor: Editor }) {
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
    if (confirm(`Supprimer le préréglage « ${p.name} » ? Les formes déjà stylées ne changent pas.`))
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
    const name = style && prompt(target === 'arrow' ? 'Nom de la relation (ex. : « conduit à ») :' : 'Nom du préréglage (ex. : « Thèse ») :')
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
                aria-label="Nom"
                onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && update(p.id, { name: e.target.value.trim() })}
              />
              {target === 'arrow' && (
                <input
                  className="preset-input w-28"
                  defaultValue={p.label ?? ''}
                  placeholder="(sans étiquette)"
                  title="Étiquette posée sur une flèche encore vide"
                  onBlur={(e) => e.target.value !== (p.label ?? '') && update(p.id, { label: e.target.value.trim() || undefined })}
                />
              )}
              <button
                className="btn-xs"
                disabled={!selection[target]}
                onClick={() => update(p.id, { style: styleFromSelection(editor, target)! })}
                title="Reprendre le style de la sélection (les formes déjà stylées ne changent pas)"
              >
                ← sélection
              </button>
              <button className="preset-icon" onClick={() => move(p.id, -1)} title="Monter">↑</button>
              <button className="preset-icon" onClick={() => move(p.id, 1)} title="Descendre">↓</button>
              <button className="preset-icon" onClick={() => remove(p)} title="Supprimer">✕</button>
            </li>
          ))}
      </ul>
      <button className="btn-xs mt-2" disabled={!selection[target]} onClick={() => create(target)}>
        + Nouveau, d&apos;après {target === 'arrow' ? 'la flèche sélectionnée' : 'la forme sélectionnée'}
      </button>
    </section>
  )

  return (
    <div className="preset-overlay" onPointerDown={(e) => e.target === e.currentTarget && presetManagerOpenAtom.set(false)}>
      <div className="preset-dialog" role="dialog" aria-label="Préréglages de styles">
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Préréglages de styles</h2>
          <button className="preset-icon" onClick={() => presetManagerOpenAtom.set(false)} aria-label="Fermer">✕</button>
        </header>
        <p className="text-xs text-zinc-500">
          Communs à tous vos schémas. Pour créer ou modifier un préréglage, stylez une forme avec le panneau de styles,
          sélectionnez-la, puis « d&apos;après la sélection ».
        </p>
        {error && <p className="text-xs text-red-600">Préréglages non enregistrés : {error}</p>}
        <div className="grid gap-4 overflow-y-auto">
          {group('shape', 'Formes')}
          {group('arrow', 'Relations (flèches)')}
          {fromDoc.length > 0 && (
            <section>
              <h3 className="preset-group-title">Présents dans ce schéma seulement</h3>
              <ul className="space-y-1">
                {fromDoc.map((p) => (
                  <li key={p.id} className="preset-row">
                    <Swatch editor={editor} preset={p} />
                    <span className="flex-1">{p.name}</span>
                    <button className="btn-xs" onClick={() => save({ ...settings, items: [...items, p] })}>
                      Ajouter à mes préréglages
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
            Afficher les préréglages dans le panneau de styles
          </label>
          <button
            className="btn-xs"
            onClick={() => confirm('Remplacer tous vos préréglages par ceux de départ ?') && save(defaultPresetSettings())}
          >
            Rétablir les préréglages de départ
          </button>
        </footer>
      </div>
    </div>
  )
}
