import { expect, test } from '@playwright/test'
import { openExample, present, stepCounter } from './helpers'

// Passe par le service public de PeerJS (mise en relation) : désactivé par défaut, pour ne pas
// dépendre d'un service externe. E2E_PEERJS=1 pour le lancer.
test.skip(!process.env.E2E_PEERJS, 'E2E_PEERJS=1 pour tester la télécommande (service PeerJS public)')

test('télécommande : appairage par le lien du QR code, commandes, état renvoyé au téléphone', async ({ page, browser }) => {
  await openExample(page)
  await present(page)
  await page.getByTitle('More').click()
  await page.getByRole('menuitem', { name: 'Phone remote' }).click()
  await expect(page.locator('.remote-qr svg')).toBeVisible()
  // Même adresse que le QR code, affichée en lien sous celui-ci.
  const href = await page.locator('.remote-link').getAttribute('href')
  const id = new URL(href!).hash.slice(1)

  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
  await phone.goto(`/r#${id}`)
  await expect(page.getByText(/Phone connected/)).toBeVisible()
  await phone.getByRole('button', { name: 'Next →' }).click()
  await expect(stepCounter(page)).toHaveText('1 / 7')
  await expect(phone.getByText('1 / 7')).toBeVisible()
})
