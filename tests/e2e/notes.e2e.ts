import { expect, test, type Page } from '@playwright/test'

// Notes d'objets en mode édition : lues et écrites dans l'onglet Élément du panneau de droite,
// sans passer par la séquence ; marque ¶ sur le canevas, entrée du menu contextuel.

type Win = { editor: import('tldraw').Editor }
type Id = import('tldraw').TLShapeId

async function openTruthExample(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /Should we always tell the truth\?/ }).click()
  await page.waitForURL(/\?demo=truth/)
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard && document.querySelector('aside'))
  await page.waitForTimeout(1500)
}

const noteOf = (page: Page, id: string) =>
  page.evaluate((id) => (window as unknown as Win).editor.getShape(id as Id)?.meta.note as string | undefined, id)

test('note en édition : onglet Élément, marque ¶, menu contextuel', async ({ page }) => {
  await openTruthExample(page)
  const panel = page.locator('aside').last()
  const tabs = panel.getByRole('tablist', { name: 'Panel: sequence, element or chat' })

  // Onglet Élément sans sélection : une consigne.
  await page.evaluate(() => void (window as unknown as Win).editor.selectNone())
  await tabs.getByRole('tab', { name: 'Element' }).click()
  await expect(panel.getByText(/Select an element on the canvas/)).toBeVisible()

  // Une boîte sans note, sélectionnée : on lui ajoute une note.
  const id = await page.evaluate(() => {
    const { editor } = window as unknown as Win
    const shape = editor.getCurrentPageShapes().find((s) => s.type === 'geo' && !s.meta.note && !editor.isShapeHidden(s))!
    editor.select(shape.id)
    editor.zoomToSelection()
    return shape.id as string
  })
  await panel.getByRole('button', { name: 'Add a note' }).click()
  await panel.getByRole('textbox', { name: 'Object note' }).fill('Un **développement** de la boîte.')
  await expect.poll(() => noteOf(page, id)).toBe('Un **développement** de la boîte.')
  await panel.getByRole('button', { name: 'Done' }).click()
  await expect(panel.locator('strong', { hasText: 'développement' })).toBeVisible()

  // Taille du texte de l'onglet, comme pour la narration.
  const body = panel.locator('strong', { hasText: 'développement' }).locator('xpath=ancestor::div[1]')
  const size = async () => parseFloat(await body.evaluate((el) => getComputedStyle(el).fontSize))
  const before = await size()
  await panel.getByRole('button', { name: 'A+' }).click()
  expect(await size()).toBeGreaterThan(before)
  await panel.getByRole('button', { name: '110 %' }).click()
  expect(await size()).toBe(before)

  // Menu IA : une demande toute faite ouvre le panneau de l'IA prérempli.
  await panel.getByRole('button', { name: 'AI', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Objections' }).click()
  await expect(page.locator('textarea').filter({ hasText: /objections/i }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).click()

  // Onglet Séquence, objet désélectionné : la marque ¶ le resélectionne et rouvre l'onglet Élément.
  await tabs.getByRole('tab', { name: 'Sequence' }).click()
  await page.evaluate(() => void (window as unknown as Win).editor.selectNone())
  await page.evaluate((id) => {
    const b = (window as unknown as Win).editor.getShapePageBounds(id as Id)!
    const el = [...document.querySelectorAll<HTMLElement>('.note-marker')].find((m) => Math.abs(parseFloat(m.style.left) - b.maxX) < 1)!
    el.click()
  }, id)
  await expect(tabs.getByRole('tab', { name: /Element/ })).toHaveAttribute('aria-selected', 'true')
  await expect(panel.locator('strong', { hasText: 'développement' })).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as Win).editor.getSelectedShapeIds())).toEqual([id])

  // Panneau replié : ses trois onglets, l'actif mis en évidence ; chacun rouvre le panneau sur lui.
  await panel.getByRole('button', { name: 'Collapse the panel' }).click()
  const rail = page.getByRole('navigation', { name: 'Panel: sequence, element or chat' })
  await expect(rail.getByRole('button', { name: /^Element/ })).toHaveAttribute('aria-current', 'true')
  await rail.getByRole('button', { name: /^Chat/ }).click()
  await expect(page.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true')

  // Menu contextuel d'un autre objet sans note : « Add a note » ouvre directement la saisie.
  await tabs.getByRole('tab', { name: 'Sequence' }).click()
  const other = await page.evaluate((id) => {
    const { editor } = window as unknown as Win
    const shape = editor.getCurrentPageShapes().find((s) => s.type === 'geo' && s.id !== id && !s.meta.note && !editor.isShapeHidden(s))!
    editor.select(shape.id)
    editor.zoomToSelection()
    const c = editor.pageToViewport(editor.getShapePageBounds(shape.id)!.center)
    return { id: shape.id, x: c.x, y: c.y }
  }, id)
  const canvas = await page.locator('.tl-canvas').boundingBox()
  await page.mouse.click(canvas!.x + other.x, canvas!.y + other.y, { button: 'right' })
  await page.getByRole('menuitem', { name: 'Add a note' }).click()
  await expect(panel.getByRole('textbox', { name: 'Object note' })).toBeVisible()
  await panel.getByRole('textbox', { name: 'Object note' }).fill('Seconde note')
  await expect.poll(() => noteOf(page, other.id)).toBe('Seconde note')
})
