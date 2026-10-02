import { describe, expect, it } from 'vitest'
import { chatGptError, readResponsesStream, responsesBody } from './chatgpt'
import { AiError } from './errors'

/** Flux SSE de l'API Responses, d'après des événements. */
const sse = (...events: object[]) =>
  new Response(events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join(''), {
    headers: { 'content-type': 'text/event-stream' },
  })

const kindOf = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e instanceof AiError ? e.kind : String(e)
  }
  return 'ok'
}

describe('ChatGPT : demande à l’API Responses', () => {
  it('met les consignes système dans `instructions` et convertit les parties multimodales', () => {
    const body = responsesBody(
      'gpt-x',
      [
        { role: 'system', content: 'Réponds en JSON.' },
        { role: 'user', content: [{ type: 'text', text: 'Transcris.' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AA' } }] },
        { role: 'assistant', content: '{"a":1}' },
        { role: 'user', content: [{ type: 'file', file: { filename: 'a.pdf', file_data: 'data:application/pdf;base64,AA' } }] },
      ],
      'max'
    )
    expect(body).toEqual({
      model: 'gpt-x',
      instructions: 'Réponds en JSON.',
      input: [
        { role: 'user', content: [{ type: 'input_text', text: 'Transcris.' }, { type: 'input_image', image_url: 'data:image/png;base64,AA' }] },
        { role: 'assistant', content: '{"a":1}' },
        { role: 'user', content: [{ type: 'input_file', filename: 'a.pdf', file_data: 'data:application/pdf;base64,AA' }] },
      ],
      reasoning: { effort: 'xhigh' },
    })
    // Ni température ni plafond de jetons : refusés par cette route.
    expect(responsesBody('m', [{ role: 'user', content: 'x' }], 'off')).toEqual({ model: 'm', input: [{ role: 'user', content: 'x' }] })
  })
})

describe('ChatGPT : lecture du flux', () => {
  it('assemble le texte et lit l’usage à la fin', async () => {
    const seen: string[] = []
    const result = await readResponsesStream(
      sse(
        { type: 'response.created' },
        { type: 'response.output_text.delta', delta: '{"ok":' },
        { type: 'response.output_text.delta', delta: ' true}' },
        { type: 'response.completed', response: { model: 'gpt-x', usage: { input_tokens: 12, output_tokens: 5 } } }
      ),
      (text) => seen.push(text)
    )
    expect(result).toEqual({ text: '{"ok": true}', model: 'gpt-x', usage: { promptTokens: 12, completionTokens: 5 } })
    expect(seen.at(-1)).toBe('{"ok": true}')
  })

  it('distingue la réponse tronquée, l’échec et le flux coupé', async () => {
    expect(await kindOf(readResponsesStream(sse({ type: 'response.incomplete', response: { incomplete_details: { reason: 'max_output_tokens' } } })))).toBe('length')
    expect(
      await kindOf(
        readResponsesStream(sse({ type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'limit' } } }))
      )
    ).toBe('usage_limit')
    expect(await kindOf(readResponsesStream(sse({ type: 'response.output_text.delta', delta: 'abc' })))).toBe('interrupted')
  })
})

describe('ChatGPT : erreurs', () => {
  it('classe les codes propres au forfait, et les réponses `{ detail }` avant le flux', () => {
    expect(chatGptError(403, JSON.stringify({ error: { code: 'subscription_sharing_user_not_eligible', message: 'no' } })).kind).toBe('not_eligible')
    expect(chatGptError(429, JSON.stringify({ error: { code: 'subscription_sharing_usage_limit_exceeded' } })).kind).toBe('usage_limit')
    expect(chatGptError(400, JSON.stringify({ error: { code: 'subscription_sharing_unsupported_capability', message: 'Unsupported model' } })).kind).toBe('model')
    expect(chatGptError(401, JSON.stringify({ detail: 'Unauthorized' }))).toMatchObject({ kind: 'signin', detail: 'Unauthorized' })
    expect(chatGptError(503, 'Service Unavailable').kind).toBe('server')
  })
})
