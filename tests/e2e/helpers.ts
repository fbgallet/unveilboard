import { expect, type Page } from '@playwright/test'

/** Crée le schéma d'exemple (cycle de l'eau) depuis l'accueil et attend l'éditeur. Interface en anglais (locale du navigateur). */
export async function openExample(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the example' }).click()
  await page.waitForURL(/\/d\//)
  await page.waitForFunction(() => (window as unknown as { editor?: unknown }).editor && document.querySelector('aside'))
  // Laisse la synchronisation écrire l'exemple.
  await page.waitForTimeout(1500)
}

export async function present(page: Page) {
  await page.getByRole('button', { name: '▶ Present' }).click()
  await expect(page.locator('.studio')).toHaveAttribute('data-mode', 'present')
}

/** Compteur d'étapes de la barre de présentation (« 3 / 7 »). */
export const stepCounter = (page: Page) => page.locator('.progress span.tabular-nums')

/** Nombre de formes cachées par la séquence (même valeur attendue dans deux fenêtres synchronisées). */
export const hiddenShapes = (page: Page) => page.evaluate(() => document.querySelectorAll('.tl-shape.pres-hidden').length)

/** Une adresse IP différente par test : les limites de publication sont comptées par IP. */
export async function fakeClientIp(page: Page) {
  const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.1`
  // Seulement vers notre API : un en-tête ajouté aux requêtes du CDN de tldraw les ferait refuser (CORS).
  // Sur tout le contexte : les autres onglets du test (lecteur d'un lien) ont la même adresse.
  await page.context().route('**/api/**', (route) => route.continue({ headers: { ...route.request().headers(), 'x-forwarded-for': ip } }))
}
