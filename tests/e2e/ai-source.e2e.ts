import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test'

// Créer un schéma depuis un texte : génération avec correction des extraits, extraits signalés ;
// lecture d'un PDF (couche de texte) ; transcription d'un PDF scanné et d'une photo. IA simulée.

const LOCAL = 'http://127.0.0.1:65533/v1'
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
const SOURCE = `Dire la vérité n’est donc un devoir qu’envers ceux qui ont droit à la vérité. Or nul homme n’a droit à la vérité qui nuit à autrui.`

type Win = { editor: import('tldraw').Editor }

const sse = (text: string) => `data: ${JSON.stringify({ model: 'fake', choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`

async function openEditor(page: Page, settings: Record<string, unknown>, key?: string) {
  await page.goto('/')
  await page.getByRole('button', { name: /Should we always tell the truth\?/ }).click()
  await page.waitForURL(/\?demo=truth/)
  await page.evaluate(
    ({ settings, key }) => {
      localStorage.setItem('ai-settings', JSON.stringify(settings))
      if (key) localStorage.setItem('ai-key:openrouter', key)
    },
    { settings, key }
  )
  await page.reload()
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard && document.querySelector('aside'))
  await page.getByTestId('main-menu.button').click()
  await page.getByText('New diagram from a text…').click()
  return page.getByRole('dialog', { name: 'Create a diagram from a text' })
}

const map = (first: boolean) => ({
  format: 'unveilboard/map',
  version: 1,
  title: 'Constant : le droit à la vérité',
  lang: 'fr',
  elements: [
    { id: 'q', type: 'question', text: 'Faut-il dire la vérité à tous ?', tree: { kind: 'argument' }, origin: 'reconstruction' },
    {
      id: 't',
      text: 'La véracité n’est due qu’à qui y a droit',
      parent: 'q',
      relation: 'answers',
      source: 'Constant',
      origin: 'text',
      excerpt: 'Dire la vérité n’est donc un devoir qu’envers ceux qui ont droit à la vérité.',
    },
    {
      id: 'j',
      text: 'Nul n’a droit à une vérité qui nuit',
      parent: 't',
      relation: 'supports',
      origin: 'text',
      excerpt: first ? 'Personne n’a droit à une vérité nuisible' : 'Or nul homme n’a droit à la vérité qui nuit à autrui.',
    },
    { id: 'c', type: 'quote', text: '« Le mensonge est parfois un devoir »', parent: 't', relation: 'illustrates', source: 'Constant' },
  ],
  sequence: {
    steps: [
      { title: 'La question', camera: 'overview', actions: [{ do: 'show', targets: ['q'] }] },
      { title: 'La thèse', narration: 'Constant répond…', actions: [{ do: 'show', targets: ['t'] }] },
    ],
  },
})

test('depuis un texte collé : extraits corrigés par l’IA, citation introuvable signalée, provenance', async ({ page }) => {
  const bodies: { messages: { role: string; content: string }[] }[] = []
  const answers = [JSON.stringify(map(true)), JSON.stringify(map(false))]
  await page.route(`${LOCAL}/**`, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    bodies.push(route.request().postDataJSON())
    await route.fulfill({ body: sse(answers.shift() ?? ''), headers: { ...CORS, 'content-type': 'text/event-stream' } })
  })
  const dialog = await openEditor(page, { kind: 'custom', customUrl: LOCAL, customModel: 'fake' })
  await dialog.getByRole('textbox', { name: 'Source text' }).fill(SOURCE)
  await expect(dialog.getByText(/^\d+ characters, about \d+ tokens\.$/)).toBeVisible()
  await dialog.getByRole('textbox', { name: 'Reference of the text' }).fill('Constant, Des réactions politiques, 1797')
  await dialog.getByRole('radio', { name: 'Argument map' }).check()
  await dialog.getByRole('button', { name: 'Create the diagram' }).click()
  await expect(dialog.getByRole('status')).toHaveText(
    'A diagram of 4 elements and 2 steps; 2 excerpts found in the text, 1 to check (flagged in the diagram).'
  )
  await expect(dialog.getByText('This quotation cannot be found in the source text')).toBeVisible()
  await page.screenshot({ path: 'test-results/ai-source-dialog.png' })

  // Première réponse : deux extraits introuvables, renvoyés au modèle pour correction.
  expect(bodies).toHaveLength(2)
  expect(bodies[0].messages[0].content).toContain('Reference: Constant, Des réactions politiques, 1797')
  expect(bodies[0].messages[0].content).toContain('Build an **argument map**')
  const repair = bodies[1].messages[2].content
  expect(repair).toContain('elements[2].excerpt: The excerpt is not in the source text')
  expect(repair).toContain('elements[3].text: This quotation is not in the source text')

  // Nouveau schéma : la citation introuvable porte « à vérifier » ; la provenance s'affiche.
  const before = page.url()
  await dialog.getByRole('button', { name: 'Open as a new diagram' }).click()
  await page.waitForURL((url) => url.href !== before && /\/d\//.test(url.href))
  await page.waitForFunction(() => (window as unknown as { editor?: unknown }).editor && document.querySelector('aside'))
  await expect(page.locator('.unverified-pill')).toHaveCount(1)
  const select = (ref: string) =>
    page.evaluate((r) => {
      const { editor } = window as unknown as Win
      editor.select(editor.getCurrentPageShapes().find((s) => s.meta.ref === r)!.id)
    }, ref)
  await select('t')
  await expect(page.locator('.provenance')).toContainText('From the text')
  await expect(page.locator('.provenance blockquote')).toHaveText('Dire la vérité n’est donc un devoir qu’envers ceux qui ont droit à la vérité.')
  await select('q')
  await expect(page.locator('.provenance')).toHaveText('Reconstruction (the analysis, not the text)')
  await select('c')
  await expect(page.locator('.provenance')).toContainText('This excerpt cannot be found in the text: check it.')
  await page.evaluate(() => void (window as unknown as Win).editor.zoomToFit())
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'test-results/ai-source-diagram.png' })
  await page.getByRole('button', { name: 'Mark as checked' }).click()
  await expect(page.locator('.unverified-pill')).toHaveCount(0)
})

/** Un PDF fabriqué par Chromium à partir d'un HTML. */
async function makePdf(context: BrowserContext, html: string) {
  const p = await context.newPage()
  await p.setContent(html)
  const pdf = await p.pdf({ format: 'A5' })
  await p.close()
  return pdf
}

async function makePng(context: BrowserContext) {
  const p = await context.newPage()
  await p.setContent('<div id="x" style="width:240px;height:80px;background:#222;color:#fff;font:20px serif;padding:8px">Texte photographié</div>')
  const png = await p.locator('#x').screenshot()
  await p.close()
  return png
}

test('PDF : couche de texte lue dans le navigateur ; PDF scanné transcrit (OpenRouter, lecteur « native »)', async ({ page, context }) => {
  let body: { model: string; plugins?: unknown; messages: { content: unknown }[] } | null = null
  await page.route('https://openrouter.ai/api/v1/chat/completions', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    body = route.request().postDataJSON()
    const answer = JSON.stringify({ text: 'Le texte transcrit du scan.', reference: 'Alain, Propos, 1908' })
    await route.fulfill({ body: sse(answer), headers: { ...CORS, 'content-type': 'text/event-stream' } })
  })
  const dialog = await openEditor(page, { kind: 'openrouter', openrouterModel: 'deepseek/deepseek-v4.1-flash' }, 'sk-or-test')
  const input = dialog.locator('input[type="file"]')

  // PDF avec du texte : lu tel quel, sans IA.
  const textPdf = await makePdf(context, `<p style="font:16px serif">${SOURCE}</p>`)
  await input.setInputFiles({ name: 'cours.pdf', mimeType: 'application/pdf', buffer: textPdf })
  await expect(dialog.getByText('Text of cours.pdf.')).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: 'Source text' })).toHaveValue(/Dire la vérité n’est donc un devoir/)

  // PDF scanné (une image, sans texte) : transcrit par le modèle de transcription du catalogue.
  const png = await makePng(context)
  const scan = await makePdf(context, `<img src="data:image/png;base64,${png.toString('base64')}">`)
  await input.setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: scan })
  await expect(dialog.getByText('scan.pdf has no text layer (a scan?): its text must be transcribed.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Transcribe with the AI' }).click()
  await expect(dialog.getByText('Transcribed from scan.pdf: check the text before going on.')).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: 'Source text' })).toHaveValue('Le texte transcrit du scan.')
  await expect(dialog.getByRole('textbox', { name: 'Reference of the text' })).toHaveValue('Alain, Propos, 1908')
  expect(body).toMatchObject({ model: 'openai/gpt-6-luna', plugins: [{ id: 'file-parser', pdf: { engine: 'native' } }] })
  expect(JSON.stringify(body!.messages[1].content)).toContain('"type":"file"')
})

test('photo : transcrite par le serveur compatible OpenAI (partie image)', async ({ page, context }) => {
  let body: { model: string; messages: { content: unknown }[] } | null = null
  await page.route(`${LOCAL}/**`, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    body = route.request().postDataJSON()
    await route.fulfill({ body: sse('{"text": "Texte photographié", "reference": ""}'), headers: { ...CORS, 'content-type': 'text/event-stream' } })
  })
  const dialog = await openEditor(page, { kind: 'custom', customUrl: LOCAL, customModel: 'vision-model' })
  await dialog.locator('input[type="file"]').setInputFiles({ name: 'page.png', mimeType: 'image/png', buffer: await makePng(context) })
  await expect(dialog.getByText('page.png is an image: its text must be transcribed.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Transcribe with the AI' }).click()
  await expect(dialog.getByRole('textbox', { name: 'Source text' })).toHaveValue('Texte photographié')
  expect(body!.model).toBe('vision-model')
  expect(JSON.stringify(body!.messages[1].content)).toContain('"image_url":{"url":"data:image/png;base64,')
})
