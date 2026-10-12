import { expect, test } from '@playwright/test'
import { openExample, present } from './helpers'

// Laser actif sans clic : le curseur devient un point lumineux (curseur du système masqué), qui laisse
// une traînée aussitôt effacée (vérifiée à l'œil) ; il disparaît quand on quitte le laser.

test('laser au survol : point lumineux, traînée éphémère, curseur masqué', async ({ page }) => {
  await openExample(page)
  await present(page)
  const container = page.locator('.tl-container').first()
  await page.keyboard.press('k')
  for (let i = 0; i < 10; i++) await page.mouse.move(300 + i * 20, 300)
  await expect(container).toHaveClass(/laser-hover/)
  const canvas = page.locator('.tl-canvas').first()
  expect(await canvas.evaluate((el) => getComputedStyle(el).cursor)).toBe('none')

  // Au-dessus d'un menu (ici, ⋯ de la barre de présentation, ouvert sur le canevas) : la flèche revient.
  await page.getByRole('button', { name: 'More' }).click()
  const item = page.getByRole('menuitem').first()
  await item.hover()
  await expect(container).not.toHaveClass(/laser-hover/)
  expect(await item.evaluate((el) => getComputedStyle(el).cursor)).not.toBe('none')
  await page.keyboard.press('Escape')
  for (let i = 0; i < 5; i++) await page.mouse.move(300 + i * 20, 320)
  await expect(container).toHaveClass(/laser-hover/)

  // Laser désactivé sans bouger : le curseur revient.
  await page.keyboard.press('k')
  await expect(container).not.toHaveClass(/laser-hover/)
})

test('laser au survol en édition aussi (outil laser de tldraw)', async ({ page }) => {
  await openExample(page)
  const container = page.locator('.tl-container').first()
  await page.evaluate(() => void (window as unknown as { editor: import('tldraw').Editor }).editor.setCurrentTool('laser'))
  for (let i = 0; i < 10; i++) await page.mouse.move(300 + i * 20, 300)
  await expect(container).toHaveClass(/laser-hover/)
  // Au-dessus de la barre d'outils de tldraw (dans le conteneur, par-dessus le canevas) : la flèche revient.
  const panel = page.locator('.tlui-toolbar').first()
  await panel.hover()
  await expect(container).not.toHaveClass(/laser-hover/)
  expect(await panel.evaluate((el) => getComputedStyle(el).cursor)).not.toBe('none')
  for (let i = 0; i < 5; i++) await page.mouse.move(300 + i * 20, 320)
  await expect(container).toHaveClass(/laser-hover/)
  await page.evaluate(() => void (window as unknown as { editor: import('tldraw').Editor }).editor.setCurrentTool('select'))
  await expect(container).not.toHaveClass(/laser-hover/)
})
