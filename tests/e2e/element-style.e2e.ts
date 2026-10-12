import { expect, test, type Page } from '@playwright/test'

// Couleurs d'un élément (onglet Élément et barre d'action) : le fond affiché est celui que tldraw
// dessine (« semi » est un fond uni, pas la couleur du contour), la section se replie, et le panneau
// de la barre reste dans le canevas quand la boîte est au bord.

type Win = { editor: import('tldraw').Editor }

async function openTruthExample(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /Should we always tell the truth\?/ }).click()
  await page.waitForURL(/\?demo=truth/)
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard && document.querySelector('aside'))
  await page.waitForTimeout(1500)
}

const fillOf = (page: Page, id: string) =>
  page.evaluate((id) => {
    const s = (window as unknown as Win).editor.getShape(id as never) as { props: { color: string; fill: string } }
    return { color: s.props.color, fill: s.props.fill }
  }, id)

test('couleurs : fond uni, teinté (pâle, vif, hachuré) ou transparent ; section repliable', async ({ page }) => {
  await openTruthExample(page)
  // Une boîte rouge au fond « semi » : tldraw la dessine sur un fond uni (couleur du canevas).
  const id = await page.evaluate(() => {
    const { editor } = window as unknown as Win
    const shape = editor.getCurrentPageShapes().find((s) => s.type === 'geo' && !editor.isShapeHidden(s))!
    editor.updateShape({ id: shape.id, type: 'geo', props: { color: 'red', fill: 'semi' } })
    editor.select(shape.id)
    return shape.id as string
  })
  const panel = page.locator('aside').last()
  await panel.getByRole('tab', { name: /Element/ }).click()

  // Repliée par défaut : seulement son titre (et l'aperçu).
  const fill = panel.getByRole('radiogroup', { name: 'Fill' })
  await expect(fill).toHaveCount(0)
  await panel.getByRole('button', { name: /Colors/ }).click()
  await expect(fill).toBeVisible()

  // Le fond affiché est « uni », pas le rouge du contour.
  await expect(fill.getByRole('radio', { name: 'Plain fill (canvas color)' })).toHaveAttribute('aria-checked', 'true')
  await expect(fill.getByRole('radio', { name: 'Red', exact: true })).toHaveAttribute('aria-checked', 'false')

  // Une couleur teinte la boîte (pâle), puis vif et hachuré.
  await fill.getByRole('radio', { name: 'Blue', exact: true }).click()
  expect(await fillOf(page, id)).toEqual({ color: 'blue', fill: 'solid' })
  const intensity = panel.getByRole('group', { name: 'Fill intensity' })
  await intensity.getByRole('button', { name: 'Vivid' }).click()
  expect(await fillOf(page, id)).toEqual({ color: 'blue', fill: 'fill' })
  await intensity.getByRole('button', { name: 'Hatched' }).click()
  expect(await fillOf(page, id)).toEqual({ color: 'blue', fill: 'pattern' })
  await expect(fill.getByRole('radio', { name: 'Blue', exact: true })).toHaveAttribute('aria-checked', 'true')

  // Sans fond : le contour garde sa couleur ; fond uni de nouveau.
  await fill.getByRole('radio', { name: 'No fill (transparent)' }).click()
  expect(await fillOf(page, id)).toEqual({ color: 'blue', fill: 'none' })
  await expect(intensity).toHaveCount(0)
  await fill.getByRole('radio', { name: 'Plain fill (canvas color)' }).click()
  expect(await fillOf(page, id)).toEqual({ color: 'blue', fill: 'semi' })

  // Repliée de nouveau, et gardée repliée après rechargement.
  await panel.getByRole('button', { name: /Colors/ }).click()
  await expect(fill).toHaveCount(0)
})

test('barre d’action : le panneau des couleurs reste dans le canevas quand la boîte est au bord gauche', async ({ page }) => {
  await openTruthExample(page)
  await page.evaluate(() => {
    const { editor } = window as unknown as Win
    const shape = editor.getCurrentPageShapes().find((s) => s.type === 'geo' && !editor.isShapeHidden(s))!
    editor.select(shape.id)
    // La boîte collée au bord gauche de la vue.
    const b = editor.getShapePageBounds(shape.id)!
    const vp = editor.getViewportPageBounds()
    editor.setCamera({ ...editor.getCamera(), x: editor.getCamera().x + (vp.minX - b.minX) - 10 })
  })
  await page.getByRole('button', { name: 'Fill and text color' }).click()
  const popover = page.locator('.tree-popover-colors')
  await expect(popover).toBeVisible()
  const box = (await popover.boundingBox())!
  const canvas = (await page.locator('.tl-container').first().boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(canvas.x)
  expect(box.x + box.width).toBeLessThanOrEqual(canvas.x + canvas.width)
})
