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
const getMap = (page: Page) => page.evaluate(() => (window as unknown as Win).unveilboard.getMap())

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
  await page.getByRole('button', { name: 'Accept all' }).click()

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

  // Liens et séquence, appliqués directement.
  await panel.getByRole('button', { name: 'Links and sequence' }).click()
  await expect(panel.getByText('Links and sequence added.')).toBeVisible()
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
