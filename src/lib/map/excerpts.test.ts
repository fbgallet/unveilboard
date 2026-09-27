import { describe, expect, it } from 'vitest'
import { checkExcerpts, excerptFound, normalizeForMatch } from './excerpts'
import type { UnveilMap } from './format'

const SOURCE = `Dire la vérité n’est donc un devoir qu’envers ceux qui ont droit à la vérité. Or nul homme n’a droit à la
vérité qui nuit à autrui. — Benjamin Constant, « Des réac-
tions politiques », 1797.`

describe('extraits retrouvés dans la source', () => {
  const text = normalizeForMatch(SOURCE)
  it('tolère apostrophes, sauts de ligne, césures, casse, guillemets', () => {
    expect(excerptFound(text, "Dire la vérité n'est donc un devoir")).toBe(true)
    expect(excerptFound(text, 'nul homme n’a droit à la vérité qui nuit à autrui.')).toBe(true)
    expect(excerptFound(text, '"Des réactions politiques"')).toBe(true)
    expect(excerptFound(text, 'DIRE LA VÉRITÉ')).toBe(true)
  })
  it('coupures « … » et « […] » : chaque morceau, dans l’ordre', () => {
    expect(excerptFound(text, 'Dire la vérité […] ceux qui ont droit à la vérité')).toBe(true)
    expect(excerptFound(text, 'Dire la vérité… nuit à autrui')).toBe(true)
    expect(excerptFound(text, 'nuit à autrui … Dire la vérité')).toBe(false)
  })
  it('refuse une paraphrase', () => {
    expect(excerptFound(text, 'Personne n’a droit à une vérité nuisible')).toBe(false)
    expect(excerptFound(text, '…')).toBe(false)
  })
  it('contrôle d’un schéma : extraits et citations, erreurs ou avertissements', () => {
    const map: UnveilMap = {
      format: 'unveilboard/map',
      version: 1,
      elements: [
        { id: 'a', text: 'Un devoir relatif', excerpt: 'un devoir qu’envers ceux qui ont droit à la vérité' },
        { id: 'b', text: 'Inventé', excerpt: 'mentir est toujours permis' },
        { id: 'c', type: 'quote', text: '« Or nul homme n’a droit à la vérité qui nuit à autrui »' },
        { id: 'd', type: 'quote', text: '« Le mensonge est un crime »' },
        { id: 'e', text: 'Reconstruit', origin: 'reconstruction' },
      ],
    }
    const strict = checkExcerpts(map, SOURCE, true)
    expect(strict).toMatchObject({ verified: ['a'], unverified: ['b', 'd'] })
    expect(strict.issues.map((i) => `${i.level}:${i.code}:${i.path}`)).toEqual([
      'error:excerpt_not_found:elements[1].excerpt',
      'error:quote_not_found:elements[3].text',
    ])
    expect(checkExcerpts(map, SOURCE, false).issues.every((i) => i.level === 'warning')).toBe(true)
  })
})
