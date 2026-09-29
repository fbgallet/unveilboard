import { describe, expect, it } from 'vitest'
import { defaultPresets } from '../presets/presets'
import { planPatch, readPlan, readStepPatch, skeletonMap, type DiagramPlan } from '../map/plan'
import { AiError } from './errors'
import { buildPrompt, type PromptInput } from './prompts'
import { runWithRepair } from './run'
import { askPlan, developSections, finishMap, memoryStore, type Ask, type StagedContext } from './staged'

// Aucun appel réseau : l'IA est simulée, réponse par tâche (et par section).

const presets = defaultPresets({})
const known = {
  types: presets.filter((p) => p.target === 'shape').map((p) => p.id),
  relations: presets.filter((p) => p.target === 'arrow').map((p) => p.id),
}

const plan: DiagramPlan = {
  format: 'unveilboard/plan',
  version: 1,
  title: 'La caverne',
  kind: 'mindmap',
  root: { id: 'root', text: 'L’allégorie de la caverne' },
  pattern: 'Chaque étape → son interprétation → son intérêt philosophique.',
  sections: [
    { id: 's1', text: 'Les prisonniers prennent les ombres pour le réel', brief: 'La situation initiale.', size: 3 },
    { id: 's2', text: 'La libération est douloureuse', brief: 'La montée.', size: 3 },
    { id: 's3', text: 'L’allégorie décrit l’éducation', brief: 'Sens d’ensemble.', synthesis: true },
  ],
}

const json = (value: unknown) => '```json\n' + JSON.stringify(value) + '\n```'
const patch = (operations: unknown[]) => json({ format: 'unveilboard/patch', version: 1, operations })

describe('plan (unveilboard/plan)', () => {
  it('lu et contrôlé ; le squelette a la racine et une tête par section', () => {
    const result = readPlan(json(plan), known)
    expect(result.ok).toBe(true)
    const map = skeletonMap(plan)
    expect(map.elements.map((e) => [e.id, e.parent ?? null])).toEqual([
      ['root', null],
      ['s1', 'root'],
      ['s2', 'root'],
      ['s3', 'root'],
    ])
    expect(map.elements[0].tree).toEqual({ kind: 'mindmap' })
  })

  it('une relation inconnue est signalée sur la section, pour la correction', () => {
    const bad = { ...plan, sections: [{ ...plan.sections[0], relation: 'nope' }] }
    const result = readPlan(bad, known)
    expect(result.ok).toBe(false)
    expect(result.issues.map((i) => `${i.code}:${i.path}`)).toContain('unknown_relation:sections[0].relation')
  })
})

describe('développement d’une section', () => {
  const map = skeletonMap(plan)
  const opts = { allowed: ['add', 'link'] as ('add' | 'link')[], section: 's1' }

  it('identifiant déjà pris : renommé, avec ses mentions', () => {
    const taken = { ...map, elements: [...map.elements, { id: 's1-1', text: 'déjà là', parent: 's2' }] }
    const result = readStepPatch(
      patch([
        { op: 'add', id: 's1-1', text: 'A', parent: 's1' },
        { op: 'add', id: 's1-2', text: 'B', parent: 's1-1' },
      ]),
      taken,
      known,
      opts
    )
    expect(result.ok && result.patch.operations.map((o) => [o.op === 'add' && o.id, o.op === 'add' && o.parent])).toEqual([
      ['s1-1-2', 's1'],
      ['s1-2', 's1-1-2'],
    ])
  })

  it('hors de la section, ou opération non permise : refusé', () => {
    const outside = readStepPatch(patch([{ op: 'add', id: 'x', text: 'X', parent: 's2' }]), map, known, opts)
    expect(outside.ok ? [] : outside.issues.map((i) => i.code)).toEqual(['outside_section'])
    const update = readStepPatch(patch([{ op: 'update', id: 's2', text: 'Autre' }]), map, known, opts)
    expect(update.ok ? [] : update.issues.map((i) => i.code)).toEqual(['operation_not_allowed'])
  })
})

describe('création en plusieurs temps', () => {
  /** IA simulée : `answer` donne la réponse à une demande ; `seen` garde les demandes, dans l'ordre. */
  function fakeAsk(answer: (input: PromptInput) => string, seen: (PromptInput & { reasoning?: string })[] = []): Ask {
    return async (input, check, opts) => {
      seen.push({ ...input, reasoning: opts.reasoning })
      buildPrompt(input) // la consigne se construit pour chaque étape
      return runWithRepair(async () => {
        const text = answer(input)
        if (text === 'FAIL') throw new AiError('interrupted')
        return { text }
      }, check)
    }
  }
  const context = (ask: Ask): StagedContext => ({ ask, known, base: { instruction: 'La caverne', vocabulary: [], lang: 'fr', delivery: 'api' }, reasoning: 'high' })
  const develop = (input: PromptInput) =>
    patch([
      { op: 'add', id: `${input.focus}-1`, text: `Idée de ${input.focus}`, parent: input.focus },
      { op: 'add', id: `${input.focus}-2`, text: 'Interprétation', parent: `${input.focus}-1`, relation: 'explains' },
    ])

  it('plan, sections en parallèle puis synthèse, finition : un schéma complet', async () => {
    const seen: (PromptInput & { reasoning?: string })[] = []
    const ctx = context(
      fakeAsk((input) => {
        if (input.task === 'plan') return json(plan)
        if (input.task === 'develop') return develop(input)
        return patch([
          { op: 'link', id: 'l1', from: 's3-1', to: 's1-1' },
          { op: 'sequence', mode: 'replace', steps: [{ title: 'Tout', camera: 'overview', actions: [{ do: 'show', targets: ['root'] }] }] },
        ])
      }, seen)
    )
    const { plan: got } = await askPlan(ctx)
    expect(got.lang).toBe('fr')
    const state = memoryStore(got)
    const done: string[] = []
    await developSections(ctx, got, state, ['s1', 's2', 's3'], {
      onStart: () => {},
      onText: () => {},
      onDone: (id, _run, added) => done.push(`${id}:${added}`),
      onFail: (id, e) => done.push(`${id}:${e.kind}`),
    })
    // La synthèse vient après les autres, et voit leur contenu.
    expect(done).toEqual(['s1:2', 's2:2', 's3:2'])
    const synthesis = seen.find((i) => i.task === 'develop' && i.focus === 's3')!
    expect(synthesis.map?.elements.some((e) => e.id === 's1-1')).toBe(true)
    // Réflexion : celle choisie pour le plan, légère ensuite.
    expect(seen.map((i) => `${i.task}:${i.reasoning}`)).toEqual(['plan:high', 'develop:low', 'develop:low', 'develop:low'])
    await finishMap(ctx, got, state)
    expect(state.map.elements).toHaveLength(4 + 6)
    expect(state.map.links?.map((l) => l.id)).toEqual(['l1'])
    expect(state.map.sequence?.steps).toHaveLength(1)
  })

  it('une section qui échoue n’arrête pas les autres ; relancée, elle s’ajoute', async () => {
    let fail = true
    const ctx = context(fakeAsk((input) => (input.focus === 's2' && fail ? 'FAIL' : develop(input))))
    const state = memoryStore(plan)
    const events = { onStart: () => {}, onText: () => {}, onDone: () => {}, onFail: (id: string, e: AiError) => failed.push(`${id}:${e.kind}`) }
    const failed: string[] = []
    await developSections(ctx, plan, state, ['s1', 's2', 's3'], events)
    expect(failed).toEqual(['s2:interrupted'])
    expect(state.map.elements.some((e) => e.id === 's1-1')).toBe(true)
    fail = false
    await developSections(ctx, plan, state, ['s2'], events)
    expect(state.map.elements.some((e) => e.id === 's2-1')).toBe(true)
  })

  it('les consignes des étapes : plan (format du plan), section (sa consigne, le motif), finition', () => {
    const base = { instruction: 'La caverne', vocabulary: [], lang: 'fr', delivery: 'api' as const }
    expect(buildPrompt({ ...base, task: 'plan' })).toContain('"format": "unveilboard/plan"')
    const section = buildPrompt({ ...base, task: 'develop', plan, focus: 's2', map: skeletonMap(plan) })
    expect(section).toContain('**Brief of this section**: La montée.')
    expect(section).toContain('**Common pattern**')
    expect(section).toContain('`s2-1`')
    const revised = buildPrompt({ ...base, task: 'plan', plan, planRemarks: 'Ajoute le retour dans la caverne.' })
    expect(revised).toContain('**Remarks**: Ajoute le retour dans la caverne.')
    expect(buildPrompt({ ...base, task: 'finish', plan, map: skeletonMap(plan) })).toContain('Use only `link` and `sequence` operations')
  })
})

describe('plan d’un schéma existant', () => {
  const map = {
    format: 'unveilboard/map' as const,
    version: 1 as const,
    elements: [
      { id: 'q', text: 'La caverne', tree: { kind: 'mindmap' as const } },
      { id: 'a', text: 'Les prisonniers', parent: 'q' },
      { id: 'a1', text: 'Les ombres', parent: 'a' },
    ],
  }
  const onMap: DiagramPlan = {
    ...plan,
    root: { id: 'q', text: 'La caverne' },
    sections: [
      { id: 'a', text: 'Les prisonniers', brief: 'Compléter.' },
      { id: 's2', text: 'La sortie', brief: 'Nouvelle.' },
    ],
  }

  it('adopter : seules les têtes manquantes sont ajoutées ; un texte changé dans le plan est repris', () => {
    expect(planPatch(onMap, map)?.operations).toEqual([{ op: 'add', id: 's2', text: 'La sortie', parent: 'q' }])
    const renamed = { ...onMap, sections: [{ ...onMap.sections[0], text: 'Les prisonniers enchaînés' }] }
    expect(planPatch(renamed, map)?.operations).toEqual([{ op: 'update', id: 'a', text: 'Les prisonniers enchaînés' }])
    expect(planPatch({ ...onMap, sections: [onMap.sections[0]] }, map)).toBeNull()
  })

  it('la consigne du plan demande de reprendre la racine et les branches', () => {
    const prompt = buildPrompt({ task: 'plan', instruction: 'Compléter', vocabulary: [], lang: 'fr', delivery: 'api', map })
    expect(prompt).toContain('**The diagram already exists**')
    expect(buildPrompt({ task: 'plan', instruction: 'x', vocabulary: [], lang: 'fr', delivery: 'api' })).not.toContain('already exists')
  })
})

describe('plan d’un texte source', () => {
  const para = (n: number) => `Paragraphe ${n} : ${'le texte dit ceci et cela. '.repeat(4)}`
  const text = [1, 2, 3, 4].map(para).join('\n\n')
  const source = { text, label: 'Platon, République VII' }
  const sourcePlan: DiagramPlan = {
    ...plan,
    sections: [
      { id: 's1', text: 'Début', brief: 'Les deux premiers paragraphes.', paragraphs: [1, 2] },
      { id: 's2', text: 'Fin', brief: 'La suite.', paragraphs: [3, 4] },
    ],
  }
  const base = { instruction: '', vocabulary: [], lang: 'fr', delivery: 'api' as const, source }

  it('le plan voit les paragraphes numérotés ; une section, seulement son passage, avec les règles de fidélité', () => {
    expect(buildPrompt({ ...base, task: 'plan' })).toContain('[§4] Paragraphe 4')
    const s2 = buildPrompt({ ...base, task: 'develop', plan: sourcePlan, focus: 's2', map: skeletonMap(sourcePlan, { source: true }) })
    expect(s2).toContain('[§3] Paragraphe 3')
    expect(s2).not.toContain('Paragraphe 1 :')
    expect(s2).toContain('**Faithfulness to the text**')
    expect(buildPrompt({ ...base, task: 'finish', plan: sourcePlan, withSequence: false })).toContain('Do not write a sequence.')
  })

  it('une plage hors du texte est refusée (pour correction)', () => {
    const bad = { ...sourcePlan, sections: [{ ...sourcePlan.sections[0], paragraphs: [1, 9] as [number, number] }] }
    const result = readPlan(bad, known, { paragraphs: 4 })
    expect(result.ok ? [] : result.issues.map((i) => i.path)).toEqual(['sections[0].paragraphs'])
  })

  it('extraits contrôlés par section : introuvable → correction, puis « à vérifier »', async () => {
    const answers = [
      [{ op: 'add', id: 's1-1', text: 'Il dit ceci', parent: 's1', origin: 'text', excerpt: 'Le texte ne dit pas cela' }],
      [{ op: 'add', id: 's1-1', text: 'Il dit ceci', parent: 's1', origin: 'text', excerpt: 'Toujours introuvable' }],
    ]
    const prompts: PromptInput[] = []
    const ask: Ask = async (input, check) => {
      prompts.push(input)
      return runWithRepair(async () => ({ text: patch(answers.shift()!) }), check)
    }
    const store = memoryStore(sourcePlan, { source: true })
    expect(store.map.elements.every((e) => e.origin === 'reconstruction')).toBe(true)
    const done: string[][] = []
    await developSections({ ask, known, base, reasoning: 'default' }, sourcePlan, { ...store, commit: (r) => done.push(r.unverified ?? []) }, ['s1'], {
      onStart: () => {},
      onText: () => {},
      onDone: () => {},
      onFail: (id, e) => done.push([`${id}:${e.kind}`]),
    })
    // Deux essais : le premier refusé (extrait introuvable), le second accepté, l'élément signalé.
    expect(answers).toHaveLength(0)
    expect(done).toEqual([['s1-1']])
  })
})
