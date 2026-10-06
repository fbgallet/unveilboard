// Bibliothèque de prompts : des « méthodes » qui orientent une tâche de l'IA (créer un schéma,
// développer un élément, relire…), sans toucher aux formats ni aux règles de l'app.
//
// Un prompt est un fichier Markdown (dossier prompts/ du dépôt, ou prompt personnel) :
//
//   ---
//   title: Réseau conceptuel du sujet
//   tasks: [create, expand]
//   source: required
//   ---
//   Partie commune, pour toutes les tâches.
//
//   ## @create
//   Variante pour la création d'un schéma.
//
//   ## @expand @enrich
//   Variante pour le développement d'un élément et l'enrichissement.
//
// Pur (ni navigateur ni système de fichiers) : lu par la génération de library.json et par l'app.

import { TASKS, type PromptMethod, type Task } from '../ai/prompts'

/** Tâches pour lesquelles on peut choisir un prompt (celles qui ont une boîte de dialogue). */
export const PROMPT_TASKS = ['create', 'enrich', 'expand', 'edit', 'sequence', 'review', 'plan'] as const satisfies readonly Task[]
export type PromptTask = (typeof PROMPT_TASKS)[number]

export interface PromptTemplate {
  /** Chemin sans extension (« philosophie/dissertation/reseau-conceptuel »), ou « custom:… ». */
  id: string
  /** Collection : le dossier (« philosophie/dissertation »), ou le groupe d'un prompt personnel. */
  collection: string
  title: string
  description?: string
  /** Tâches où il est proposé (absent : toutes). */
  tasks?: Task[]
  /** Texte d'aide de la zone de saisie (« Le sujet de dissertation… »). */
  placeholder?: string
  /** Langue dans laquelle il est écrit. */
  lang?: string
  /** Ordre dans sa collection (sinon : par titre). */
  order?: number
  /**
   * Texte source : « required », proposé seulement quand la demande s'appuie sur un texte (explication
   * de texte) ; « none », seulement sans texte (un sujet de dissertation). Absent : dans les deux cas.
   */
  source?: 'required' | 'none'
  body: string
  variants: Partial<Record<Task, string>>
}

export interface PromptCollection {
  /** Chemin du dossier (« philosophie », « philosophie/dissertation »). */
  id: string
  title: string
  description?: string
  lang?: string
}

export interface PromptLibraryData {
  collections: PromptCollection[]
  prompts: PromptTemplate[]
}

/** Lit l'en-tête (« --- … --- ») : clés simples, chaînes, nombres et listes « [a, b] » ou « - a ». */
export function parseFrontmatter(source: string): { data: Record<string, string | number | string[]>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source)
  if (!match) return { data: {}, body: source }
  const data: Record<string, string | number | string[]> = {}
  let listKey: string | null = null
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const item = /^\s+-\s+(.*)$/.exec(line)
    if (item && listKey) {
      ;(data[listKey] as string[]).push(unquote(item[1]))
      continue
    }
    const pair = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line)
    if (!pair) continue
    const [, key, raw] = pair
    const value = raw.trim()
    listKey = null
    if (!value) {
      data[key] = []
      listKey = key
    } else if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map((v) => unquote(v))
        .filter(Boolean)
    } else if (/^-?\d+(\.\d+)?$/.test(value)) {
      data[key] = Number(value)
    } else {
      data[key] = unquote(value)
    }
  }
  return { data, body: source.slice(match[0].length) }
}

function unquote(value: string) {
  const v = value.trim()
  return /^(["']).*\1$/.test(v) ? v.slice(1, -1) : v
}

/** Marqueur d'une variante : « ## @create » ou « ## @expand @enrich ». */
const VARIANT = /^##\s+((?:@[a-z]+\s*)+)$/

/** Partie commune et variantes par tâche d'un corps de prompt. Problèmes : tâches inconnues. */
export function parseBody(body: string): { body: string; variants: Partial<Record<Task, string>>; problems: string[] } {
  const common: string[] = []
  const variants: Partial<Record<Task, string[]>> = {}
  const problems: string[] = []
  let current: Task[] | null = null
  for (const line of body.split(/\r?\n/)) {
    const marker = VARIANT.exec(line.trim())
    if (marker) {
      const names = marker[1].split('@').map((n) => n.trim()).filter(Boolean)
      current = names.filter((n): n is Task => (TASKS as readonly string[]).includes(n))
      for (const n of names) if (!current.includes(n as Task)) problems.push(`unknown task “@${n}”`)
      for (const task of current) variants[task] ??= []
      continue
    }
    if (current) for (const task of current) variants[task]!.push(line)
    else common.push(line)
  }
  const joined = Object.fromEntries(
    Object.entries(variants)
      .map(([task, lines]) => [task, lines.join('\n').trim()])
      .filter(([, text]) => text)
  ) as Partial<Record<Task, string>>
  return { body: common.join('\n').trim(), variants: joined, problems }
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

/** Un fichier de prompt : son en-tête et son corps. `path` : chemin sans extension. */
export function parsePromptFile(source: string, path: string): { template: PromptTemplate; problems: string[] } {
  const { data, body: rawBody } = parseFrontmatter(source)
  const { body, variants, problems } = parseBody(rawBody)
  const title = str(data.title)
  if (!title) problems.push('missing “title”')
  const declared = Array.isArray(data.tasks) ? data.tasks : typeof data.tasks === 'string' ? [data.tasks] : undefined
  const tasks = declared?.filter((t): t is Task => (TASKS as readonly string[]).includes(t))
  for (const t of declared ?? []) if (!(TASKS as readonly string[]).includes(t)) problems.push(`unknown task “${t}” in “tasks”`)
  if (!body && !Object.keys(variants).length) problems.push('empty prompt')
  if (data.source !== undefined && data.source !== 'required' && data.source !== 'none') problems.push('“source” must be “required” or “none”')
  const slash = path.lastIndexOf('/')
  const template: PromptTemplate = {
    id: path,
    collection: slash > 0 ? path.slice(0, slash) : '',
    title: title ?? path.slice(slash + 1),
    ...(str(data.description) && { description: str(data.description) }),
    ...(tasks?.length && { tasks }),
    ...(str(data.placeholder) && { placeholder: str(data.placeholder) }),
    ...(str(data.lang) && { lang: str(data.lang) }),
    ...(typeof data.order === 'number' && { order: data.order }),
    ...((data.source === 'required' || data.source === 'none') && { source: data.source }),
    body,
    variants,
  }
  return { template, problems }
}

/** Le fichier d'une collection (« _collection.md ») : titre, description, langue. */
export function parseCollectionFile(source: string, path: string): PromptCollection {
  const { data, body } = parseFrontmatter(source)
  return {
    id: path,
    title: str(data.title) ?? path.split('/').pop() ?? path,
    ...((str(data.description) ?? str(body)) && { description: str(data.description) ?? str(body) }),
    ...(str(data.lang) && { lang: str(data.lang) }),
  }
}

/** L'en-tête d'un prompt (titre, description, tâches, aide, langue). */
export function serializeFrontmatter(meta: Pick<PromptTemplate, 'title' | 'description' | 'tasks' | 'placeholder' | 'lang' | 'source'>): string {
  const quote = (v: string) => (/[:#\[\]{},"']|^\s|\s$/.test(v) ? JSON.stringify(v) : v)
  const head = [
    `title: ${quote(meta.title)}`,
    meta.description && `description: ${quote(meta.description)}`,
    meta.tasks?.length && `tasks: [${meta.tasks.join(', ')}]`,
    meta.placeholder && `placeholder: ${quote(meta.placeholder)}`,
    meta.lang && `lang: ${meta.lang}`,
    meta.source && `source: ${meta.source}`,
  ].filter(Boolean)
  return `---\n${head.join('\n')}\n---\n`
}

/** Le corps d'un prompt : la partie commune, puis les variantes (celles qui ont le même texte, sous un seul marqueur). */
export function serializeBody(body: string, variants: Partial<Record<Task, string>>): string {
  const groups = new Map<string, Task[]>()
  for (const task of TASKS) {
    const text = variants[task]
    if (text) groups.set(text, [...(groups.get(text) ?? []), task])
  }
  const parts = [...groups].map(([text, tasks]) => `## ${tasks.map((t) => `@${t}`).join(' ')}\n\n${text}`)
  return [body, ...parts].filter(Boolean).join('\n\n')
}

/** Réécrit un prompt en Markdown (export d'un prompt personnel). */
export function serializePrompt(template: Omit<PromptTemplate, 'id' | 'collection'>): string {
  return `${serializeFrontmatter(template)}\n${serializeBody(template.body, template.variants)}\n`
}

/** Contexte d'une demande : s'appuie-t-elle sur un texte source ? (absent : ne pas filtrer) */
export interface PromptContext {
  source?: boolean
}

/** Le prompt est-il proposé pour cette tâche (et ce contexte) ? Le plan (création en plusieurs temps) suit la création. */
export function offersTask(template: PromptTemplate, task: PromptTask, context: PromptContext = {}): boolean {
  if (context.source !== undefined && template.source && (template.source === 'required') !== context.source) return false
  const tasks = template.tasks
  return !tasks?.length || tasks.includes(task) || (task === 'plan' && tasks.includes('create'))
}

/** Ce qui est envoyé avec la demande : la partie commune et les variantes. */
export function methodOf(template: PromptTemplate): PromptMethod {
  return { title: template.title, body: template.body, ...(Object.keys(template.variants).length && { variants: template.variants }) }
}
