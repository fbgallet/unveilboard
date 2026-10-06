import { describe, expect, it } from 'vitest'
import { defaultPresetSettings, defaultPresets, normalizePresetSettings, offeredPresets, relationsFor } from './presets'

const names = {} as Record<string, string>

describe('normalizePresetSettings', () => {
  it('v5 → v6 : « distingue » renommé, Distinction et relations entre concepts ajoutées à leur place', () => {
    const n = { distinguishes: 'se distingue de' }
    const v5 = {
      version: 5,
      items: [
        { id: 'concept', name: 'Concept', target: 'shape', style: {} },
        { id: 'distinguishes', name: 'distingue', target: 'arrow', style: {} },
      ],
    }
    const v6 = normalizePresetSettings(v5, n)
    expect(v6.items.map((p) => p.id)).toEqual(['concept', 'distinction', 'distinguishes', 'opposes', 'relates', 'premise', 'linked'])
    expect(v6.items.find((p) => p.id === 'distinguishes')!.name).toBe('se distingue de')
  })

  it('v3 → v5 : « Croyance fondamentale » renommée si inchangée, « Fait » ajouté', () => {
    const n = { belief: 'Présupposé', fact: 'Fait' }
    const v3 = { version: 3, items: [{ id: 'belief', name: 'Croyance fondamentale', target: 'shape', style: {} }] }
    const v4 = normalizePresetSettings(v3, n)
    expect(v4.items.slice(0, 2).map((p) => [p.id, p.name])).toEqual([['belief', 'Présupposé'], ['fact', 'Fait']])
    const v4saved = { version: 4, items: [{ id: 'belief', name: 'Postulat', target: 'shape', style: {} }] }
    expect(normalizePresetSettings(v4saved, n).items[0].name).toBe('Présupposé')
    const renamed = { version: 3, items: [{ id: 'belief', name: 'Doxa', target: 'shape', style: {} }] }
    expect(normalizePresetSettings(renamed, n).items[0].name).toBe('Doxa')
  })

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
    expect(v3.version).toBe(12)
    expect(v3.items.map((p) => p.id)).toEqual([
      'statement', 'belief', 'fact', 'example', 'quote', 'linked', 'objects', 'explains', 'distinction', 'opposes', 'relates', 'premise',
    ])
    expect(v3.items.find((p) => p.id === 'example')!.style.color).toBe('grey')
    // Couleur modifiée par l'utilisateur : conservée.
    expect(v3.items.find((p) => p.id === 'quote')!.style.color).toBe('violet')
    expect(v3.items.find((p) => p.id === 'objects')!.role).toBe('Objection')
  })

  it('v9 → v11 : la citation perd son cadre en tirets de la v1 et prend un fond jaune pâle, sauf choix de l’utilisateur', () => {
    const quote = (style: Record<string, string>, version = 9) =>
      normalizePresetSettings({ version, items: [{ id: 'quote', name: 'Cit', target: 'shape', style: { color: 'yellow', ...style } }] }, names)
        .items.find((p) => p.id === 'quote')!.style
    expect(quote({ dash: 'dashed', fill: 'none' })).toMatchObject({ dash: 'none', fill: 'solid' })
    expect(quote({ dash: 'none', fill: 'semi' }, 10)).toMatchObject({ dash: 'none', fill: 'solid' })
    expect(quote({ dash: 'solid', fill: 'pattern' })).toMatchObject({ dash: 'solid', fill: 'pattern' })
  })

  it('v11 → v12 : « s’oppose à » devient rouge, sauf couleur choisie par l’utilisateur', () => {
    const opposes = (color: string) =>
      normalizePresetSettings({ version: 11, items: [{ id: 'opposes', name: 'o', target: 'arrow', style: { color } }] }, names)
        .items.find((p) => p.id === 'opposes')!.style.color
    expect(opposes('blue')).toBe('red')
    expect(opposes('green')).toBe('green')
  })
})

describe('profil et contexte', () => {
  const settings = defaultPresetSettings({})
  const mine = { id: 'these-x', name: 'Thèse', target: 'shape' as const, style: {} }

  it('Essentiel : dix préréglages de départ, plus ceux de l’utilisateur ; Complet : tout, sauf ceux de structure', () => {
    expect(offeredPresets({ ...settings, items: [...settings.items, mine] }).map((p) => p.id)).toEqual([
      'statement', 'concept', 'question', 'example', 'quote', 'supports', 'objects', 'answers', 'illustrates', 'distinguishes', 'these-x',
    ])
    const complete = offeredPresets({ ...settings, profile: 'complete' }).map((p) => p.id)
    expect(complete).toHaveLength(defaultPresets({}).length - 2)
    expect(complete).not.toContain('linked')
    expect(complete).not.toContain('premise')
  })

  it('relations selon le nœud : question, objection, concept', () => {
    const relations = defaultPresets({}).filter((p) => p.target === 'arrow')
    const ids = (c: { functionId?: string; typeId?: string }) => relationsFor(c, relations).map((r) => r.id)
    expect(ids({ typeId: 'question' })).toContain('answers')
    expect(ids({ typeId: 'question' })).not.toContain('supports')
    expect(ids({ functionId: 'objects', typeId: 'statement' }).slice(0, 3)).toEqual(['answers', 'supports', 'objects'])
    expect(ids({ typeId: 'concept' })).toEqual(expect.arrayContaining(['defines', 'distinguishes', 'opposes', 'relates']))
    expect(ids({ typeId: 'statement' })).toContain('supports')
  })
})

describe('v7 → v8 : familles de couleurs', () => {
  it('recolore les couleurs de départ inchangées, garde les autres', () => {
    const v7 = {
      version: 7,
      items: [
        { id: 'statement', name: 'Énoncé', target: 'shape', style: { color: 'yellow' } },
        { id: 'question', name: 'Question', target: 'shape', style: { color: 'green' } },
        { id: 'relates', name: 'se rapproche de', target: 'arrow', style: { color: 'grey', dash: 'solid' } },
      ],
    }
    const v8 = normalizePresetSettings(v7, {})
    expect(v8.items.find((p) => p.id === 'statement')!.style.color).toBe('violet')
    expect(v8.items.find((p) => p.id === 'question')!.style.color).toBe('green')
    expect(v8.items.find((p) => p.id === 'relates')!.style).toMatchObject({ color: 'blue', dash: 'dotted' })
  })
})
