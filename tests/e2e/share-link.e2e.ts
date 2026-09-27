import { expect, test } from '@playwright/test'
import { openExample, stepCounter } from './helpers'

test('lien contenant le schéma : lecture seule, étapes, Échap sans effet, lien abîmé', async ({ page, context }) => {
  await openExample(page)
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  await page.getByRole('button', { name: 'Create the link' }).click()
  const url = await page.locator('.share-dialog input').first().inputValue()
  expect(url).toMatch(/\/p#v1\./)

  const viewer = await context.newPage()
  await viewer.goto(url)
  await expect(viewer.locator('.studio')).toHaveAttribute('data-mode', 'present')
  for (let i = 0; i < 3; i++) await viewer.keyboard.press('ArrowRight')
  await expect(stepCounter(viewer)).toHaveText('3 / 7')
  await viewer.keyboard.press('Escape')
  await expect(viewer.locator('.studio')).toHaveAttribute('data-mode', 'present')
  expect(await viewer.evaluate(() => (window as unknown as { editor: { getInstanceState(): { isReadonly: boolean } } }).editor.getInstanceState().isReadonly)).toBe(true)
  await expect(viewer.getByTitle(/Exit the presentation/)).toHaveCount(0)

  await viewer.goto('/p#v1.damaged')
  await expect(viewer.getByText('This link is incomplete or damaged')).toBeVisible()
})
