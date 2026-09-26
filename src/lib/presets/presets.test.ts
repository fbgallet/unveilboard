import { describe, expect, it } from 'vitest'
import { defaultPresetSettings, normalizePresetSettings } from './presets'

const names = {} as Record<string, string>

describe('normalizePresetSettings', () => {
  it('sans réglage enregistré : préréglages de départ', () => {
    expect(normalizePresetSettings(null, names)).toEqual(defaultPresetSettings(names))
  })

  it('v1 → v2 : les natures de départ reçoivent leur géométrie, le reste est conservé', () => {
    const v1 = {
      version: 1,
      enabled: false,
      items: [
        { id: 'question', name: 'Q', target: 'shape', style: { color: 'orange' } },
        { id: 'these-x', name: 'Thèse', target: 'shape', style: { color: 'blue' } },
      ],
    }
    const v2 = normalizePresetSettings(v1, names)
    expect(v2).toMatchObject({ enabled: false, showTags: true })
    expect(v2.items[0].style).toEqual({ geo: 'diamond', color: 'orange' })
    expect(v2.items[1].style).toEqual({ color: 'blue' })
  })

  it('v2 → v3 : fonctions, couleurs de départ non modifiées, nouvelles entrées', () => {
    const roles = { objects: 'Objection' }
    const v2 = {
      version: 2,
      items: [
        { id: 'statement', name: 'É', target: 'shape', style: { geo: 'rectangle', color: 'yellow' } },
        { id: 'example', name: 'Ex', target: 'shape', style: { color: 'green' } },
        { id: 'quote', name: 'Cit', target: 'shape', style: { color: 'violet' } },
        { id: 'objects', name: 'objecte', target: 'arrow', style: { color: 'red' } },
      ],
    }
    const v3 = normalizePresetSettings(v2, names, roles)
    expect(v3.version).toBe(3)
    expect(v3.items.map((p) => p.id)).toEqual(['statement', 'belief', 'example', 'quote', 'objects', 'explains'])
    expect(v3.items.find((p) => p.id === 'example')!.style.color).toBe('grey')
    // Couleur modifiée par l'utilisateur : conservée.
    expect(v3.items.find((p) => p.id === 'quote')!.style.color).toBe('violet')
    expect(v3.items.find((p) => p.id === 'objects')!.role).toBe('Objection')
  })
})
