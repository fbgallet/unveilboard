import { describe, expect, it } from 'vitest'
import { MapSchema } from '../map/format'
import { AIM_FAMILIES, AIM_TEXT, deepenText, FAMILY_AIMS, familyFor } from './aims'
import { estimatedCost, MODELS } from './models'
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

describe('relecture : ce qu’on en attend', () => {
  it('par défaut, tout : construction, solidité (sophismes, biais, force des raisons), sources, séquence', () => {
    const prompt = buildPrompt({ task: 'review', instruction: '', map, vocabulary, lang: 'fr', delivery: 'api' })
    for (const part of ['### Construction of the diagram', '### Soundness of the argument', '### Sources and quotations', '### Sequence', '"strengths"', '`fallacy`']) {
      expect(prompt).toContain(part)
    }
    expect(prompt).toContain('never by their id')
  })

  it('solidité seule : les autres axes sont laissés de côté, sortes de remarques comprises', () => {
    const prompt = buildPrompt({ task: 'review', instruction: '', map, vocabulary, lang: 'fr', delivery: 'api', reviewFocus: ['reasoning'] })
    expect(prompt).toContain('### Soundness of the argument')
    expect(prompt).toContain('Look only at the aspects below')
    expect(prompt).not.toContain('### Construction of the diagram')
    expect(prompt).not.toContain('`wording`')
    expect(prompt).toContain('"strengths"')
  })

  it('construction seule : ni sophismes ni force des raisons', () => {
    const prompt = buildPrompt({ task: 'review', instruction: '', map, vocabulary, lang: 'fr', delivery: 'api', reviewFocus: ['structure'] })
    expect(prompt).not.toContain('"strengths"')
    expect(prompt).not.toContain('- **fallacy**')
    expect(prompt).toContain('`wording`')
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

  it('développer avec une visée et une ampleur : la consigne de la visée, le nombre d’éléments, enfants compris', () => {
    const base = { task: 'expand' as const, instruction: '', map, focus: 'thesis', vocabulary, lang: 'fr', delivery: 'api' as const }
    const prompt = buildPrompt({ ...base, aim: { label: 'Contraires', text: AIM_TEXT.opposites }, amount: 'brief' })
    expect(prompt).toContain('## The aim of this request: Contraires')
    expect(prompt).toContain('<aim>\n' + AIM_TEXT.opposites + '\n</aim>')
    expect(prompt).toContain('about 2 to 4 elements in all, counting every element you add')
    expect(prompt.indexOf('<aim>')).toBeLessThan(prompt.indexOf('## The shape of the diagram'))
    expect(buildPrompt({ ...base, amount: 'exhaustive' })).toContain('as much as the material really offers')
    expect(buildPrompt(base)).not.toContain('**How much to add**')
    // Hors développement d'un élément, ni visée ni ampleur.
    expect(buildPrompt({ ...base, task: 'enrich', aim: { label: 'X', text: 'Y' }, amount: 'brief' })).not.toMatch(/<aim>|\*\*How much to add/)
  })

  it('compléter : ce qui a déjà été proposé n’est pas repris ; approfondir : les éléments ajoutés, par leurs enfants', () => {
    const base = { task: 'expand' as const, instruction: '', map, focus: 'thesis', vocabulary, lang: 'fr', delivery: 'api' as const }
    const complete = buildPrompt({ ...base, avoid: ['Le savoir', 'La foi'] })
    expect(complete).toContain('## Already proposed')
    expect(complete).toContain('- Le savoir\n- La foi')
    expect(buildPrompt(base)).not.toContain('## Already proposed')
    const deepen = buildPrompt({ ...base, selection: ['thesis'], aim: { label: 'Approfondir', text: deepenText('Objections') } })
    expect(deepen).toContain('Deepen the selected elements, which were just added from this element (as: Objections)')
    expect(deepen).toContain('focus on them: `thesis`')
  })

  it('régénérer : une proposition à remplacer (sans ampleur), ou toutes, dans la direction voulue, sinon mieux', () => {
    const base = { task: 'expand' as const, instruction: '', map, focus: 'thesis', vocabulary, lang: 'fr', delivery: 'api' as const, amount: 'normal' as const }
    const one = buildPrompt({ ...base, redo: { replace: { text: 'Le savoir', rationale: 'Voisin fréquent' } } })
    expect(one).toContain('## Redo one proposal')
    expect(one).toContain('“Le savoir” (proposed because: Voisin fréquent)')
    expect(one).toContain('The user gave no direction')
    expect(one).not.toContain('**How much to add**')
    const branch = buildPrompt({ ...base, redo: { replace: { text: 'Objection', branch: ['  - Réponse'] } } })
    expect(branch).toContain('It came with this branch, replaced with it:\n\n  - Réponse')
    expect(branch).toContain('with its own children as the replaced one had')
    const all = buildPrompt({ ...base, avoid: ['Le savoir'], redo: { direction: 'plus concret' } })
    expect(all).toContain('## Redo the proposals')
    expect(all).toContain('The direction the user asks for: plus concret')
    expect(all).toContain('**How much to add**')
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

describe('langue du contenu', () => {
  const base = { task: 'create' as const, instruction: 'Die Freiheit', vocabulary, delivery: 'api' as const }

  it('automatique : la langue du schéma, sinon de la demande ou du texte, notée dans `lang`', () => {
    const prompt = buildPrompt({ ...base, lang: 'auto' })
    expect(prompt).toContain("in the language of the current diagram if there is one; otherwise in the language of the user's request")
    expect(prompt).toContain('ISO 639-1 code')
    expect(prompt).toContain('If that language is neither English nor French')
  })

  it('une langue que l’app ne traduit pas : son nom, et les relations à nommer dans `vocabulary`', () => {
    const prompt = buildPrompt({ ...base, lang: 'de' })
    expect(prompt).toContain('in German, except quotations')
    expect(prompt).toContain('to `de`')
    expect(prompt).toContain('The content is in German: the vocabulary names above are not in that language')
  })

  it('une langue de l’app : pas de noms de relations à traduire', () => {
    const prompt = buildPrompt({ ...base, lang: 'fr' })
    expect(prompt).toContain('in French, except quotations')
    expect(prompt).not.toContain('vocabulary names above are not in that language')
  })
})

describe('visées', () => {
  it('chaque famille a ses visées, toutes avec une consigne', () => {
    for (const f of AIM_FAMILIES) {
      expect(FAMILY_AIMS[f].length).toBeGreaterThan(0)
      for (const a of FAMILY_AIMS[f]) expect(AIM_TEXT[a]).toBeTruthy()
    }
  })

  it('famille proposée d’abord : selon le type, sinon selon l’arbre', () => {
    expect(familyFor('concept', true)).toBe('analyse')
    expect(familyFor('question', false)).toBe('question')
    expect(familyFor('example', true)).toBe('illustrate')
    expect(familyFor('statement', false)).toBe('argue')
    expect(familyFor(undefined, true)).toBe('argue')
    expect(familyFor(undefined, false)).toBe('analyse')
  })
})

describe('coût estimé', () => {
  it('d’après les prix du catalogue, par million de jetons ; inconnu sans prix', () => {
    const priced = MODELS.find((m) => m.price)!
    const cost = estimatedCost(priced.id, { promptTokens: 1_000_000, completionTokens: 1_000_000 })
    expect(cost).toBeCloseTo(priced.price!.input + priced.price!.output)
    expect(estimatedCost('inconnu/modele', { promptTokens: 10 })).toBeUndefined()
    expect(estimatedCost(priced.id, {})).toBeUndefined()
  })
})
