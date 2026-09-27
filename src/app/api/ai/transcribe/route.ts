import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isOpenRouter, openChatStream } from '@/lib/ai/chat'
import { toAiError, type AiErrorKind } from '@/lib/ai/errors'
import { TRANSCRIPTION_MODEL } from '@/lib/ai/models'
import { OPENROUTER_PDF_PLUGIN, transcriptionMessages } from '@/lib/ai/transcribe'
import { allowAiRequest, serverAiAvailable, serverAiConfig } from '@/lib/server/ai'

// Transcription d'une photo ou d'un PDF scanné par l'IA de l'instance (modèle multimodal du
// catalogue, src/lib/ai/models.json). Le serveur construit lui-même la demande et relaie le flux.

export const maxDuration = 120

/** Fichier de 3 Mo au plus : en base64, un tiers de plus (sous la limite de 4,5 Mo de Vercel). */
const MAX_DATA_URI = 4_200_000
const TYPES = /^data:(image\/(jpeg|png|webp|gif)|application\/pdf);base64,/

const BodySchema = z.object({
  file: z.object({ name: z.string().min(1).max(255), type: z.string().max(100), dataUri: z.string().max(MAX_DATA_URI).regex(TYPES) }),
})

const fail = (kind: AiErrorKind, status: number, message?: string) => NextResponse.json({ kind, message }, { status })

/** POST : { file: { name, type, dataUri } } → flux SSE compatible OpenAI. */
export async function POST(request: Request) {
  const config = serverAiConfig()
  if (!config || !serverAiAvailable()) return fail('unavailable', 404)
  if (!(await allowAiRequest(request))) return fail('rate_limit', 429, 'Limit of AI requests reached for this instance.')
  const raw = await request.text()
  if (raw.length > MAX_DATA_URI + 2000) return fail('context', 413, 'File too large.')
  let body: z.infer<typeof BodySchema>
  try {
    body = BodySchema.parse(JSON.parse(raw))
  } catch (e) {
    return fail('server', 400, e instanceof Error ? e.message.slice(0, 500) : 'Invalid request.')
  }
  const openRouter = isOpenRouter(config.baseUrl)
  try {
    const upstream = await openChatStream({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: openRouter ? TRANSCRIPTION_MODEL : config.model,
      messages: transcriptionMessages(body.file),
      // Transcrire ne se réfléchit pas.
      reasoning: 'off',
      jsonMode: config.jsonMode,
      maxTokens: config.maxTokens,
      headers: { 'HTTP-Referer': process.env.SITE_URL || 'https://unveilboard.com', 'X-Title': 'Unveilboard' },
      ...(openRouter && body.file.type === 'application/pdf' && { extraBody: OPENROUTER_PDF_PLUGIN }),
      signal: request.signal,
    })
    return new Response(upstream.body, {
      headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'text/event-stream', 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    const error = toAiError(e)
    if (error.kind === 'auth') return fail('unavailable', 502, error.detail)
    const status = { credits: 402, rate_limit: 429, context: 413, aborted: 499 }[error.kind as string] ?? 502
    return fail(error.kind, status, error.detail)
  }
}
