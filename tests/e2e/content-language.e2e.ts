import { expect, test } from '@playwright/test'

// Langue du contenu que l'app ne traduit pas : les noms de relations donnés par l'IA (dans
// `vocabulary`, sous l'identifiant d'une relation connue) étiquettent les flèches, sont gardés
// par le document, et repartent vers l'IA et dans l'export JSON.

type Win = { editor: import('tldraw').Editor; unveilboard: import('../../src/lib/canvas/assistant').UnveilboardApi }

const GERMAN = {
  format: 'unveilboard/map',
  version: 1,
  title: 'Freiheit',
  lang: 'de',
  vocabulary: [
    { id: 'supports', kind: 'relation', name: 'stützt' },
    { id: 'objects', kind: 'relation', name: 'widerspricht' },
  ],
  elements: [
    { id: 'q', text: 'Ist Freiheit, zu tun, was man will?', type: 'question' },
    { id: 't', text: 'Frei ist, wer tut, was er will', parent: 'q', relation: 'answers' },
    { id: 'j', text: 'Niemand hindert mich', parent: 't', relation: 'supports' },
    { id: 'o', text: 'Wünsche sind nicht gewählt', parent: 't', relation: 'objects' },
  ],
}

test('langue sans libellés de l’app : étiquettes des relations données par l’IA, gardées et réutilisées', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Should we always tell the truth\?/ }).click()
  await page.waitForURL(/\?demo=truth/)
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard && document.querySelector('aside'))
  const start = page.url()
  const result = await page.evaluate((map) => (window as unknown as Win).unveilboard.apply(map), GERMAN)
  expect(result.ok).toBe(true)
  await page.waitForURL((u) => u.toString() !== start)
  await page.waitForFunction(() => ((window as unknown as Partial<Win>).unveilboard?.getMap().elements.length ?? 0) >= 4)

  const labels = await page.evaluate(() =>
    (window as unknown as Win).editor
      .getCurrentPageShapes()
      .filter((s) => s.type === 'arrow')
      .map((s) => JSON.stringify(s.props))
      .join(' ')
  )
  expect(labels).toContain('stützt')
  expect(labels).toContain('widerspricht')
  // « answers », non renommé : l'étiquette de l'app reste.
  expect(labels).toMatch(/answers|répond/)

  const exported = await page.evaluate(() => (window as unknown as Win).unveilboard.getMap())
  expect(exported.lang).toBe('de')
  expect(exported.vocabulary?.find((v) => v.id === 'supports')?.name).toBe('stützt')

  const prompt = await page.evaluate(() => (window as unknown as Win).unveilboard.getPrompt('enrich'))
  expect(prompt).toContain('`supports` (stützt)')
  expect(prompt).toContain('in German, except quotations')
})

test('langue du contenu : automatique par défaut, modifiable pour une création', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await page.getByRole('button', { name: /Should we always tell the truth\?/ }).click()
  await page.waitForURL(/\?demo=truth/)
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard && document.querySelector('aside'))
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: 'AI features' }).click()
  await page.getByRole('menuitem', { name: 'Create or change the diagram…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Work with an AI' })
  await dialog.getByRole('radio', { name: 'Create a diagram' }).click()
  await expect(dialog.getByText('Language: automatic.')).toBeVisible()
  await dialog.getByRole('textbox', { name: 'Your request' }).fill('La liberté')
  const copy = async () => {
    await dialog.getByRole('button', { name: 'Copy the prompt' }).click()
    return page.evaluate(() => navigator.clipboard.readText())
  }
  expect(await copy()).toContain("otherwise in the language of the user's request")

  await dialog.getByText('Language: automatic.').locator('..').getByRole('button', { name: 'Change' }).click()
  await dialog.getByRole('combobox', { name: 'Language' }).selectOption('es')
  await expect(dialog.getByText('Language: Spanish.')).toBeVisible()
  expect(await copy()).toContain('in Spanish, except quotations')
})
