import { expect, test, type Page, type Route } from '@playwright/test'

// À partir d'un élément : consigne à l'IA, suggestions fantômes à accepter ou écarter ;
// et « Séquence (IA)… » depuis la barre de l'arbre. IA simulée (adresse interceptée).

const LOCAL = 'http://127.0.0.1:65532/v1'
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }

type Win = { editor: import('tldraw').Editor; unveilboard: import('../../src/lib/canvas/assistant').UnveilboardApi }

async function openTruthExample(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /Should we always tell the truth\?/ }).click()
  await page.waitForURL(/\?demo=truth/)
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard && document.querySelector('aside'))
  await page.waitForTimeout(1500)
}

const PATCH = {
  format: 'unveilboard/patch',
  version: 1,
  summary: 'Two objections from consequentialism, one with an answer.',
  operations: [
    { op: 'add', id: 'obj2', text: 'A lie can save a life', parent: 'thesis', relation: 'objects', rationale: 'The classic consequentialist objection.' },
    { op: 'add', id: 'ans2', text: 'Consequences are never certain', parent: 'obj2', relation: 'answers', source: 'Kant' },
    { op: 'link', id: 'lk1', from: 'ans2', to: 'assumption', relation: 'presupposes' },
    { op: 'update', id: 'thesis', text: 'SHOULD BE IGNORED' },
  ],
}

async function selectRef(page: Page, ref: string) {
  await page.evaluate((r) => {
    const { editor } = window as unknown as Win
    editor.select(editor.getCurrentPageShapes().find((s) => s.meta.ref === r)!.id)
  }, ref)
}

const pending = (page: Page) =>
  page.evaluate(() => (window as unknown as Win).editor.getCurrentPageShapes().filter((s) => s.meta.suggestion).map((s) => s.meta.ref ?? s.type))

test('à partir d’un élément : suggestions fantômes, accepter, écarter, hors export et présentation', async ({ page }) => {
  const bodies: { messages: { content: string }[] }[] = []
  await page.route(`${LOCAL}/**`, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    bodies.push(route.request().postDataJSON())
    const body = `data: ${JSON.stringify({ model: 'fake', choices: [{ delta: { content: JSON.stringify(PATCH) } }] })}\n\ndata: [DONE]\n\n`
    await route.fulfill({ body, headers: { ...CORS, 'content-type': 'text/event-stream' } })
  })
  await openTruthExample(page)
  await page.evaluate((url) => localStorage.setItem('ai-settings', JSON.stringify({ kind: 'custom', customUrl: url, customModel: 'fake' })), LOCAL)
  await page.reload()
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard)

  // La justification : son extrait (ses ancêtres, sa branche) ne contient pas l'objection.
  await selectRef(page, 'justification')
  await page.getByRole('button', { name: '✦ AI…' }).click()
  const panel = page.getByRole('dialog', { name: 'Ask the AI from this element' })
  await expect(panel.getByRole('heading')).toHaveText(/^AI, from “A lie cannot become a universal law: it would destroy all t…”$/)
  await panel.getByRole('button', { name: 'Objections' }).click()
  await expect(panel.getByRole('textbox', { name: 'Your request' })).toHaveValue('Propose the strongest objections to this element.')
  await panel.getByRole('checkbox', { name: /Take the whole diagram into account/ }).uncheck()
  await panel.getByRole('button', { name: 'Ask the AI' }).click()
  await expect(panel.getByRole('status')).toHaveText(
    '3 suggestions added: accept (✓) or reject (✕) each one on the diagram. 1 change to existing elements ignored.'
  )
  // La consigne : tâche « expand », élément de départ, extrait du schéma.
  const prompt = bodies[0].messages[0].content
  expect(prompt).toContain('task: expand')
  expect(prompt).toContain('Starting from the element `justification`')
  expect(prompt).toContain('## The current diagram (extract)')
  expect(prompt).not.toContain('"id": "objection"')

  // Suggestions : estompées, étiquetées, hors de l'export JSON ; la thèse est inchangée.
  expect((await pending(page)).sort()).toEqual(['ans2', 'arrow', 'arrow', 'lk1', 'obj2'])
  await expect(page.locator('.tl-shape.ai-suggestion').first()).toBeVisible()
  await expect(page.locator('.suggestion-pill')).toHaveCount(2)
  await expect(page.getByRole('region', { name: 'AI suggestions' })).toContainText('3 AI suggestions')
  const map = await page.evaluate(() => (window as unknown as Win).unveilboard.getMap())
  expect(map.elements).toHaveLength(8)
  expect(map.elements.find((e) => e.id === 'thesis')?.text).toBe('Yes: truthfulness is an unconditional duty')
  await page.keyboard.press('Escape')
  await page.evaluate(() => void (window as unknown as Win).editor.zoomToFit())
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'test-results/ai-suggestions.png' })

  // En présentation, les suggestions sont cachées.
  const ghostId: string = await page.evaluate(() => String((window as unknown as Win).editor.getCurrentPageShapes().find((s) => s.meta.ref === 'obj2')!.id))
  await page.getByRole('button', { name: '▶ Present' }).click()
  expect(await page.evaluate((id) => (window as unknown as Win).editor.isShapeHidden(id as never), ghostId)).toBe(true)
  await page.keyboard.press('Escape')

  // Accepter la réponse accepte aussi l'objection dont elle dépend ; écarter le lien.
  // Boutons dans l'ordre des suggestions : obj2, ans2, lk1. Chaque suggestion est centrée à l'écran,
  // la boîte de l'IA fermée : ailleurs, ses boutons peuvent passer sous un panneau.
  await panel.getByRole('button', { name: 'Close' }).click()
  const centerOn = (ref: string) =>
    page.evaluate((r) => {
      const { editor } = window as unknown as Win
      const shape = editor.getCurrentPageShapes().find((s) => s.meta.ref === r)!
      editor.selectNone()
      editor.centerOnPoint(editor.getShapePageBounds(shape)!.center, { animation: { duration: 0 } })
    }, ref)
  await centerOn('ans2')
  await page.getByRole('button', { name: 'Accept', exact: true }).nth(1).click()
  await expect.poll(async () => (await pending(page)).sort()).toEqual(['lk1'])
  await centerOn('lk1')
  await page.getByRole('button', { name: 'Reject', exact: true }).click()
  await expect.poll(() => pending(page)).toEqual([])
  await expect(page.getByRole('region', { name: 'AI suggestions' })).toHaveCount(0)
  const after = await page.evaluate(() => (window as unknown as Win).unveilboard.getMap())
  expect(after.elements.map((e) => e.id)).toEqual(expect.arrayContaining(['obj2', 'ans2']))
  expect(after.links ?? []).toEqual([])
  // Ctrl+Z rétablit le lien écarté, toujours en suggestion.
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => pending(page)).toEqual(['lk1'])
})

test('sans IA branchée : copier la consigne, coller la réponse, ajouter en suggestions', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openTruthExample(page)
  // Sans IA branchée, quelle que soit la configuration du serveur de test.
  await page.evaluate(() => localStorage.setItem('ai-settings', JSON.stringify({ kind: 'clipboard' })))
  await page.reload()
  await page.waitForFunction(() => (window as unknown as { unveilboard?: { getMap(): { elements: unknown[] } } }).unveilboard?.getMap().elements.length === 8)
  await selectRef(page, 'objection')
  await page.getByRole('button', { name: '✦ AI…' }).click()
  const panel = page.getByRole('dialog', { name: 'Ask the AI from this element' })
  await panel.getByRole('textbox', { name: 'Your request' }).fill('Add an example.')
  await panel.getByRole('button', { name: 'Copy the prompt' }).click()
  const prompt = await page.evaluate(() => navigator.clipboard.readText())
  expect(prompt).toContain('Starting from the element `objection`')
  expect(prompt).toContain('"id": "justification"') // tout le schéma, par défaut
  const answer = { format: 'unveilboard/patch', version: 1, operations: [{ op: 'add', id: 'ex2', text: 'A doctor’s lie', parent: 'objection', relation: 'illustrates' }] }
  await panel.getByRole('textbox', { name: 'JSON to paste' }).fill(JSON.stringify(answer))
  await panel.getByRole('button', { name: 'Add as suggestions' }).click()
  await expect(panel.getByRole('status')).toHaveText('1 suggestion added: accept (✓) or reject (✕) each one on the diagram.')
  expect((await pending(page)).sort()).toEqual(['arrow', 'ex2'])
})

test('« Séquence (IA)… » : la boîte s’ouvre sur la séquence, avec l’ordre par défaut', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openTruthExample(page)
  await selectRef(page, 'question')
  await page.getByRole('button', { name: 'Sequence (AI)…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Work with an AI' })
  await expect(dialog.getByRole('radio', { name: 'Write the sequence' })).toHaveAttribute('aria-checked', 'true')
  await dialog.getByRole('button', { name: 'Copy the prompt' }).click()
  const prompt = await page.evaluate(() => navigator.clipboard.readText())
  expect(prompt).toContain('task: sequence')
  expect(prompt).toContain(
    'what the app\'s “Reveal the map” button does): `question`, `thesis`, `justification`, `assumption`, `example`, `objection`, `distinction`, `answer`.'
  )
})

test('accès permanent à l’IA : une icône, un menu (relecture, à partir de la sélection…)', async ({ page }) => {
  await openTruthExample(page)
  const icon = page.getByRole('button', { name: 'AI features' })
  const menu = page.getByRole('menu', { name: 'AI features' })
  await icon.click()
  await expect(menu.getByRole('menuitem')).toHaveText([
    'Develop the selected element…',
    'Create or change the diagram…',
    'Write the presentation sequence…',
    'Improve the look with AI…',
    'Critical review…',
    'Structure with a plan…',
    'New diagram from a text…',
    'Import a list, Markdown or JSON…',
    'Prompt library…',
    'AI settings…',
  ])
  await expect(menu.getByRole('menuitem', { name: 'Develop the selected element…' })).toBeDisabled()
  await page.screenshot({ path: 'test-results/ai-launcher.png' })
  await menu.getByRole('menuitem', { name: 'Critical review…' }).click()
  await expect(page.getByRole('complementary', { name: 'Critical review' })).toBeVisible()

  await selectRef(page, 'thesis')
  await icon.click()
  await menu.getByRole('menuitem', { name: 'Develop the selected element…' }).click()
  await expect(page.getByRole('dialog', { name: 'Ask the AI from this element' })).toBeVisible()
  // En présentation, pas d'icône.
  await page.getByRole('button', { name: '▶ Present' }).click()
  await expect(icon).toHaveCount(0)
})
