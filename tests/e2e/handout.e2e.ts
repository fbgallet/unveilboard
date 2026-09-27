import { expect, test } from '@playwright/test'
import { openExample } from './helpers'

test('polycopié : une partie par étape, images du schéma, PDF de plusieurs pages', async ({ page }) => {
  await openExample(page)
  await page.getByTestId('main-menu.button').click()
  await page.getByText('Handout (print / PDF)…').click()
  const steps = page.locator('.handout-step')
  await expect(steps).toHaveCount(7)
  await expect(page.locator('.handout-figure img').first()).toBeVisible()
  // Chaque image est chargée (taille naturelle non nulle).
  await expect
    .poll(() => page.locator('.handout-figure img').evaluateAll((imgs) => imgs.every((i) => (i as HTMLImageElement).naturalWidth > 0)))
    .toBe(true)
  await page.screenshot({ path: 'test-results/handout-screen.png' })

  // Rendu d'impression : seul le polycopié, sur plusieurs pages.
  const pdf = await page.pdf({ format: 'A4', path: 'test-results/handout.pdf' })
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
  expect(pages).toBeGreaterThan(1)

  await page.keyboard.press('Escape')
  await expect(page.locator('.handout-root')).toHaveCount(0)
})
