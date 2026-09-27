import { expect, test } from '@playwright/test'
import { hiddenShapes, openExample, present, stepCounter } from './helpers'

test('double affichage : la fenêtre public suit, renvoie ses touches, attend hors présentation', async ({ page, context }) => {
  await openExample(page)
  await present(page)
  await page.getByTitle('More').click()
  const [screen] = await Promise.all([context.waitForEvent('page'), page.getByRole('menuitem', { name: /Project on a second screen/ }).click()])
  await expect(screen.locator('.screen-view')).toBeVisible()
  await expect(page.getByText('Audience screen connected')).toBeVisible()

  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
  await expect(stepCounter(page)).toHaveText('3 / 7')
  await expect.poll(() => hiddenShapes(screen)).toBe(await hiddenShapes(page))

  // Touche pressée dans la fenêtre public (télécommande) : jouée chez le présentateur.
  await screen.keyboard.press('ArrowRight')
  await expect(stepCounter(page)).toHaveText('4 / 7')
  await expect.poll(() => hiddenShapes(screen)).toBe(await hiddenShapes(page))

  // Narration au projecteur, à la demande.
  await expect(screen.locator('aside.narration')).toHaveCount(0)
  await page.getByLabel('Narration on the screen').check()
  await expect(screen.locator('aside.narration')).toBeVisible()

  // Fin de présentation : écran d'attente.
  await page.keyboard.press('Escape')
  await expect(screen.getByText('Waiting for the presentation')).toBeVisible()
})
