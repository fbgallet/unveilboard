// Bibliothèque de prompts, côté navigateur : les prompts partagés (dossier prompts/ du dépôt,
// compilés dans library.json), les prompts personnels de l'utilisateur et les collections qu'il
// affiche. Prompts personnels et collections sont des réglages communs (SettingsStore) : dans le
// navigateur en mode local, sur le serveur en mode cloud (donc sur tous ses appareils).

import { atom } from 'tldraw'
import { clientLocale } from '@/i18n/client'
import type { SettingsStore } from '../storage/types'
import { TASKS, type Task } from '../ai/prompts'
import shared from './library.json'
import { offersTask, parseBody, type PromptCollection, type PromptLibraryData, type PromptTask, type PromptTemplate } from './template'

export const SHARED_LIBRARY = shared as PromptLibraryData

const SETTING_KEY = 'prompt-library'
const CACHE_KEY = 'prompt-library-cache'
const CHOICE_KEY = 'prompt-choice'

/** Un prompt personnel, tel qu'enregistré : le corps garde ses marqueurs de variantes (« ## @create »). */
export interface CustomPrompt {
  id: string
  title: string
  /** Groupe où il est rangé (« Mes prompts » par défaut). */
  group?: string
  description?: string
  tasks?: Task[]
  placeholder?: string
  source: string
  updatedAt?: string
}

export interface PromptLibrarySettings {
  version: 1
  custom: CustomPrompt[]
  /** Collections partagées affichées ; null : celles de la langue de l'interface. */
  enabled: string[] | null
}

const EMPTY: PromptLibrarySettings = { version: 1, custom: [], enabled: null }

export const promptLibraryAtom = atom<PromptLibrarySettings>('promptLibrary', EMPTY)
/** Erreur de la dernière sauvegarde (affichée dans la bibliothèque). */
export const promptLibraryErrorAtom = atom<string | null>('promptLibraryError', null)
/** Boîte « Bibliothèque de prompts » ouverte. */
export const promptLibraryOpenAtom = atom<boolean>('promptLibraryOpen', false)

function normalize(value: unknown): PromptLibrarySettings {
  if (!value || typeof value !== 'object') return EMPTY
  const v = value as Partial<PromptLibrarySettings>
  const custom = Array.isArray(v.custom)
    ? v.custom.filter((p): p is CustomPrompt => !!p && typeof p.id === 'string' && typeof p.title === 'string' && typeof p.source === 'string')
    : []
  const enabled = Array.isArray(v.enabled) ? v.enabled.filter((c): c is string => typeof c === 'string') : null
  return { version: 1, custom, enabled }
}

/** Charge les réglages de la bibliothèque (copie locale si le stockage est injoignable). */
export async function loadPromptLibrary(store: SettingsStore) {
  try {
    const value = normalize(await store.get(SETTING_KEY))
    promptLibraryAtom.set(value)
    writeLocal(CACHE_KEY, value)
  } catch {
    promptLibraryAtom.set(normalize(readLocal(CACHE_KEY)))
  }
}

export async function savePromptLibrary(store: SettingsStore, next: PromptLibrarySettings) {
  promptLibraryAtom.set(next)
  writeLocal(CACHE_KEY, next)
  try {
    await store.set(SETTING_KEY, next)
    promptLibraryErrorAtom.set(null)
  } catch (e) {
    promptLibraryErrorAtom.set(e instanceof Error ? e.message : String(e))
  }
}

function readLocal(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // stockage indisponible
  }
}

// ---------- Collections ----------

/** Langue d'une collection : la sienne, sinon celle de son parent. */
export function collectionLang(id: string, collections = SHARED_LIBRARY.collections): string | undefined {
  for (let path = id; path; path = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '') {
    const lang = collections.find((c) => c.id === path)?.lang
    if (lang) return lang
  }
  return undefined
}

/** Collections affichées par défaut : celles de la langue de l'interface, ou sans langue. */
export function defaultEnabled(locale: string = clientLocale()): string[] {
  return SHARED_LIBRARY.collections.filter((c) => {
    const lang = collectionLang(c.id)
    return !lang || lang === locale
  }).map((c) => c.id)
}

export function enabledCollections(settings: PromptLibrarySettings): Set<string> {
  return new Set(settings.enabled ?? defaultEnabled())
}

// ---------- Prompts proposés ----------

/** Préfixe des identifiants et des groupes de prompts personnels. */
export const CUSTOM_PREFIX = 'custom:'

/** Un prompt personnel, lu comme un prompt partagé. */
export function customTemplate(prompt: CustomPrompt, defaultGroup: string): PromptTemplate {
  const { body, variants } = parseBody(prompt.source)
  return {
    id: prompt.id,
    collection: `${CUSTOM_PREFIX}${prompt.group?.trim() || defaultGroup}`,
    title: prompt.title,
    ...(prompt.description && { description: prompt.description }),
    ...(prompt.tasks?.length && { tasks: prompt.tasks.filter((t) => (TASKS as readonly string[]).includes(t)) }),
    ...(prompt.placeholder && { placeholder: prompt.placeholder }),
    body,
    variants,
  }
}

export interface PromptGroup {
  /** Identifiant de la collection (« custom:… » pour un groupe de prompts personnels). */
  id: string
  title: string
  prompts: PromptTemplate[]
}

/** Titre d'une collection partagée, avec celui de ses parents (« Philosophie › Dissertation (bac) »). */
export function collectionTitle(id: string, collections: PromptCollection[] = SHARED_LIBRARY.collections) {
  const parts = id.split('/')
  return parts.map((_, i) => collections.find((c) => c.id === parts.slice(0, i + 1).join('/'))?.title ?? parts[i]).join(' › ')
}

/** Prompts proposés pour une tâche, par groupe : les personnels d'abord, puis les collections affichées. */
export function promptGroups(settings: PromptLibrarySettings, task: PromptTask, defaultGroup: string): PromptGroup[] {
  const groups = new Map<string, PromptGroup>()
  const add = (template: PromptTemplate, title: string) => {
    if (!offersTask(template, task)) return
    const group = groups.get(template.collection) ?? { id: template.collection, title, prompts: [] }
    group.prompts.push(template)
    groups.set(template.collection, group)
  }
  for (const p of [...settings.custom].sort((a, b) => a.title.localeCompare(b.title))) {
    const template = customTemplate(p, defaultGroup)
    add(template, template.collection.slice(CUSTOM_PREFIX.length))
  }
  const enabled = enabledCollections(settings)
  for (const p of SHARED_LIBRARY.prompts) if (enabled.has(p.collection)) add(p, collectionTitle(p.collection))
  return [...groups.values()]
}

/** Un prompt par son identifiant (personnel ou partagé), s'il existe encore. */
export function findPrompt(settings: PromptLibrarySettings, id: string, defaultGroup: string): PromptTemplate | undefined {
  const custom = settings.custom.find((p) => p.id === id)
  if (custom) return customTemplate(custom, defaultGroup)
  return SHARED_LIBRARY.prompts.find((p) => p.id === id)
}

// ---------- Dernier choix, par tâche (sur cet appareil) ----------

export function readPromptChoice(task: PromptTask): string {
  const all = readLocal(CHOICE_KEY) as Record<string, string> | null
  return (all && typeof all[task] === 'string' && all[task]) || ''
}

export function writePromptChoice(task: PromptTask, id: string) {
  const all = { ...((readLocal(CHOICE_KEY) as Record<string, string> | null) ?? {}) }
  if (id) all[task] = id
  else delete all[task]
  writeLocal(CHOICE_KEY, all)
}

export function newPromptId() {
  return `${CUSTOM_PREFIX}${crypto.randomUUID()}`
}
