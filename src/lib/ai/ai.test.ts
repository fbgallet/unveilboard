import { describe, expect, it, vi } from 'vitest'
import { defaultPresets } from '../presets/presets'
import { MapSchema } from '../map/format'
import { readJson } from '../map/read'
import { STALL_MS, chat, readChatStream } from './chat'
import { AiError, kindFromStatus, toAiError } from './errors'
import { chatMessages, runWithRepair } from './run'
import truthFr from '../examples/truth.fr.json'

// Aucun appel réseau : `fetch` est remplacé par des réponses fabriquées.

const sse = (chunks: unknown[]) =>
  new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n', {
    headers: { 'content-type': 'text/event-stream' },
  })

function fakeFetch(responses: Response[], seen: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = []) {
  return (async (url: string, init: RequestInit) => {
    seen.push({ url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> })
    return responses.shift()!
  }) as unknown as typeof fetch
}

describe('appel compatible OpenAI', () => {
  it('lit le flux : texte par fragments, modèle, consommation et coût', async () => {
    const texts: string[] = []
    const result = await readChatStream(
      sse([
        { model: 'm1', choices: [{ delta: { content: '{"a"' } }] },
        { choices: [{ delta: { content: ': 1}' } }] },
        { choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.002 } },
      ]),
      (t) => texts.push(t)
    )
    expect(result).toEqual({ text: '{"a": 1}', model: 'm1', usage: { promptTokens: 10, completionTokens: 5, cost: 0.002 } })
    expect(texts).toEqual(['{"a"', '{"a": 1}'])
  })

  it('lit aussi une réponse JSON d’un bloc (serveur qui ignore le flux)', async () => {
    const res = Response.json({ model: 'm', choices: [{ message: { content: 'ok' } }] })
    expect((await readChatStream(res)).text).toBe('ok')
  })

  it('corps de la demande : flux, JSON demandé, coût sur OpenRouter ; clé en en-tête', async () => {
    const seen: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = []
    await chat({
      baseUrl: 'https://openrouter.ai/api/v1/',
      apiKey: 'sk-test',
      model: 'x/y',
      messages: [{ role: 'user', content: 'hi' }],
      jsonMode: true,
      fetch: fakeFetch([sse([{ choices: [{ delta: { content: 'hello' } }] }])], seen),
    })
    expect(seen[0].url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(seen[0].headers.Authorization).toBe('Bearer sk-test')
    expect(seen[0].body).toMatchObject({ model: 'x/y', stream: true, response_format: { type: 'json_object' }, usage: { include: true } })
  })

  it('erreurs classées : clé, crédit, limite, modèle, contexte, réseau, annulation, réponse vide', async () => {
    const fail = (status: number, body: unknown) =>
      chat({ baseUrl: 'http://x/v1', model: 'm', messages: [], fetch: fakeFetch([Response.json(body, { status })]) }).catch((e) => (e as AiError).kind)
    expect(await fail(401, { error: { message: 'bad key' } })).toBe('auth')
    expect(await fail(402, { error: { message: 'no credit' } })).toBe('credits')
    expect(await fail(429, { error: 'slow down' })).toBe('rate_limit')
    expect(await fail(404, { error: { message: 'model not found' } })).toBe('model')
    expect(await fail(400, { error: { message: "This model's maximum context length is 8192 tokens" } })).toBe('context')
    expect(await fail(503, { kind: 'unavailable' })).toBe('unavailable')
    expect(kindFromStatus(500)).toBe('server')
    expect(toAiError(new TypeError('Failed to fetch')).kind).toBe('unreachable')
    expect(toAiError(new DOMException('x', 'AbortError')).kind).toBe('aborted')
    const empty = await chat({ baseUrl: 'http://x/v1', model: 'm', messages: [], fetch: fakeFetch([sse([])]) }).catch((e) => (e as AiError).kind)
    expect(empty).toBe('empty')
  })
})

describe('flux incomplet', () => {
  const stream = (body: string | ReadableStream) => new Response(body, { headers: { 'content-type': 'text/event-stream' } })
  const kindOf = (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e as AiError).kind)

  it('coupé avant la fin (ni finish_reason ni [DONE]) → interrupted', async () => {
    expect(await kindOf(readChatStream(stream(`data: ${JSON.stringify({ choices: [{ delta: { content: '{"a"' } }] })}\n\n`)))).toBe('interrupted')
  })

  it('finish_reason suffit sans [DONE] ; « length » → réponse tronquée refusée', async () => {
    const end = (reason: string) => stream(`data: ${JSON.stringify({ choices: [{ delta: { content: 'x' }, finish_reason: reason }] })}\n\n`)
    expect((await readChatStream(end('stop'))).text).toBe('x')
    expect(await kindOf(readChatStream(end('length')))).toBe('length')
  })

  it('coupure réseau pendant la lecture → interrupted', async () => {
    const broken = new ReadableStream({ pull: (c) => c.error(new TypeError('Network connection lost.')) })
    expect(await kindOf(readChatStream(stream(broken)))).toBe('interrupted')
  })

  it('silence prolongé → timeout', async () => {
    vi.useFakeTimers()
    try {
      const result = kindOf(readChatStream(stream(new ReadableStream())))
      await vi.advanceTimersByTimeAsync(STALL_MS)
      expect(await result).toBe('timeout')
    } finally {
      vi.useRealTimers()
    }
  })

  it('réflexion comptée à part du texte (reasoning, reasoning_content)', async () => {
    const seen: [string, number][] = []
    await readChatStream(
      sse([{ choices: [{ delta: { reasoning: 'hmm' } }] }, { choices: [{ delta: { reasoning_content: '..' } }] }, { choices: [{ delta: { content: 'ok' } }] }]),
      (text, thinking) => seen.push([text, thinking])
    )
    expect(seen).toEqual([['', 3], ['', 5], ['ok', 5]])
  })
})

describe('demande avec correction', () => {
  const presets = defaultPresets({})
  const known = {
    types: presets.filter((p) => p.target === 'shape').map((p) => p.id),
    relations: presets.filter((p) => p.target === 'arrow').map((p) => p.id),
  }
  const map = MapSchema.parse(truthFr)
  const check = (text: string) => readJson(text, known, map)
  const bad = '```json\n{"format": "unveilboard/patch", "version": 1, "operations": [{"op": "update", "id": "nope", "text": "x"}]}\n```'
  const good = '{"format": "unveilboard/patch", "version": 1, "operations": [{"op": "update", "id": "thesis", "text": "x"}]}'

  it('une réponse valide : un seul appel', async () => {
    let calls = 0
    const run = await runWithRepair(async () => {
      calls++
      return { text: good, usage: { promptTokens: 3 } }
    }, check)
    expect(calls).toBe(1)
    expect(run).toMatchObject({ attempts: 1, result: { ok: true, kind: 'patch' } })
  })

  it('une réponse invalide : renvoyée au modèle avec les problèmes, consommation cumulée', async () => {
    const repairs: unknown[] = []
    const answers = [bad, good]
    const run = await runWithRepair(async (repair) => {
      repairs.push(repair)
      return { text: answers.shift()!, usage: { promptTokens: 10, completionTokens: 2, cost: 0.01 } }
    }, check)
    expect(run.attempts).toBe(2)
    expect(run.result.ok).toBe(true)
    expect(run.usage).toEqual({ promptTokens: 20, completionTokens: 4, cost: 0.02 })
    expect(repairs[1]).toEqual({
      answer: bad,
      problems: ['Error: operations[0].id: No element or link has this identifier in the current diagram (nope)'],
    })
    const messages = chatMessages('PROMPT', repairs[1] as { answer: string; problems: string[] })
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(messages[2].content).toContain('No element or link has this identifier')
  })
})

describe('réflexion du modèle', () => {
  it('OpenRouter : reasoning ; autres serveurs : reasoning_effort ; par défaut : rien', async () => {
    const { reasoningParams } = await import('./chat')
    expect(reasoningParams('https://openrouter.ai/api/v1', 'high')).toEqual({ reasoning: { enabled: true, effort: 'high' } })
    expect(reasoningParams('https://openrouter.ai/api/v1', 'off')).toEqual({ reasoning: { enabled: false } })
    expect(reasoningParams('http://localhost:11434/v1', 'low')).toEqual({ reasoning_effort: 'low' })
    expect(reasoningParams('http://localhost:11434/v1', 'off')).toEqual({})
    expect(reasoningParams('https://openrouter.ai/api/v1', 'default')).toEqual({})
  })
})
