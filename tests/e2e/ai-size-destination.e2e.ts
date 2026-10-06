import { expect, test, type Page, type Route } from '@playwright/test'

// Création par l'IA : taille voulue (réglages de l'IA, rappel modifiable à la création, correction
// demandée si la réponse en sort) et destination (nouveau schéma, nouvelle page, cette page).

const LOCAL = 'http://127.0.0.1:65532/v1'
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
  [{ model: 'fake-model', choices: [{ delta: { content: text } }] }, { choices: [], usage: { prompt_tokens: 10, completion_tokens: 10 } }]
    .map((c) => `data: ${JSON.stringify(c)}\n\n`)
    .join('') + 'data: [DONE]\n\n'

async function fakeServer(page: Page, answers: string[], bodies: { messages: { content: string }[] }[]) {
  await page.route(`${LOCAL}/**`, async (route: Route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (req.url().endsWith('/models')) return route.fulfill({ json: { data: [{ id: 'fake-model' }] }, headers: CORS })
    bodies.push(req.postDataJSON())
    await route.fulfill({ body: sse(answers.shift() ?? ''), headers: { ...CORS, 'content-type': 'text/event-stream' } })
  })
}

/** Carte mentale : une racine et n enfants, une étape qui montre la racine. */
const mindMap = (title: string, children: number) => ({
  format: 'unveilboard/map',
  version: 1,
  title,
  elements: [
    { id: 'root', text: title, tree: { kind: 'mindmap' } },
    ...Array.from({ length: children }, (_, i) => ({ id: `c${i}`, text: `${title} ${i + 1}`, parent: 'root' })),
  ],
  sequence: { steps: [{ title: `${title}: start`, actions: [{ do: 'show', targets: ['root'] }] }] },
})

const state = (page: Page) =>
  page.evaluate(() => {
    const { editor } = window as unknown as Win
    const seq = editor.getDocumentSettings().meta.sequence as { title: string }
    return {
      pages: editor.getPages().map((p) => p.name),
      page: editor.getCurrentPage().name,
      boxes: editor.getCurrentPageShapes().filter((s) => s.type === 'geo').length,
      title: seq.title,
    }
  })

test('taille réglée, rappelée à la création, corrigée par l’IA ; schéma ajouté sur une nouvelle page', async ({ page }) => {
  const bodies: { messages: { content: string }[] }[] = []
  // Première réponse : 5 éléments pour 3 à 4 demandés ; la seconde, après correction : 4.
  await fakeServer(page, [JSON.stringify(mindMap('Freedom', 4)), JSON.stringify(mindMap('Freedom', 3))], bodies)
  await openTruthExample(page)
  await page.evaluate((url) => {
    localStorage.setItem('ai-settings', JSON.stringify({ kind: 'custom', customUrl: url, customModel: 'fake-model' }))
  }, LOCAL)
  await page.reload()
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard)
  const title = (await state(page)).title

  // Réglages : 3 à 4 éléments, 1 niveau.
  await page.getByTestId('main-menu.button').click()
  await page.getByTestId('main-menu-sub.schema-ai-button').click()
  await page.getByText('AI settings…').click()
  const settings = page.getByRole('dialog', { name: 'AI settings' })
  await settings.getByRole('spinbutton', { name: 'Minimum number of elements' }).fill('3')
  await settings.getByRole('spinbutton', { name: 'Maximum number of elements' }).fill('4')
  await settings.getByRole('spinbutton', { name: 'Maximum number of levels' }).fill('1')
  await settings.getByRole('button', { name: 'Save' }).click()

  await page.getByTestId('main-menu.button').click()
  await page.getByTestId('main-menu-sub.schema-ai-button').click()
  await page.getByText('Create or change the diagram with AI…').click()
  const dialog = page.getByRole('dialog', { name: 'Work with an AI' })
  await dialog.getByRole('radio', { name: 'Create a diagram' }).click()
  await expect(dialog.getByText('Size: 3 to 4 elements, at most 1 level.')).toBeVisible()
  // Modifiable pour cette création (le premier « Change » : celui de la taille ; le second, la langue).
  await dialog.getByRole('button', { name: 'Change' }).first().click()
  await dialog.getByRole('spinbutton', { name: 'Minimum number of levels' }).fill('1')
  await expect(dialog.getByText('Size: 3 to 4 elements, 1 level.')).toBeVisible()
  await dialog.getByRole('textbox', { name: 'Your request' }).fill('Freedom')
  await dialog.getByRole('button', { name: 'Ask the AI' }).click()
  await expect(dialog.getByText('Valid: 4 elements, 1 step.')).toBeVisible()
  expect(bodies).toHaveLength(2)
  expect(bodies[0].messages[0].content).toContain('- **Elements**: 3 to 4 boxes in all, the root included.')
  expect(bodies[0].messages[0].content).toContain('- **Levels**: the longest branch goes 1 level below the root')
  expect(bodies[1].messages.at(-1)!.content).toContain('The number of elements is outside the bounds set by the user')

  // Sur une nouvelle page de ce schéma : sa séquence est celle de la page, le titre du document reste.
  await dialog.getByRole('radio', { name: 'on a new page of this one' }).check()
  await dialog.getByRole('button', { name: 'Add on a new page' }).click()
  await expect(dialog).toHaveCount(0)
  await expect.poll(() => state(page)).toMatchObject({ pages: ['Page 1', 'Freedom'], page: 'Freedom', boxes: 4, title })
  await expect(page.locator('aside ol > li[data-step]')).toHaveCount(1)
})

test('schéma collé, ajouté sur cette page à côté : la séquence s’allonge, un seul Ctrl+Z l’annule', async ({ page }) => {
  await openTruthExample(page)
  const before = await state(page)
  const steps = await page.locator('aside ol > li[data-step]').count()
  const right = await page.evaluate(() => (window as unknown as Win).editor.getCurrentPageBounds()!.maxX)

  await page.getByTestId('main-menu.button').click()
  await page.getByTestId('main-menu-sub.schema-file-menu-button').click()
  await page.getByText('Import a list, Markdown or JSON…').click()
  const dialog = page.getByRole('dialog', { name: 'Import' })
  await dialog.getByRole('textbox').fill(JSON.stringify(mindMap('Justice', 2)))
  await dialog.getByRole('radio', { name: 'on this page, beside' }).check()
  await dialog.getByRole('button', { name: 'Add to this page' }).click()

  await expect.poll(() => state(page)).toMatchObject({ pages: ['Page 1'], boxes: before.boxes + 3, title: before.title })
  await expect(page.locator('aside ol > li[data-step]')).toHaveCount(steps + 1)
  // À droite de ce qui était là.
  const left = await page.evaluate(() => {
    const { editor } = window as unknown as Win
    return Math.min(...editor.getCurrentPageShapes().filter((s) => s.meta.ref === 'root' || String(s.meta.ref).startsWith('c')).map((s) => editor.getShapePageBounds(s)!.minX))
  })
  expect(left).toBeGreaterThan(right)

  await page.locator('.tl-canvas').click({ position: { x: 5, y: 300 } })
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => state(page)).toMatchObject({ boxes: before.boxes })
  await expect(page.locator('aside ol > li[data-step]')).toHaveCount(steps)

  // La destination choisie est retenue.
  await page.getByTestId('main-menu.button').click()
  await page.getByTestId('main-menu-sub.schema-file-menu-button').click()
  await page.getByText('Import a list, Markdown or JSON…').click()
  await dialog.getByRole('textbox').fill(JSON.stringify(mindMap('Justice', 2)))
  await expect(dialog.getByRole('radio', { name: 'on this page, beside' })).toBeChecked()
})
