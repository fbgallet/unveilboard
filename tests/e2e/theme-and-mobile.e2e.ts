import { devices, expect, test } from '@playwright/test'
import { openExample, present } from './helpers'

test('mode sombre : les panneaux suivent le thème de tldraw', async ({ page }) => {
  await openExample(page)
  await expect(page.locator('.studio')).toHaveAttribute('data-theme', 'light')
  await page.evaluate(() => (window as unknown as { editor: import('tldraw').Editor }).editor.user.updateUserPreferences({ colorScheme: 'dark' }))
  await expect(page.locator('.studio')).toHaveAttribute('data-theme', 'dark')
  // Fond du panneau de séquence : sombre (luminance faible).
  const lightness = await page.evaluate(() => {
    const [r, g, b] = getComputedStyle(document.querySelector('aside')!).backgroundColor.match(/[\d.]+/g)!.map(Number)
    return (r + g + b) / 3
  })
  expect(lightness).toBeLessThan(60)
})

test('téléphone en portrait : la narration passe sous le schéma', async ({ page, browser }) => {
  await openExample(page)
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  await page.getByRole('button', { name: 'Create the link' }).click()
  const url = await page.locator('.share-dialog input').first().inputValue()

  const phone = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage()
  await phone.goto(url)
  await expect(phone.locator('aside.narration')).toBeVisible()
  const canvas = await phone.locator('.tl-container').boundingBox()
  const narration = await phone.locator('aside.narration').boundingBox()
  expect(narration!.y).toBeGreaterThanOrEqual(canvas!.y + canvas!.height - 1)
  expect(narration!.width).toBeGreaterThan(300)
})

test('téléphone : le menu « ⋯ » de la présentation reste entièrement à l’écran, sans les options réservées à l’ordinateur', async ({ browser }) => {
  for (const device of ['iPhone 13', 'iPhone SE']) {
    const phone = await (await browser.newContext({ ...devices[device] })).newPage()
    await openExample(phone)
    await present(phone)
    await phone.locator('.progress').getByRole('button', { name: 'More' }).click()
    const menu = phone.locator('.more-menu')
    await expect(menu).toBeVisible()
    await phone.waitForTimeout(300)
    const box = (await menu.boundingBox())!
    expect(box.x, device).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width, device).toBeLessThanOrEqual(phone.viewportSize()!.width)
    expect(box.y, device).toBeGreaterThanOrEqual(0)
    await expect(menu.getByRole('menuitem', { name: /Phone remote/ })).toBeHidden()
    await phone.context().close()
  }
})

test('bouton du mode sombre, à côté de celui du texte source : tldraw et les panneaux suivent', async ({ page }) => {
  await openExample(page)
  const studio = page.locator('.studio')
  await expect(studio).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: 'Dark mode' }).click()
  await expect(studio).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Light mode' }).click()
  await expect(studio).toHaveAttribute('data-theme', 'light')
})
