import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildPrompt } from '../ai/prompts'
import {
  methodOf,
  offersTask,
  parseBody,
  parseCollectionFile,
  parseFrontmatter,
  parsePromptFile,
  serializePrompt,
  type PromptCollection,
  type PromptLibraryData,
  type PromptTemplate,
} from './template'

const ROOT = join(process.cwd(), 'prompts')
const OUTPUT = join(process.cwd(), 'src/lib/prompts/library.json')

function files(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name)
      return statSync(path).isDirectory() ? files(path) : name.endsWith('.md') ? [path] : []
    })
}

/** La bibliothèque partagée, lue dans prompts/ (README.md exclu), avec les problèmes trouvés. */
function readLibrary(): { data: PromptLibraryData; problems: string[] } {
  const collections = new Map<string, PromptCollection>()
  const prompts: PromptTemplate[] = []
  const problems: string[] = []
  for (const file of files(ROOT)) {
    const path = relative(ROOT, file).replace(/\\/g, '/').replace(/\.md$/, '')
    const name = path.split('/').pop()!
    if (name === 'README') continue
    const source = readFileSync(file, 'utf8')
    if (name === '_collection') {
      const id = path.slice(0, -'/_collection'.length)
      collections.set(id, parseCollectionFile(source, id))
      continue
    }
    const parsed = parsePromptFile(source, path)
    if (!parsed.template.collection) problems.push(`${path}: a prompt belongs in a folder (its collection)`)
    problems.push(...parsed.problems.map((p) => `${path}: ${p}`))
    prompts.push(parsed.template)
  }
  // Toute collection (et ses parents) a une entrée, même sans _collection.md.
  for (const p of prompts) {
    const parts = p.collection.split('/')
    for (let i = 1; i <= parts.length; i++) {
      const id = parts.slice(0, i).join('/')
      if (id && !collections.has(id)) collections.set(id, { id, title: parts[i - 1] })
    }
  }
  return {
    data: {
      collections: [...collections.values()].sort((a, b) => a.id.localeCompare(b.id)),
      prompts: prompts.sort((a, b) => a.collection.localeCompare(b.collection) || (a.order ?? 999) - (b.order ?? 999) || a.title.localeCompare(b.title)),
    },
    problems,
  }
}

describe('bibliothèque partagée (prompts/)', () => {
  const { data, problems } = readLibrary()

  it('chaque prompt est lisible', () => {
    expect(problems).toEqual([])
    expect(data.prompts.length).toBeGreaterThan(0)
  })

  it('library.json est à jour (sinon : pnpm prompts:build)', () => {
    const expected = JSON.stringify(data, null, 2) + '\n'
    if (process.env.UPDATE_PROMPT_LIBRARY) writeFileSync(OUTPUT, expected)
    expect(readFileSync(OUTPUT, 'utf8')).toBe(expected)
  })
})

describe('format des prompts', () => {
  it('en-tête : chaînes, nombres, listes en ligne ou à tirets', () => {
    const { data, body } = parseFrontmatter('---\ntitle: "Un titre : avec deux-points"\norder: 2\ntasks: [create, expand]\nother:\n  - a\n  - b\n---\nCorps')
    expect(data).toEqual({ title: 'Un titre : avec deux-points', order: 2, tasks: ['create', 'expand'], other: ['a', 'b'] })
    expect(body).toBe('Corps')
  })

  it('variantes : partie commune, une ou plusieurs tâches par marqueur, tâches inconnues signalées', () => {
    const parsed = parseBody('Commun\n\n## Un titre ordinaire\n\nsuite\n\n## @create\n\nCréer\n\n## @expand @enrich\n\nDévelopper\n\n## @nope\n\nx')
    expect(parsed.body).toBe('Commun\n\n## Un titre ordinaire\n\nsuite')
    expect(parsed.variants).toEqual({ create: 'Créer', expand: 'Développer', enrich: 'Développer' })
    expect(parsed.problems).toEqual(['unknown task “@nope”'])
  })

  it('aller-retour : un prompt réécrit en Markdown se relit à l’identique', () => {
    const { template } = parsePromptFile('---\ntitle: Test\ntasks: [create, expand]\nplaceholder: "Le sujet : …"\n---\nCommun\n\n## @create\n\nA\n\n## @expand\n\nA', 'x/test')
    const again = parsePromptFile(serializePrompt(template), 'x/test').template
    expect(again).toEqual(template)
    expect(serializePrompt(template)).toContain('## @create @expand')
  })

  it('tâches proposées : celles déclarées, sinon toutes ; le plan suit la création', () => {
    const base = { id: 'a/b', collection: 'a', title: 'T', body: 'x', variants: {} }
    expect(offersTask(base, 'review')).toBe(true)
    expect(offersTask({ ...base, variants: { expand: 'y' } }, 'create')).toBe(true)
    expect(offersTask({ ...base, tasks: ['create'] }, 'plan')).toBe(true)
    expect(offersTask({ ...base, tasks: ['create'] }, 'expand')).toBe(false)
  })

  it('chat : les méthodes déclarées pour lui, ou pour une modification du schéma (variante « edit » à défaut de la sienne)', () => {
    const base = { id: 'a/b', collection: 'a', title: 'T', body: 'Commun', variants: {} }
    expect(offersTask({ ...base, tasks: ['create', 'expand', 'enrich'] }, 'chat')).toBe(true)
    expect(offersTask({ ...base, tasks: ['chat'] }, 'chat')).toBe(true)
    expect(offersTask({ ...base, tasks: ['create', 'sequence'] }, 'chat')).toBe(false)
    const input = { task: 'chat' as const, instruction: 'x', vocabulary: [], lang: 'fr', delivery: 'api' as const }
    const prompt = buildPrompt({ ...input, method: methodOf({ ...base, variants: { edit: 'Variante edit', create: 'Variante create' } }) })
    expect(prompt).toContain('Commun\n\nVariante edit')
    expect(prompt).not.toContain('Variante create')
    expect(buildPrompt({ ...input, method: methodOf({ ...base, variants: { chat: 'Variante chat', edit: 'Variante edit' } }) })).toContain('Commun\n\nVariante chat')
  })

  it('texte source : « required » seulement avec un texte, « none » seulement sans ; sans contexte, pas de filtre', () => {
    const base = { id: 'a/b', collection: 'a', title: 'T', body: 'x', variants: {} }
    const explication = { ...base, source: 'required' as const }
    const sujet = { ...base, source: 'none' as const }
    expect(offersTask(explication, 'create', { source: true })).toBe(true)
    expect(offersTask(explication, 'create', { source: false })).toBe(false)
    expect(offersTask(sujet, 'create', { source: true })).toBe(false)
    expect(offersTask(sujet, 'create', { source: false })).toBe(true)
    expect(offersTask(base, 'create', { source: true })).toBe(true)
    expect(offersTask(explication, 'create')).toBe(true)
  })
})

describe('méthode dans la consigne', () => {
  const method = methodOf({ id: 'a/b', collection: 'a', title: 'Réseau conceptuel', body: 'Commun', variants: { create: 'Pour créer', expand: 'Pour développer' } })
  const base = { instruction: 'La liberté', vocabulary: [], lang: 'fr', delivery: 'api' as const, method }

  it('création : partie commune et variante, avant la demande', () => {
    const prompt = buildPrompt({ ...base, task: 'create' })
    expect(prompt).toContain('## The method to follow: Réseau conceptuel')
    expect(prompt).toContain('<method>\nCommun\n\nPour créer\n</method>')
    expect(prompt).not.toContain('Pour développer')
    expect(prompt.indexOf('<method>')).toBeLessThan(prompt.indexOf("## The user's request"))
  })

  it('étapes d’une création en plusieurs temps : la variante de la création', () => {
    expect(buildPrompt({ ...base, task: 'plan' })).toContain('Pour créer')
    expect(buildPrompt({ ...base, task: 'develop', focus: 's1' })).toContain('Pour créer')
  })

  it('tâche sans variante : la partie commune seule ; sans méthode : rien', () => {
    const prompt = buildPrompt({ ...base, task: 'review' })
    expect(prompt).toContain('<method>\nCommun\n</method>')
    expect(buildPrompt({ ...base, method: undefined, task: 'create' })).not.toContain('<method>')
  })
})
