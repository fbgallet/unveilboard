import { expect, test } from '@playwright/test'
import { openExample, stepCounter } from './helpers'

// Lien de partage d'un schéma à plusieurs pages : toutes les pages se lisent, celles qui ont une
// séquence comme celles qui n'en ont pas, et on passe de l'une à l'autre en avançant.

type Win = { editor: import('tldraw').Editor }

test('lien de partage : toutes les pages, enchaînées en avançant et en reculant', async ({ page, context }) => {
  await openExample(page)
  // Page 2 : une étape ; page 3 : un contenu, sans séquence ; page 4 : vide (pas présentée).
  await page.evaluate(() => {
    const { editor } = window as unknown as Win
    editor.createPage({ name: 'Second' })
    editor.setCurrentPage(editor.getPages().at(-1)!.id)
    editor.createShape({ type: 'geo', x: 0, y: 0, props: { w: 200, h: 100 } })
    editor.selectAll()
  })
  await page.getByRole('button', { name: 'Step', exact: true }).click()
  await page.evaluate(() => {
    const { editor } = window as unknown as Win
    editor.createPage({ name: 'Third' })
    editor.setCurrentPage(editor.getPages().at(-1)!.id)
    editor.createShape({ type: 'geo', x: 0, y: 0, props: { w: 300, h: 100 } })
    editor.createPage({ name: 'Empty' })
    editor.setCurrentPage(editor.getPages()[0].id)
  })
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  await page.getByRole('button', { name: 'Create the link' }).click()
  const url = await page.locator('.share-dialog input').first().inputValue()

  const viewer = await context.newPage()
  await viewer.goto(url)
  await expect(viewer.locator('.studio')).toHaveAttribute('data-mode', 'present')
  const current = () => viewer.evaluate(() => (window as unknown as Win).editor.getCurrentPage().name)
  await expect(viewer.locator('.page-picker option')).toHaveText(['1. Page 1', '2. Second', '3. Third'])

  // Fin de la page 1 : la page suivante, au bouton du panneau comme à la flèche.
  // Fin : la dernière étape de la page, sans en sortir.
  await viewer.keyboard.press('End')
  await expect(stepCounter(viewer)).toHaveText('7 / 7')
  await viewer.keyboard.press('End')
  expect(await current()).toBe('Page 1')
  await viewer.getByRole('button', { name: 'Next page: Second →' }).click()
  await expect.poll(current).toBe('Second')
  await expect(stepCounter(viewer)).toHaveText('0 / 1')
  await viewer.keyboard.press('ArrowRight')
  await expect(stepCounter(viewer)).toHaveText('1 / 1')
  await viewer.keyboard.press('ArrowRight')
  // Page sans séquence : affichée telle quelle.
  await expect.poll(current).toBe('Third')
  await expect(stepCounter(viewer)).toHaveText('0 / 0')
  await expect(viewer.locator('.tl-shape.pres-hidden')).toHaveCount(0)
  await expect(viewer.locator('.tl-shape')).toHaveCount(1)
  await expect(viewer.getByRole('button', { name: /Next \(/ })).toBeDisabled()

  // Reculer : la dernière étape de la page précédente, puis son départ, puis la fin de la page 1.
  await viewer.keyboard.press('ArrowLeft')
  await expect.poll(current).toBe('Second')
  await expect(stepCounter(viewer)).toHaveText('1 / 1')
  await viewer.keyboard.press('ArrowLeft')
  await viewer.keyboard.press('ArrowLeft')
  await expect.poll(current).toBe('Page 1')
  await expect(stepCounter(viewer)).toHaveText('7 / 7')
})
