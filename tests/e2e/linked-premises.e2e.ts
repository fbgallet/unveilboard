import { expect, test, type Page } from '@playwright/test'

// Prémisses liées : une pastille entre la conclusion et des prémisses qui ne valent qu'ensemble.

type Win = {
  editor: import('tldraw').Editor
  unveilboard: { apply(json: object): Promise<{ ok: boolean; problems: string[] }> }
}

async function openTruthExample(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /Should we always tell the truth\?/ }).click()
  await page.waitForURL(/\?demo=truth/)
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard && document.querySelector('aside'))
  await page.waitForTimeout(1500)
}

/** Pastilles, et pour chacune : taille, couleur, remplissage, prémisses, texte de sa flèche. */
const junctions = (page: Page) =>
  page.evaluate(() => {
    const { editor } = window as unknown as Win
    const text = (id: string) => {
      const s = editor.getShape(id as never)
      return s && 'richText' in s.props ? editor.getShapeUtil(s).getText(s) ?? '' : ''
    }
    const arrows = editor.getCurrentPageShapes().filter((s) => s.type === 'arrow')
    const ends = (a: (typeof arrows)[number]) => {
      const b = editor.getBindingsFromShape(a, 'arrow') as { toId: string; props: { terminal: string } }[]
      return { from: b.find((x) => x.props.terminal === 'start')?.toId, to: b.find((x) => x.props.terminal === 'end')?.toId }
    }
    return editor
      .getCurrentPageShapes()
      .filter((s) => s.meta.preset === 'linked')
      .map((j) => {
        const b = editor.getShapePageBounds(j.id)!
        const props = j.props as { color: string; fill: string }
        const premises = arrows.filter((a) => a.meta.preset === 'premise' && ends(a).from === j.id)
        const own = arrows.find((a) => ends(a).to === j.id)!
        return {
          id: String(j.id),
          size: [Math.round(b.w), Math.round(b.h)],
          color: props.color,
          fill: props.fill,
          premises: premises.map((a) => String(ends(a).to)),
          premiseColors: premises.map((a) => (editor.getShape(ends(a).to as never)!.props as { color: string }).color),
          edge: { id: String(own.id), relation: String(own.meta.preset), text: text(own.id) },
        }
      })
  })

test('prémisse liée à une justification : pastille, couleurs, étiquette et séquence reprises', async ({ page }) => {
  await openTruthExample(page)
  const node = await page.evaluate(() => {
    const { editor } = window as unknown as Win
    const edge = editor.getCurrentPageShapes().find((s) => s.type === 'arrow' && s.meta.branch && s.meta.preset === 'supports')!
    const child = (editor.getBindingsFromShape(edge, 'arrow') as { toId: string; props: { terminal: string } }[]).find((b) => b.props.terminal === 'end')!.toId
    editor.select(child as never)
    return { id: child, edge: edge.id }
  })
  await page.getByRole('button', { name: '+ Linked premise' }).click()
  await page.keyboard.type('Lying to one person is lying to all')
  await page.keyboard.press('Escape')

  const [j] = await junctions(page)
  expect(j).toMatchObject({ size: [18, 18], color: 'green', fill: 'fill', premiseColors: ['green', 'green'] })
  expect(j.premises).toContain(node.id)
  expect(j.edge).toMatchObject({ relation: 'supports', text: 'supports · reductio' })

  // La pastille apparaît à la même étape que le nœud, sa flèche avec celle du nœud.
  type Ids = { node: string; junction: string; edge: string; junctionEdge: string }
  const ids: Ids = { node: node.id, junction: j.id, edge: node.edge as string, junctionEdge: j.edge.id }
  const shownTogether = await page.evaluate(({ node, junction, edge, junctionEdge }: Ids) => {
    const seq = (window as unknown as Win).editor.getDocumentSettings().meta.sequence as { steps: { actions: { type: string; targets: string[] }[] }[] }
    const stepOf = (id: string) => seq.steps.findIndex((s) => s.actions.some((a) => a.type === 'show' && a.targets.includes(id)))
    return [stepOf(node) === stepOf(junction), stepOf(edge) === stepOf(junctionEdge), stepOf(junction) >= 0]
  }, ids)
  expect(shownTogether).toEqual([true, true, true])

  // Entrée sur la pastille : une prémisse de plus.
  await page.evaluate((id: string) => {
    const { editor } = window as unknown as Win
    editor.select(id as never)
  }, j.id)
  await page.keyboard.press('Enter')
  await page.keyboard.type('Every lie weakens trust')
  await page.keyboard.press('Escape')
  expect((await junctions(page))[0].premises).toHaveLength(3)
})

test('IA : des prémisses liées ajoutées par le format de modifications', async ({ page }) => {
  await openTruthExample(page)
  const result = await page.evaluate(() =>
    (window as unknown as Win).unveilboard.apply({
      format: 'unveilboard/patch',
      version: 1,
      operations: [
        { op: 'add', id: 'l1', text: '', type: 'linked', parent: 'thesis', relation: 'supports' },
        { op: 'add', id: 'p1', text: 'A duty admits no exception', parent: 'l1', relation: 'premise' },
        { op: 'add', id: 'p2', text: 'Truthfulness is a duty', parent: 'l1', relation: 'premise' },
      ],
    })
  )
  expect(result).toMatchObject({ ok: true })
  await expect.poll(async () => (await junctions(page)).length).toBe(1)
  const [j] = await junctions(page)
  expect(j).toMatchObject({ size: [18, 18], color: 'green', premiseColors: ['green', 'green'], edge: { relation: 'supports' } })
})
