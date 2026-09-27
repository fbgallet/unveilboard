import 'server-only'
import { storageMode } from '@/lib/storageMode'
import { isOpenRouter } from '@/lib/ai/chat'
import { DEFAULT_MODEL, MODELS } from '@/lib/ai/models'
import { kvConfigured } from './kv'
import { withinLimits } from './rateLimit'

// IA de l'instance : une clé côté serveur (OpenRouter, ou tout fournisseur compatible OpenAI).
// - Mode cloud : réservée à la session (proxy.ts protège /api).
// - Mode local (instance publique, sans compte) : seulement avec AI_PUBLIC=on, et des limites par
//   adresse IP ; sinon, n'importe quel visiteur dépenserait le crédit de la clé.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1'
const PUBLIC_LIMITS = { perIpHour: 5, perIpDay: 20, allDay: 300 }

export interface ServerAiConfig {
  baseUrl: string
  apiKey?: string
  model: string
  maxTokens: number
  jsonMode: boolean
}

/** Configuration (variables d'environnement) ; null si l'instance n'a pas d'IA. */
export function serverAiConfig(): ServerAiConfig | null {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.AI_API_KEY || undefined
  const baseUrl = process.env.AI_BASE_URL || (apiKey ? OPENROUTER_URL : '')
  if (!baseUrl) return null
  const model = process.env.AI_MODEL || (isOpenRouter(baseUrl) ? DEFAULT_MODEL : '')
  if (!model) return null
  return {
    baseUrl,
    apiKey,
    model,
    maxTokens: Number(process.env.AI_MAX_TOKENS) || 16000,
    // json_object : accepté par OpenRouter et par la plupart des serveurs ; AI_JSON_MODE=off sinon.
    jsonMode: process.env.AI_JSON_MODE !== 'off',
  }
}

/**
 * Modèles que l'utilisateur peut choisir : celui de la configuration, puis, sur OpenRouter, ceux du
 * catalogue (src/lib/ai/models.json).
 */
export function serverModels(config: ServerAiConfig): string[] {
  return [...new Set([config.model, ...(isOpenRouter(config.baseUrl) ? MODELS.map((m) => m.id) : [])])]
}

/** Ouverte à cette instance : configurée, et en mode cloud ou publique par choix (AI_PUBLIC=on). */
export function serverAiAvailable(): { model: string; models: string[] } | null {
  const config = serverAiConfig()
  if (!config) return null
  if (storageMode() === 'local' && !(process.env.AI_PUBLIC === 'on' && kvConfigured())) return null
  return { model: config.model, models: serverModels(config) }
}

/** Mode local (AI_PUBLIC) : compte une demande de cette adresse ; false si une limite est atteinte. */
export async function allowAiRequest(request: Request) {
  if (storageMode() !== 'local') return true
  return withinLimits(request, 'ai', PUBLIC_LIMITS)
}
