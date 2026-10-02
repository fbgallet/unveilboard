// Fournisseur « ChatGPT » (application de bureau) : l'IA utilise le forfait ChatGPT de l'utilisateur.
// Les jetons restent dans le processus principal d'Electron (desktop/chatgpt.js) ; ici, on prépare la
// demande à l'API Responses, on lit le flux qu'il relaie, et on classe les erreurs.
// Règles de cette route (documentation d'OpenAI, « Preview limitations ») : `store: false` et
// `stream: true` (posés par le processus principal), consignes système dans `instructions`, ni
// `temperature` ni `max_output_tokens`.

import { atom } from 'tldraw'
import { readWithin, type ChatMessage, type ChatResult, type ContentPart, type ReasoningEffort } from './chat'
import { AiError, kindFromStatus, type AiErrorKind } from './errors'
import type { ChatGptState } from '../desktop'

/** Réglages d'usage du forfait dans ChatGPT (lien « Gérer l'usage », exigé par OpenAI). */
export const CHATGPT_USAGE_URL = 'https://chatgpt.com/settings/usage'

/** Les modèles qui réfléchissent longtemps n'envoient rien pendant ce temps : silence toléré plus long. */
const CHATGPT_STALL_MS = 180_000

export interface ChatGptModel {
  slug: string
  displayName: string
}

export const chatGptStateAtom = atom<ChatGptState | null>('chatGptState', null)

const bridge = () => (typeof window === 'undefined' ? undefined : window.unveilboardDesktop?.chatgpt)

/** Fournisseur disponible : dans l'application de bureau seulement. */
export const chatGptAvailable = () => !!bridge()

let watching = false

/** Suit l'état de la connexion (changements poussés par le processus principal). */
export async function initChatGpt() {
  const b = bridge()
  if (!b) return
  if (!watching) {
    watching = true
    b.onState((state) => chatGptStateAtom.set(state))
  }
  chatGptStateAtom.set(await b.state())
}

export async function signInChatGpt(options?: { newAccount?: boolean; consent?: boolean }) {
  const b = bridge()
  if (b) chatGptStateAtom.set(await b.signIn(options))
}

export async function cancelChatGptSignIn() {
  const b = bridge()
  if (b) chatGptStateAtom.set(await b.cancelSignIn())
}

/** Déconnexion ; `revoked` : session révoquée chez OpenAI (sinon, à retirer dans les réglages de ChatGPT). */
export async function signOutChatGpt(): Promise<boolean> {
  const b = bridge()
  if (!b) return true
  const { state, revoked } = await b.signOut()
  chatGptStateAtom.set(state)
  return revoked
}

export async function listChatGptModels(): Promise<ChatGptModel[]> {
  const b = bridge()
  if (!b) throw new AiError('unavailable')
  const reply = await b.models()
  if (!reply.ok) throw bridgeError(reply.error)
  return reply.models
}

// ---------- Demande ----------

/** Corps d'une demande à l'API Responses, d'après des messages au format « chat completions ». */
export function responsesBody(model: string, messages: ChatMessage[], reasoning?: ReasoningEffort): Record<string, unknown> {
  const instructions = messages
    .filter((m) => m.role === 'system')
    .map((m) => textOf(m.content))
    .join('\n\n')
  const input = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : m.content.map((p) => partOf(p, m.role)) }))
  return { model, input, ...(instructions && { instructions }), ...reasoningOf(reasoning) }
}

const textOf = (content: ChatMessage['content']) =>
  typeof content === 'string' ? content : content.map((p) => (p.type === 'text' ? p.text : '')).join('')

function partOf(part: ContentPart, role: ChatMessage['role']) {
  if (part.type === 'image_url') return { type: 'input_image', image_url: part.image_url.url }
  if (part.type === 'file') return { type: 'input_file', filename: part.file.filename, file_data: part.file.file_data }
  return { type: role === 'assistant' ? 'output_text' : 'input_text', text: part.text }
}

/** Niveau de réflexion ; « off » et « par défaut » : celui du modèle ; « max » devient « xhigh ». */
function reasoningOf(effort?: ReasoningEffort) {
  if (!effort || effort === 'default' || effort === 'off') return {}
  return { reasoning: { effort: effort === 'max' ? 'xhigh' : effort } }
}

/** Appel complet par le processus principal : envoi, lecture du flux relayé. */
export async function chatGptChat(
  req: { model: string; messages: ChatMessage[]; reasoning?: ReasoningEffort; signal?: AbortSignal },
  onText?: (text: string, thinking: number) => void
): Promise<ChatResult> {
  const b = bridge()
  if (!b) throw new AiError('unavailable')
  const id = crypto.randomUUID()
  const encoder = new TextEncoder()
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const stream = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) })
  const off = b.onChunk((chunkId, text) => {
    if (chunkId === id) controller.enqueue(encoder.encode(text))
  })
  const abort = () => void b.abort(id)
  req.signal?.addEventListener('abort', abort, { once: true })
  const reading = readResponsesStream(new Response(stream), onText)
  reading.catch(() => {})
  try {
    const reply = await b.request(id, responsesBody(req.model, req.messages, req.reasoning))
    if (reply.ok) controller.close()
    else controller.error(reply.error ? bridgeError(reply.error) : chatGptError(reply.status ?? 0, reply.body ?? ''))
    const result = await reading
    if (!result.text.trim()) throw new AiError('empty')
    return result
  } finally {
    off()
    req.signal?.removeEventListener('abort', abort)
  }
}

// ---------- Flux ----------

interface ResponsesEvent {
  type?: string
  delta?: string
  code?: string
  message?: string
  error?: { code?: string; message?: string }
  response?: {
    model?: string
    usage?: { input_tokens?: number; output_tokens?: number }
    error?: { code?: string; message?: string } | null
    incomplete_details?: { reason?: string } | null
  }
}

/**
 * Lit le flux de l'API Responses (événements SSE). Réussite seulement sur `response.completed` ;
 * `response.incomplete` (plafond de jetons → « length »), `response.failed`, `error`, ou un flux coupé
 * avant la fin (« interrupted ») sont des échecs.
 */
export async function readResponsesStream(res: Response, onText?: (text: string, thinking: number) => void): Promise<ChatResult> {
  const reader = res.body?.getReader()
  if (!reader) throw new AiError('empty')
  const decoder = new TextDecoder()
  let buffer = ''
  let data: string[] = []
  let text = ''
  let thinking = 0
  let result: ChatResult | undefined

  const dispatch = () => {
    const payload = data.join('\n')
    data = []
    if (!payload || payload === '[DONE]') return
    let event: ResponsesEvent
    try {
      event = JSON.parse(payload)
    } catch {
      return
    }
    switch (event.type) {
      case 'response.output_text.delta':
        text += event.delta ?? ''
        onText?.(text, thinking)
        break
      case 'response.reasoning_summary_text.delta':
      case 'response.reasoning_text.delta':
        thinking += event.delta?.length ?? 0
        onText?.(text, thinking)
        break
      case 'response.completed': {
        const usage = event.response?.usage
        result = {
          text,
          model: event.response?.model,
          ...(usage && { usage: { promptTokens: usage.input_tokens, completionTokens: usage.output_tokens } }),
        }
        break
      }
      case 'response.incomplete':
        throw new AiError(event.response?.incomplete_details?.reason === 'max_output_tokens' ? 'length' : 'interrupted', event.response?.incomplete_details?.reason)
      case 'response.failed':
        throw errorOfCode(event.response?.error?.code, event.response?.error?.message, 0)
      case 'error':
        throw errorOfCode(event.code ?? event.error?.code, event.message ?? event.error?.message, 0)
    }
  }

  for (;;) {
    const { value, done } = await readWithin(reader, CHATGPT_STALL_MS)
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line === '') dispatch()
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
    }
    if (result) break
  }
  if (buffer.startsWith('data:')) data.push(buffer.slice(5).replace(/^ /, ''))
  dispatch()
  if (!result) throw new AiError('interrupted')
  return result
}

// ---------- Erreurs ----------

/** Codes d'erreur propres à l'usage du forfait (documentation d'OpenAI, « Errors and recovery »). */
const CODE_KINDS: Record<string, AiErrorKind> = {
  subscription_sharing_usage_limit_exceeded: 'usage_limit',
  subscription_sharing_user_not_eligible: 'not_eligible',
  subscription_sharing_invalid_user: 'signin',
  subscription_sharing_usage_unavailable: 'server',
  subscription_sharing_user_unavailable: 'server',
  subscription_sharing_route_not_supported: 'server',
  chatpass_v2_scope_not_authorized: 'signin',
  chatpass_v2_invalid_authorization_context: 'signin',
  model_not_found: 'model',
  context_length_exceeded: 'context',
}

function errorOfCode(code: string | undefined, message: string | undefined, status: number): AiError {
  const detail = [code, message].filter(Boolean).join(' : ').slice(0, 500) || undefined
  if (code && CODE_KINDS[code]) return new AiError(CODE_KINDS[code], detail)
  // Modèle ou option refusés pour cette route : le paramètre en cause est dans le message.
  if (code === 'subscription_sharing_unsupported_capability') return new AiError(/model/i.test(message ?? '') ? 'model' : 'server', detail)
  if (status === 401) return new AiError('signin', detail)
  return new AiError(status ? kindFromStatus(status, message) : 'server', detail)
}

/** Réponse HTTP en échec : objet `error` de l'API, ou `{ detail }` avant l'ouverture du flux. */
export function chatGptError(status: number, body: string): AiError {
  let code: string | undefined
  let message: string | undefined = body || undefined
  try {
    const json = JSON.parse(body) as { error?: { code?: string; message?: string } | string; detail?: string; message?: string }
    if (typeof json.error === 'object' && json.error) ({ code, message } = json.error)
    else message = typeof json.error === 'string' ? json.error : (json.detail ?? json.message ?? message)
  } catch {
    // Corps non JSON : gardé comme détail.
  }
  return errorOfCode(code, message, status)
}

/** Erreur signalée par le processus principal (connexion expirée, réseau, arrêt…). */
function bridgeError(error: { code: string; message: string; status?: number }): AiError {
  if (error.code === 'aborted') return new AiError('aborted')
  if (error.code === 'signin') return new AiError('signin', error.message)
  if (error.code === 'network') return new AiError('unreachable', error.message)
  return errorOfCode(error.code, error.message, error.status ?? 0)
}
