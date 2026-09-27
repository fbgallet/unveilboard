import { expect, test } from '@playwright/test'

test('mentions légales : éditeur, confidentialité, formulaire de contact, lien depuis l’accueil', async ({ page }) => {
  const response = await page.goto('/legal')
  test.skip(response?.status() === 404, 'LEGAL_PUBLISHER non défini sur ce serveur')
  await expect(page.getByRole('heading', { name: 'Legal notice and privacy' })).toBeVisible()
  await expect(page.getByText(/This site is published by/)).toBeVisible()
  await expect(page.getByText('Your data', { exact: true })).toBeVisible()

  await page.locator('textarea[name=message]').fill('Automated end-to-end test')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Thank you, your message has been sent.')).toBeVisible()

  await page.goto('/')
  await page.getByRole('link', { name: 'Legal notice & privacy' }).click()
  await expect(page).toHaveURL(/\/legal$/)
})
