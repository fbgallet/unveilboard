import { expect, test, type Page, type Route } from '@playwright/test'

// Relecture critique : remarques de l'IA (simulée) avec corrections à appliquer une à une,
// vérifications automatiques, remarques gardées d'une séance à l'autre ; réflexion du modèle.

const LOCAL = 'http://127.0.0.1:65534/v1'
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }

type Win = { editor: import('tldraw').Editor; unveilboard: import('../../src/lib/canvas/assistant').UnveilboardApi }

const REVIEW = {
  format: 'unveilboard/review',
  version: 1,
  summary: 'Une carte **claire** ; deux points à reprendre.',
  remarks: [
    {
      id: 'r1',
      kind: 'wording',
      priority: 'medium',
      targets: ['justification'],
      message: 'La justification mêle deux idées.',
      operations: [{ op: 'update', id: 'justification', text: 'Universalisé, le mensonge se détruit lui-même' }],
    },
    { id: 'r2', kind: 'gap', priority: 'high', targets: ['thesis'], message: 'Il manque la définition du mensonge.' },
    { id: 'r3', kind: 'relation', priority: 'low', targets: ['example'], message: 'L’exemple met la thèse à l’épreuve plus qu’il ne l’illustre.' },
  ],
}

async function open(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /Should we always tell the truth\?/ }).click()
  await page.waitForURL(/\?demo=truth/)
  await page.evaluate((url) => localStorage.setItem('ai-settings', JSON.stringify({ kind: 'custom', customUrl: url, customModel: 'fake', reasoning: 'high' })), LOCAL)
  await page.reload()
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard && document.querySelector('aside'))
}

const openPanel = async (page: Page) => {
  await page.getByTestId('main-menu.button').click()
  await page.getByText('Critical review…').click()
  return page.getByRole('complementary', { name: 'Critical review' })
}

test('relecture par l’IA : remarques, correction appliquée, remarque écartée, gardées au rechargement', async ({ page }) => {
  const bodies: Record<string, unknown>[] = []
  await page.route(`${LOCAL}/**`, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    bodies.push(route.request().postDataJSON())
    const body = `data: ${JSON.stringify({ model: 'fake', choices: [{ delta: { content: JSON.stringify(REVIEW) } }] })}\n\ndata: [DONE]\n\n`
    await route.fulfill({ body, headers: { ...CORS, 'content-type': 'text/event-stream' } })
  })
  await open(page)
  const panel = await openPanel(page)
  await expect(panel.getByText('No remark from the automatic checks. Ask the AI for a review.')).toBeVisible()
  await panel.getByRole('button', { name: 'Review with the AI' }).click()
  await expect(panel.locator('.review-item')).toHaveCount(3)
  // Par priorité : la lacune (haute) d'abord.
  await expect(panel.locator('.review-item').first()).toContainText('Il manque la définition du mensonge.')
  await expect(panel.locator('.review-item').nth(1)).toContainText('Change “A lie cannot become a universal law: it would destroy all t…”: text: Universalisé, le mensonge se détruit lui-même')
  await expect(page.locator('.review-badges')).toHaveCount(3)
  // La demande : tâche « review », réflexion poussée.
  expect(bodies[0]).toMatchObject({ reasoning_effort: 'high' })
  expect(JSON.stringify(bodies[0])).toContain('task: review')
  await page.screenshot({ path: 'test-results/ai-review.png' })

  // Un élément visé : sélectionné et cadré.
  await panel.locator('.review-item').nth(2).getByRole('button', { name: /The murderer at the door/ }).click()
  expect(await page.evaluate(() => (window as unknown as Win).editor.getOnlySelectedShape()?.meta.ref)).toBe('example')

  // Appliquer la correction de r1, écarter r3.
  await panel.locator('.review-item').nth(1).getByRole('button', { name: 'Apply the correction' }).click()
  await expect(panel.locator('.review-item')).toHaveCount(2)
  const text = await page.evaluate(() => (window as unknown as Win).unveilboard.getMap().elements.find((e) => e.id === 'justification')?.text)
  expect(text).toBe('Universalisé, le mensonge se détruit lui-même')
  await panel.locator('.review-item').nth(1).getByRole('button', { name: 'Dismiss' }).click()
  await expect(panel.locator('.review-item')).toHaveCount(1)

  // Gardée au rechargement (sur cet appareil).
  await page.reload()
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard)
  const again = await openPanel(page)
  await expect(again.locator('.review-item')).toHaveCount(1)
  await expect(again.getByText('Une carte')).toBeVisible()
})

test('vérifications automatiques, et relecture collée depuis un assistant', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await page.getByRole('button', { name: /Should we always tell the truth\?/ }).click()
  await page.waitForURL(/\?demo=truth/)
  // Sans IA branchée, quelle que soit la configuration du serveur de test.
  await page.evaluate(() => localStorage.setItem('ai-settings', JSON.stringify({ kind: 'clipboard' })))
  await page.reload()
  // L'exemple est créé après l'installation de l'API : on attend ses éléments.
  await page.waitForFunction(() => (window as unknown as Win).unveilboard?.getMap().elements.length === 8)
  // Une objection sans réponse.
  const applied = await page.evaluate(() =>
    (window as unknown as Win).unveilboard.apply({
      format: 'unveilboard/patch',
      version: 1,
      operations: [{ op: 'add', id: 'o2', text: 'Mentir peut sauver une vie', parent: 'thesis', relation: 'objects' }],
    })
  )
  expect(applied).toEqual({ ok: true, kind: 'patch', problems: [] })
  const panel = await openPanel(page)
  await expect(panel.locator('.review-item')).toHaveCount(1)
  await expect(panel.locator('.review-item')).toContainText('This objection has no answer or refutation yet.')
  await expect(panel.locator('.review-item')).toContainText('automatic check')

  await panel.getByRole('button', { name: 'Copy the prompt' }).click()
  const prompt = await page.evaluate(() => navigator.clipboard.readText())
  expect(prompt).toContain('task: review')
  expect(prompt).toContain('"format": "unveilboard/review"')
  await panel.getByRole('textbox', { name: 'JSON to paste' }).fill(JSON.stringify(REVIEW))
  await panel.getByRole('button', { name: 'Show the review' }).click()
  await expect(panel.locator('.review-item')).toHaveCount(4)

  // Ignorer la vérification automatique.
  await panel.locator('.review-item', { hasText: 'automatic check' }).getByRole('button', { name: 'Dismiss' }).click()
  await expect(panel.locator('.review-item')).toHaveCount(3)
})
