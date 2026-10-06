import { NextResponse } from 'next/server'
import { z } from 'zod'
import { REASONING_EFFORTS, REASONING_HEADROOM, openChatStream } from '@/lib/ai/chat'
import { toAiError, type AiErrorKind } from '@/lib/ai/errors'
import { PromptInputSchema } from '@/lib/ai/prompts'
import { promptMessages } from '@/lib/ai/run'
import { allowAiRequest, serverAiAvailable, serverAiConfig, serverModels } from '@/lib/server/ai'

// IA de l'instance, par tâche : le serveur reçoit la demande (tâche, consigne, schéma, vocabulaire),
// construit lui-même la consigne et relaie le flux du fournisseur. Ce n'est pas un relais de
// conversation générique : on ne peut pas s'en servir pour autre chose que les tâches de l'app.
// La conversation de l'onglet Chat (« chat ») garde la consigne de l'app en message système, et
// ses messages précédents sont plafonnés (MAX_CHAT_HISTORY, taille de chacun).

// Une génération de schéma peut prendre plus d'une minute.
export const maxDuration = 300

const MAX_BODY = 2_000_000

const BodySchema = z.object({
  input: PromptInputSchema,
  /** Modèle choisi par l'utilisateur, parmi ceux permis (serverModels). */
  model: z.string().max(200).optional(),
  /** Réflexion du modèle choisie par l'utilisateur. */
  reasoning: z.enum(REASONING_EFFORTS).optional(),
  repair: z.object({ answer: z.string().max(400_000), problems: z.array(z.string().max(1000)).max(40) }).optional(),
})

const fail = (kind: AiErrorKind, status: number, message?: string) => NextResponse.json({ kind, message }, { status })

/** POST : { input, repair? } → flux SSE compatible OpenAI (chat completions). */
export async function POST(request: Request) {
  const config = serverAiConfig()
  if (!config || !serverAiAvailable()) return fail('unavailable', 404)
  if (!(await allowAiRequest(request))) return fail('rate_limit', 429, 'Limit of AI requests reached for this instance.')

  const raw = await request.text()
  if (raw.length > MAX_BODY) return fail('context', 413, 'Request too large.')
  let body: z.infer<typeof BodySchema>
  try {
    body = BodySchema.parse(JSON.parse(raw))
  } catch (e) {
    return fail('server', 400, e instanceof Error ? e.message.slice(0, 500) : 'Invalid request.')
  }

  const model = body.model ?? config.model
  if (!serverModels(config).includes(model)) return fail('model', 400, `Model not allowed on this instance: ${model}`)
  try {
    const upstream = await openChatStream({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model,
      messages: promptMessages(body.input, body.repair),
      jsonMode: config.jsonMode,
      reasoning: body.reasoning,
      maxTokens: config.maxTokens + REASONING_HEADROOM[body.reasoning ?? 'default'],
      headers: { 'HTTP-Referer': process.env.SITE_URL || 'https://unveilboard.com', 'X-Title': 'Unveilboard' },
      signal: request.signal,
    })
    return new Response(upstream.body, {
      headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'text/event-stream', 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    const error = toAiError(e)
    // Clé de l'instance refusée : un problème de configuration, pas de l'utilisateur.
    if (error.kind === 'auth') return fail('unavailable', 502, error.detail)
    const status = { credits: 402, rate_limit: 429, context: 413, aborted: 499 }[error.kind as string] ?? 502
    return fail(error.kind, status, error.detail)
  }
}
