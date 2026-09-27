import { expect, test } from '@playwright/test'
import { fakeClientIp, openExample } from './helpers'

test('partage public : publier, lire, signaler, republier, filtre, limite, dépublier', async ({ page, context }) => {
  await fakeClientIp(page)
  await openExample(page)
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  const section = page.locator('.share-section').nth(1)
  await expect(section.locator('h3')).toHaveText('Short link')

  await section.getByRole('button', { name: 'Publish' }).click()
  const input = section.locator('input')
  await expect(input).toHaveValue(/\/p\/[\w-]{16}$/)
  const url = await input.inputValue()

  // QR code en grand : il encode le lien court.
  await section.getByRole('button', { name: 'QR code' }).click()
  await expect(page.locator('.qr-overlay svg')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.qr-overlay')).toHaveCount(0)

  // Lecture et signalement (sans Resend en développement : le message part dans la console du serveur).
  const viewer = await context.newPage()
  await viewer.goto(url)
  await expect(viewer.locator('.studio')).toHaveAttribute('data-mode', 'present')
  await viewer.getByRole('button', { name: 'Report' }).click()
  await viewer.locator('textarea[name=reason]').fill('Automated end-to-end test')
  await viewer.getByRole('button', { name: 'Send the report' }).click()
  await expect(viewer.getByText('Thank you, your report has been sent.')).toBeVisible()

  // Republication : même lien.
  await section.getByRole('button', { name: 'Publish the latest version' }).click()
  await expect(section.getByText(/Expires/)).toBeVisible()
  await expect(input).toHaveValue(url)

  // Terme refusé.
  await page.evaluate(() => {
    const editor = (window as unknown as { editor: import('tldraw').Editor }).editor
    const meta = editor.getDocumentSettings().meta as { sequence: { steps: { narration: string }[] } }
    const sequence = structuredClone(meta.sequence)
    sequence.steps[0].narration = 'Send your seed phrase here'
    editor.updateDocumentSettings({ meta: { ...meta, sequence } as never })
  })
  await section.getByRole('button', { name: 'Publish the latest version' }).click()
  await expect(section.getByText('cannot be published here')).toBeVisible()

  // 4e publication dans l'heure pour cette adresse : refusée.
  await section.getByRole('button', { name: 'Publish the latest version' }).click()
  await expect(section.getByText('Too many publications')).toBeVisible()

  page.on('dialog', (d) => d.accept())
  await section.getByRole('button', { name: 'Unpublish' }).click()
  await expect(section.getByRole('button', { name: 'Publish', exact: true })).toBeVisible()
  expect((await viewer.goto(url))?.status()).toBe(404)
})
