import { expect, test } from '@playwright/test'

test('galerie : ouvrir l’exemple dans l’autre langue que celle du navigateur', async ({ page }) => {
  await page.goto('/')
  await page.screenshot({ path: 'test-results/home-examples.png', fullPage: true })
  await page.getByRole('button', { name: /Is freedom an illusion\?/ }).click()
  await page.waitForURL(/\/d\/.+\?demo=liberty/)
  await page.waitForFunction(() => (window as unknown as { editor?: unknown }).editor)
  await expect
    .poll(() =>
      page.evaluate(() => {
        const editor = (window as unknown as { editor: import('tldraw').Editor }).editor
        return (editor.getDocumentSettings().meta as { sequence?: { title?: string } }).sequence?.title
      })
    )
    .toBe('Démo : La liberté est-elle une illusion ?')
})

test('exemple d’arbre argumentatif : relations, natures, séquence, sans historique d’annulation', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Should we always tell the truth\?/ }).click()
  await page.waitForURL(/\?demo=truth/)
  await page.waitForFunction(() => (window as unknown as { editor?: unknown }).editor && document.querySelector('aside'))
  await expect
    .poll(() =>
      page.evaluate(() => {
        const editor = (window as unknown as { editor: import('tldraw').Editor }).editor
        const shapes = editor.getCurrentPageShapes()
        const sequence = (editor.getDocumentSettings().meta as { sequence?: { steps: unknown[] } }).sequence
        return {
          nodes: shapes.filter((s) => s.type === 'geo').length,
          relations: shapes.filter((s) => s.type === 'arrow' && s.meta.preset).length,
          argument: shapes.some((s) => s.meta.argument),
          steps: sequence?.steps.length,
          editing: editor.getEditingShapeId(),
          canUndo: editor.getCanUndo(),
        }
      })
    )
    .toEqual({ nodes: 8, relations: 7, argument: true, steps: 9, editing: null, canUndo: false })
})
