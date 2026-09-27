import { expect, test, type Page } from '@playwright/test'

// Travail avec une IA par le presse-papiers : consigne copiée, réponse collée (modifications),
// et API de la page (window.unveilboard) pour un agent qui pilote le navigateur.

type Win = { editor: import('tldraw').Editor; unveilboard: import('../../src/lib/canvas/assistant').UnveilboardApi }

async function openTruthExample(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /Should we always tell the truth\?/ }).click()
  await page.waitForURL(/\?demo=truth/)
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard && document.querySelector('aside'))
  await page.waitForTimeout(1500)
}

const state = (page: Page) =>
  page.evaluate(() => {
    const { editor } = window as unknown as Win
    const shapes = editor.getCurrentPageShapes()
    const seq = (editor.getDocumentSettings().meta as { sequence?: { steps: unknown[] } }).sequence
    return {
      nodes: shapes.filter((s) => s.type === 'geo').length,
      relations: shapes.filter((s) => s.type === 'arrow' && s.meta.preset).length,
      steps: seq?.steps.length,
    }
  })

const PATCH = {
  format: 'unveilboard/patch',
  version: 1,
  summary: 'Adds **Constant’s second objection** and Kant’s answer.',
  operations: [
    { op: 'add', id: 'obj2', text: 'A lie can save a life', parent: 'thesis', relation: 'objects' },
    { op: 'add', id: 'ans2', text: 'Duty does not depend on consequences', parent: 'obj2', relation: 'answers', source: 'Kant' },
    { op: 'update', id: 'justification', text: 'A lie cannot be universalised' },
    { op: 'sequence', mode: 'append', steps: [{ title: 'Another objection', actions: [{ do: 'show', targets: ['obj2'] }, { do: 'show', targets: ['ans2'] }] }] },
  ],
}

test('consigne pour une IA : copier (schéma et sélection compris), coller la réponse, appliquer, annuler d’un coup', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openTruthExample(page)
  // Sélection : la thèse.
  await page.evaluate(() => {
    const { editor } = window as unknown as Win
    const thesis = editor.getCurrentPageShapes().find((s) => s.meta.ref === 'thesis')!
    editor.select(thesis.id)
  })

  await page.getByTestId('main-menu.button').click()
  await page.getByText('Prompt for an AI…').click()
  const dialog = page.getByRole('dialog', { name: 'Work with an AI' })
  await expect(dialog.getByRole('radio', { name: 'Enrich' })).toHaveAttribute('aria-checked', 'true')
  await dialog.getByRole('textbox', { name: 'Your request' }).fill('Add a second objection by Constant, with an answer.')
  await expect(dialog.getByText('Focus on the selection (1 element)')).toBeVisible()
  await dialog.getByRole('button', { name: 'Copy the prompt' }).click()
  await expect(dialog.getByText(/^Copied \(\d+k characters\)/)).toBeVisible()
  const prompt = await page.evaluate(() => navigator.clipboard.readText())
  expect(prompt).toContain('task: enrich')
  expect(prompt).toContain('Add a second objection by Constant, with an answer.')
  expect(prompt).toContain('focus on them: `thesis`')
  expect(prompt).toContain('"id": "objection"')
  expect(prompt).toContain('"unveilboard/patch"')

  // La réponse de l'IA, entourée de texte comme souvent.
  await dialog.getByRole('textbox', { name: 'JSON to paste' }).fill(`Here are my changes:\n\n\`\`\`json\n${JSON.stringify(PATCH, null, 2)}\n\`\`\``)
  await expect(dialog.getByText('Valid changes: 2 elements added, 1 changed, 1 step added to the sequence.')).toBeVisible()
  await expect(dialog.locator('.patch-summary-text strong')).toHaveText('Constant’s second objection')
  await page.screenshot({ path: 'test-results/assistant-dialog.png' })
  await dialog.getByRole('button', { name: 'Apply to this diagram' }).click()
  await expect(dialog).toHaveCount(0)

  await expect.poll(() => state(page)).toEqual({ nodes: 10, relations: 9, steps: 10 })
  const added = await page.evaluate(() => {
    const { editor } = window as unknown as Win
    const obj2 = editor.getCurrentPageShapes().find((s) => s.meta.ref === 'obj2')!
    const objection = editor.getCurrentPageShapes().find((s) => s.meta.ref === 'objection')!
    const b = editor.getShapePageBounds(obj2.id)!
    const o = editor.getShapePageBounds(objection.id)!
    return { color: (obj2.props as { color: string }).color, overlaps: b.collides(o) }
  })
  // Fonction « Objection » : rouge ; placé sans chevaucher l'autre objection.
  expect(added).toEqual({ color: 'red', overlaps: false })
  await page.evaluate(() => void (window as unknown as Win).editor.zoomToFit())
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'test-results/assistant-applied.png' })

  // Un seul Ctrl+Z défait toutes les modifications.
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => state(page)).toEqual({ nodes: 8, relations: 7, steps: 9 })
})

test('API de la page : lire le schéma, refuser un JSON faux (problèmes en anglais), appliquer', async ({ page }) => {
  await openTruthExample(page)
  const result = await page.evaluate(async () => {
    const api = (window as unknown as Win).unveilboard
    const map = api.getMap()
    const bad = await api.apply({ format: 'unveilboard/patch', version: 1, operations: [{ op: 'update', id: 'nope', text: 'x' }] })
    const prompt = api.getPrompt('review')
    const good = await api.apply(
      JSON.stringify({
        format: 'unveilboard/patch',
        version: 1,
        operations: [
          { op: 'update', id: 'example', relation: 'supports', reasoning: 'example' },
          { op: 'move', id: 'answer', parent: 'thesis', relation: 'supports' },
          { op: 'remove', id: 'distinction' },
        ],
      })
    )
    return { elements: map.elements.length, bad, reviewPrompt: prompt.includes('task: review') && !prompt.includes('window.unveilboard'), good }
  })
  expect(result).toMatchObject({
    elements: 8,
    bad: { ok: false, kind: 'patch', problems: ['Error: operations[0].id: No element or link has this identifier in the current diagram (nope)'] },
    reviewPrompt: true,
    good: { ok: true, kind: 'patch', problems: [] },
  })
  const after = await page.evaluate(() => {
    const map = (window as unknown as Win).unveilboard.getMap()
    const pick = (id: string) => map.elements.find((e) => e.id === id)
    return { n: map.elements.length, example: pick('example'), answer: pick('answer') }
  })
  expect(after.n).toBe(7)
  expect(after.example).toMatchObject({ parent: 'thesis', relation: 'supports', reasoning: 'example', function: 'Justification' })
  expect(after.answer).toMatchObject({ parent: 'thesis', relation: 'supports' })
  // L'étiquette de la flèche suit la nouvelle relation et son type de raisonnement.
  const label = await page.evaluate(() => {
    const { editor } = window as unknown as Win
    const example = editor.getCurrentPageShapes().find((s) => s.meta.ref === 'example')!
    const arrow = editor
      .getCurrentPageShapes()
      .find((s) => s.type === 'arrow' && editor.getBindingsFromShape(s, 'arrow').some((b) => b.toId === example.id))!
    return JSON.stringify(arrow.props)
  })
  expect(label).toContain('supports · by example')
})
