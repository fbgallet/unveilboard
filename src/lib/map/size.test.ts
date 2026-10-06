import { describe, expect, it } from 'vitest'
import { buildPrompt } from '../ai/prompts'
import { mapStats, normalizeSize, sizeIssues, sizeText } from './size'

// r → a → a1 → a1x ; r → b
const map = {
  elements: [
    { id: 'r', text: 'R' },
    { id: 'a', text: 'A', parent: 'r' },
    { id: 'a1', text: 'A1', parent: 'a' },
    { id: 'a1x', text: 'A1x', parent: 'a1' },
    { id: 'b', text: 'B', parent: 'r' },
  ],
}

describe('taille d’un schéma', () => {
  it('bornes : entiers dans les limites, min et max remis dans l’ordre', () => {
    expect(normalizeSize({ minElements: 30, maxElements: 10, minLevels: 0, maxLevels: 2.5 })).toEqual({ minElements: 10, maxElements: 30 })
    expect(normalizeSize(null)).toEqual({})
    expect(normalizeSize({ maxLevels: 99 })).toEqual({})
  })

  it('compte les éléments et les niveaux sous la racine (branche la plus longue)', () => {
    expect(mapStats(map)).toEqual({ elements: 5, levels: 3 })
    expect(mapStats({ elements: [{ id: 'x', text: 'X' }] })).toEqual({ elements: 1, levels: 0 })
  })

  it('hors des bornes : erreur au premier essai, avertissement ensuite ; rien sans bornes', () => {
    expect(sizeIssues(map, { maxElements: 4, minLevels: 2 }, true)).toEqual([
      { level: 'error', code: 'size_elements', path: 'elements', detail: '5, expected at most 4' },
    ])
    expect(sizeIssues(map, { minLevels: 4, maxLevels: 5 }, false)).toEqual([
      { level: 'warning', code: 'size_levels', path: 'elements', detail: '3, expected 4 to 5' },
    ])
    expect(sizeIssues(map, { minElements: 5, maxElements: 5, maxLevels: 3 }, true)).toEqual([])
    expect(sizeIssues(map, {}, true)).toEqual([])
  })

  it('consigne : création, plan, section (la profondeur seulement)', () => {
    const size = { minElements: 15, maxElements: 30, minLevels: 2, maxLevels: 4 }
    expect(sizeText(size, 'diagram')).toContain('- **Elements**: 15 to 30 boxes in all, the root included.')
    expect(sizeText(size, 'diagram')).toContain('- **Levels**: the longest branch goes 2 to 4 levels below the root')
    expect(sizeText(size, 'plan')).toContain('the section heads and their sizes add up to this')
    expect(sizeText(size, 'section')).not.toContain('Elements')
    expect(sizeText({ maxElements: 20 }, 'section')).toBe('')
    expect(sizeText({}, 'diagram')).toBe('')
  })

  it('la consigne de création l’inclut, celle d’enrichissement non', () => {
    const base = { instruction: 'La liberté', vocabulary: [], lang: 'fr', delivery: 'clipboard' as const, size: { maxElements: 12 } }
    expect(buildPrompt({ ...base, task: 'create' })).toContain('**Size set by the user.**')
    expect(buildPrompt({ ...base, task: 'enrich' })).not.toContain('**Size set by the user.**')
  })
})
