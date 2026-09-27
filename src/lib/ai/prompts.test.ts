import { describe, expect, it } from 'vitest'
import { MapSchema } from '../map/format'
import { buildPrompt, PROMPT_VERSION, type VocabularyLine } from './prompts'
import truthFr from '../examples/truth.fr.json'

const vocabulary: VocabularyLine[] = [
  { id: 'statement', kind: 'type', name: 'Énoncé', definition: 'Ce qui est affirmé.' },
  { id: 'presupposes', kind: 'relation', name: 'présuppose', direction: 'toChild', childType: 'belief', function: 'Présupposé' },
]
const map = MapSchema.parse(truthFr)

describe('consignes', () => {
  it('créer : format du schéma, pas de schéma ouvert ni de format de modifications', () => {
    const prompt = buildPrompt({ task: 'create', instruction: 'La liberté', vocabulary, lang: 'fr', delivery: 'clipboard' })
    expect(prompt).toContain(`Unveilboard prompt v${PROMPT_VERSION}, task: create`)
    expect(prompt).toContain('La liberté')
    expect(prompt).toContain('"format": "unveilboard/map"')
    expect(prompt).not.toContain('unveilboard/patch')
    expect(prompt).not.toContain('The current diagram')
    expect(prompt).toContain('in French')
  })

  it('enrichir : schéma ouvert, sélection, vocabulaire et sens de lecture, format des modifications', () => {
    const prompt = buildPrompt({ task: 'enrich', instruction: '', map, selection: ['thesis'], vocabulary, lang: 'fr', delivery: 'clipboard' })
    expect(prompt).toContain('"unveilboard/patch"')
    expect(prompt).toContain('`thesis`')
    expect(prompt).toContain('`presupposes` (présuppose) [reads “parent RELATION child”; default child type: belief; function of the child: Présupposé]')
    expect(prompt).toContain(JSON.stringify(map, null, 1))
    expect(prompt).toContain('window.unveilboard.apply(json)')
  })

  it('par l’API : pas d’instructions pour coller la réponse', () => {
    const prompt = buildPrompt({ task: 'sequence', instruction: '', map, vocabulary, lang: 'en', delivery: 'api' })
    expect(prompt).not.toContain('window.unveilboard')
    expect(prompt).toContain('in English')
  })
})

describe('consignes : à partir d’un élément, ordre par défaut', () => {
  it('développer : élément de départ, extrait signalé, justification demandée', () => {
    const prompt = buildPrompt({ task: 'expand', instruction: 'Deux objections.', map, focus: 'thesis', partial: true, vocabulary, lang: 'fr', delivery: 'api' })
    expect(prompt).toContain('Starting from the element `thesis`')
    expect(prompt).toContain('## The current diagram (extract)')
    expect(prompt).toContain('`rationale`')
    expect(prompt).toContain('"unveilboard/patch"')
  })

  it('séquence : l’ordre par défaut est donné', () => {
    const prompt = buildPrompt({ task: 'sequence', instruction: '', map, order: ['question', 'thesis'], vocabulary, lang: 'fr', delivery: 'api' })
    expect(prompt).toContain('button does): `question`, `thesis`.')
  })
})

describe('consignes : créer à partir d’un texte', () => {
  it('le texte, sa référence, le type de schéma, la fidélité, sans séquence si demandé', () => {
    const prompt = buildPrompt({
      task: 'create',
      instruction: 'Pour des terminales.',
      source: { text: 'Dire la vérité est un devoir.', label: 'Kant, 1797' },
      kind: 'argument',
      withSequence: false,
      vocabulary,
      lang: 'fr',
      delivery: 'api',
    })
    expect(prompt).toContain('## Your task: create a diagram from a source text')
    expect(prompt).toContain('Build an **argument map**')
    expect(prompt).toContain('Do not write a sequence.')
    expect(prompt).toContain('copied **character for character**')
    expect(prompt).toContain('Reference: Kant, 1797\n\n<source>\nDire la vérité est un devoir.\n</source>')
    expect(prompt).toContain('Pour des terminales.')
  })
})

describe('consignes : boîte explicite, note facultative', () => {
  it('par défaut : l’essentiel dans la boîte, précision brève en note, Markdown permis', () => {
    const prompt = buildPrompt({ task: 'enrich', instruction: '', map, vocabulary, lang: 'fr', delivery: 'api' })
    expect(prompt).toContain('explicit and self-sufficient')
    expect(prompt).toContain('Never put the essential in the note alone')
    expect(prompt).toContain('Markdown is allowed sparingly')
  })
  it('sans notes : tout dans la boîte', () => {
    const prompt = buildPrompt({ task: 'enrich', instruction: '', map, vocabulary, lang: 'fr', delivery: 'api', notes: false })
    expect(prompt).toContain('Do not write notes')
    expect(prompt).not.toContain('Never put the essential in the note alone')
  })
})
