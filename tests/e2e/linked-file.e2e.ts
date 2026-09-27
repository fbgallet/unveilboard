import { expect, test, type Page } from '@playwright/test'
import { openExample } from './helpers'

// Fichier lié (File System Access API) : les sélecteurs de fichier natifs sont remplacés par un
// fichier du système de fichiers privé du navigateur (OPFS), qui offre les mêmes opérations.
// Le contexte de test étant privé, les liens restent en mémoire : leur enregistrement dans IndexedDB
// (profil normal) n'est pas couvert ici.

const readFile = (page: Page) =>
  page.evaluate(async () => {
    const dir = await navigator.storage.getDirectory()
    return (await (await dir.getFileHandle('drive.tldr')).getFile()).text()
  })

test('fichier lié : enregistrement automatique, modification ailleurs, réouverture sans doublon', async ({ page }) => {
  await page.addInitScript(() => {
    const handle = async () => (await navigator.storage.getDirectory()).getFileHandle('drive.tldr', { create: true })
    Object.assign(window, {
      showSaveFilePicker: handle,
      showOpenFilePicker: async () => [await handle()],
    })
  })
  await openExample(page)
  const docPath = new URL(page.url()).pathname
  const title = page.locator('aside header input').first()

  // Ctrl + S sans fichier lié : « Enregistrer sous », puis le fichier est lié.
  await page.keyboard.press('Control+s')
  await expect(page.locator('aside header').getByRole('button', { name: 'drive.tldr' })).toBeVisible()
  expect(await readFile(page)).toContain('The water cycle')

  // Les modifications sont écrites automatiquement.
  await title.fill('Renamed diagram')
  await expect.poll(() => readFile(page)).toContain('Renamed diagram')

  // Modifié ailleurs (dossier synchronisé) : chargé au retour sur l'onglet.
  await page.waitForTimeout(50)
  await page.evaluate(async () => {
    const file = await (await navigator.storage.getDirectory()).getFileHandle('drive.tldr')
    const text = (await file.getFile()).text()
    const writable = await file.createWritable()
    await writable.write((await text).replace('Renamed diagram', 'Edited elsewhere'))
    await writable.close()
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(title).toHaveValue('Edited elsewhere')
  // Rien ne reste à écrire : on peut quitter le schéma sans avertissement.
  await expect(page.locator('aside header [role=status]')).toHaveText('Saved')

  // Rouvrir le fichier depuis l'accueil rouvre le même schéma. Navigation interne : le contexte de test
  // est privé, les liens n'y sont gardés qu'en mémoire (voir tldrFile.ts).
  await page.getByRole('link', { name: 'My diagrams' }).click()
  await page.getByRole('button', { name: 'or open a .tldr file' }).click()
  await page.waitForURL(/\/d\//)
  expect(new URL(page.url()).pathname).toBe(docPath)
  await expect(title).toHaveValue('Edited elsewhere')
})
