// Appel d'un modèle par l'API « chat completions » compatible OpenAI (OpenRouter, Ollama, LM Studio,
// llama.cpp, OpenAI…), en flux (SSE) : le texte arrive au fur et à mesure. Sans dépendance, pour le
// navigateur comme pour le serveur ; `fetch` est injectable (tests).

import { AiError, errorFromResponse } from './errors'

/** Partie d'un message multimodal : texte, image, ou fichier (PDF), en « data: » URI. */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentPart[]
}

/** Réflexion du modèle (raisonnement) : celle du modèle par défaut, coupée, ou d'un niveau donné. */
export const REASONING_EFFORTS = ['default', 'off', 'low', 'medium', 'high'] as const
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number]

/**
 * Champs de la demande pour un niveau de réflexion. OpenRouter : `reasoning` ({ enabled: false }
 * coupe la réflexion des modèles qui réfléchissent d'eux-mêmes). Autres serveurs compatibles
 * OpenAI : `reasoning_effort` (ignoré par ceux qui ne le connaissent pas ; « off » n'y a pas d'équivalent).
 */
export function reasoningParams(baseUrl: string, effort: ReasoningEffort | undefined): Record<string, unknown> {
  if (!effort || effort === 'default') return {}
  if (isOpenRouter(baseUrl)) return { reasoning: effort === 'off' ? { enabled: false } : { enabled: true, effort } }
  return effort === 'off' ? {} : { reasoning_effort: effort }
}

/** Jetons en plus à prévoir pour la réflexion (elle se décompte du même plafond que la réponse). */
export const REASONING_HEADROOM: Record<ReasoningEffort, number> = { default: 0, off: 0, low: 2000, medium: 5000, high: 10000 }

export interface ChatRequest {
  /** Adresse de l'API, jusqu'à /v1 compris (ex. : https://openrouter.ai/api/v1, http://localhost:11434/v1). */
  baseUrl: string
  apiKey?: string
  model: string
  messages: ChatMessage[]
  /** Demande une réponse JSON (response_format json_object), si le serveur l'accepte. */
  jsonMode?: boolean
  maxTokens?: number
  temperature?: number
  /** En-têtes en plus (OpenRouter : HTTP-Referer, X-Title). */
  headers?: Record<string, string>
  /** Champs en plus dans le corps (OpenRouter : plugins). */
  extraBody?: Record<string, unknown>
  /** Niveau de réflexion du modèle. */
  reasoning?: ReasoningEffort
  signal?: AbortSignal
  fetch?: typeof fetch
}

export interface ChatUsage {
  promptTokens?: number
  completionTokens?: number
  /** Coût en dollars, quand le fournisseur le donne (OpenRouter). */
  cost?: number
}

export interface ChatResult {
  text: string
  model?: string
  usage?: ChatUsage
}

export const isOpenRouter = (baseUrl: string) => /(^|\.)openrouter\.ai(\/|$)/.test(baseUrl.replace(/^https?:\/\//, ''))

/** Ouvre la réponse en flux du fournisseur (sans la lire) ; erreur HTTP → AiError. */
export async function openChatStream(req: ChatRequest): Promise<Response> {
  const body = {
    model: req.model,
    messages: req.messages,
    stream: true,
    stream_options: { include_usage: true },
    ...(req.maxTokens && { max_tokens: req.maxTokens }),
    ...(req.temperature !== undefined && { temperature: req.temperature }),
    ...(req.jsonMode && { response_format: { type: 'json_object' } }),
    // OpenRouter : coût de l'appel dans le dernier fragment.
    ...(isOpenRouter(req.baseUrl) && { usage: { include: true } }),
    ...reasoningParams(req.baseUrl, req.reasoning),
    ...req.extraBody,
  }
  const res = await (req.fetch ?? fetch)(`${req.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(req.apiKey && { Authorization: `Bearer ${req.apiKey}` }),
      ...req.headers,
    },
    body: JSON.stringify(body),
    signal: req.signal,
  })
  if (!res.ok) throw await errorFromResponse(res)
  return res
}

/**
 * Lit une réponse en flux (SSE « data: {…} », ou JSON d'un bloc si le serveur ignore le flux).
 * `onText` reçoit le texte reçu jusque-là.
 */
export async function readChatStream(res: Response, onText?: (text: string) => void): Promise<ChatResult> {
  const type = res.headers.get('content-type') ?? ''
  if (type.includes('application/json')) {
    const json = (await res.json()) as ChunkJson
    const text = json.choices?.[0]?.message?.content ?? ''
    onText?.(text)
    return { text, model: json.model, usage: usageOf(json.usage) }
  }
  const reader = res.body?.getReader()
  if (!reader) throw new AiError('empty')
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  let model: string | undefined
  let usage: ChatUsage | undefined
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const raw of lines) {
      const line = raw.trim()
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') continue
      let chunk: ChunkJson
      try {
        chunk = JSON.parse(data)
      } catch {
        continue
      }
      // Erreur signalée en cours de flux (OpenRouter).
      if (chunk.error) throw new AiError('server', typeof chunk.error === 'string' ? chunk.error : chunk.error.message)
      const delta = chunk.choices?.[0]?.delta?.content
      if (delta) {
        text += delta
        onText?.(text)
      }
      model ??= chunk.model
      if (chunk.usage) usage = usageOf(chunk.usage)
    }
  }
  return { text, model, usage }
}

/** Appel complet : envoi, lecture du flux. */
export async function chat(req: ChatRequest, onText?: (text: string) => void): Promise<ChatResult> {
  const result = await readChatStream(await openChatStream(req), onText)
  if (!result.text.trim()) throw new AiError('empty')
  return result
}

interface ChunkJson {
  model?: string
  choices?: { delta?: { content?: string }; message?: { content?: string } }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
  error?: string | { message?: string }
}

function usageOf(u: ChunkJson['usage']): ChatUsage | undefined {
  if (!u) return undefined
  return { promptTokens: u.prompt_tokens, completionTokens: u.completion_tokens, ...(typeof u.cost === 'number' && { cost: u.cost }) }
}
