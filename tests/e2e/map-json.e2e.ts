import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

// Format JSON des schémas : export depuis l'exemple argumentatif, puis réimport comme nouveau schéma.

async function openTruthExample(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /Should we always tell the truth\?|Faut-il toujours dire la vérité \?/ }).click()
  await page.waitForURL(/\?demo=truth/)
  await page.waitForFunction(() => (window as unknown as { editor?: unknown }).editor && document.querySelector('aside'))
  await page.waitForTimeout(1500)
}

/** Résumé du document ouvert : formes, relations, séquence. */
const summary = (page: Page) =>
  page.evaluate(() => {
    const editor = (window as unknown as { editor: import('tldraw').Editor }).editor
    const shapes = editor.getCurrentPageShapes()
    const sequence = (editor.getDocumentSettings().meta as { sequence?: { steps: { actions: unknown[] }[] } }).sequence
    return {
      nodes: shapes.filter((s) => s.type === 'geo').length,
      relations: shapes.filter((s) => s.type === 'arrow' && s.meta.preset).length,
      argument: shapes.some((s) => s.meta.argument),
      steps: sequence?.steps.length,
      canUndo: editor.getCanUndo(),
    }
  })

test('exporter en JSON, puis réimporter comme nouveau schéma', async ({ page }) => {
  await openTruthExample(page)

  // Export : un fichier .unveilboard.json.
  await page.getByTestId('main-menu.button').click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByText('Export as JSON…').click()])
  expect(download.suggestedFilename()).toBe('Demo Should we always tell the truth.unveilboard.json')
  const json = await readFile(await download.path(), 'utf8')
  const map = JSON.parse(json)
  expect(map.format).toBe('unveilboard/map')
  expect(map.elements).toHaveLength(8)
  // Identifiants : ceux du JSON de l'exemple, gardés par les formes (meta.ref).
  expect(map.elements[0]).toMatchObject({ id: 'question', type: 'question', tree: { kind: 'argument' } })
  expect(map.elements.find((e: { relation?: string }) => e.relation === 'objects')).toMatchObject({
    type: 'statement',
    function: 'Objection',
    source: 'Constant, On Political Reactions',
  })
  expect(map.elements.find((e: { relation?: string }) => e.relation === 'supports')).toMatchObject({ reasoning: 'absurd' })
  expect(map.vocabulary.find((v: { id: string }) => v.id === 'presupposes')).toMatchObject({ kind: 'relation', direction: 'toChild' })
  expect(map.sequence.steps).toHaveLength(9)
  expect(map.sequence.steps[0]).toMatchObject({ camera: 'overview', actions: [{ do: 'show', targets: ['question'] }] })

  // Import : le JSON exporté, collé dans la boîte de dialogue, ouvre un nouveau schéma identique.
  await page.getByTestId('main-menu.button').click()
  await page.getByText('Paste JSON (diagram or changes)…').click()
  const dialog = page.getByRole('dialog', { name: 'Paste JSON' })
  await dialog.getByRole('textbox').fill(json)
  await expect(dialog.getByText('Valid: 8 elements, 9 steps.')).toBeVisible()
  await page.screenshot({ path: 'test-results/map-json-import-dialog.png' })
  const before = page.url()
  await dialog.getByRole('button', { name: 'Open as a new diagram' }).click()
  await page.waitForURL((url) => url.href !== before && /\/d\//.test(url.href))
  await page.waitForFunction(() => (window as unknown as { editor?: unknown }).editor && document.querySelector('aside'))
  await expect.poll(() => summary(page)).toEqual({ nodes: 8, relations: 7, argument: true, steps: 9, canUndo: false })
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'test-results/map-json-imported.png' })

  // Réexporté, le schéma importé donne le même JSON.
  await page.getByTestId('main-menu.button').click()
  const [again] = await Promise.all([page.waitForEvent('download'), page.getByText('Export as JSON…').click()])
  expect(await readFile(await again.path(), 'utf8')).toBe(json)
})

test('import : erreurs signalées, bouton désactivé', async ({ page }) => {
  await openTruthExample(page)
  await page.getByTestId('main-menu.button').click()
  await page.getByText('Paste JSON (diagram or changes)…').click()
  const dialog = page.getByRole('dialog', { name: 'Paste JSON' })
  await dialog.getByRole('textbox').fill(
    JSON.stringify({
      format: 'unveilboard/map',
      version: 1,
      elements: [
        { id: 'a', text: 'A' },
        { id: 'b', text: 'B', parent: 'zz', type: 'nope' },
      ],
    })
  )
  await expect(dialog.getByText('The parent is not an element of the diagram')).toBeVisible()
  await expect(dialog.getByText('Unknown element type')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Open as a new diagram' })).toBeDisabled()
  await page.screenshot({ path: 'test-results/map-json-errors.png' })
})

test.describe('en français', () => {
  test.use({ locale: 'fr-FR' })

  test('schéma écrit à la main : deux arbres, lien transversal, type créé, séquence', async ({ page }) => {
    await openTruthExample(page)
    const map = {
      format: 'unveilboard/map',
      version: 1,
      title: 'La technique nous rend-elle libres ?',
      vocabulary: [{ id: 'hypothese', kind: 'type', name: 'Hypothèse', style: { geo: 'ellipse', color: 'light-green', fill: 'semi', dash: 'dotted' } }],
      elements: [
        { id: 'q', type: 'question', text: 'La technique nous rend-elle libres ?', tree: { kind: 'argument', direction: 'down' } },
        { id: 'oui', text: 'Oui : elle nous libère des contraintes naturelles', parent: 'q', relation: 'answers', source: 'Descartes' },
        { id: 'non', text: 'Non : elle crée de nouvelles dépendances', parent: 'q', relation: 'answers' },
        { id: 'ex', text: 'Le téléphone portable', parent: 'non', relation: 'illustrates', note: 'Joignable partout, **tout le temps**.' },
        { id: 'h', type: 'hypothese', text: 'La liberté se mesure au pouvoir d’agir', parent: 'oui', relation: 'presupposes', origin: 'reconstruction' },
        { id: 'liberte', type: 'concept', text: 'Liberté', tree: { kind: 'mindmap', direction: 'both' } },
        { id: 'l1', text: 'Indépendance', parent: 'liberte' },
        { id: 'l2', text: 'Autonomie', parent: 'liberte', side: 'left' },
        { id: 'l3', text: 'Puissance', parent: 'liberte', relation: 'relates' },
      ],
      links: [{ id: 'lien', from: 'h', relation: 'defines', to: 'l3' }],
      sequence: {
        steps: [
          { title: 'La question', camera: 'overview', actions: [{ do: 'show', targets: ['q'] }] },
          { title: 'Deux réponses', actions: [{ do: 'show', targets: ['oui', 'non'] }] },
          { title: 'Un exemple', actions: [{ do: 'show', targets: ['ex'] }, { do: 'note', targets: ['ex'] }] },
          { title: 'La notion', camera: 'overview', actions: [{ do: 'show', targets: ['liberte', 'lien'] }] },
        ],
      },
    }
    await page.getByTestId('main-menu.button').click()
    await page.getByText('Coller du JSON (schéma ou modifications)…').click()
    const dialog = page.getByRole('dialog', { name: 'Coller du JSON' })
    await dialog.getByRole('textbox').fill(JSON.stringify(map))
    await expect(dialog.getByText('Valide : 9 éléments, 4 étapes.')).toBeVisible()
    const before = page.url()
    await dialog.getByRole('button', { name: 'Ouvrir comme nouveau schéma' }).click()
    await page.waitForURL((url) => url.href !== before && /\/d\//.test(url.href))
    await page.waitForFunction(() => (window as unknown as { editor?: unknown }).editor && document.querySelector('aside'))
    await expect.poll(() => summary(page)).toMatchObject({ nodes: 9, relations: 6, argument: true, steps: 4, canUndo: false })
    const shapes = await page.evaluate(() => {
      const editor = (window as unknown as { editor: import('tldraw').Editor }).editor
      const geo = editor.getCurrentPageShapes().filter((s) => s.type === 'geo')
      const byText = (t: string) => geo.find((s) => JSON.stringify(s.props).includes(t))!
      const b = (t: string) => editor.getShapePageBounds(byText(t).id)!
      return {
        hypothese: { geo: (byText('pouvoir d’agir').props as { geo: string }).geo, meta: byText('pouvoir d’agir').meta },
        down: b('Oui : elle').y > b('La technique nous').y,
        leftSide: b('Autonomie').x < b('Liberté').x,
        rightSide: b('Indépendance').x > b('Liberté').x,
        apart: b('Liberté').x > b('nouvelles dépendances').x,
      }
    })
    expect(shapes).toEqual({
      hypothese: { geo: 'ellipse', meta: { ref: 'h', preset: 'hypothese', origin: 'reconstruction' } },
      down: true,
      leftSide: true,
      rightSide: true,
      apart: true,
    })
    await page.evaluate(() => void (window as unknown as { editor: import('tldraw').Editor }).editor.zoomToFit())
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'test-results/map-json-handwritten.png' })
  })
})

test('texte des boîtes en Markdown : mis en forme, et rendu tel quel à l’export', async ({ page }) => {
  await openTruthExample(page)
  await page.waitForFunction(() => (window as unknown as { unveilboard?: { getMap(): { elements: unknown[] } } }).unveilboard?.getMap().elements.length === 8)
  const text = 'Mentir peut **sauver** une vie :\n- *le médecin*\n- l’ami caché'
  const result = await page.evaluate(async (t) => {
    const w = window as unknown as { unveilboard: import('../../src/lib/canvas/assistant').UnveilboardApi; editor: import('tldraw').Editor }
    await w.unveilboard.apply({
      format: 'unveilboard/patch',
      version: 1,
      operations: [{ op: 'add', id: 'md', text: t, note: 'Une **précision** brève.', parent: 'thesis', relation: 'objects' }],
    })
    const shape = w.editor.getCurrentPageShapes().find((s) => s.meta.ref === 'md')!
    return { rich: JSON.stringify(shape.props), exported: w.unveilboard.getMap().elements.find((e) => e.id === 'md') }
  }, text)
  expect(result.rich).toContain('"marks":[{"type":"bold"}]')
  expect(result.rich).toContain('"type":"bulletList"')
  expect(result.exported).toMatchObject({ text, note: 'Une **précision** brève.' })
  await page.evaluate(() => {
    const { editor } = window as unknown as { editor: import('tldraw').Editor }
    editor.select(editor.getCurrentPageShapes().find((s) => s.meta.ref === 'md')!.id)
    editor.zoomToSelection()
  })
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'test-results/markdown-box.png' })
})

test('étiquettes des relations dans la langue du contenu, pas dans celle de l’interface', async ({ page }) => {
  await openTruthExample(page) // interface en anglais
  await page.waitForFunction(() => (window as unknown as { unveilboard?: { getMap(): { elements: unknown[] } } }).unveilboard?.getMap().elements.length === 8)
  const map = {
    format: 'unveilboard/map',
    version: 1,
    title: 'La technique',
    lang: 'fr',
    elements: [
      { id: 'q', type: 'question', text: 'La technique nous libère-t-elle ?', tree: { kind: 'argument' } },
      { id: 't', text: 'Oui, elle nous affranchit de la nature', parent: 'q', relation: 'answers' },
      { id: 'j', text: 'Elle épargne les tâches pénibles', parent: 't', relation: 'supports', reasoning: 'analogy' },
    ],
  }
  const before = page.url()
  await page.evaluate((m) => (window as unknown as { unveilboard: import('../../src/lib/canvas/assistant').UnveilboardApi }).unveilboard.apply(m), map)
  await page.waitForURL((url) => url.href !== before && /\/d\//.test(url.href))
  await page.waitForFunction(() => (window as unknown as { unveilboard?: { getMap(): { elements: unknown[] } } }).unveilboard?.getMap().elements.length === 3)
  const labels = await page.evaluate(() => {
    const { editor } = window as unknown as { editor: import('tldraw').Editor }
    return editor
      .getCurrentPageShapes()
      .filter((s) => s.type === 'arrow')
      .map((s) => JSON.stringify(s.props).match(/"text":"([^"]+)"/)?.[1])
      .sort()
  })
  expect(labels).toEqual(['répond à', 'soutient · analogie'])
  // Ajout par l'IA ensuite : même langue (celle gardée dans le document).
  await page.evaluate(() =>
    (window as unknown as { unveilboard: import('../../src/lib/canvas/assistant').UnveilboardApi }).unveilboard.apply({
      format: 'unveilboard/patch',
      version: 1,
      operations: [{ op: 'add', id: 'o', text: 'Elle crée de nouvelles dépendances', parent: 't', relation: 'objects' }],
    })
  )
  const added = await page.evaluate(() => {
    const { editor } = window as unknown as { editor: import('tldraw').Editor }
    const o = editor.getCurrentPageShapes().find((s) => s.meta.ref === 'o')!
    const arrow = editor.getCurrentPageShapes().find((s) => s.type === 'arrow' && editor.getBindingsFromShape(s, 'arrow').some((b) => b.toId === o.id))!
    return JSON.stringify(arrow.props).match(/"text":"([^"]+)"/)?.[1]
  })
  expect(added).toBe('objecte')
})
