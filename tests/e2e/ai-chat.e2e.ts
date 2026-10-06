import { expect, test, type Page, type Route } from '@playwright/test'

// Onglet Chat : conversation sur plusieurs tours avec l'IA (simulée, adresse interceptée) :
// question sans modification, modification appliquée aussitôt puis annulée et rétablie,
// demande de correction d'une réponse inutilisable, historique gardé, effacement confirmé.

const LOCAL = 'http://127.0.0.1:65533/v1'
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }

type Win = { editor: import('tldraw').Editor; unveilboard: import('../../src/lib/canvas/assistant').UnveilboardApi }
type Body = { messages: { role: string; content: string }[] }

async function openTruthExample(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /Should we always tell the truth\?/ }).click()
  await page.waitForURL(/\?demo=truth/)
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard && document.querySelector('aside'))
  await page.waitForTimeout(1500)
}

const sse = (content: string) => `data: ${JSON.stringify({ model: 'fake', choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`

const ADD = {
  reply: 'I added [an objection](el:obj9) to [the thesis](el:thesis).',
  patch: {
    format: 'unveilboard/patch',
    version: 1,
    summary: 'One consequentialist objection.',
    operations: [{ op: 'add', id: 'obj9', text: 'A lie can save a life', parent: 'thesis', relation: 'objects' }],
  },
}

const texts = (page: Page) => page.evaluate(() => (window as unknown as Win).unveilboard.getMap().elements.map((e) => e.text))

test('chat : question, modification annulable, correction, note, copie, historique, effacement', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const bodies: Body[] = []
  // Réponses successives du faux modèle.
  const answers = [
    JSON.stringify({ reply: 'The thesis is **Kant’s**: lying is always wrong.' }),
    // Modifications invalides (parent inconnu) : renvoyées une fois pour correction.
    JSON.stringify({ ...ADD, patch: { ...ADD.patch, operations: [{ ...ADD.patch.operations[0], parent: 'nope' }] } }),
    JSON.stringify(ADD),
  ]
  await page.route(`${LOCAL}/**`, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    bodies.push(route.request().postDataJSON())
    await route.fulfill({ body: sse(answers.shift() ?? '{"reply":"?"}'), headers: { ...CORS, 'content-type': 'text/event-stream' } })
  })
  await openTruthExample(page)
  await page.evaluate((url) => localStorage.setItem('ai-settings', JSON.stringify({ kind: 'custom', customUrl: url, customModel: 'fake' })), LOCAL)
  await page.reload()
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard)

  const panel = page.locator('aside').last()
  await panel.getByRole('tab', { name: 'Chat' }).click()
  const input = panel.getByRole('textbox', { name: 'Message to the AI' })

  // Le modèle affiché ouvre les réglages de l'IA.
  await panel.getByRole('button', { name: 'fake' }).click()
  await expect(page.getByRole('dialog').filter({ hasText: /AI settings/i }).first()).toBeVisible()
  await page.keyboard.press('Escape')

  // 1. Une question : une réponse, sans modification.
  const before = await texts(page)
  await input.fill('Whose thesis is it?')
  await input.press('Enter')
  await expect(panel.locator('.chat-bubble-ai strong', { hasText: 'Kant’s' })).toBeVisible()
  expect(await texts(page)).toEqual(before)
  expect(bodies[0].messages.map((m) => m.role)).toEqual(['system', 'user'])
  expect(bodies[0].messages[0].content).toContain('task: chat')
  expect(bodies[0].messages[0].content).toContain('"id": "thesis"')
  expect(bodies[0].messages[1].content).toBe('Whose thesis is it?')

  // Une réponse s'ajoute à la note de l'élément sélectionné (sans sélection : bouton inactif).
  const toNote = panel.locator('.chat-bubble-ai').first().getByRole('button', { name: /Add to the note/ })
  await page.evaluate(() => void (window as unknown as Win).editor.selectNone())
  await expect(toNote).toBeDisabled()
  await page.evaluate(() => {
    const { editor } = window as unknown as Win
    editor.select(editor.getCurrentPageShapes().find((s) => s.meta.ref === 'assumption')!.id)
  })
  const noteBefore = await page.evaluate(() => (window as unknown as Win).editor.getCurrentPageShapes().find((s) => s.meta.ref === 'assumption')!.meta.note as string | undefined)
  await toNote.click()
  await expect(panel.getByText(/^Added to the note of/)).toBeVisible()
  const noteAfter = await page.evaluate(() => (window as unknown as Win).editor.getCurrentPageShapes().find((s) => s.meta.ref === 'assumption')!.meta.note as string)
  expect(noteAfter).toBe([noteBefore?.trim(), 'The thesis is **Kant’s**: lying is always wrong.'].filter(Boolean).join('\n\n'))

  // 2. Une modification : correction demandée une fois, puis appliquée aussitôt.
  await input.fill('Add an objection')
  await panel.getByRole('button', { name: 'Send' }).click()
  await expect(panel.locator('.chat-changes')).toContainText('Diagram changed · One consequentialist objection.')
  expect(await texts(page)).toContain('A lie can save a life')
  // Deuxième tour : l'historique (la question, la réponse en JSON), puis le nouveau message ; puis la correction.
  expect(bodies[1].messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user'])
  expect(bodies[1].messages[2].content).toBe('{"reply":"The thesis is **Kant’s**: lying is always wrong."}')
  expect(bodies[2].messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user', 'assistant', 'user'])

  // Référence cliquable : sélectionne l'élément ajouté.
  await panel.getByRole('button', { name: 'an objection' }).click()
  const selected = await page.evaluate(() => {
    const { editor } = window as unknown as Win
    return editor.getSelectedShapes().map((s) => s.meta.ref)
  })
  expect(selected).toEqual(['obj9'])

  // 3. Annuler, même après une autre modification du schéma (qui reste), puis rétablir.
  await page.evaluate(() => {
    const { editor } = window as unknown as Win
    editor.createShape({ type: 'geo', x: 5000, y: 5000, props: { w: 100, h: 60 }, meta: { ref: 'mine' } })
  })
  await panel.getByRole('button', { name: 'Undo' }).click()
  await expect(panel.locator('.chat-changes')).toContainText('Changes undone')
  expect(await texts(page)).not.toContain('A lie can save a life')
  expect(await page.evaluate(() => (window as unknown as Win).editor.getCurrentPageShapes().some((s) => s.meta.ref === 'mine'))).toBe(true)
  await panel.getByRole('button', { name: 'Redo' }).click()
  await expect(panel.locator('.chat-changes')).toContainText('Diagram changed')
  expect(await texts(page)).toContain('A lie can save a life')

  // Copie de la conversation en Markdown (références en texte).
  await panel.getByRole('button', { name: 'Copy the conversation (Markdown)' }).click()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toContain('## You\n\nWhose thesis is it?')
  expect(copied).toContain('I added an objection to the thesis.\n\n> Diagram changed · One consequentialist objection.')

  // 4. La conversation est gardée pour ce schéma (sur cet appareil) ; l'effacer demande confirmation.
  // (Le document s'enregistre 1,2 s après la dernière modification : on le laisse faire avant de recharger.)
  await page.waitForTimeout(2000)
  await page.reload()
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard)
  await panel.getByRole('tab', { name: 'Chat' }).click()
  await expect(panel.locator('.chat-bubble-user')).toHaveCount(2)
  // Après rechargement, les modifications ne sont plus annulables d'ici (l'historique de tldraw, si).
  await expect(panel.getByRole('button', { name: 'Undo' })).toHaveCount(0)
  await panel.getByRole('button', { name: 'Clear the conversation' }).click()
  const dialog = panel.getByRole('alertdialog')
  await expect(dialog).toContainText('Clear this conversation?')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(panel.locator('.chat-bubble-user')).toHaveCount(2)
  await panel.getByRole('button', { name: 'Clear the conversation' }).click()
  await panel.getByRole('alertdialog').getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(panel.locator('.chat-bubble-user')).toHaveCount(0)
  expect(await texts(page)).toContain('A lie can save a life')
})
