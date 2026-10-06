import { expect, test, type Page } from '@playwright/test'

// Bibliothèque de prompts : afficher une collection partagée, choisir une méthode dans une boîte de
// l'IA (elle part avec la consigne, avec la variante de la tâche), écrire un prompt personnel.

async function openTruthExample(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /Should we always tell the truth\?/ }).click()
  await page.waitForURL(/\?demo=truth/)
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard && document.querySelector('aside'))
  await page.waitForTimeout(1500)
}

async function openFromLauncher(page: Page, item: string) {
  await page.getByRole('button', { name: 'AI features' }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

async function copiedPrompt(page: Page, dialog: ReturnType<Page['getByRole']>) {
  await dialog.getByRole('button', { name: 'Copy the prompt' }).click()
  await expect(dialog.getByText(/^Copied \(\d+k characters\)/)).toBeVisible()
  return page.evaluate(() => navigator.clipboard.readText())
}

test('bibliothèque de prompts : collection partagée, méthode choisie, prompt personnel', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openTruthExample(page)

  // Interface en anglais : la collection de philosophie (en français) est masquée par défaut.
  await openFromLauncher(page, 'Prompt library…')
  const library = page.getByRole('dialog', { name: 'Prompt library' })
  const philosophy = library.getByRole('checkbox', { name: 'Philosophie › Dissertation (bac)' })
  await expect(philosophy).not.toBeChecked()
  await philosophy.check()
  await library.getByRole('checkbox', { name: 'Philosophie › Explication de texte (bac)' }).check()

  // Un prompt personnel, sans tâche cochée (proposé partout), avec une variante pour « expand ».
  await library.getByRole('button', { name: 'New prompt' }).click()
  await library.getByRole('textbox', { name: 'Title' }).fill('Counter-examples')
  await library.getByRole('textbox', { name: 'Prompt', exact: true }).fill('Always add a counter-example.\n\n## @expand\n\nOnly when developing an element.')
  await library.getByRole('button', { name: 'Save' }).click()
  await expect(library.getByText('Counter-examples')).toBeVisible()
  await library.getByText('Philosophie › Dissertation (bac)').click()
  await page.screenshot({ path: 'test-results/prompt-library.png' })
  await library.getByRole('button', { name: 'Close' }).last().click()

  // Création : la méthode partagée, avec sa variante pour la création.
  await openFromLauncher(page, 'Create or change the diagram…')
  const dialog = page.getByRole('dialog', { name: 'Work with an AI' })
  await dialog.getByRole('radio', { name: 'Create a diagram' }).click()
  await dialog.getByRole('combobox', { name: 'Method' }).selectOption({ label: 'Réseau conceptuel du sujet' })
  await expect(dialog.getByRole('textbox', { name: 'Your request' })).toHaveAttribute('placeholder', /Le sujet de dissertation/)
  await dialog.getByRole('textbox', { name: 'Your request' }).fill('La liberté revient-elle à faire ce qu’on veut ?')
  await page.screenshot({ path: 'test-results/prompt-picker.png' })
  let prompt = await copiedPrompt(page, dialog)
  expect(prompt).toContain('## The method to follow: Réseau conceptuel du sujet')
  expect(prompt).toContain('quinze à vingt-cinq éléments en tout')
  expect(prompt).not.toContain('Relis le schéma comme un réseau conceptuel')
  expect(prompt).not.toContain('## @')

  // Enrichir : le prompt personnel, sans la variante réservée au développement d'un élément.
  await dialog.getByRole('radio', { name: 'Enrich' }).click()
  await dialog.getByRole('combobox', { name: 'Method' }).selectOption({ label: 'Counter-examples' })
  prompt = await copiedPrompt(page, dialog)
  expect(prompt).toContain('## The method to follow: Counter-examples')
  expect(prompt).toContain('Always add a counter-example.')
  expect(prompt).not.toContain('Only when developing an element.')

  // Sans texte source, les prompts d'explication de texte ne sont pas proposés.
  const methods = dialog.getByRole('combobox', { name: 'Method' }).locator('option')
  await expect(methods.filter({ hasText: 'Structure argumentative du texte' })).toHaveCount(0)

  // Le choix est retenu par tâche.
  await dialog.getByRole('radio', { name: 'Create a diagram' }).click()
  await expect(dialog.getByRole('combobox', { name: 'Method' })).toHaveValue('philosophie/dissertation/reseau-conceptuel')

  await dialog.getByRole('button', { name: 'Close' }).click()

  // À partir d'un élément : la méthode suffit, la demande écrite devient facultative.
  await page.evaluate(() => {
    const { editor } = window as unknown as { editor: import('tldraw').Editor }
    editor.select(editor.getCurrentPageShapes().find((s) => s.meta.ref === 'thesis')!.id)
  })
  await openFromLauncher(page, 'Develop the selected element…')
  const panel = page.getByRole('dialog', { name: 'Ask the AI from this element' })
  const ask = panel.getByRole('button', { name: /Ask the AI|Copy the prompt/ })
  await expect(ask).toBeDisabled()
  await panel.getByRole('combobox', { name: 'Method' }).selectOption({ label: 'Réseau conceptuel du sujet' })
  await expect(panel.getByRole('textbox', { name: 'Your request' })).toHaveAttribute('placeholder', /the method is enough/)
  await expect(ask).toBeEnabled()

  await panel.getByRole('button', { name: 'Close' }).click()

  // Depuis un texte : seulement les prompts qui s'appuient sur un texte.
  await openFromLauncher(page, 'New diagram from a text…')
  const source = page.getByRole('dialog', { name: 'Create a diagram from a text' })
  const sourceMethods = source.getByRole('combobox', { name: 'Method' }).locator('option')
  await expect(sourceMethods.filter({ hasText: 'Structure argumentative du texte' })).toHaveCount(1)
  await expect(sourceMethods.filter({ hasText: 'Réseau conceptuel du sujet' })).toHaveCount(0)
})
