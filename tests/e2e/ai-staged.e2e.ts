import { expect, test, type Page, type Route } from '@playwright/test'

// Création d'un schéma riche en plusieurs étapes : plan relu et modifié, sections en parallèle
// (une section coupée deux fois, puis relancée), finition, schéma prêt à ouvrir. IA simulée.

const LOCAL = 'http://127.0.0.1:65530/v1'
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }

const sse = (text: string, complete = true) =>
  `data: ${JSON.stringify({ model: 'fake', choices: [{ delta: { content: text } }] })}\n\n` + (complete ? 'data: [DONE]\n\n' : '')

const plan = {
  format: 'unveilboard/plan',
  version: 1,
  title: 'L’allégorie de la caverne',
  lang: 'fr',
  summary: 'Les étapes du récit, puis leur sens d’ensemble.',
  kind: 'mindmap',
  root: { id: 'root', text: 'L’allégorie de la caverne' },
  pattern: 'Chaque étape → son interprétation → son intérêt philosophique.',
  sections: [
    { id: 's1', text: 'Les prisonniers prennent les ombres pour le réel', brief: 'La situation initiale.', size: 2 },
    { id: 's2', text: 'La libération est douloureuse', brief: 'La montée.', size: 2 },
    { id: 's3', text: 'L’allégorie décrit l’éducation', brief: 'Sens d’ensemble.', synthesis: true },
  ],
}

const develop = (id: string) => ({
  format: 'unveilboard/patch',
  version: 1,
  operations: [
    { op: 'add', id: `${id}-1`, text: `Interprétation de ${id}`, parent: id, relation: 'explains' },
    { op: 'add', id: `${id}-2`, text: `Intérêt philosophique de ${id}`, parent: `${id}-1` },
  ],
})

const finish = {
  format: 'unveilboard/patch',
  version: 1,
  operations: [
    { op: 'link', id: 'l1', from: 's3-1', to: 's1-1' },
    {
      op: 'sequence',
      mode: 'replace',
      steps: [
        { title: 'La caverne', camera: 'overview', actions: [{ do: 'show', targets: ['root'] }] },
        { title: 'Les prisonniers', actions: [{ do: 'show', targets: ['s1'] }] },
      ],
    },
  ],
}

test('schéma riche : plan relu et modifié, sections en parallèle, section relancée, finition', async ({ page }) => {
  const prompts: string[] = []
  let s2Attempts = 0
  await page.route(`${LOCAL}/**`, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const prompt: string = route.request().postDataJSON().messages[0].content
    prompts.push(prompt)
    const task = prompt.match(/task: (\w+)/)![1]
    const section = prompt.match(/Develop only the section `(\w+)`/)?.[1]
    let body: string
    if (task === 'plan') body = sse(JSON.stringify(plan))
    else if (task === 'develop' && section === 's2' && ++s2Attempts <= 2) body = sse('{"format": "unveilboard/pat', false) // flux coupé
    else if (task === 'develop') body = sse(JSON.stringify(develop(section!)))
    else body = sse(JSON.stringify(finish))
    await route.fulfill({ body, headers: { ...CORS, 'content-type': 'text/event-stream' } })
  })

  await page.goto('/')
  await page.getByRole('button', { name: /Should we always tell the truth\?/ }).click()
  await page.waitForURL(/\?demo=truth/)
  await page.evaluate((url) => localStorage.setItem('ai-settings', JSON.stringify({ kind: 'custom', customUrl: url, customModel: 'fake' })), LOCAL)
  await page.reload()
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard && document.querySelector('aside'))
  await page.getByTestId('main-menu.button').click()
  await page.getByTestId('main-menu-sub.schema-ai-button').click()
  await page.getByText('Create or change the diagram with AI…').click()
  const dialog = page.getByRole('dialog', { name: 'Work with an AI' })
  await dialog.getByRole('radio', { name: 'Create a diagram' }).click()
  await dialog.getByRole('textbox', { name: 'Your request' }).fill('L’allégorie de la caverne, étape par étape.')
  await dialog.getByRole('checkbox', { name: /Rich diagram/ }).check()
  await dialog.getByRole('checkbox', { name: 'Review the plan before developing it' }).check()
  await dialog.getByRole('button', { name: 'Ask the AI (in steps)' }).click()

  // Le plan, relu et modifié : une section renommée, sa consigne précisée.
  await expect(dialog.getByText('Les étapes du récit, puis leur sens d’ensemble.')).toBeVisible()
  await dialog.getByRole('textbox', { name: 'Section 2' }).fill('La libération est douloureuse et lente')
  await dialog.getByRole('textbox', { name: 'What to develop' }).nth(1).fill('La montée, jusqu’au soleil.')
  await page.screenshot({ path: 'test-results/ai-staged-plan.png' })
  await dialog.getByRole('button', { name: 'Generate it all at once' }).click()

  // s2 coupée deux fois (relance automatique comprise) : en échec, les autres sections aboutissent.
  await expect(dialog.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
  await expect(dialog.getByText('✓ 2 elements')).toHaveCount(2)
  expect(s2Attempts).toBe(2)
  await page.screenshot({ path: 'test-results/ai-staged-failed.png' })
  await dialog.getByRole('button', { name: 'Retry', exact: true }).click()

  // Relancée, puis finition : le schéma complet arrive dans la zone de réponse.
  await expect(dialog.getByText('Diagram ready: check it below, then create it.')).toBeVisible()
  await expect(dialog.getByText('Valid: 10 elements, 2 steps.')).toBeVisible()
  await page.screenshot({ path: 'test-results/ai-staged-done.png' })

  // Les consignes : la section modifiée par l'utilisateur est transmise ; la synthèse voit les autres.
  const s2 = prompts.filter((p) => p.includes('Develop only the section `s2`')).at(-1)!
  expect(s2).toContain('**Brief of this section**: La montée, jusqu’au soleil.')
  expect(s2).toContain('La libération est douloureuse et lente')
  const s3 = prompts.find((p) => p.includes('Develop only the section `s3`'))!
  expect(s3).toContain('"s1-1"')

  await dialog.getByRole('button', { name: 'Open as a new diagram' }).click()
  await page.waitForURL(/\/d\//)
  await expect.poll(() => page.evaluate(() => (window as unknown as { unveilboard: { getMap(): { elements: unknown[] } } }).unveilboard?.getMap().elements.length)).toBe(10)
})

type Win = { unveilboard: { getMap(): { elements: { id: string }[]; links?: unknown[]; sequence?: { steps: unknown[] } } } }
/** Le schéma ouvert ; attend que la page (juste ouverte) ait installé son API. */
const getMap = async (page: Page) => {
  await page.waitForFunction(() => (window as unknown as Partial<Win>).unveilboard)
  return page.evaluate(() => (window as unknown as Win).unveilboard.getMap())
}

test('construction en direct : squelette, sections en suggestions, précision, liens et séquence', async ({ page }) => {
  const prompts: string[] = []
  await page.route(`${LOCAL}/**`, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const prompt: string = route.request().postDataJSON().messages[0].content
    prompts.push(prompt)
    const task = prompt.match(/task: (\w+)/)![1]
    const section = prompt.match(/Develop only the section `(\w+)`/)?.[1]
    const body = task === 'plan' ? plan : task === 'develop' ? develop(section!) : finish
    await route.fulfill({ body: sse(JSON.stringify(body)), headers: { ...CORS, 'content-type': 'text/event-stream' } })
  })

  await page.goto('/')
  await page.getByRole('button', { name: /Should we always tell the truth\?/ }).click()
  await page.waitForURL(/\?demo=truth/)
  await page.evaluate((url) => localStorage.setItem('ai-settings', JSON.stringify({ kind: 'custom', customUrl: url, customModel: 'fake' })), LOCAL)
  await page.reload()
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard && document.querySelector('aside'))
  await page.getByTestId('main-menu.button').click()
  await page.getByTestId('main-menu-sub.schema-ai-button').click()
  await page.getByText('Create or change the diagram with AI…').click()
  const dialog = page.getByRole('dialog', { name: 'Work with an AI' })
  await dialog.getByRole('radio', { name: 'Create a diagram' }).click()
  await dialog.getByRole('textbox', { name: 'Your request' }).fill('L’allégorie de la caverne, étape par étape.')
  await dialog.getByRole('checkbox', { name: /Rich diagram/ }).check()
  await dialog.getByRole('checkbox', { name: 'Review the plan before developing it' }).check()
  await dialog.getByRole('button', { name: 'Ask the AI (in steps)' }).click()
  await dialog.getByRole('button', { name: 'Build it in the diagram' }).click()

  // Le squelette s'ouvre comme nouveau schéma, avec le panneau du plan.
  await page.waitForURL(/\/d\//)
  const panel = page.getByRole('complementary', { name: 'Diagram plan' })
  await expect(panel).toBeVisible()
  await expect.poll(async () => (await getMap(page)).elements.map((e) => e.id)).toEqual(['root', 's1', 's2', 's3'])
  const rows = panel.getByRole('listitem')

  // Une section : ses éléments arrivent en suggestions (hors du schéma tant qu'ils ne sont pas acceptés).
  await rows.nth(0).getByRole('button', { name: 'Develop' }).click()
  await expect(rows.nth(0).getByText('2 suggestions to review')).toBeVisible()
  expect((await getMap(page)).elements).toHaveLength(4)
  await page.waitForTimeout(500) // fin du recadrage, pour la capture
  await page.screenshot({ path: 'test-results/ai-live-suggestions.png' })
  await page.getByRole('button', { name: 'Accept all' }).click()
  await expect(rows.nth(0).getByText('✓ 2 elements')).toBeVisible()

  // Les sections restantes : la synthèse attend que les autres soient acceptées.
  await panel.getByRole('button', { name: 'Develop the remaining sections' }).click()
  await expect(rows.nth(1).getByText('2 suggestions to review')).toBeVisible()
  await expect(rows.nth(2).getByText('to develop')).toBeVisible()
  await expect(panel.getByText(/Next step: accept/)).toBeVisible()
  await page.getByRole('button', { name: 'Accept all' }).click()
  await expect(panel.getByText(/Next step: develop the synthesis \(section 3\)/)).toBeVisible()

  // La synthèse, avec une précision : elle voit les sections acceptées.
  await rows.nth(2).getByText('Brief and precision').click()
  await rows.nth(2).getByRole('textbox', { name: 'Precision for this pass (optional)' }).fill('Insiste sur la paideia.')
  await rows.nth(2).getByRole('button', { name: 'Develop' }).click()
  await expect(rows.nth(2).getByText('2 suggestions to review')).toBeVisible()
  const s3 = prompts.filter((p) => p.includes('Develop only the section `s3`')).at(-1)!
  expect(s3).toContain("**The user's precision for this pass**: Insiste sur la paideia.")
  expect(s3).toContain('"s2-1"')
  await page.getByRole('button', { name: 'Accept all' }).click()

  // Compléter une section déjà développée : l'IA le sait.
  await rows.nth(0).getByRole('button', { name: 'Complete' }).click()
  await expect(rows.nth(0).getByText(/suggestions to review/)).toBeVisible()
  expect(prompts.at(-1)).toContain('**This section already has 2 elements**')
  await page.getByRole('button', { name: 'Reject all' }).click()

  // Liens et séquence, appliqués directement : c'est la prochaine étape indiquée.
  await expect(panel.getByText(/Next step: “Links and sequence”/)).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Links and sequence' })).toHaveClass(/btn-primary/)
  await panel.getByRole('button', { name: 'Links and sequence' }).click()
  await expect(panel.getByText('Links and sequence added.')).toBeVisible()
  await expect(panel.getByText(/Next step: the diagram is complete/)).toBeVisible()
  // Le panneau ne défile pas horizontalement : ✕ reste visible.
  expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  await expect(panel.getByRole('button', { name: 'Close' })).toBeInViewport()
  const map = await getMap(page)
  expect(map.elements).toHaveLength(10)
  expect(map.links).toHaveLength(1)
  expect(map.sequence?.steps).toHaveLength(2)
  await page.screenshot({ path: 'test-results/ai-live-done.png' })

  // Le plan reste avec le document : après rechargement, le menu ✦ le rouvre.
  await page.reload()
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard)
  await page.getByRole('button', { name: 'AI features' }).click()
  await page.getByRole('menuitem', { name: 'Diagram plan…' }).click()
  await expect(panel.getByText('✓ 2 elements')).toHaveCount(3)
})

test('plan d’un schéma existant : branches reprises, section ajoutée, développée en suggestions', async ({ page }) => {
  const prompts: string[] = []
  const answer: { plan?: unknown } = {}
  await page.route(`${LOCAL}/**`, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const prompt: string = route.request().postDataJSON().messages[0].content
    prompts.push(prompt)
    const task = prompt.match(/task: (\w+)/)![1]
    const section = prompt.match(/Develop only the section `(\S+)`/)?.[1]
    const body = task === 'plan' ? answer.plan : develop(section!)
    await route.fulfill({ body: sse(JSON.stringify(body)), headers: { ...CORS, 'content-type': 'text/event-stream' } })
  })

  await page.goto('/')
  await page.getByRole('button', { name: /Should we always tell the truth\?/ }).click()
  await page.waitForURL(/\?demo=truth/)
  await page.evaluate((url) => localStorage.setItem('ai-settings', JSON.stringify({ kind: 'custom', customUrl: url, customModel: 'fake' })), LOCAL)
  await page.reload()
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard && document.querySelector('aside'))

  // Le plan proposé reprend la racine et une branche existantes, et ajoute une section.
  const before = (await getMap(page)) as unknown as { elements: { id: string; text: string; parent?: string }[] }
  const root = before.elements.find((e) => !e.parent)!
  const branch = before.elements.find((e) => e.parent === root.id)!
  answer.plan = {
    format: 'unveilboard/plan',
    version: 1,
    title: 'Faut-il toujours dire la vérité ?',
    kind: 'argument',
    summary: 'On garde la réponse de Kant, et on ajoute une position intermédiaire.',
    root: { id: root.id, text: root.text },
    sections: [
      { id: branch.id, text: branch.text, brief: 'Compléter la position de Kant.' },
      { id: 'mid', text: 'Mentir n’est permis que pour protéger autrui', relation: 'answers', brief: 'Une position intermédiaire.' },
    ],
  }
  await page.getByRole('button', { name: 'AI features' }).click()
  await page.getByRole('menuitem', { name: 'Structure with a plan…' }).click()
  const panel = page.getByRole('complementary', { name: 'Diagram plan' })
  await panel.getByRole('textbox', { name: 'Your request' }).fill('Ajoute une position intermédiaire.')
  await panel.getByRole('button', { name: 'Propose a plan' }).click()
  await expect(panel.getByText('already in the diagram')).toHaveCount(1)
  expect(prompts[0]).toContain('**The diagram already exists**')
  await page.screenshot({ path: 'test-results/ai-plan-existing.png' })
  await panel.getByRole('button', { name: 'Adopt this plan' }).click()

  // Adopté : la section ajoutée est dans le schéma, le panneau passe aux sections.
  await expect.poll(async () => (await getMap(page)).elements.length).toBe(before.elements.length + 1)
  const rows = panel.getByRole('listitem')
  await expect(rows.nth(1).getByText('to develop')).toBeVisible()
  await rows.nth(1).getByRole('button', { name: 'Develop' }).click()
  await expect(rows.nth(1).getByText('2 suggestions to review')).toBeVisible()
  // La branche reprise a déjà du contenu : « Compléter ».
  await expect(rows.nth(0).getByRole('button', { name: 'Complete' })).toBeVisible()
})

// ---------- Depuis un texte ----------

const TEXT = [
  'Représente-toi des hommes dans une demeure souterraine, en forme de caverne, enchaînés depuis leur enfance.',
  'Ils ne voient que les ombres projetées par le feu sur la paroi qui leur fait face, et les prennent pour la réalité.',
  'Qu’on détache l’un d’eux et qu’on le force à se retourner : la lumière l’éblouit, et il souffre.',
  'Sorti de la caverne, il verra enfin le soleil lui-même, qui règle toutes choses visibles.',
].join('\n\n')

const textPlan = {
  ...plan,
  sections: [
    { id: 's1', text: 'Les prisonniers prennent les ombres pour le réel', brief: 'La situation.', paragraphs: [1, 2] },
    { id: 's2', text: 'La libération est douloureuse', brief: 'La montée.', paragraphs: [3, 4] },
  ],
}
const quoted = (id: string, excerpt: string) => ({
  format: 'unveilboard/patch',
  version: 1,
  operations: [{ op: 'add', id: `${id}-1`, text: `Ce que dit le passage (${id})`, parent: id, origin: 'text', excerpt }],
})

async function openSource(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /Should we always tell the truth\?/ }).click()
  await page.waitForURL(/\?demo=truth/)
  await page.evaluate((url) => localStorage.setItem('ai-settings', JSON.stringify({ kind: 'custom', customUrl: url, customModel: 'fake' })), LOCAL)
  await page.reload()
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard && document.querySelector('aside'))
  await page.getByTestId('main-menu.button').click()
  await page.getByTestId('main-menu-sub.schema-ai-button').click()
  await page.getByText('New diagram from a text…').click()
  const dialog = page.getByRole('dialog', { name: 'Create a diagram from a text' })
  await dialog.getByRole('textbox', { name: 'Source text' }).fill(TEXT)
  await dialog.getByRole('checkbox', { name: /Rich diagram/ }).check()
  await dialog.getByRole('checkbox', { name: 'Review the plan before developing it' }).check()
  await dialog.getByRole('button', { name: 'Ask the AI (in steps)' }).click()
  return dialog
}

test('depuis un texte : plan sur les paragraphes, passage par section, extrait corrigé', async ({ page }) => {
  const prompts: string[] = []
  let s1Attempts = 0
  await page.route(`${LOCAL}/**`, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const messages: { content: string }[] = route.request().postDataJSON().messages
    const prompt = messages[0].content
    prompts.push(prompt)
    const task = prompt.match(/task: (\w+)/)![1]
    const section = prompt.match(/Develop only the section `(\w+)`/)?.[1]
    let body: unknown
    if (task === 'plan') body = textPlan
    else if (section === 's1') body = quoted('s1', ++s1Attempts === 1 ? 'Ils voient la réalité elle-même' : 'les prennent pour la réalité')
    else if (section === 's2') body = quoted('s2', 'il verra enfin le soleil lui-même')
    else body = { format: 'unveilboard/patch', version: 1, operations: [{ op: 'sequence', mode: 'replace', steps: [{ title: 'La caverne', actions: [{ do: 'show', targets: ['root'] }] }] }] }
    await route.fulfill({ body: sse(JSON.stringify(body)), headers: { ...CORS, 'content-type': 'text/event-stream' } })
  })
  const dialog = await openSource(page)
  await expect(dialog.getByRole('textbox', { name: 'Section 1' })).toHaveValue('Les prisonniers prennent les ombres pour le réel')
  expect(prompts[0]).toContain('[§4] Sorti de la caverne')
  await dialog.getByRole('button', { name: 'Generate it all at once' }).click()

  // s1 : extrait introuvable au premier essai, corrigé au second ; le schéma est prêt.
  await expect(dialog.getByText('Diagram ready: check it below, then create it.')).toBeVisible()
  await expect(dialog.getByText(/A diagram of 5 elements and 1 step; 2 excerpts found in the text\./)).toBeVisible()
  expect(s1Attempts).toBe(2)
  // Chaque section n'a reçu que son passage.
  const s2 = prompts.find((p) => p.includes('Develop only the section `s2`'))!
  expect(s2).toContain('[§3] Qu’on détache')
  expect(s2).not.toContain('[§1]')
  await page.screenshot({ path: 'test-results/ai-source-staged.png' })
})

test('depuis un texte, en direct : squelette, section en suggestions, extrait introuvable signalé', async ({ page }) => {
  await page.route(`${LOCAL}/**`, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const prompt: string = route.request().postDataJSON().messages[0].content
    const task = prompt.match(/task: (\w+)/)![1]
    const body = task === 'plan' ? textPlan : quoted('s1', 'Une phrase que le texte ne contient pas')
    await route.fulfill({ body: sse(JSON.stringify(body)), headers: { ...CORS, 'content-type': 'text/event-stream' } })
  })
  const dialog = await openSource(page)
  await dialog.getByRole('button', { name: 'Build it in the diagram' }).click()
  await page.waitForURL(/\/d\//)
  const panel = page.getByRole('complementary', { name: 'Diagram plan' })
  const rows = panel.getByRole('listitem')
  await rows.nth(0).getByRole('button', { name: 'Develop' }).click()
  await expect(rows.nth(0).getByText('1 suggestion to review')).toBeVisible()
  await page.getByRole('button', { name: 'Accept all' }).click()
  // Introuvable deux fois : l'élément est gardé, marqué « à vérifier », comme à l'import.
  const flagged = await page.evaluate(() => {
    const editor = (window as unknown as { editor: import('tldraw').Editor }).editor
    return editor.getCurrentPageShapes().filter((s) => s.meta.excerptUnverified).map((s) => s.meta.ref)
  })
  expect(flagged).toEqual(['s1-1'])
})

test('texte source : affiché à côté du schéma, passages surlignés, dans les deux sens, texte mis en forme', async ({ page }) => {
  await page.route(`${LOCAL}/**`, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const prompt: string = route.request().postDataJSON().messages[0].content
    const task = prompt.match(/task: (\w+)/)![1]
    const section = prompt.match(/Develop only the section `(\w+)`/)?.[1]
    const body =
      task === 'plan'
        ? textPlan
        : section === 's1'
          ? quoted('s1', 'les prennent pour la réalité')
          : section === 's2'
            ? quoted('s2', 'il verra enfin le soleil lui-même')
            : { format: 'unveilboard/patch', version: 1, operations: [{ op: 'sequence', mode: 'replace', steps: [{ title: 'La caverne', actions: [{ do: 'show', targets: ['root'] }] }] }] }
    await route.fulfill({ body: sse(JSON.stringify(body)), headers: { ...CORS, 'content-type': 'text/event-stream' } })
  })
  const dialog = await openSource(page)
  await dialog.getByRole('button', { name: 'Generate it all at once' }).click()
  await dialog.getByRole('button', { name: 'Open as a new diagram' }).click()
  await page.waitForURL(/\/d\//)
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard && document.querySelector('aside'))

  // La barre s'ouvre d'elle-même : le texte, les deux passages cités surlignés.
  const panel = page.getByRole('complementary', { name: 'Source text' })
  await expect(panel.getByText(/2 passages cited/)).toBeVisible()
  await expect(panel.locator('mark.source-mark')).toHaveText(['les prennent pour la réalité', 'il verra enfin le soleil lui-même'])

  // Élément sélectionné → son passage ressort ; passage cliqué → ses éléments sont sélectionnés.
  const shapeOf = (ref: string) =>
    page.evaluate((ref) => {
      const editor = (window as unknown as { editor: import('tldraw').Editor }).editor
      return editor.getCurrentPageShapes().find((s) => s.meta.ref === ref)!.id as string
    }, ref)
  const s21 = await shapeOf('s2-1')
  await page.evaluate((id) => void (window as unknown as { editor: { select(id: string): unknown } }).editor.select(id), s21)
  await expect(panel.locator('mark.source-mark-active')).toHaveText('il verra enfin le soleil lui-même')
  // Par défaut, un clic recentre sans sélectionner ; avec l'option, il sélectionne aussi.
  await panel.getByRole('button', { name: 'Also select the element when clicking a passage' }).click()
  await panel.locator('mark.source-mark').first().click()
  const selected = await page.evaluate(() => (window as unknown as { editor: { getSelectedShapeIds(): string[] } }).editor.getSelectedShapeIds())
  expect(selected).toEqual([await shapeOf('s1-1')])
  await page.screenshot({ path: 'test-results/ai-source-panel.png' })

  // Mis en forme en Markdown : les passages restent retrouvés, même coupés par une mise en forme.
  await panel.getByRole('button', { name: 'Edit' }).click()
  const editor = panel.getByRole('textbox', { name: 'Source text' })
  const text = await editor.inputValue()
  await editor.fill(`# La caverne\n\n${text.replace('pour la réalité', 'pour la **réalité**')}`)
  await panel.getByRole('button', { name: 'Save' }).click()
  await expect(panel.getByRole('heading', { name: 'La caverne' })).toBeVisible()
  await expect(panel.locator('strong').filter({ hasText: 'réalité' })).toBeVisible()
  await expect(panel.getByText(/2 passages cited/)).toBeVisible()
  await expect(panel.locator('mark.source-mark')).toHaveText(['les prennent pour la ', 'réalité', 'il verra enfin le soleil lui-même'])

  // Retirer le texte : le panneau se ferme, le menu ne le propose plus, les extraits restent.
  page.once('dialog', (d) => void d.accept())
  await panel.getByRole('button', { name: 'Edit' }).click()
  await panel.getByRole('button', { name: 'Remove the text' }).click()
  await expect(panel.getByRole('heading', { name: 'Associate a text with this page' })).toBeVisible()
  expect((await getMap(page)).elements.some((e) => (e as { excerpt?: string }).excerpt === 'il verra enfin le soleil lui-même')).toBe(true)
})

test('texte associé à une page : élément créé d’une sélection, extraits d’un élément (ajout, retrait), clic sans cadrage', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Should we always tell the truth\?/ }).click()
  await page.waitForURL(/\?demo=truth/)
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard && document.querySelector('aside'))
  type Editor = { getCurrentPageShapes(): { id: string; type: string; meta: Record<string, unknown> }[] }
  const shapes = () => page.evaluate(() => (window as unknown as { editor: Editor }).editor.getCurrentPageShapes().map((s) => ({ id: s.id, type: s.type, meta: s.meta })))

  // Le bouton discret, à côté de ✦ : la barre s'ouvre à gauche, sans texte encore.
  await page.getByRole('button', { name: 'Source text: show or hide the text of this page' }).click()
  const panel = page.getByRole('complementary', { name: 'Source text' })
  const text = 'La véracité est un devoir envers tous.\n\nMentir à un meurtrier reste une faute, dit Kant.'
  await panel.getByRole('textbox', { name: 'Source text' }).fill(text)
  await panel.getByRole('button', { name: 'Associate this text' }).click()
  await expect(panel.getByText('La véracité est un devoir envers tous.')).toBeVisible()
  /** Sélectionne `words` dans le paragraphe `index` du texte, comme à la souris. */
  const selectIn = (index: number, words: string) =>
    panel.locator('.source-text p').nth(index).evaluate((p, words) => {
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const at = node.textContent!.indexOf(words)
        if (at < 0) continue
        const range = document.createRange()
        range.setStart(node, at)
        range.setEnd(node, at + words.length)
        window.getSelection()!.removeAllRanges()
        window.getSelection()!.addRange(range)
        p.closest('.source-text')!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
        return
      }
    }, words)

  // Une sélection dans le texte → « Nouvel élément » : l'élément cite le passage, surligné.
  await panel.locator('.source-text p').nth(1).evaluate((p) => {
    const node = p.firstChild!
    const range = document.createRange()
    range.setStart(node, 0)
    range.setEnd(node, 'Mentir à un meurtrier reste une faute'.length)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    p.closest('.source-text')!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  })
  await panel.getByRole('button', { name: 'New element', exact: true }).click()
  await expect.poll(async () => (await shapes()).filter((s) => s.meta.excerpt === 'Mentir à un meurtrier reste une faute').length).toBe(1)
  await expect(panel.locator('mark.source-mark')).toHaveText(['Mentir à un meurtrier reste une faute'])

  // L'élément sélectionné, puis un passage : « Extrait de l'élément ».
  const thesis = (await shapes()).find((s) => s.meta.ref === 'thesis')!
  await page.evaluate((id) => void (window as unknown as { editor: { select(id: string): unknown } }).editor.select(id), thesis.id)
  await selectIn(0, 'La véracité est un devoir envers tous.')
  await panel.getByRole('button', { name: 'Excerpt of the element' }).click()
  await expect.poll(async () => (await shapes()).find((s) => s.id === thesis.id)!.meta.excerpt).toBe('La véracité est un devoir envers tous.')
  await expect(panel.locator('mark.source-mark')).toHaveCount(2)
  await page.screenshot({ path: 'test-results/source-sidebar.png' })

  // Un élément existant sélectionné, puis un passage choisi : « Extrait de l'élément ».
  const question = (await shapes()).find((s) => s.meta.ref === 'question')!
  await page.evaluate((id) => void (window as unknown as { editor: { select(id: string): unknown } }).editor.select(id), question.id)
  await expect(panel.getByRole('status')).toContainText('Selected element: “Should we always tell the truth?”')
  await panel.locator('.source-text p').nth(1).evaluate((p) => {
    const node = p.lastChild!
    const range = document.createRange()
    range.setStart(node, node.textContent!.indexOf('dit Kant'))
    range.setEnd(node, node.textContent!.indexOf('dit Kant') + 'dit Kant'.length)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    p.closest('.source-text')!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  })
  await panel.getByRole('button', { name: 'Excerpt of the element' }).click()
  await expect.poll(async () => (await shapes()).find((s) => s.id === question.id)!.meta.excerpt).toBe('dit Kant')

  // Un second passage (plus haut dans le texte) : les extraits se suivent dans l'ordre du texte.
  await expect(panel.getByRole('status')).toContainText('Excerpts of the selected element:')
  await selectIn(0, 'La véracité')
  await panel.getByRole('button', { name: 'Add to its excerpts' }).click()
  await expect.poll(async () => (await shapes()).find((s) => s.id === question.id)!.meta.excerpt).toBe('La véracité […] dit Kant')
  // Retirer un passage : son surlignage disparaît.
  await panel.getByRole('button', { name: 'Remove this passage from its excerpts' }).first().click()
  await expect.poll(async () => (await shapes()).find((s) => s.id === question.id)!.meta.excerpt).toBe('dit Kant')


  // Un clic sur un passage recentre sur son élément, sans le sélectionner (par défaut).
  type Camera = { getCamera(): { x: number; y: number; z: number }; getSelectedShapeIds(): string[]; selectNone(): unknown }
  const camera = () => page.evaluate(() => (window as unknown as { editor: Camera }).editor.getCamera())
  await page.evaluate(() => void (window as unknown as { editor: Camera }).editor.selectNone())
  const before = await camera()
  await panel.locator('mark.source-mark').first().click()
  await expect.poll(camera).not.toEqual(before)
  expect(await page.evaluate(() => (window as unknown as { editor: Camera }).editor.getSelectedShapeIds())).toEqual([])

  // Calques : la thèse (sa fonction dans la carte) et la question (son type) citent des passages
  // qui se recouvrent ; chaque calque garde son soulignement, et peut être masqué.
  await page.evaluate((id) => void (window as unknown as { editor: { select(id: string): unknown } }).editor.select(id), question.id)
  await selectIn(0, 'un devoir envers tous')
  await panel.getByRole('button', { name: 'Add to its excerpts' }).click()
  await page.evaluate(() => void (window as unknown as { editor: Camera }).editor.selectNone())
  await panel.getByRole('button', { name: /^Layers/ }).click()
  const layers = panel.getByRole('group', { name: 'Layers' })
  await expect(layers.getByRole('checkbox')).not.toHaveCount(0)
  const overlap = panel.locator('mark.source-mark', { hasText: 'un devoir envers tous' }).first()
  await expect(overlap).toHaveAttribute('style', /box-shadow/)
  const labels = await layers.locator('label').allInnerTexts()
  const questionLayer = labels.find((l) => /Question/.test(l))!
  await layers.getByRole('checkbox', { name: new RegExp(questionLayer.split('\n')[0]) }).uncheck()
  await expect(panel.locator('mark.source-mark', { hasText: 'dit Kant' })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/source-layers.png' })
  await layers.getByRole('checkbox', { name: new RegExp(questionLayer.split('\n')[0]) }).check()

  // Taille du texte : A+ l'agrandit.
  const size = () => panel.locator('.source-text').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  const small = await size()
  await panel.getByRole('button', { name: 'Larger text (+)' }).click()
  expect(await size()).toBeGreaterThan(small)

  // Clic droit sur un passage : les éléments qui le citent.
  await panel.locator('mark.source-mark', { hasText: 'dit Kant' }).click({ button: 'right' })
  await expect(panel.getByRole('dialog', { name: 'Cited by:' })).toContainText('Should we always tell the truth?')
  await page.keyboard.press('Escape')
  // Clic : une petite croix au bout du passage retire son surlignement.
  await panel.locator('mark.source-mark', { hasText: 'dit Kant' }).click()
  await panel.getByRole('button', { name: 'Remove the highlight' }).click()
  await expect(panel.locator('mark.source-mark', { hasText: 'dit Kant' })).toHaveCount(0)
  await expect.poll(async () => (await shapes()).find((s) => s.id === question.id)!.meta.excerpt).toBe('un devoir envers tous')

  // Option de la présentation (carte « Départ ») : afficher le texte au lancement.
  await page.locator('li[data-start]').click()
  await page.getByRole('checkbox', { name: 'Show the source text when the presentation starts' }).check()
  // En présentation : la barre, en lecture seule ; les passages apparaissent au fil des étapes.
  await page.getByRole('button', { name: '▶ Present' }).click()
  await expect(panel.getByRole('button', { name: 'Edit' })).toHaveCount(0)
  const marked = () => panel.locator('mark.source-mark').allInnerTexts()
  // Avant la première étape : seul l'élément isolé (qu'aucune étape ne gère) est visible.
  await expect.poll(marked).toEqual(['Mentir à un meurtrier reste une faute'])
  await page.keyboard.press('ArrowRight')
  await expect.poll(marked).toContain('un devoir envers tous')
  await expect(panel.locator('mark.source-mark-active')).not.toHaveCount(0)
  await page.screenshot({ path: 'test-results/source-presenting.png' })
  // Le menu « Plus » la masque.
  await page.getByTitle('More').click()
  await page.getByRole('menuitem', { name: 'Source text' }).click()
  await expect(panel).toHaveCount(0)
})

test('calques libres : créer, renommer, calque actif, ranger un élément, masquer, supprimer', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Should we always tell the truth\?/ }).click()
  await page.waitForURL(/\?demo=truth/)
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard && document.querySelector('aside'))
  type Editor = { getCurrentPageShapes(): { id: string; meta: Record<string, unknown> }[]; select(id: string): unknown; selectNone(): unknown }
  const editor = (fn: string, arg?: string) =>
    page.evaluate(
      ({ fn, arg }) => {
        const e = (window as unknown as { editor: Editor }).editor
        if (fn === 'shapes') return e.getCurrentPageShapes().map((s) => ({ id: s.id, meta: s.meta }))
        if (fn === 'select') void e.select(arg!)
        if (fn === 'none') void e.selectNone()
        return null
      },
      { fn, arg }
    )
  const shapes = async () => (await editor('shapes')) as { id: string; meta: Record<string, unknown> }[]

  await page.getByRole('button', { name: 'Source text: show or hide the text of this page' }).click()
  const panel = page.getByRole('complementary', { name: 'Source text' })
  // L'éditeur du texte : boutons et raccourcis Markdown (Ctrl/⌘ + B, Ctrl/⌘ + Alt + 1…).
  const input = panel.getByRole('textbox', { name: 'Source text' })
  await input.fill('Titre')
  await input.press('ControlOrMeta+a')
  await input.press('ControlOrMeta+Alt+Digit1')
  await expect(input).toHaveValue('# Titre')
  await input.press('ControlOrMeta+a')
  await input.press('ControlOrMeta+b')
  await expect(input).toHaveValue('**# Titre**')
  await input.fill('La véracité est un devoir envers tous.\n\nMentir à un meurtrier reste une faute, dit Kant.')
  await panel.getByRole('button', { name: 'Associate this text' }).click()

  // Un calque, renommé : il devient le calque actif.
  await panel.getByRole('button', { name: /^Layers/ }).click()
  const layers = panel.getByRole('group', { name: 'Layers' })
  await layers.getByRole('button', { name: 'New layer' }).click()
  const name = layers.getByRole('textbox', { name: 'Layer name' })
  await name.fill('Arguments')
  await name.press('Enter')
  await expect(layers.getByRole('radio')).toBeChecked()

  // Un élément créé depuis un passage est rangé dans le calque actif, surligné à sa couleur.
  await panel.locator('.source-text p').nth(1).evaluate((p) => {
    const range = document.createRange()
    range.setStart(p.firstChild!, 0)
    range.setEnd(p.firstChild!, 'Mentir à un meurtrier'.length)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    p.closest('.source-text')!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  })
  await panel.getByRole('button', { name: 'New element', exact: true }).click()
  await expect.poll(async () => (await shapes()).find((s) => s.meta.excerpt === 'Mentir à un meurtrier')?.meta.layer).toBe('layer1')
  await expect(panel.locator('mark.source-mark')).toHaveCount(1)
  // Le calque regroupe ; le passage garde la couleur de son élément.
  expect(await panel.locator('mark.source-mark').evaluate((el) => (el as HTMLElement).style.getPropertyValue('--mark-color'))).toBeTruthy()
  await expect(layers.locator('.source-layer-swatch')).toHaveCount(0)

  // Ranger un élément existant (la thèse) dans le calque, depuis le bas de la barre.
  const thesis = (await shapes()).find((s) => s.meta.ref === 'thesis')!
  await editor('select', thesis.id)
  await panel.getByRole('combobox').selectOption({ label: 'Arguments' })
  await expect.poll(async () => (await shapes()).find((s) => s.id === thesis.id)!.meta.layer).toBe('layer1')
  await page.screenshot({ path: 'test-results/source-custom-layers.png' })

  // Masquer le calque, puis le supprimer : ses éléments retrouvent leur calque automatique.
  await layers.getByRole('checkbox', { name: 'Arguments' }).uncheck()
  await expect(panel.locator('mark.source-mark')).toHaveCount(0)
  await layers.getByRole('checkbox', { name: 'Arguments' }).check()
  await layers.getByRole('button', { name: /Delete this layer/ }).click()
  await expect.poll(async () => (await shapes()).filter((s) => s.meta.layer).length).toBe(0)
  await expect(panel.locator('mark.source-mark')).toHaveCount(1)

  // Un long passage : l'encart de l'élément sélectionné reste dans la barre.
  const created = (await shapes()).find((s) => s.meta.excerpt === 'Mentir à un meurtrier')!
  await page.evaluate(
    ({ id, excerpt }) => {
      const e = (window as unknown as { editor: { getShape(id: string): { type: string; meta: object }; updateShape(p: unknown): unknown; select(id: string): unknown } }).editor
      const shape = e.getShape(id)
      void e.updateShape({ id, type: shape.type, meta: { ...shape.meta, excerpt } })
      void e.select(id)
    },
    { id: created.id, excerpt: 'Mentir à un meurtrier reste une faute, dit Kant, et cette phrase est volontairement très longue pour déborder' }
  )
  await expect(panel.getByRole('status')).toContainText('Excerpts of the selected element:')
  const widths = await page.evaluate(() => {
    const aside = document.querySelector('.source-sidebar')!.getBoundingClientRect().right
    return [...document.querySelectorAll('.source-target, .source-target *')].map((el) => el.getBoundingClientRect().right - aside)
  })
  expect(Math.max(...widths)).toBeLessThanOrEqual(1)

  // Une nouvelle page : on y reprend le texte de la page 1.
  await page.evaluate(() => {
    const e = (window as unknown as { editor: { createPage(p: { name: string }): unknown; getPages(): { id: string; name: string }[]; setCurrentPage(id: string): unknown } }).editor
    void e.createPage({ name: 'Page 2' })
    void e.setCurrentPage(e.getPages().find((p) => p.name === 'Page 2')!.id)
  })
  await panel.getByRole('button', { name: 'Use the text of “Page 1”' }).click()
  await expect(panel.getByText('La véracité est un devoir envers tous.')).toBeVisible()
})

test('partage avec le texte source : le lecteur peut l’afficher', async ({ page, context }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Should we always tell the truth\?/ }).click()
  await page.waitForURL(/\?demo=truth/)
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard && document.querySelector('aside'))
  await page.getByRole('button', { name: 'Source text: show or hide the text of this page' }).click()
  const panel = page.getByRole('complementary', { name: 'Source text' })
  await panel.getByRole('textbox', { name: 'Source text' }).fill('La véracité est un devoir envers tous.')
  await panel.getByRole('button', { name: 'Associate this text' }).click()

  // Sans la case, le lien ne contient pas le texte ; avec, si.
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  await page.getByRole('checkbox', { name: /Include the source text/ }).check()
  await page.getByRole('button', { name: 'Create the link' }).click()
  const url = await page.locator('.share-dialog input[readonly]').first().inputValue()
  const viewer = await context.newPage()
  await viewer.goto(url)
  await expect(viewer.locator('.studio')).toHaveAttribute('data-mode', 'present')
  // Masqué par défaut ; le lecteur l'affiche depuis le menu « Plus ».
  const shared = viewer.getByRole('complementary', { name: 'Source text' })
  await expect(shared).toHaveCount(0)
  await viewer.getByTitle('More').click()
  await viewer.getByRole('menuitem', { name: 'Source text' }).click()
  await expect(shared.getByText('La véracité est un devoir envers tous.')).toBeVisible()
  await expect(shared.getByRole('button', { name: 'Edit' })).toHaveCount(0)
})

test('menu IA de la barre du texte : créer depuis ce texte, enrichir en s’appuyant sur le texte', async ({ page }) => {
  const prompts: string[] = []
  await page.route(`${LOCAL}/**`, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    prompts.push(route.request().postDataJSON().messages[0].content)
    const body = {
      format: 'unveilboard/patch',
      version: 1,
      operations: [
        { op: 'add', id: 'n1', text: 'Un devoir envers tous', parent: 'thesis', relation: 'supports', origin: 'text', excerpt: 'un devoir envers tous' },
        { op: 'add', id: 'n2', text: 'Une citation inventée', parent: 'thesis', relation: 'supports', origin: 'text', excerpt: 'une phrase absente du texte' },
      ],
    }
    await route.fulfill({ body: sse(JSON.stringify(body)), headers: { ...CORS, 'content-type': 'text/event-stream' } })
  })
  await page.goto('/')
  await page.getByRole('button', { name: /Should we always tell the truth\?/ }).click()
  await page.waitForURL(/\?demo=truth/)
  await page.evaluate((url) => localStorage.setItem('ai-settings', JSON.stringify({ kind: 'custom', customUrl: url, customModel: 'fake' })), LOCAL)
  await page.reload()
  await page.waitForFunction(() => (window as unknown as { unveilboard?: unknown }).unveilboard && document.querySelector('aside'))
  await page.getByRole('button', { name: 'Source text: show or hide the text of this page' }).click()
  const panel = page.getByRole('complementary', { name: 'Source text' })
  await panel.getByRole('textbox', { name: 'Source text' }).fill('La véracité est un devoir envers tous.')
  await panel.getByRole('button', { name: 'Associate this text' }).click()

  // « Créer un nouveau schéma à partir de ce texte » : la boîte s'ouvre, remplie.
  await panel.getByRole('button', { name: 'AI from this text' }).click()
  await page.getByRole('menuitem', { name: 'Create a new diagram from this text…' }).click()
  const source = page.getByRole('dialog', { name: 'Create a diagram from a text' })
  await expect(source.getByRole('textbox', { name: 'Source text' })).toHaveValue('La véracité est un devoir envers tous.')
  await source.getByRole('button', { name: 'Close' }).click()

  // « Enrichir le schéma à partir du texte » : la consigne contient le texte et les règles de fidélité.
  await panel.getByRole('button', { name: 'AI from this text' }).click()
  await page.getByRole('menuitem', { name: 'Enrich the diagram from the text…' }).click()
  const assistant = page.getByRole('dialog', { name: 'Work with an AI' })
  await expect(assistant.getByRole('checkbox', { name: 'Use the source text of this page' })).toBeChecked()
  await assistant.getByRole('button', { name: 'Ask the AI' }).click()
  await assistant.getByRole('button', { name: 'Apply' }).click()
  expect(prompts.at(-1)).toContain('<source>\nLa véracité est un devoir envers tous.\n</source>')
  expect(prompts.at(-1)).toContain('**Faithfulness to the text**')
  // Appliqué : l'extrait retrouvé est surligné, l'autre est marqué « à vérifier ».
  const flags = await page.evaluate(() =>
    (window as unknown as { editor: { getCurrentPageShapes(): { meta: Record<string, unknown> }[] } }).editor
      .getCurrentPageShapes()
      .filter((s) => s.meta.ref === 'n1' || s.meta.ref === 'n2')
      .map((s) => `${s.meta.ref}:${!!s.meta.excerptUnverified}`)
      .sort()
  )
  expect(flags).toEqual(['n1:false', 'n2:true'])
  await expect(panel.locator('mark.source-mark')).toHaveText(['un devoir envers tous'])
})
