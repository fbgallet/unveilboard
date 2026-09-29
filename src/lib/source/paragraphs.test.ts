import { describe, expect, it } from 'vitest'
import { numberedSource, passageOf, sourceParagraphs } from './paragraphs'

describe('paragraphes d’un texte source', () => {
  it('blocs séparés par une ligne vide ; un titre court rejoint le paragraphe suivant', () => {
    const text = `Chapitre I\n\n${'a'.repeat(100)}.\n\n${'b'.repeat(100)}.`
    expect(sourceParagraphs(text)).toEqual([`Chapitre I\n${'a'.repeat(100)}.`, `${'b'.repeat(100)}.`])
  })

  it('un bloc trop long (PDF sans lignes vides) est coupé en fins de phrase, sans rien perdre', () => {
    const sentence = `${'Une phrase assez longue pour remplir le texte'.repeat(3)}. `
    const block = sentence.repeat(20).trim()
    const parts = sourceParagraphs(block)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.every((p) => p.length <= 1500)).toBe(true)
    expect(parts.join(' ').replace(/\s+/g, ' ')).toBe(block.replace(/\s+/g, ' '))
  })

  it('numérotés à partir de 1 ; un passage garde ses numéros', () => {
    const paragraphs = ['A'.repeat(90), 'B'.repeat(90), 'C'.repeat(90)]
    expect(numberedSource(paragraphs)).toBe(`[§1] ${'A'.repeat(90)}\n\n[§2] ${'B'.repeat(90)}\n\n[§3] ${'C'.repeat(90)}`)
    expect(passageOf(paragraphs, [2, 3])).toBe(`[§2] ${'B'.repeat(90)}\n\n[§3] ${'C'.repeat(90)}`)
    expect(passageOf(paragraphs, [3, 9])).toBe(`[§3] ${'C'.repeat(90)}`)
  })
})
