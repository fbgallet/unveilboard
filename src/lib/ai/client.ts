// Fournisseur d'IA, côté navigateur. Quatre choix :
// - « clipboard » : aucune IA branchée, on copie la consigne et on colle la réponse (par défaut) ;
// - « server » : l'IA de cette instance (clé côté serveur, route /api/ai) ;
// - « openrouter » : OpenRouter avec la clé de l'utilisateur, appelé directement depuis le navigateur ;
// - « custom » : tout serveur compatible OpenAI (Ollama, LM Studio, llama.cpp…), local ou distant.
//
// Réglages et clé restent sur cet appareil (localStorage, ou sessionStorage pour une clé à ne pas
// retenir) : jamais dans le document, ni dans les réglages synchronisés, ni sur le serveur.

import { atom } from 'tldraw'
import { extractJson } from '../map/read'
import { REASONING_EFFORTS, chat, readChatStream, type ChatResult, type ReasoningEffort } from './chat'
import { AiError, errorFromResponse, toAiError, type AiErrorKind } from './errors'
import { buildPrompt, type PromptInput } from './prompts'
import { chatMessages, runWithRepair, type AiRun, type Repair } from './run'
import { DEFAULT_MODEL, TRANSCRIPTION_MODEL } from './models'
import { OPENROUTER_PDF_PLUGIN, readTranscription, transcriptionMessages } from './transcribe'
import type { MapIssue } from '../map/check'

export const PROVIDERS = ['clipboard', 'server', 'openrouter', 'custom'] as const
export type ProviderKind = (typeof PROVIDERS)[number]

export interface AiSettings {
  kind: ProviderKind
  /** IA de l'instance : modèle choisi parmi ceux qu'elle permet (vide : le sien). */
  serverModel: string
  /** OpenRouter : modèle choisi. */
  openrouterModel: string
  /** Serveur compatible OpenAI : adresse (jusqu'à /v1), modèle, réponse JSON forcée. */
  customUrl: string
  customModel: string
  customJsonMode: boolean
  /** Réflexion du modèle (tous les fournisseurs ne l'acceptent pas). */
  reasoning: ReasoningEffort
}

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1'
export const DEFAULT_AI_SETTINGS: AiSettings = {
  kind: 'clipboard',
  serverModel: '',
  openrouterModel: DEFAULT_MODEL,
  customUrl: 'http://localhost:11434/v1',
  customModel: '',
  customJsonMode: false,
  reasoning: 'default',
}

export interface ServerAi {
  /** Modèle par défaut. */
  model: string
  /** Modèles permis. */
  models: string[]
}

/** IA de l'instance (null : aucune), transmise par la page. */
export const serverAiAtom = atom<ServerAi | null>('serverAi', null)
export const aiSettingsAtom = atom<AiSettings>('aiSettings', DEFAULT_AI_SETTINGS)

const SETTINGS_KEY = 'ai-settings'
const KEY_KEY = 'ai-key'

/**
 * Réglages de cet appareil. Sans réglage enregistré, l'IA de l'instance quand elle en a une (sa clé
 * reste sur le serveur : rien à saisir), sinon le copier-coller.
 */
export function loadAiSettings(server: ServerAi | null = null) {
  const fallback: AiSettings = { ...DEFAULT_AI_SETTINGS, kind: server ? 'server' : 'clipboard' }
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') as Partial<AiSettings> | null
    const next = { ...fallback, ...raw }
    if (!PROVIDERS.includes(next.kind)) next.kind = fallback.kind
    if (!REASONING_EFFORTS.includes(next.reasoning)) next.reasoning = 'default'
    aiSettingsAtom.set(next)
  } catch {
    aiSettingsAtom.set(fallback)
  }
}

export function saveAiSettings(next: AiSettings) {
  aiSettingsAtom.set(next)
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
  } catch {
    // stockage indisponible : réglages le temps de la séance
  }
}

/** Clé de l'utilisateur pour un fournisseur (openrouter, custom). */
export function readKey(kind: 'openrouter' | 'custom'): string {
  try {
    return sessionStorage.getItem(`${KEY_KEY}:${kind}`) ?? localStorage.getItem(`${KEY_KEY}:${kind}`) ?? ''
  } catch {
    return ''
  }
}

export function isKeyRemembered(kind: 'openrouter' | 'custom') {
  try {
    return !!localStorage.getItem(`${KEY_KEY}:${kind}`)
  } catch {
    return false
  }
}

/** Enregistre la clé : sur cet appareil (remember), ou le temps de la séance. Vide : effacée. */
export function writeKey(kind: 'openrouter' | 'custom', key: string, remember: boolean) {
  try {
    localStorage.removeItem(`${KEY_KEY}:${kind}`)
    sessionStorage.removeItem(`${KEY_KEY}:${kind}`)
    if (key) (remember ? localStorage : sessionStorage).setItem(`${KEY_KEY}:${kind}`, key.trim())
  } catch {
    // stockage indisponible
  }
}

/** Fournisseur prêt à l'emploi (sinon : copier-coller). */
export function isAiReady(settings: AiSettings, server: ServerAi | null) {
  switch (settings.kind) {
    case 'server':
      return !!server
    case 'openrouter':
      return !!readKey('openrouter') && !!settings.openrouterModel.trim()
    case 'custom':
      return !!settings.customUrl.trim() && !!settings.customModel.trim()
    default:
      return false
  }
}

/** Nom du modèle utilisé, pour l'afficher. */
export function modelName(settings: AiSettings, server: ServerAi | null) {
  if (settings.kind === 'server') return serverModelOf(settings, server) ?? ''
  if (settings.kind === 'openrouter') return settings.openrouterModel
  if (settings.kind === 'custom') return settings.customModel
  return ''
}

/** Modèle de l'IA de l'instance : celui choisi s'il est permis, sinon celui par défaut. */
function serverModelOf(settings: AiSettings, server: ServerAi | null) {
  return server?.models.includes(settings.serverModel) ? settings.serverModel : server?.model
}

// ---------- Appels ----------

interface CallOptions {
  signal?: AbortSignal
  /** Texte reçu jusque-là, et longueur de la réflexion reçue ; ('', 0) quand on recommence. */
  onText?: (text: string, thinking: number) => void
}

/** Pannes passagères (flux coupé, silence) : on recommence une fois, depuis le début. */
const RETRIED: AiErrorKind[] = ['interrupted', 'timeout']

async function withRetry<T>(call: () => Promise<T>, opts: CallOptions): Promise<T> {
  try {
    return await call()
  } catch (e) {
    const error = toAiError(e)
    if (!RETRIED.includes(error.kind) || opts.signal?.aborted) throw error
    opts.onText?.('', 0)
    return call()
  }
}

/** Un envoi (et au besoin une demande de correction) au fournisseur choisi. */
function sender(settings: AiSettings, input: PromptInput, opts: CallOptions) {
  return (repair?: Repair) => withRetry(() => sendOnce(settings, input, opts, repair), opts)
}

async function sendOnce(settings: AiSettings, input: PromptInput, opts: CallOptions, repair?: Repair): Promise<ChatResult> {
  try {
    if (settings.kind === 'server') {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { ...input, delivery: 'api' },
          model: serverModelOf(settings, serverAiAtom.get()),
          reasoning: settings.reasoning,
          repair,
        }),
        signal: opts.signal,
      })
      if (!res.ok) throw await errorFromResponse(res)
      const result = await readChatStream(res, opts.onText)
      if (!result.text.trim()) throw new AiError('empty')
      return result
    }
    const messages = chatMessages(buildPrompt({ ...input, delivery: 'api' }), repair)
    return await chat({ ...endpoint(settings), messages, reasoning: settings.reasoning, signal: opts.signal }, opts.onText)
  } catch (e) {
    throw toAiError(e)
  }
}

function endpoint(settings: AiSettings) {
  if (settings.kind === 'openrouter') {
    return {
      baseUrl: OPENROUTER_URL,
      apiKey: readKey('openrouter'),
      model: settings.openrouterModel.trim(),
      jsonMode: true,
      headers: { 'HTTP-Referer': location.origin, 'X-Title': 'Unveilboard' },
    }
  }
  return {
    baseUrl: settings.customUrl.trim(),
    apiKey: readKey('custom') || undefined,
    model: settings.customModel.trim(),
    jsonMode: settings.customJsonMode,
  }
}

/** Demande à l'IA, avec au plus une demande de correction ; `check` contrôle chaque réponse. */
export function askAi<R extends { ok: boolean; issues: MapIssue[] }>(
  settings: AiSettings,
  input: PromptInput,
  check: (text: string, attempt: number) => R,
  opts: CallOptions = {}
): Promise<AiRun<R>> {
  return runWithRepair(sender(settings, input, opts), check)
}

/**
 * Transcrit une photo ou un PDF scanné avec le fournisseur choisi (OpenRouter : le modèle de
 * transcription du catalogue ; serveur compatible OpenAI : le modèle réglé, s'il lit les images).
 */
export async function transcribeFile(
  settings: AiSettings,
  file: { name: string; type: string; dataUri: string },
  opts: CallOptions = {}
): Promise<{ text: string; reference: string }> {
  try {
    const result = await withRetry(() => transcribeOnce(settings, file, opts), opts)
    return readTranscription(result.text)
  } catch (e) {
    throw toAiError(e)
  }
}

async function transcribeOnce(settings: AiSettings, file: { name: string; type: string; dataUri: string }, opts: CallOptions): Promise<ChatResult> {
  if (settings.kind === 'server') {
    const res = await fetch('/api/ai/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file }),
      signal: opts.signal,
    })
    if (!res.ok) throw await errorFromResponse(res)
    return readChatStream(res, opts.onText)
  }
  const target = endpoint(settings)
  const openRouter = settings.kind === 'openrouter'
  return chat(
    {
      ...target,
      model: openRouter ? TRANSCRIPTION_MODEL : target.model,
      messages: transcriptionMessages(file),
      // Transcrire ne se réfléchit pas (comme dans bac-philo-agent).
      reasoning: 'off',
      ...(openRouter && file.type === 'application/pdf' && { extraBody: OPENROUTER_PDF_PLUGIN }),
      signal: opts.signal,
    },
    opts.onText
  )
}

/** Essai du fournisseur : une demande minuscule, dont la réponse doit être un JSON donné. */
export async function testAi(settings: AiSettings, signal?: AbortSignal): Promise<{ ok: boolean; model?: string; ms: number; text: string }> {
  const started = performance.now()
  const prompt = 'Reply with exactly this JSON object and nothing else: {"ok": true}'
  let result: ChatResult
  try {
    if (settings.kind === 'server') {
      // Pas de route d'essai : la tâche la plus courte, sur un schéma vide.
      result = await sender(settings, { task: 'edit', instruction: prompt, vocabulary: [], lang: 'en', delivery: 'api' }, { signal })()
    } else {
      result = await chat({ ...endpoint(settings), messages: [{ role: 'user', content: prompt }], signal })
    }
  } catch (e) {
    throw toAiError(e)
  }
  const json = extractJson(result.text) as { ok?: unknown } | undefined
  return { ok: settings.kind === 'server' ? !!json : json?.ok === true, model: result.model, ms: Math.round(performance.now() - started), text: result.text }
}

/** Modèles proposés par le serveur (GET /models), triés ; [] si la liste est indisponible. */
export async function listModels(settings: AiSettings): Promise<string[]> {
  const { baseUrl, apiKey } = settings.kind === 'openrouter' ? { baseUrl: OPENROUTER_URL, apiKey: undefined } : endpoint(settings)
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/models`, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} })
    if (!res.ok) return []
    const json = (await res.json()) as { data?: { id?: string }[] }
    return (json.data ?? []).map((m) => m.id).filter((id): id is string => !!id).sort()
  } catch {
    return []
  }
}

// ---------- Connexion à OpenRouter (OAuth PKCE) ----------

const PKCE_KEY = 'openrouter-pkce'
export const OPENROUTER_AUTH_URL = 'https://openrouter.ai/auth'

const base64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

/**
 * Envoie l'utilisateur sur OpenRouter, qui crée une clé pour Unveilboard et revient sur /ai/callback.
 * La clé est échangée dans le navigateur : elle ne passe jamais par le serveur d'Unveilboard.
 */
export async function startOpenRouterLogin(returnTo: string, remember: boolean) {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)))
  const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, returnTo, remember }))
  const url = new URL(OPENROUTER_AUTH_URL)
  url.searchParams.set('callback_url', `${location.origin}/ai/callback`)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  location.assign(url)
}

/** Retour d'OpenRouter : échange le code contre une clé, l'enregistre, renvoie l'adresse de retour. */
export async function finishOpenRouterLogin(code: string): Promise<string> {
  const pending = JSON.parse(sessionStorage.getItem(PKCE_KEY) ?? 'null') as { verifier: string; returnTo: string; remember: boolean } | null
  if (!pending) throw new AiError('auth', 'No sign-in in progress')
  const res = await fetch(`${OPENROUTER_URL}/auth/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: pending.verifier, code_challenge_method: 'S256' }),
  })
  if (!res.ok) throw await errorFromResponse(res)
  const { key } = (await res.json()) as { key?: string }
  if (!key) throw new AiError('auth', 'No key returned')
  sessionStorage.removeItem(PKCE_KEY)
  writeKey('openrouter', key, pending.remember)
  loadAiSettings(serverAiAtom.get())
  saveAiSettings({ ...aiSettingsAtom.get(), kind: 'openrouter' })
  return pending.returnTo
}
