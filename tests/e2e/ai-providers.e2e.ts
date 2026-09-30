import { expect, test, type Page, type Route } from '@playwright/test'

// Fournisseurs d'IA, sans appel réseau réel : un serveur compatible OpenAI simulé (adresse
// interceptée), et une connexion à OpenRouter simulée (OAuth PKCE).

const LOCAL = 'http://127.0.0.1:65531/v1'
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }

type Win = { editor: import('tldraw').Editor }

async function openTruthExample(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /Should we always tell the truth\?/ }).click()
  await page.waitForURL(/\?demo=truth/)
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard && document.querySelector('aside'))
  await page.waitForTimeout(1500)
}

const sse = (text: string) =>
  [
    { model: 'fake-model', choices: [{ delta: { content: text.slice(0, 20) } }] },
    { choices: [{ delta: { content: text.slice(20) } }] },
    { choices: [], usage: { prompt_tokens: 1200, completion_tokens: 80 } },
  ]
    .map((c) => `data: ${JSON.stringify(c)}\n\n`)
    .join('') + 'data: [DONE]\n\n'

/** Serveur simulé : liste des modèles, puis les réponses données, dans l'ordre. */
async function fakeServer(page: Page, answers: string[], bodies: Record<string, unknown>[] = []) {
  await page.route(`${LOCAL}/**`, async (route: Route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (req.url().endsWith('/models')) return route.fulfill({ json: { data: [{ id: 'fake-model' }, { id: 'other' }] }, headers: CORS })
    bodies.push(req.postDataJSON())
    await route.fulfill({ body: sse(answers.shift() ?? ''), headers: { ...CORS, 'content-type': 'text/event-stream' } })
  })
}

test('serveur compatible OpenAI : réglages, essai, demande avec correction, application', async ({ page }) => {
  const bodies: Record<string, unknown>[] = []
  const bad = JSON.stringify({ format: 'unveilboard/patch', version: 1, operations: [{ op: 'add', id: 'o2', text: 'x', parent: 'nope' }] })
  const good = JSON.stringify({
    format: 'unveilboard/patch',
    version: 1,
    summary: 'Une objection de plus.',
    operations: [{ op: 'add', id: 'o2', text: 'A lie can save a life', parent: 'thesis', relation: 'objects' }],
  })
  await fakeServer(page, ['{"ok": true}', bad, `Here it is:\n\`\`\`json\n${good}\n\`\`\``], bodies)
  await openTruthExample(page)

  // Réglages : serveur compatible OpenAI, modèle choisi dans la liste, essai.
  await page.getByTestId('main-menu.button').click()
  await page.getByText('AI settings…').click()
  const settings = page.getByRole('dialog', { name: 'AI settings' })
  await settings.getByRole('radio', { name: /OpenAI-compatible server/ }).check()
  await settings.getByRole('textbox', { name: 'Server address (up to /v1)' }).fill(LOCAL)
  await settings.getByRole('button', { name: 'List the models' }).click()
  await expect(settings.getByText('2 models available')).toBeVisible()
  await settings.getByRole('combobox', { name: 'Model', exact: true }).fill('fake-model')
  await expect(settings.getByText(/OLLAMA_ORIGINS=http:\/\/localhost:\d+/)).toBeVisible()
  await settings.getByRole('button', { name: 'Test' }).click()
  await expect(settings.getByRole('status')).toHaveText(/^It works: fake-model, [\d.]+ s\.$/)
  await page.screenshot({ path: 'test-results/ai-settings.png' })
  await settings.getByRole('button', { name: 'Save' }).click()

  // Demande : la première réponse est fausse, la seconde (après correction) est bonne.
  await page.getByTestId('main-menu.button').click()
  await page.getByText('Create or change the diagram with AI…').click()
  const dialog = page.getByRole('dialog', { name: 'Work with an AI' })
  await expect(dialog.getByText('AI: OpenAI-compatible server (Ollama, LM Studio…) · fake-model')).toBeVisible()
  await dialog.getByRole('button', { name: 'Ask the AI' }).click()
  await expect(dialog.getByText(/^Answer from fake-model in \d+ s: check it below, then apply it\. The first answer had problems/)).toBeVisible()
  await expect(dialog.getByText('Valid changes: 1 element added.')).toBeVisible()
  await expect(dialog.getByText(/2,560 tokens/)).toBeVisible()
  await page.screenshot({ path: 'test-results/ai-answer.png' })
  // Deux demandes : la consigne, puis la correction (réponse précédente et problèmes).
  expect(bodies).toHaveLength(3)
  const repair = bodies[2] as { model: string; messages: { role: string; content: string }[] }
  expect(repair.model).toBe('fake-model')
  expect(repair.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
  expect(repair.messages[0].content).toContain('task: enrich')
  expect(repair.messages[2].content).toContain('elements[id=o2].parent: Parent is not an element of the map')

  await dialog.getByRole('button', { name: 'Apply to this diagram' }).click()
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Win).editor.getCurrentPageShapes().filter((s) => s.type === 'geo').length))
    .toBe(9)
})

test('serveur injoignable : message d’erreur explicite', async ({ page }) => {
  await page.route(`${LOCAL}/**`, (route) => route.abort('connectionrefused'))
  await openTruthExample(page)
  await page.evaluate((url) => {
    localStorage.setItem('ai-settings', JSON.stringify({ kind: 'custom', customUrl: url, customModel: 'm' }))
  }, LOCAL)
  await page.reload()
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard)
  await page.getByTestId('main-menu.button').click()
  await page.getByText('Create or change the diagram with AI…').click()
  const dialog = page.getByRole('dialog', { name: 'Work with an AI' })
  await dialog.getByRole('button', { name: 'Ask the AI' }).click()
  await expect(dialog.getByRole('alert')).toContainText('The AI could not be reached')
})

test('OpenRouter : connexion (PKCE), la clé reste dans le navigateur', async ({ page }) => {
  let exchange: Record<string, unknown> | null = null
  // OpenRouter simulé : la page d'autorisation renvoie aussitôt au site avec un code.
  await page.route('https://openrouter.ai/auth?**', (route) => {
    const url = new URL(route.request().url())
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    const callback = url.searchParams.get('callback_url')!
    return route.fulfill({ status: 302, headers: { location: `${callback}?code=test-code` } })
  })
  await page.route('https://openrouter.ai/api/v1/auth/keys', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    exchange = route.request().postDataJSON()
    return route.fulfill({ json: { key: 'sk-or-test' }, headers: CORS })
  })
  await openTruthExample(page)
  const docUrl = page.url()
  await page.getByTestId('main-menu.button').click()
  await page.getByText('AI settings…').click()
  const settings = page.getByRole('dialog', { name: 'AI settings' })
  await settings.getByRole('radio', { name: /OpenRouter, with your key/ }).check()
  await settings.getByRole('button', { name: 'Sign in with OpenRouter' }).click()
  // Retour sur le schéma, connecté (l'adresse de départ est aussi celle d'arrivée : on attend la clé).
  // Clé non retenue par défaut : le temps de la séance seulement.
  const storedKey = () => page.evaluate(() => sessionStorage.getItem('ai-key:openrouter')).catch(() => null)
  await expect.poll(storedKey).toBe('sk-or-test')
  await expect.poll(() => page.url()).toBe(docUrl)
  await page.waitForLoadState()
  expect(exchange).toMatchObject({ code: 'test-code', code_challenge_method: 'S256' })
  expect(typeof (exchange as unknown as { code_verifier: string }).code_verifier).toBe('string')
  const stored = await page.evaluate(() => ({
    key: sessionStorage.getItem('ai-key:openrouter'),
    remembered: localStorage.getItem('ai-key:openrouter'),
    settings: JSON.parse(localStorage.getItem('ai-settings')!),
  }))
  expect(stored).toMatchObject({ key: 'sk-or-test', remembered: null, settings: { kind: 'openrouter' } })
})

test('IA de l’instance : absente sans configuration (mode local)', async ({ request }) => {
  const res = await request.post('/api/ai', { data: {} })
  // Serveur de test avec une clé d'IA (en développement, elle suffit) : la demande vide est refusée, autrement.
  test.skip(res.status() !== 404, 'IA de l’instance configurée sur ce serveur')
  expect(res.status()).toBe(404)
  expect(await res.json()).toMatchObject({ kind: 'unavailable' })
})
