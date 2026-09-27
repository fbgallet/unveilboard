import { expect, test } from '@playwright/test'
import { openExample, present } from './helpers'

test('aide des raccourcis : touche ?, Échap la ferme sans quitter, accès par le menu ⋯', async ({ page }) => {
  await openExample(page)
  await present(page)
  await page.keyboard.press('?')
  await expect(page.getByRole('dialog', { name: 'Presentation shortcuts' })).toBeVisible()
  await page.screenshot({ path: 'test-results/shortcuts-help.png' })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Presentation shortcuts' })).toHaveCount(0)
  await expect(page.locator('.studio')).toHaveAttribute('data-mode', 'present')

  await page.getByTitle('More').click()
  await page.getByRole('menuitem', { name: 'Keyboard shortcuts (?)' }).click()
  await expect(page.getByRole('dialog', { name: 'Presentation shortcuts' })).toBeVisible()
})
