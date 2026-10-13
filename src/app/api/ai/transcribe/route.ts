import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isOpenRouter, openChatStream } from '@/lib/ai/chat'
import { toAiError, type AiErrorKind } from '@/lib/ai/errors'
import { TRANSCRIPTION_MODEL } from '@/lib/ai/models'
import { identificationMessages, imageReadingMessages } from '@/lib/ai/imageReading'
import { isLangCode } from '@/lib/ai/language'
import { OPENROUTER_PDF_PLUGIN, transcriptionMessages } from '@/lib/ai/transcribe'
import { allowAiRequest, serverAiAvailable, serverAiConfig, serverModels } from '@/lib/server/ai'

// Transcription d'une photo ou d'un PDF scanné, ou lecture d'une image du schéma, par l'IA de
// l'instance (modèle multimodal du catalogue, src/lib/ai/models.json). Le serveur construit
// lui-même la demande et relaie le flux.

export const maxDuration = 120

/** Fichier de 3 Mo au plus : en base64, un tiers de plus (sous la limite de 4,5 Mo de Vercel). */
const MAX_DATA_URI = 4_200_000
const TYPES = /^data:(image\/(jpeg|png|webp|gif)|application\/pdf);base64,/
const IMAGE_TYPES = /^data:image\/(jpeg|png|webp|gif);base64,/

const BodySchema = z.union([
  z.object({ file: z.object({ name: z.string().min(1).max(255), type: z.string().max(100), dataUri: z.string().max(MAX_DATA_URI).regex(TYPES) }) }),
  /** Image du schéma à lire (ou à identifier), langue de la réponse, et modèle choisi parmi ceux permis. */
  z.object({
    image: z.object({ dataUri: z.string().max(MAX_DATA_URI).regex(IMAGE_TYPES) }),
    lang: z.string().max(20).refine(isLangCode),
    task: z.enum(['read', 'identify']).optional(),
    model: z.string().max(200).optional(),
  }),
])

const fail = (kind: AiErrorKind, status: number, message?: string) => NextResponse.json({ kind, message }, { status })

/** POST : { file: { name, type, dataUri } } ou { image: { dataUri }, lang } → flux SSE compatible OpenAI. */
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
  const chosen = 'image' in body ? body.model : undefined
  if (chosen && !serverModels(config).includes(chosen)) return fail('model', 400, `Model not allowed on this instance: ${chosen}`)
  try {
    const upstream = await openChatStream({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: chosen ?? (openRouter ? TRANSCRIPTION_MODEL : config.model),
      messages:
        'file' in body
          ? transcriptionMessages(body.file)
          : body.task === 'identify'
            ? identificationMessages(body.image.dataUri, body.lang)
            : imageReadingMessages(body.image.dataUri, body.lang),
      // Transcrire ou décrire ne se réfléchit pas ; un modèle choisi garde son réglage (certains
      // exigent de réfléchir).
      reasoning: chosen ? 'default' : 'off',
      jsonMode: config.jsonMode,
      maxTokens: config.maxTokens,
      headers: { 'HTTP-Referer': process.env.SITE_URL || 'https://unveilboard.com', 'X-Title': 'Unveilboard' },
      ...(openRouter && 'file' in body && body.file.type === 'application/pdf' && { extraBody: OPENROUTER_PDF_PLUGIN }),
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
