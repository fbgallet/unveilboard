import { expect, test, type Page } from '@playwright/test'

// Panneau de styles replié en un bouton (sous ceux du haut à droite), et étiquettes de flèche écrites
// avec un nom de départ d'une autre langue ou d'avant, remises dans la langue du schéma au chargement.

type Win = { editor: import('tldraw').Editor }

async function openTruthExample(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /Should we always tell the truth\?/ }).click()
  await page.waitForURL(/\?demo=truth/)
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard && document.querySelector('aside'))
  await page.waitForTimeout(1500)
}

test('panneau de styles : replié en un bouton, gardé replié, rouvert', async ({ page }) => {
  await openTruthExample(page)
  const panel = page.locator('.tlui-style-panel')
  await expect(panel).toBeVisible()
  await page.getByRole('button', { name: /Collapse the style panel/ }).click()
  await expect(panel).toHaveCount(0)
  const show = page.getByRole('button', { name: /Show the style panel/ })
  await expect(show).toBeVisible()

  await page.reload()
  await page.waitForFunction(() => (window as unknown as { editor?: unknown }).editor)
  await expect(show).toBeVisible()
  await expect(panel).toHaveCount(0)
  await show.click()
  await expect(panel).toBeVisible()
  await expect(show).toHaveCount(0)
})

test('étiquette de flèche au nom de départ d’une autre langue (ou d’avant) : remise dans la langue du schéma', async ({ page }) => {
  await openTruthExample(page)
  const labels = () =>
    page.evaluate(() => {
      const { editor } = window as unknown as Win
      return editor
        .getCurrentPageShapes()
        .filter((s) => s.type === 'arrow' && (s.meta.ref === 'lab1' || s.meta.ref === 'lab2' || s.meta.ref === 'lab3'))
        .map((s) => [s.meta.ref, JSON.stringify((s.props as { richText: unknown }).richText).match(/"text":"([^"]*)"/)?.[1]])
        .sort()
    })
  await page.evaluate(() => {
    const { editor } = window as unknown as Win
    const richText = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
    const arrow = (ref: string, text: string, y: number) =>
      editor.createShape({ type: 'arrow', x: 4000, y, props: { richText: richText(text) as never }, meta: { ref, preset: 'distinguishes' } })
    arrow('lab1', 'distinguishes', 4000) // ancien nom anglais
    arrow('lab2', 'se distingue de', 4200) // nom français
    arrow('lab3', 'my own words', 4400) // texte saisi à la main
  })
  await page.waitForTimeout(2000)
  await page.reload()
  await page.waitForFunction(() => (window as unknown as { editor?: unknown }).editor)
  await expect.poll(labels).toEqual([
    ['lab1', 'is distinct from'],
    ['lab2', 'is distinct from'],
    ['lab3', 'my own words'],
  ])
})
