import { NextResponse } from 'next/server'
import { z } from 'zod'
import { toAiError, type AiErrorKind } from '@/lib/ai/errors'
import { ASPECT_RATIOS, IMAGE_STYLES, MAX_REFERENCE, MAX_REFERENCES, imageRequestBody, readImageResponse } from '@/lib/ai/imageGen'
import { IMAGE_MODEL, IMAGE_MODELS } from '@/lib/ai/models'
import { allowAiRequest, serverAiAvailable, serverAiConfig } from '@/lib/server/ai'

// Génération d'une image par l'IA de l'instance (OpenRouter, AI_IMAGE=on) : le serveur construit
// lui-même la consigne (src/lib/ai/imageGen.ts), avec ses règles, et renvoie l'image.

export const maxDuration = 180

const BodySchema = z.object({
  request: z.object({
    subject: z.string().min(1).max(4000),
    context: z.string().max(2000).optional(),
    style: z.enum(IMAGE_STYLES),
    styleNote: z.string().max(500).optional(),
    aspect: z.enum(ASPECT_RATIOS),
    references: z
      .array(z.string().max(MAX_REFERENCE).regex(/^data:image\/(jpeg|png|webp);base64,/))
      .max(MAX_REFERENCES)
      .optional(),
    sketch: z.boolean().optional(),
  }),
  /** Modèle choisi, parmi ceux du catalogue. */
  model: z.string().max(200).optional(),
})

const fail = (kind: AiErrorKind, status: number, message?: string) => NextResponse.json({ kind, message }, { status })

/** POST : { request, model? } → { dataUri, cost? } (avec `request.references` : une image modifiée, ou composée). */
export async function POST(request: Request) {
  const config = serverAiConfig()
  if (!config || !serverAiAvailable() || !config.image) return fail('unavailable', 404)
  if (!(await allowAiRequest(request))) return fail('rate_limit', 429, 'Limit of AI requests reached for this instance.')
  let body: z.infer<typeof BodySchema>
  try {
    body = BodySchema.parse(await request.json())
  } catch (e) {
    return fail('server', 400, e instanceof Error ? e.message.slice(0, 500) : 'Invalid request.')
  }
  const model = IMAGE_MODELS.find((m) => m.id === (body.model ?? IMAGE_MODEL))
  if (!model) return fail('model', 400, `Image model not allowed on this instance: ${body.model}`)
  try {
    const res = await fetch(`${config.baseUrl}/images`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey && { Authorization: `Bearer ${config.apiKey}` }),
        'HTTP-Referer': process.env.SITE_URL || 'https://unveilboard.com',
        'X-Title': 'Unveilboard',
      },
      body: JSON.stringify(imageRequestBody(model.id, body.request)),
      signal: request.signal,
    })
    const answer = await res.json().catch(() => ({}))
    if (!res.ok) {
      const kind = res.status === 402 ? 'credits' : res.status === 429 ? 'rate_limit' : 'server'
      return fail(kind, res.status === 401 ? 502 : res.status, (answer as { error?: { message?: string } }).error?.message?.slice(0, 500))
    }
    return NextResponse.json(readImageResponse(answer))
  } catch (e) {
    const error = toAiError(e)
    const status = { aborted: 499, empty: 422 }[error.kind as string] ?? 502
    return fail(error.kind, status, error.detail)
  }
}
