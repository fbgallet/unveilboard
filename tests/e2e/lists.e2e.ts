import { expect, test, type Page, type Route } from '@playwright/test'

// Listes : import (copie de Roam), collage sur le canevas et dans une boîte, cases à cocher,
// copie en liste, mise en forme par l'IA (simulée) et son annulation.

const LOCAL = 'http://127.0.0.1:65531/v1'
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }

type Win = { editor: import('tldraw').Editor; unveilboard: import('../../src/lib/canvas/assistant').UnveilboardApi }

const ROAM = `- {{[[TODO]]}} UI
    - {{[[TODO]]}} fold/unfold [[tout]] au niveau n
- {{[[TODO]]}} AI features
    - {{[[DONE]]}} presets
    - {{[[TODO]]}} custom prompts`

async function openTruthExample(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /Should we always tell the truth\?/ }).click()
  await page.waitForURL(/\?demo=truth/)
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard && document.querySelector('aside'))
  await page.waitForTimeout(1500)
}

/** Boîtes de la page : texte, case, parent (par texte). */
const boxes = (page: Page) =>
  page.evaluate(() => {
    const { editor } = window as unknown as Win
    const map = (window as unknown as Win).unveilboard.getMap()
    const byId = new Map(map.elements.map((e) => [e.id, e]))
    return map.elements.map((e) => ({ text: e.text, task: e.task, parent: e.parent ? byId.get(e.parent)?.text : undefined, n: editor.getCurrentPageShapes().length }))
  })

test('liste collée sur le canevas : carte mentale, cases cliquables, copie en liste', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openTruthExample(page)
  const before = (await boxes(page)).length
  await page.evaluate((text) => {
    const { editor } = window as unknown as Win
    editor.selectNone()
    const b = editor.getCurrentPageBounds()!
    void editor.putExternalContent({ type: 'text', text, point: { x: b.maxX + 400, y: b.minY } })
  }, ROAM)
  await expect.poll(async () => (await boxes(page)).length).toBe(before + 5)
  const texts = ['UI', 'fold/unfold tout au niveau n', 'AI features', 'presets', 'custom prompts']
  const added = (await boxes(page)).filter((b) => texts.includes(b.text))
  expect(added.map(({ text, task, parent }) => ({ text, task, parent }))).toEqual([
    { text: 'UI', task: 'todo', parent: undefined },
    { text: 'fold/unfold tout au niveau n', task: 'todo', parent: 'UI' },
    { text: 'AI features', task: 'todo', parent: undefined },
    { text: 'presets', task: 'done', parent: 'AI features' },
    { text: 'custom prompts', task: 'todo', parent: 'AI features' },
  ])

  // Un clic sur la case la coche, sans sélectionner ni déplacer la boîte.
  await page.evaluate(() => {
    const { editor } = window as unknown as Win
    editor.selectNone()
    editor.zoomToSelection()
  })
  const id = await page.evaluate(() => {
    const { editor } = window as unknown as Win
    const s = editor.getCurrentPageShapes().find((x) => x.meta.task === 'todo' && x.meta.ref && (window as unknown as Win).unveilboard.getMap().elements.find((e) => e.id === x.meta.ref)?.text === 'custom prompts')!
    editor.zoomToBounds(editor.getShapePageBounds(s.id)!, { inset: 200 })
    return s.id as string
  })
  await page.waitForTimeout(400)
  const xy = await page.evaluate((i) => {
    const { editor } = window as unknown as Win
    const b = editor.getShapePageBounds(i as never)!
    return { x: b.x, y: b.y, sel: editor.getSelectedShapeIds().length }
  }, id)
  const box = page.locator(`[data-shape-id="${id}"] .task-box`)
  await expect(box).toHaveAttribute('aria-checked', 'false')
  await box.click()
  await expect(box).toHaveAttribute('aria-checked', 'true')
  const after = await page.evaluate((i) => {
    const { editor } = window as unknown as Win
    const b = editor.getShapePageBounds(i as never)!
    return { task: editor.getShape(i as never)!.meta.task, x: b.x, y: b.y, sel: editor.getSelectedShapeIds().length }
  }, id)
  expect(after).toEqual({ task: 'done', x: xy.x, y: xy.y, sel: xy.sel })
  await page.screenshot({ path: 'test-results/lists-checkboxes.png' })

  // Copie en liste (menu ☰ › Fichier) : l'arbre et ses cases, en Markdown.
  await page.getByTestId('main-menu.button').click()
  await page.getByTestId('main-menu-sub.schema-file-menu-button').click()
  await page.getByText('Copy as a list (Markdown)').click()
  const list = await page.evaluate(() => navigator.clipboard.readText())
  expect(list).toContain('- [ ] AI features\n    - [x] presets\n    - [x] custom prompts')
})

test('liste collée dans une boîte : en branches de la boîte, ou comme texte', async ({ page }) => {
  await openTruthExample(page)
  const paste = (text: string) =>
    page.evaluate((t) => {
      const data = new DataTransfer()
      data.setData('text/plain', t)
      document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    }, text)
  const editThesis = () =>
    page.evaluate(() => {
      const { editor } = window as unknown as Win
      const thesis = editor.getCurrentPageShapes().find((s) => s.meta.ref === 'thesis')!
      editor.select(thesis.id)
      editor.setEditingShape(thesis.id)
    })

  await editThesis()
  await page.waitForTimeout(300)
  await paste('- First\n- Second')
  const dialog = page.getByRole('dialog', { name: 'Paste a list' })
  await expect(dialog.getByText('This list has 2 elements.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Add it as branches of this box' }).click()
  await expect.poll(async () => (await boxes(page)).filter((b) => b.text === 'First' || b.text === 'Second').map((b) => b.parent?.slice(0, 18))).toEqual([
    'Yes: truthfulness ',
    'Yes: truthfulness ',
  ])

  await editThesis()
  await page.waitForTimeout(300)
  await paste('- {{[[TODO]]}} One [[page]]\n    - Two')
  await dialog.getByRole('button', { name: 'Paste it as text in the box' }).click()
  await expect(dialog).toHaveCount(0)
  await page.evaluate(() => void (window as unknown as Win).editor.setEditingShape(null))
  const thesis = (await boxes(page)).find((b) => b.text.startsWith('Yes: truthfulness'))!
  expect(thesis.text).toContain('- ☐ One page')
  expect(thesis.text).toContain('- Two')
})

test('import sous l’élément sélectionné', async ({ page }) => {
  await openTruthExample(page)
  await page.evaluate(() => {
    const { editor } = window as unknown as Win
    editor.select(editor.getCurrentPageShapes().find((s) => s.meta.ref === 'objection')!.id)
  })
  await page.getByTestId('main-menu.button').click()
  await page.getByTestId('main-menu-sub.schema-file-menu-button').click()
  await page.getByText('Import a list, Markdown or JSON…').click()
  const dialog = page.getByRole('dialog', { name: 'Import' })
  await dialog.getByRole('textbox', { name: 'List, Markdown or JSON to import' }).fill(ROAM)
  await expect(dialog.getByText('List read: 6 elements on 3 levels.')).toBeVisible()
  await dialog.getByRole('checkbox', { name: 'Gather the 2 top-level items under one root' }).uncheck()
  await dialog.getByRole('radio', { name: /^under “/ }).check()
  await dialog.getByRole('button', { name: 'Open as a new diagram' }).or(dialog.locator('footer .btn-primary')).last().click()
  await expect(dialog).toHaveCount(0)
  const added = (await boxes(page)).filter((b) => b.text === 'UI' || b.text === 'AI features')
  expect(added.map((b) => b.parent?.slice(0, 20))).toEqual(['Telling the truth is', 'Telling the truth is'])
})

test('mise en forme par l’IA : seulement l’aspect, appliquée puis annulée', async ({ page }) => {
  const STYLE = {
    format: 'unveilboard/patch',
    version: 1,
    summary: 'The question stands out.',
    operations: [{ op: 'update', id: 'question', style: { size: 'xl', color: 'violet', fill: 'solid' } }],
  }
  const bodies: { messages: { content: string }[] }[] = []
  await page.route(`${LOCAL}/**`, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    bodies.push(route.request().postDataJSON())
    const body = `data: ${JSON.stringify({ model: 'fake', choices: [{ delta: { content: JSON.stringify(STYLE) } }] })}\n\ndata: [DONE]\n\n`
    await route.fulfill({ body, headers: { ...CORS, 'content-type': 'text/event-stream' } })
  })
  await openTruthExample(page)
  await page.evaluate((url) => localStorage.setItem('ai-settings', JSON.stringify({ kind: 'custom', customUrl: url, customModel: 'fake' })), LOCAL)
  await page.reload()
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard)
  await page.waitForTimeout(1000)
  const look = () =>
    page.evaluate(() => {
      const { editor } = window as unknown as Win
      const q = editor.getCurrentPageShapes().find((s) => s.meta.ref === 'question')!
      const p = q.props as { size: string; color: string }
      return `${p.size}/${p.color}`
    })
  const original = await look()

  await page.getByRole('button', { name: 'AI features' }).click()
  await page.getByRole('menuitem', { name: 'Improve the look with AI…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Work with an AI' })
  await expect(dialog.getByRole('radio', { name: 'Improve the look' })).toHaveAttribute('aria-checked', 'true')
  await dialog.getByRole('button', { name: 'Ask the AI' }).click()
  await expect(dialog.getByText(/^Valid changes/)).toBeVisible()
  expect(bodies[0].messages.map((m) => m.content).join('\n')).toContain('task: style')
  await dialog.getByRole('button', { name: 'Apply to this diagram' }).click()
  await expect(dialog.getByText('New look applied.')).toBeVisible()
  expect(await look()).toBe('xl/violet')
  // L'export garde l'aspect propre.
  const style = await page.evaluate(() => (window as unknown as Win).unveilboard.getMap().elements.find((e) => e.id === 'question')!.style)
  expect(style).toMatchObject({ size: 'xl', color: 'violet', fill: 'solid' })
  await dialog.getByRole('button', { name: 'Undo the new look' }).click()
  expect(await look()).toBe(original)
})

test('mise en forme : une réponse qui touche au texte est refusée', async ({ page }) => {
  await openTruthExample(page)
  await page.getByRole('button', { name: 'AI features' }).click()
  await page.getByRole('menuitem', { name: 'Improve the look with AI…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Work with an AI' })
  await dialog
    .getByRole('textbox', { name: 'List, Markdown or JSON to import' })
    .or(dialog.getByRole('textbox', { name: 'JSON to paste' }))
    .fill(JSON.stringify({ format: 'unveilboard/patch', version: 1, operations: [{ op: 'update', id: 'question', text: 'Changed' }] }))
  await expect(dialog.getByText('This operation is not allowed at this step')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Apply to this diagram' })).toBeDisabled()
})

test('Ctrl+V d’une liste copiée avec du HTML (Roam, page web) : carte mentale', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openTruthExample(page)
  await page.evaluate(() => void (window as unknown as Win).editor.selectNone())
  // Comme Roam : le texte brut garde les puces, le HTML les perd une fois réduit à son texte.
  await page.evaluate(async (text) => {
    const html = '<meta charset="utf-8"><span>UI</span><br><span>fold/unfold</span><br><span>AI features</span>'
    await navigator.clipboard.write([
      new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) }),
    ])
  }, ROAM)
  await page.locator('.tl-canvas').click({ position: { x: 300, y: 600 } })
  await page.keyboard.press('ControlOrMeta+v')
  await expect.poll(async () => (await boxes(page)).filter((b) => b.text === 'presets').map((b) => [b.parent, b.task])).toEqual([['AI features', 'done']])

  // Une page web : seulement du HTML avec une liste imbriquée.
  await page.evaluate(async () => {
    const html = '<ul><li>Freedom<ul><li>License</li><li>Autonomy</li></ul></li></ul>'
    await navigator.clipboard.write([
      new ClipboardItem({ 'text/plain': new Blob(['Freedom\nLicense\nAutonomy'], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) }),
    ])
    ;(window as unknown as Win).editor.selectNone()
  })
  await page.locator('.tl-canvas').click({ position: { x: 300, y: 300 } })
  await page.keyboard.press('ControlOrMeta+v')
  await expect
    .poll(async () => (await boxes(page)).filter((b) => ['Freedom', 'License', 'Autonomy'].includes(b.text)).map((b) => [b.text, b.parent]))
    .toEqual([
      ['Freedom', undefined],
      ['License', 'Freedom'],
      ['Autonomy', 'Freedom'],
    ])
})
