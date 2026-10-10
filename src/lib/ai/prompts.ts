// Consignes données à une IA pour lire, créer ou modifier un schéma. Pures (sans tldraw ni
// navigateur) : copiées dans le presse-papiers pour un assistant, ou envoyées à un fournisseur.
//
// Les instructions sont en anglais (les modèles les suivent mieux) ; le contenu produit est dans la
// langue du schéma. Toute modification d'une consigne change PROMPT_VERSION.

import { z } from 'zod'
import { MapSchema, type UnveilMap } from '../map/format'
import { PlanSchema, type DiagramPlan } from '../map/plan'
import { numberedSource, passageOf, sourceParagraphs } from '../source/paragraphs'
import { FOCUS_OF_KIND, REMARK_KINDS, REVIEW_FOCUS, type ReviewFocus } from '../map/review'
import { APP_LANGS, AUTO_LANG, baseLang, languageName } from './language'
import { SIZE_LIMITS, sizeText, type DiagramSize } from '../map/size'

export const PROMPT_VERSION = 14

export const TASKS = ['create', 'enrich', 'sequence', 'review', 'edit', 'expand', 'plan', 'develop', 'finish', 'style', 'chat'] as const
export type Task = (typeof TASKS)[number]
/**
 * Tâches de la boîte « Consigne pour une IA » : « expand » part d'un élément (barre de l'arbre),
 * « review » a son panneau (« Relecture ») ; « plan », « develop » et « finish » sont les étapes
 * d'une création en plusieurs temps (src/lib/ai/staged.ts) ; « chat » est la conversation de l'onglet Chat.
 */
export const ASSISTANT_TASKS = ['create', 'enrich', 'sequence', 'edit', 'style'] as const satisfies readonly Task[]
export type AssistantTask = (typeof ASSISTANT_TASKS)[number]

/**
 * Méthode choisie dans la bibliothèque de prompts (src/lib/prompts) : une partie commune et, au
 * besoin, une variante par tâche. Résolue côté navigateur, puis envoyée telle quelle : le serveur
 * n'a pas besoin de la bibliothèque, et les prompts personnels marchent partout.
 */
export interface PromptMethod {
  title: string
  body: string
  variants?: Partial<Record<Task, string>>
}

/**
 * Un message de la conversation (tâche « chat ») : ceux de l'utilisateur tels quels, ceux du modèle
 * réécrits en JSON compact (sa réponse, et le résumé des modifications avec ce qu'elles sont devenues).
 */
export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

/** Une entrée du vocabulaire proposé (préréglages de l'utilisateur, dans sa langue). */
export interface VocabularyLine {
  id: string
  kind: 'type' | 'relation'
  name: string
  definition?: string
  /** Relations : « toChild » se lit « parent RELATION élément ». */
  direction?: 'toParent' | 'toChild'
  childType?: string
  function?: string
}

export interface PromptInput {
  task: Task
  /** Consigne de l'utilisateur (sujet, texte source, ce qu'il veut). */
  instruction: string
  /** Schéma ouvert (absent pour une création). */
  map?: UnveilMap
  /** Identifiants des éléments sélectionnés, sur lesquels porter l'attention. */
  selection?: string[]
  /** « expand » : l'élément d'où partir. */
  focus?: string
  /** Le schéma donné n'est qu'un extrait (l'élément, ses ancêtres, sa branche). */
  partial?: boolean
  /** « sequence » : ordre par défaut des éléments (en profondeur, comme « Dévoiler la carte »). */
  order?: string[]
  /** « create » : texte source à analyser (cours, texte d'auteur), et sa référence. */
  source?: { text: string; label?: string }
  /** « create » : type de schéma voulu (auto : au choix du modèle). */
  kind?: 'auto' | 'argument' | 'mindmap'
  /** « create » : écrire aussi la séquence et sa narration (par défaut : oui). */
  withSequence?: boolean
  /** Création (et son plan, ses sections) : nombre d'éléments et de niveaux voulus (réglages de l'IA). */
  size?: DiagramSize
  /** Développer au besoin dans la note des éléments (par défaut : oui) ; sinon, tout dans la boîte. */
  notes?: boolean
  /** « review » : ce qu'on attend de la relecture (par défaut : tout). */
  reviewFocus?: ReviewFocus[]
  /**
   * Création en plusieurs temps : le plan (« develop », « finish ») ; pour « plan », le plan
   * précédent, à revoir d'après `planRemarks`.
   */
  plan?: DiagramPlan
  planRemarks?: string
  /** « develop » : précision de l'utilisateur pour cette section, à cette passe. */
  sectionRequest?: string
  /** « chat » : les messages précédents (le dernier message de l'utilisateur est `instruction`). */
  history?: ChatTurn[]
  /** Méthode de la bibliothèque de prompts, à suivre pour cette tâche (et les étapes qui en découlent). */
  method?: PromptMethod
  vocabulary: VocabularyLine[]
  /** Langue du contenu à écrire (« fr », « en »…). */
  lang: string
  /** La réponse sera collée par l'utilisateur (ou appliquée par un agent dans son navigateur). */
  delivery: 'clipboard' | 'api'
  /** Libellé du menu « Coller du JSON… » dans la langue de l'interface (pour un agent qui la pilote). */
  pasteMenu?: string
}

/** Messages précédents envoyés au modèle, au plus (les plus anciens sont laissés de côté). */
export const MAX_CHAT_HISTORY = 24

/** Contrôle d'une demande reçue par le serveur (route /api/ai) : tailles plafonnées. */
export const PromptInputSchema = z.object({
  task: z.enum(TASKS),
  instruction: z.string().max(120_000),
  map: MapSchema.optional(),
  selection: z.array(z.string().max(64)).max(500).optional(),
  focus: z.string().max(64).optional(),
  partial: z.boolean().optional(),
  order: z.array(z.string().max(64)).max(2000).optional(),
  source: z.object({ text: z.string().max(300_000), label: z.string().max(300).optional() }).optional(),
  kind: z.enum(['auto', 'argument', 'mindmap']).optional(),
  withSequence: z.boolean().optional(),
  size: z
    .object({
      minElements: z.number().int().min(1).max(SIZE_LIMITS.elements).optional(),
      maxElements: z.number().int().min(1).max(SIZE_LIMITS.elements).optional(),
      minLevels: z.number().int().min(1).max(SIZE_LIMITS.levels).optional(),
      maxLevels: z.number().int().min(1).max(SIZE_LIMITS.levels).optional(),
    })
    .optional(),
  notes: z.boolean().optional(),
  reviewFocus: z.array(z.enum(REVIEW_FOCUS)).max(REVIEW_FOCUS.length).optional(),
  plan: PlanSchema.optional(),
  planRemarks: z.string().max(10_000).optional(),
  sectionRequest: z.string().max(10_000).optional(),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(40_000) }))
    .max(MAX_CHAT_HISTORY)
    .optional(),
  method: z
    .object({
      title: z.string().max(200),
      body: z.string().max(30_000),
      variants: z.partialRecord(z.enum(TASKS), z.string().max(30_000)).optional(),
    })
    .optional(),
  vocabulary: z
    .array(
      z.object({
        id: z.string().max(64),
        kind: z.enum(['type', 'relation']),
        name: z.string().max(100),
        definition: z.string().max(1000).optional(),
        direction: z.enum(['toParent', 'toChild']).optional(),
        childType: z.string().max(64).optional(),
        function: z.string().max(100).optional(),
      })
    )
    .max(200),
  lang: z.string().max(20),
  delivery: z.enum(['clipboard', 'api']),
  pasteMenu: z.string().max(200).optional(),
})

/** Demande de correction, après une réponse inutilisable : les problèmes trouvés (en anglais). */
export function repairMessage(problems: string[]) {
  return `Your answer could not be used as it is. Problems found:

${problems.map((p) => `- ${p}`).join('\n')}

Answer again with the whole corrected JSON, in one \`\`\`json code block, and nothing else.`
}


export function buildPrompt(input: PromptInput): string {
  const output = input.task === 'create' ? 'map' : input.task === 'review' ? 'review' : input.task === 'plan' ? 'plan' : input.task === 'chat' ? 'chat' : 'patch'
  // Conversation : la demande est le dernier message, pas une partie de la consigne.
  const instruction = input.task === 'chat' ? '' : input.instruction.trim()
  const parts = [
    `<!-- Unveilboard prompt v${PROMPT_VERSION}, task: ${input.task} -->`,
    INTRO,
    input.task === 'create' && input.source
      ? sourceTaskText(input)
      : input.task === 'review'
        ? reviewTaskText(input.reviewFocus ?? REVIEW_FOCUS)
        : input.task === 'develop'
          ? developTaskText(input)
          : input.task === 'plan' && input.source
            ? `${TASK_TEXT.plan}\n\n${planSourceText(input)}${input.map?.elements.length ? `\n\n${PLAN_EXISTING_TEXT}` : ''}`
            : input.task === 'plan' && input.map?.elements.length
              ? `${TASK_TEXT.plan}\n\n${PLAN_EXISTING_TEXT}`
              : input.task === 'finish' && input.withSequence === false
                ? FINISH_LINKS_TEXT
          : TASK_TEXT[input.task].replace('{focus}', input.focus ?? ''),
    methodText(input.method, input.task),
    instruction ? `## The user's request\n\n${instruction}` : '',
    sourceWorkText(input),
    sourceFor(input),
    input.task === 'sequence' && input.order?.length
      ? `## Default order\n\nA default order, depth first (what the app's “Reveal the map” button does): ${input.order.map((s) => `\`${s}\``).join(', ')}. Follow it unless the user's instructions, or the logic of the argument, call for another.`
      : '',
    input.selection?.length
      ? `## Selected elements\n\nThe user selected these elements; focus on them: ${input.selection.map((s) => `\`${s}\``).join(', ')}.`
      : '',
    input.task === 'plan' && input.plan ? planRevisionText(input.plan, input.planRemarks) : '',
    SHAPE_TASKS.includes(input.task)
      ? `## The shape of the diagram\n\n${(input.task === 'create' || input.task === 'plan') && input.kind !== 'argument' ? `${FORM_TEXT}\n\n` : ''}${DEPTH_TEXT}${shapeSizeText(input)}`
      : '',
    vocabularyText(input.vocabulary),
    MAP_FORMAT_TEXT,
    output === 'patch' || output === 'chat' ? PATCH_FORMAT_TEXT : output === 'review' ? reviewFormatText(input.reviewFocus ?? REVIEW_FOCUS) : output === 'plan' ? PLAN_FORMAT_TEXT : '',
    input.task === 'plan' || input.task === 'develop' || input.task === 'style' ? '' : SEQUENCE_TEXT,
    rules(input.lang, input.notes !== false, input.task === 'chat'),
    (input.task === 'develop' || input.task === 'finish') && input.plan ? `## The plan

\`\`\`json
${JSON.stringify(input.plan, null, 1)}
\`\`\`` : '',
    input.map
      ? `## The current diagram${input.partial ? ' (extract)\n\nOnly part of the diagram is shown: the element, its ancestors up to the root, and its branch.' : ''}\n\n\`\`\`json\n${JSON.stringify(input.map, null, 1)}\n\`\`\``
      : '',
    deliveryText(output, input.delivery, input.pasteMenu ?? 'Import a list, Markdown or JSON…'),
  ]
  return parts.filter(Boolean).join('\n\n') + '\n'
}

const INTRO = `# Unveilboard

You are helping a teacher with Unveilboard, an app that shows diagrams step by step (argument maps, mind maps, classifications, processes, comparisons…, often for teaching philosophy). A diagram is made of **elements** (boxes) of a given **type**, arranged in **trees**: each child is connected to its parent by a **relation** (supports, objects to…). In an argument map, the relation gives the child its **function** (Justification, Objection…). A **sequence** of steps reveals the diagram progressively, with a narration for the audience.`

/** Étapes d'une création en plusieurs temps : sans variante propre, elles suivent celle de la création (le chat, celle de « edit »). */
const STAGE_TASKS: Task[] = ['plan', 'develop', 'finish']

/** La variante d'une méthode pour une tâche (celle de la création pour ses étapes), sinon rien. */
export function methodVariant(method: PromptMethod, task: Task): string {
  const fallback = STAGE_TASKS.includes(task) ? method.variants?.create : task === 'chat' ? method.variants?.edit : undefined
  return (method.variants?.[task] ?? fallback ?? '').trim()
}

/** La méthode choisie par l'utilisateur : elle oriente le contenu, pas les formats ni les règles. */
function methodText(method: PromptMethod | undefined, task: Task): string {
  if (!method) return ''
  const text = [method.body.trim(), methodVariant(method, task)].filter(Boolean).join('\n\n')
  if (!text) return ''
  return `## The method to follow: ${method.title.trim()}

The user chose this method for the task. Follow it closely: on the content, the structure and the vocabulary of the diagram, it takes precedence over the general guidance below (shape, depth). It does not change the JSON format, the ids or the rules on faithfulness. The method may be written in another language than the content: write the content in the language required by the rules.

<method>
${text}
</method>`
}

/** Tâches qui construisent la structure d'un schéma : sa forme (à la création), sa profondeur. */
const SHAPE_TASKS: Task[] = ['create', 'plan', 'develop', 'enrich', 'expand']

/** La forme du schéma, selon la matière (création et plan). */
const FORM_TEXT = `Choose the form that fits the material, rather than a tree of arguments by habit:
- a debate, a reasoning (a question, theses, reasons, objections, answers) → an **argument map** (\`"kind": "argument"\`);
- a set of notions, a course → a **mind map** (\`"kind": "mindmap"\`), opening on both sides (\`"direction": "both"\`) when the root has more than three or four branches;
- a classification, a typology, a hierarchy of notions → a mind map **downwards** (\`"direction": "down"\`), with relations such as “is a kind of”, “is divided into”;
- a process, a chronology, a chain of causes → a **chain**: each step is the child of the previous one, with a relation that says the passage (“leads to”, “then”, “causes”); a cycle is closed by a link from the last step back to the first;
- a comparison (two doctrines, authors, periods) → **one tree per term**, side by side (several roots), and links between the points that correspond or oppose;
- notions bound by many mutual relations → a tree for the main structure, and links for the other relations.`

/** Bornes de taille de l'utilisateur, pour la création, son plan et ses sections. */
function shapeSizeText(input: PromptInput) {
  const scope = input.task === 'create' ? 'diagram' : input.task === 'plan' ? 'plan' : input.task === 'develop' ? 'section' : null
  const text = scope ? sizeText(input.size, scope) : ''
  return text ? `\n\n${text}` : ''
}

/** La profondeur plutôt que la largeur. */
const DEPTH_TEXT = `**Prefer depth to width.** A reader takes in three to five branches at a glance; a long row of siblings is hard to read and to present. This is a strong preference, not a fixed limit: follow the material.
- The root usually has few children (2 to 5): the main articulations of the subject. When more points come to mind, look for what groups them and put them under a common head rather than lining them up.
- Likewise, when an element gathers more than four or five children, check whether some of them belong together, and if so add an intermediate element that groups them (a distinction, a sub-thesis, a family of examples). Keep more children only when the material really calls for it (seven parts of a text, a list whose items are of the same rank and cannot be grouped meaningfully): never group artificially.
- Develop where it matters, over several levels (three or four below the root is common for a rich subject): a reason is justified, an objection answered, a notion divided, an example attached to what it illustrates.
- More depth does not mean more text: each box stays short, and most elements need no note.`

const TASK_TEXT: Record<Task, string> = {
  create: `## Your task: create a diagram

Build a complete diagram from the user's request below (a subject, a course, or a text to analyse), with its presentation sequence. Choose its form from the material (see “The shape of the diagram” below), and structure it in depth.`,
  enrich: `## Your task: enrich the diagram

Propose new elements for the diagram below, as requested (arguments, objections, answers, examples, assumptions, distinctions, definitions…): add them where they belong in the tree, with the right type and relation. Do not repeat what the diagram already says. If the request is vague, add what the reasoning most needs (an unanswered objection, a missing premise, an implicit assumption, an example).`,
  sequence: `## Your task: write the presentation sequence

Write the sequence that reveals the diagram below step by step, following the user's instructions if any: a clear order (usually the question or thesis first, then each line of argument with its objections and answers), a short title per step, and a narration the teacher can read or say (see below: it adds to the boxes, never repeats them). Replace the current sequence (\`"mode": "replace"\`) unless asked to extend it.`,
  review: reviewTaskText([...REVIEW_FOCUS]),
  edit: `## Your task: change the diagram

Change the diagram below as the user asks.`,
  expand: `## Your task: develop the diagram from one element

Starting from the element \`{focus}\`, do what the user asks below. Add new elements connected to it: as its children, with the right relation and type (justifications, objections, answers, examples, assumptions, distinctions, definitions…), deeper when useful (an answer to a new objection), and cross-links (\`link\`) between new elements and existing ones when they are really related. Do not change, move or remove existing elements, and do not write the sequence. Give each added element and link a short \`rationale\` (one sentence, for the user): the user will accept or reject each of them. Propose a handful of strong elements rather than many weak ones.`,
  plan: `## Your task: plan a rich diagram

The user wants a rich diagram, too large to be written in one answer. It will be built in several passes: first this **plan**, then each section developed separately (by other calls, in parallel, which will see this plan), then the cross-links and the presentation sequence. Write only the plan.

- \`kind\` and \`direction\`: the form that fits the material (see “The shape of the diagram” below).
- \`root\`: the root element (the question, the thesis or the central notion), as a real box.
- \`sections\`: the main children of the root, in reading order, **usually 3 to 5**: the main articulations of the subject, not a list of every point. When more points come to mind, group them into fewer, broader sections when they belong together; their sub-points belong in the briefs. More sections are fine when the material really has more parts of the same rank. Each head is a real box, explicit and self-sufficient (“The prisoners take shadows for reality”, not “Stage 1”), with its relation to the root.
  - \`brief\`: what the section must develop (the points to make, the authors or texts to use), how it is organised in depth (its two to four sub-articulations, each developed below), and where it stops, so that sections developed in parallel neither overlap nor leave gaps.
  - \`size\`: the number of elements the section needs under its head, usually 6 to 15: more for a central section, fewer for a secondary one.
  - \`synthesis\`: \`true\` for a section that draws on the others (an overall interpretation, a conclusion, the stakes of the whole): it is developed after them, seeing their content.
- \`pattern\`: when the sections share a structure (e.g. each stage → its interpretation → its philosophical interest), describe it precisely (relations, types, order), so that every section follows it the same way. Omit it otherwise.
- \`vocabulary\`: the types or relations you add to the vocabulary, if the material needs them (see the rules), so that every section uses the same ones.
- \`summary\`: the logic of the plan in two to four sentences, for the user, who will review it.
- Short ids: \`root\`, \`s1\`, \`s2\`…`,
  develop: '', // developTaskText : propre à chaque section
  finish: `## Your task: finish the diagram

The diagram below was built in several passes: a plan (given after the rules), then each section developed separately. Finish it:

- **Cross-links** (\`link\`): a few strong links between elements of different sections that are really related (one answers, prepares, illustrates or contradicts another), with the right relation. None where the tree already expresses the relation: few and meaningful.
- **Sequence** (\`{ "op": "sequence", "mode": "replace", "intro"?, "steps" }\`): the presentation of the whole diagram, following the plan: the root first, then each section in turn, revealing its elements progressively (group those that go together), and an overview at the end. Each step has a short title and a narration the teacher can read or say, which adds to the boxes without repeating them.

Use only \`link\` and \`sequence\` operations: do not change the elements.`,
  chat: `## Your task: talk with the user about the diagram

The user is working on the diagram below and talks with you in a chat beside it. Answer their latest message.

- When they ask a question (explain an element, assess the reasoning, suggest ideas, check a point), answer it, without changing anything.
- When they ask for a change (add, rewrite, move, remove, restyle, write or adjust the sequence or the notes), make exactly that change, with the changes format below, and say briefly in \`reply\` what you did. The app applies your changes at once (the user can undo them), so never change what they did not ask for. When the request is ambiguous and a wrong change would be costly, ask a short question instead.
- The diagram below is its **current** state: the user may have changed it, or undone your changes, since the earlier messages. Always work from it, not from what earlier messages say.
- Earlier answers of yours appear as JSON, with \`changes\` summarising the changes you made and their \`status\` (\`applied\`, \`undone\` by the user, \`suggested\`: added as suggestions the user accepts or rejects, \`failed\`).
- \`reply\` is short and conversational, in the content language: a few sentences, or a short list. Markdown is allowed.`,
  style: `## Your task: improve the look of the diagram

Every box of the diagram below may look the same (it was often imported from a list). Give it a clear, meaningful appearance, following the user's request if any, **without changing its content**.

- Use only \`update\` operations, with \`type\` and \`style\` (and \`relation\` only if the user asks for it). Do not change texts, notes, checkboxes, the tree or the sequence; do not add, move or remove anything.
- **Types first.** Give an element the type that says what it is (question, concept, example, statement…) when one really fits: its shape and colour follow. When the material calls for other kinds (a task, a step, a domain, a person, a period…), declare them in \`vocabulary\` with a \`style\`, and use them consistently: the same kind of element always looks the same.
- **Then \`style\`**, for the visual hierarchy, on top of the type: the root larger (\`"size": "l"\` or \`"xl"\`), main branches more visible than leaves; in a mind map, one colour per main branch, kept by its descendants (a lighter fill deeper down), so that each branch reads as a family. Give only the keys that change; \`null\` returns to the look of the type.
- In an argument map (\`"tree": { "kind": "argument" }\`), the colour of a connected element tells its function and is set by the app: change its type (its shape), not its colour.
- Restraint: a few colours (three to six), readable together, each with a meaning; no change without a reason.
- When elements are selected (see below), change only those (a single selected root stands for its whole tree).
- \`summary\`: in two or three sentences, the logic of the new look (what each shape or colour means), for the user.`,
}

/** Finition sans séquence : les liens seulement. */
const FINISH_LINKS_TEXT = `## Your task: finish the diagram

The diagram below was built in several passes: a plan (given after the rules), then each section developed separately. Finish it with a few strong **cross-links** (\`link\`) between elements of different sections that are really related (one answers, prepares, illustrates or contradicts another), with the right relation. None where the tree already expresses the relation: few and meaningful. Do not write a sequence.

Use only \`link\` operations: do not change the elements.`

/** Plan d'un schéma déjà commencé : reprendre sa racine et ses branches. */
const PLAN_EXISTING_TEXT = `**The diagram already exists** (below): build the plan on it, following the user's request.
- \`root\`: its main root, with its \`id\` and its text unchanged.
- Reuse its existing branches as sections when they fit: the section's \`id\` is the id of the branch head, its \`text\` the head's text unchanged. Add new sections (new ids) for what is missing.
- Each section's \`brief\` says what remains to develop in it (its existing content is kept), and its \`size\` how many elements to add.
- Branches you leave out of the plan stay as they are.`

/** Développer une section d'un plan : sa consigne, le motif commun, sa taille, ses limites. */
function developTaskText(input: PromptInput) {
  const plan = input.plan
  const section = plan?.sections.find((s) => s.id === input.focus)
  const id = input.focus ?? ''
  // Section déjà développée (en partie) : on complète.
  const inside = new Set([id])
  for (const e of input.map?.elements ?? []) if (e.parent && inside.has(e.parent)) inside.add(e.id)
  const existing = inside.size - 1
  return `## Your task: develop one section of the diagram

The diagram is built in several passes: a plan (given after the rules) split it into sections, and each section is developed separately, in parallel, by calls like this one. Develop only the section \`${id}\`${section ? ` (“${section.text}”)` : ''}, following its brief${plan?.pattern ? ', the common pattern of the plan' : ''} and the user's request.

${section ? `**Brief of this section**: ${section.brief}\n\n` : ''}${input.sectionRequest?.trim() ? `**The user's precision for this pass**: ${input.sectionRequest.trim()}\n\n` : ''}${
    existing ? `**This section already has ${existing} element${existing > 1 ? 's' : ''}** (in the diagram below): complete it, adding what is missing, without repeating or changing what is there.\n\n` : ''
  }${plan?.pattern ? `**Common pattern** (every section follows it the same way): ${plan.pattern}\n\n` : ''}- Add the elements of the section as descendants of \`${id}\` (children, grandchildren…), with the right type and relation${section?.size ? `: about ${section.size} elements` : ''}. Prefer depth: usually a few direct children under the head (2 to 4), each developed by its own children, rather than a long list of siblings; more when the material calls for it.
- Stay within the brief: the other sections cover the rest (see the plan); do not repeat them.${
    section?.synthesis
      ? '\n- This is a synthesis: the other sections are already developed, in the diagram below. Draw on them without repeating them, and link to their elements (`link`) where it helps.'
      : ''
  }
- Give the added elements ids that start with \`${id}-\` (\`${id}-1\`, \`${id}-2\`…).
- You may add cross-links (\`link\`) from your elements to elements already in the diagram, when they are really related.
- Use only \`add\` and \`link\` operations: do not change the existing elements, and do not write the sequence (it is written at the end).${input.source ? `\n\n${FIDELITY_TEXT}` : ''}`
}

/** Revoir un plan : le précédent, et les remarques de l'utilisateur. */
function planRevisionText(plan: DiagramPlan, remarks?: string) {
  return `## The previous plan${remarks?.trim() ? ", and the user's remarks" : ''}

Revise this plan${remarks?.trim() ? ' according to the remarks below; keep what they do not question' : ': propose a better one'}.

\`\`\`json
${JSON.stringify(plan, null, 1)}
\`\`\`${remarks?.trim() ? `\n\n**Remarks**: ${remarks.trim()}` : ''}`
}

const PLAN_FORMAT_TEXT = `## The plan format (JSON)

\`\`\`
{ "format": "unveilboard/plan", "version": 1, "title": "…", "lang": "fr", "summary": "…",
  "kind": "argument" | "mindmap", "direction"?: "right" | "left" | "down" | "up" | "both",
  "root": { "id", "text", "type"? },
  "pattern"?: "…", "vocabulary"?: [ { "id", "kind", "name", "description"?, … } ],
  "sections": [ { "id", "text", "type"?, "relation"?, "brief", "size"?, "synthesis"? } ] }
\`\`\`

\`type\` and \`relation\` are ids of the vocabulary, as for elements.`

/** Relecture critique : ce qu'on en attend (axes cochés par l'utilisateur), puis les règles communes. */
function reviewTaskText(focus: readonly ReviewFocus[]) {
  const on = new Set(focus.length ? focus : REVIEW_FOCUS)
  const sections: Record<ReviewFocus, string> = {
    structure: `### Construction of the diagram
- **type** / **relation**: a reason marked as an objection, an explanation marked as a justification, a question typed as a statement, an assumption typed as a statement, a wrong direction;
- **structure**: an element attached to the wrong parent, a branch that belongs elsewhere, premises that only work together but are attached separately (they should be linked premises);
- **redundancy**: two elements that say the same thing;
- **wording**: a box that holds several ideas or a whole paragraph (its development belongs in \`note\`), a vague or loaded formulation.`,
    reasoning: `### Soundness of the argument
Judge the reasoning, not whether you agree with its conclusions. Read charitably: before calling something a flaw, consider the strongest reasonable reading; if an unstated premise would repair it, say which one.
- **inconsistency**: elements that contradict each other, a conclusion that does not follow, a relation that says the opposite of the texts;
- **gap**: a premise the argument needs but does not state, a strong objection left without answer, a thesis without justification, a key notion never defined;
- **confusion**: an equivocation (a word taken in two senses), two distinct notions treated as one;
- **fallacy**: a reasoning that really commits a fallacy, with its usual \`name\` (hasty generalization, false dilemma, slippery slope, begging the question, straw man, ad hominem, appeal to an authority outside its field, post hoc, composition or division, appeal to nature…): say why this instance is fallacious;
- **bias**: a one-sided treatment, with its \`name\` if it has one: the weakest objections chosen while stronger ones exist (straw man by selection), cherry-picked examples, loaded wording, a debatable assumption taken for granted;
- **premise**: a premise that is doubtful, false, or itself needs support;
- **inference**: premises that may be acceptable yet do not lead to the conclusion, or only weakly: say what is missing.

Also rate, in \`strengths\`, each reason, objection and answer of the argument map (an element related by \`supports\`, \`objects\`, \`refutes\`, \`answers\` or \`explains\`): how much it does for the element it is attached to, \`weak\`, \`moderate\` or \`strong\`, with a one-sentence \`reason\`. For linked premises, rate the \`linked\` element (the premises together), not each premise.`,
    sources: `### Sources and quotations
- **faithfulness**: a quotation that seems inexact, a source or attribution that seems doubtful, a position ascribed to an author who did not hold it.`,
    sequence: `### Sequence
- **sequence**: an order that does not follow the reasoning, a narration that is missing or merely repeats the boxes.`,
  }
  const asked = REVIEW_FOCUS.filter((f) => on.has(f))
  return `## Your task: review the diagram critically

Read the diagram below as a demanding philosophy teacher preparing a lesson would, and point out what should be improved, following the user's request if any. ${
    asked.length < REVIEW_FOCUS.length ? 'Look only at the aspects below; leave the others aside.' : 'Look at all the aspects below.'
  }

${asked.map((f) => sections[f]).join('\n\n')}

Give each remark its \`targets\` (the ids concerned), a clear \`message\` (what is wrong and why, for the teacher, naming elements by their text, never by their id) and a \`priority\`. When a correction is clear, give it as \`operations\` (the changes format below); when it is a matter of judgement, give only the remark. Do not repeat what the app already checks by itself (an objection without answer, a thesis without justification, a missing relation, linked premises with a single premise, an element shown before its parent, a box too long): focus on what needs understanding. Fewer, sharper remarks are better than many small ones; if the diagram is sound, say so in \`summary\`.`
}

/** Schéma tiré d'un texte : le type de schéma voulu. */
const SOURCE_KIND_TEXT: Record<NonNullable<PromptInput['kind']>, string> = {
  argument: 'Build an **argument map** (`"tree": { "kind": "argument" }`): the question or thesis at the root, then the reasons, objections, answers, examples, assumptions and distinctions of the text.',
  mindmap: 'Build a **mind map** (`"tree": { "kind": "mindmap" }`): the central notion at the root, then its aspects, distinctions, definitions and examples, as the text organises them.',
  auto: 'Choose the form of the diagram from the text (see “The shape of the diagram” below): an **argument map** (`"tree": { "kind": "argument" }`) when it defends a thesis or discusses a question (reasons, objections, answers); otherwise a **mind map** (`"tree": { "kind": "mindmap" }`), shaped as the text is organised: a set of notions, a classification, a process, a comparison.',
}

/** Fidélité au texte source, vérifiée par l'app. */
const FIDELITY_TEXT = `**Faithfulness to the text** (checked by the app, character by character):
- Every element that states something the text says has \`"origin": "text"\` and an \`excerpt\`: the shortest passage of the text that says it (one or two sentences at most), copied **character for character**, without any change. To skip words inside it, write “[…]”.
- What the text does not say but your analysis brings out (an implicit assumption, an unstated link, a connecting question) has \`"origin": "reconstruction"\` and no \`excerpt\`.
- A \`quote\` element is a quotation copied exactly from the text (its \`text\` must appear in it).
- Give a \`source\` only when the text names it, or from the reference below.`

/** Créer un schéma à partir d'un texte : type de schéma, fidélité, séquence. */
function sourceTaskText(input: PromptInput) {
  const kind = SOURCE_KIND_TEXT[input.kind ?? 'auto']
  const sequence =
    input.withSequence === false
      ? 'Do not write a sequence.'
      : 'Write the presentation sequence too: the steps follow the progression of the text (usually the question or thesis first), each with a narration that explains the text to students, in its own terms, as a teacher would.'
  return `## Your task: create a diagram from a source text

Analyse the source text below and draw its structure as a diagram, following the user's request if any. ${kind}

${sequence}

${FIDELITY_TEXT}`
}

/** Plan d'un schéma tiré d'un texte : chaque section analyse une plage de paragraphes. */
function planSourceText(input: PromptInput) {
  return `**The diagram analyses the source text below**, whose paragraphs are numbered ([§1], [§2]…). ${SOURCE_KIND_TEXT[input.kind ?? 'auto']}
- Each section analyses a passage of the text: give its \`paragraphs\` (\`[first, last]\`). The sections usually follow the progression of the text and together cover it; a synthesis section may have no passage.
- The root and the section heads are your analysis of the text: state them clearly. Their developments will quote the text.
- \`brief\`: what the section must bring out of its passage (theses, reasons, examples, distinctions, objections).`
}

/** Tâches sur un schéma existant qui peuvent s'appuyer sur le texte source de la page. */
const TEXT_WORK_TASKS: Task[] = ['enrich', 'edit', 'expand', 'sequence', 'review']

/** Travailler sur un schéma tiré d'un texte : s'y appuyer, fidèlement (ou, pour une relecture, s'y confronter). */
function sourceWorkText(input: PromptInput): string {
  if (!input.source || !TEXT_WORK_TASKS.includes(input.task)) return ''
  if (input.task === 'review') {
    return `## The source text

The diagram is drawn from the source text given below. Check the diagram against it: an element that misrepresents the text, an excerpt or quotation that is inexact or attributed to the wrong element, an important point of the text that the diagram leaves out (remark kinds \`faithfulness\` and \`gap\`).`
  }
  if (input.task === 'sequence') {
    return `## The source text

The diagram is drawn from the source text given below: the narration may explain the text to students, in its own terms, and follow its progression when it makes sense.`
  }
  return `## The source text

The diagram is drawn from the source text given below. Base what you add on it, and say where it comes from.

${FIDELITY_TEXT}`
}

/** Le texte source, selon l'étape : entier (création), numéroté (plan), ou le passage d'une section. */
function sourceFor(input: PromptInput): string {
  const source = input.source
  if (!source) return ''
  if (input.task === 'create') return sourceText(source)
  const reference = source.label ? `\n\nReference: ${source.label}` : ''
  if (input.task === 'plan') return `## The source text (numbered paragraphs)${reference}\n\n<source>\n${numberedSource(sourceParagraphs(source.text))}\n</source>`
  // Enrichir, modifier, développer, relire un schéma tiré d'un texte : le texte entier.
  if (TEXT_WORK_TASKS.includes(input.task)) return sourceText(source)
  if (input.task !== 'develop') return ''
  const range = input.plan?.sections.find((s) => s.id === input.focus)?.paragraphs
  if (!range) return sourceText(source)
  return `## The passage this section analyses${reference}\n\nQuote from this passage (the excerpts are checked against the whole text).\n\n<source>\n${passageOf(sourceParagraphs(source.text), range)}\n</source>`
}

function sourceText(source: NonNullable<PromptInput['source']>) {
  return `## The source text${source.label ? `\n\nReference: ${source.label}` : ''}

<source>
${source.text}
</source>`
}

function vocabularyText(vocabulary: VocabularyLine[]) {
  const types = vocabulary.filter((v) => v.kind === 'type')
  const relations = vocabulary.filter((v) => v.kind === 'relation')
  const line = (v: VocabularyLine) => {
    const extra = [
      v.direction === 'toChild' ? 'reads “parent RELATION child”' : v.kind === 'relation' ? 'reads “child RELATION parent”' : '',
      v.childType ? `default child type: ${v.childType}` : '',
      v.function ? `function of the child: ${v.function}` : '',
    ].filter(Boolean)
    return `- \`${v.id}\` (${v.name})${v.definition ? `: ${v.definition}` : ''}${extra.length ? ` [${extra.join('; ')}]` : ''}`
  }
  return `## Vocabulary

Element types (what an element is):
${types.map(line).join('\n')}

Relations (what connects a child to its parent):
${relations.map(line).join('\n')}

Types of reasoning (optional, on a relation, mostly supports and objects): \`deduction\`, \`induction\`, \`analogy\`, \`abduction\` (best explanation), \`absurd\` (reductio), \`afortiori\`, \`authority\`, \`example\` (by example or counterexample).

Modality (optional, statements and assumptions only): \`descriptive\` or \`prescriptive\`.`
}

const MAP_FORMAT_TEXT = `## The diagram format (JSON)

\`\`\`
{ "format": "unveilboard/map", "version": 1, "title": "…", "lang": "fr",
  "elements": [ Element… ], "links": [ Link… ], "sequence": { "steps": [ Step… ] } }
\`\`\`

- **Element**: \`{ "id", "text", "type"?, "parent"?, "relation"?, "reasoning"?, "source"?, "modality"?, "note"?, "task"?, "style"?, "tree"?, "origin"?, "excerpt"? }\`
  - \`id\`: short and unique, without spaces (e.g. \`thesis\`, \`obj1\`). Parents come before their children; siblings are in display order.
  - \`parent\` + \`relation\`: the tree. An element without parent is a root (or a standalone box). Without \`relation\`, a plain branch (mind map).
  - \`type\`: omitted, the relation's default child type applies.
  - **Linked premises**: when premises only support (or object to) a conclusion **together**, none being enough alone, do not attach them separately: add a \`"type": "linked"\` element with an empty \`text\`, child of the conclusion with the relation (\`supports\`, \`objects\`…), then each premise as its child with \`"relation": "premise"\`. An objection to the inference itself (the premises may be true, yet not lead to the conclusion) is a child of the \`linked\` element. Independent reasons stay separate children.
  - \`source\`: author, work, theory or position the element comes from.
  - \`note\`: a longer development in Markdown (a full quotation, an explanation), shown beside the diagram on demand.
  - \`task\`: a checkbox on the box, \`"todo"\` or \`"done"\` (for a plan, a to-do list); omitted: none.
  - \`style\`: the look of this box, over the one its type gives it (only the keys that change): \`{ "geo"?, "color"?, "fill"?, "dash"?, "size"?: "s" | "m" | "l" | "xl", "font"?: "draw" | "sans" | "serif" | "mono" }\` (values as for a type's style, below). Prefer types; leave it out unless asked to work on the look.
  - \`tree\` (on a root only): \`{ "kind": "argument" | "mindmap", "direction"?: "right" | "left" | "down" | "up" | "both" }\`.
  - \`origin\`: \`"text"\` (stated in a source text) or \`"reconstruction"\` (your analysis: an implicit assumption, an unstated link). \`excerpt\`: the passage of the source it comes from, copied **verbatim**.
- **Link** (arrow outside the trees, between two elements): \`{ "id", "from", "to", "relation"?, "label"? }\`, reads “from RELATION to”.
- Fields marked \`function\` or \`others\` in the current diagram are read-only context.`

const PATCH_FORMAT_TEXT = `## The changes format (JSON)

Do not rewrite the whole diagram: answer with changes, applied in order.

\`\`\`
{ "format": "unveilboard/patch", "version": 1, "summary": "…", "operations": [ … ] }
\`\`\`

- \`summary\`: what you changed and why, in a few sentences, for the user (in the content language).
- \`{ "op": "add", "id", "text", "parent"?, "relation"?, "type"?, "rationale"?, … }\`: a new element (any Element field); \`id\` must be new. \`parent\` is an existing element or one added earlier. \`rationale\`: why you propose it (one sentence).
- \`{ "op": "update", "id", "text"?, "type"?, "relation"?, "reasoning"?, "source"?, "modality"?, "note"?, "task"?, "style"?, "tree"? }\`: change fields; \`null\` removes one (\`style\` only changes the keys given).
- \`{ "op": "move", "id", "parent", "relation"? }\`: attach an element (with its branch) to another parent.
- \`{ "op": "remove", "id" }\`: remove an element with its whole branch, or a link.
- \`{ "op": "link", "id", "from", "to", "relation"?, "rationale"? }\`: a new cross-link.
- \`{ "op": "sequence", "mode": "replace" | "append", "title"?, "steps": [ Step… ] }\`: write the sequence.

Refer to existing elements by their \`id\` in the current diagram.`

const CHAT_DELIVERY_TEXT = `## Your answer

Answer with a single JSON object in one \`\`\`json code block, and nothing else after it:

\`\`\`
{ "reply": "…", "patch"?: { "format": "unveilboard/patch", "version": 1, "summary": "…", "operations": [ … ] } }
\`\`\`

- \`reply\`: your message to the user (Markdown), always present. Write it first.
- \`patch\`: only when you change the diagram, in the changes format above. Leave it out otherwise.

It must be valid JSON (double quotes, no comments, no trailing commas; line breaks in strings written \`\\n\`).`

function reviewFormatText(focus: readonly ReviewFocus[]) {
  const on = new Set(focus.length ? focus : REVIEW_FOCUS)
  const kinds = REMARK_KINDS.filter((k) => FOCUS_OF_KIND[k] === null || on.has(FOCUS_OF_KIND[k]!))
  const strengths = on.has('reasoning')
  return `## The review format (JSON)

\`\`\`
{ "format": "unveilboard/review", "version": 1, "summary": "…",
  "remarks": [ { "id": "r1", "kind": "gap", "priority": "high" | "medium" | "low", "targets": [ids], "message": "…", "name"?: "…", "operations": [ … ]? } ]${
    strengths ? ',\n  "strengths": [ { "target": id, "strength": "weak" | "moderate" | "strong", "reason": "…" } ]' : ''
  } }
\`\`\`

- \`summary\`: your overall judgement in a few sentences (strengths, main problems), in the content language.
- \`kind\`: ${kinds.map((k) => `\`${k}\``).join(', ')}.${strengths ? '\n- `name`: for a `fallacy` or a `bias`, its usual name, in the content language.' : ''}
- \`operations\` (optional): the correction, applied only if the user accepts it, independently of the other remarks:
  - \`{ "op": "add", "id", "text", "parent"?, "relation"?, "type"?, … }\`: a new element (a new \`id\`);
  - \`{ "op": "update", "id", "text"?, "type"?, "relation"?, "reasoning"?, "source"?, "modality"?, "note"? }\`: change fields (\`null\` removes one);
  - \`{ "op": "move", "id", "parent", "relation"? }\`: attach an element (with its branch) to another parent;
  - \`{ "op": "remove", "id" }\`: remove an element with its branch;
  - \`{ "op": "link", "id", "from", "to", "relation"? }\`: a new cross-link;
  - \`{ "op": "sequence", "mode": "replace" | "append", "steps": [ Step… ] }\`: rewrite the sequence.${
    strengths ? '\n- `strengths`: one entry per reason, objection and answer (see above); `reason` names elements by their text.' : ''
  }

Refer to existing elements by their \`id\` in \`targets\` and \`operations\` only.`
}

const SEQUENCE_TEXT = `## The sequence

A **Step**: \`{ "title", "narration"?, "camera"?: "follow" | "overview" | "keep", "actions": [ { "do", "targets": [ids], "effect"?, "part"? } ] }\`

- \`do\`: \`show\`, \`hide\`, \`dim\`, \`undim\` (lasting); \`highlight\`, \`focus\` (everything else is dimmed), \`note\` (shows the element's note beside the diagram): this step only; \`fold\`, \`unfold\` (a branch).
- Targeting an element acts on its box **and** the arrow to its parent (\`show\` makes the box rise and draws the arrow). \`part\`: \`"node"\` or \`"edge"\` to act on one of them only.
- **Presentation mode**: if the current diagram's sequence has \`"presentation": "tour"\`, the whole diagram is visible from the start and \`show\` designates the elements a step frames and highlights (the rest is slightly dimmed): each step shows the part of the diagram the teacher talks about, in any order, and the visibility rule below does not apply. Otherwise (\`"reveal"\`, the default), steps reveal the diagram:
- **Visibility rule**: an element that no step shows is visible from the start, but only while its parent is visible. So showing a thesis shows its whole tree, except what later steps show. To reveal a tree progressively, show every element in its own step (or group elements that go together); never show a child before its parent.
- \`camera\`: \`follow\` (default) frames what the step shows; use \`overview\` for the first and last steps.
- \`narration\`: what the teacher says at that step (Markdown): what the boxes do not say, such as the link with the previous step, why this point matters, a question to the class, a transition. Never paraphrase or restate the boxes shown; one to three sentences is usually enough, and a step whose boxes speak for themselves needs little or none.
- \`intro\` (on the sequence, optional): shown under the title before the first step (Markdown): the question to the class, instructions or an outline. Short.`

/** Boîte et note : l'essentiel, explicite, dans la boîte ; la note précise, sans le remplacer. */
function writingRules(notes: boolean) {
  const box = `- **Box text** (\`text\`): the element itself, explicit and self-sufficient: a complete claim for a statement, an objection or an answer (“Lying destroys trust in speech”, not “Trust”), the notion and its gist for a concept. Anyone must understand the diagram from the boxes alone. Be concise: one idea per box, usually one sentence under 20 words. Markdown is allowed sparingly (**bold** for the key word, *italic*, a short list when the idea is a list).`
  if (!notes) return `${box}
- Do not write notes: everything goes in the boxes, concisely.`
  return `${box}
- **Note** (\`note\`, optional, Markdown): rare. Most elements have none. Add one only for a precise detail the box cannot hold: a full quotation, an exact reference, a date or figure, a technical precision, a worked example. Never to restate, paraphrase or introduce the box. Brief (one to three sentences), longer only if the user asks for developments. Never put the essential in the note alone: the box must still say it.`
}

/** La langue du contenu, et les noms des relations à traduire quand l'app n'a pas cette langue. */
function languageRules(lang: string) {
  const content = 'all content (texts, notes, titles, narration, summary, vocabulary names)'
  const translate = (when: string) =>
    `- ${when}: the vocabulary names above are not in that language, and relation names are written on the arrows. In your answer's \`vocabulary\`, add an entry for each relation of the vocabulary above that you use: same \`id\` and \`kind\`, with its \`name\` in the content language, as it should read on the arrow (a short verb phrase).`
  if (lang === AUTO_LANG) {
    return `- Write ${content} in the language of the current diagram if there is one; otherwise in the language of the user's request, or of the source text when the request is empty or gives no clear cue. Quotations stay in their language. Set the \`lang\` of the diagram or plan you write to the ISO 639-1 code of that language.
${translate('If that language is neither English nor French')}`
  }
  const name = languageName(lang)
  return `- Write ${content} in ${name}, except quotations, kept in their language. Set the \`lang\` of the diagram or plan you write to \`${lang}\`.${
    APP_LANGS.includes(baseLang(lang)) ? '' : `\n${translate(`The content is in ${name}`)}`
  }`
}

function rules(lang: string, notes: boolean, chat = false) {
  return `## Rules

${writingRules(notes)}
${languageRules(lang)}
- Be faithful: never invent a quotation, a source or a reference. A \`quote\` element must be an exact quotation with its \`source\`; when you are not sure of the exact words, write a \`statement\` without \`source\`. Mark your own reconstructions with \`"origin": "reconstruction"\`.
- Use the vocabulary above (ids, not names). It was designed for arguments and theories: when the material calls for other kinds of elements or relations (a step, an event, a period, a cause, a character, a work; “leads to”, “precedes”, “is a kind of”, “is part of”, “causes”, “influences”…), declare them in \`vocabulary\` rather than forcing a type or relation that does not fit: \`{ "id", "kind": "type" | "relation", "name" (in the content language), "description", "direction"?, "childType"?, "style"? }\`. A relation reads “child RELATION parent” unless \`"direction": "toChild"\` (“parent RELATION child”: “leads to”, “is divided into”). \`style\` (optional): for a type, \`{ "geo": "rectangle" | "oval" | "ellipse" | "diamond" | "hexagon" | "octagon" | "cloud" | "rhombus" | "triangle" | "pentagon" | "trapezoid" | "star", "color", "fill": "none" | "semi" | "solid" | "pattern" | "fill", "dash": "draw" | "solid" | "dashed" | "dotted", "size"?, "font"? }\` (\`fill\`: \`semi\` pale, \`solid\` light, \`fill\` full colour); for a relation, \`{ "color", "dash" }\`; colors: \`black\`, \`grey\`, \`violet\`, \`light-violet\`, \`blue\`, \`light-blue\`, \`yellow\`, \`orange\`, \`green\`, \`light-green\`, \`red\`, \`light-red\`. Keep such additions few and consistent.
- Nothing may rely on colors or positions: positions are computed by the app, and colors only reinforce what types, relations and the tree already say.
- Never write an element's \`id\` in text meant for the user (message, summary, reason, rationale, narration): the user does not see ids. Name the element by its text, briefly quoted.${
    chat
      ? '\n- In `reply` only, you may make an element clickable with a Markdown link whose target is `el:` followed by its id: `[its text, briefly quoted](el:e12)`. The user sees the text, and clicking it shows the element on the diagram. Use this for elements that already exist or that your changes add.'
      : ''
  }`
}

function deliveryText(output: 'map' | 'patch' | 'review' | 'plan' | 'chat', delivery: PromptInput['delivery'], pasteMenu: string) {
  if (output === 'chat') return CHAT_DELIVERY_TEXT
  const what = {
    plan: 'the plan (`"format": "unveilboard/plan"`)',
    map: 'the diagram (`"format": "unveilboard/map"`)',
    patch: 'the changes (`"format": "unveilboard/patch"`)',
    review: 'the review (`"format": "unveilboard/review"`)',
  }[output]
  const base = `## Your answer

Answer with ${what} as a single JSON object in one \`\`\`json code block, and nothing else after it. It must be valid JSON (double quotes, no comments, no trailing commas).`
  if (delivery === 'api') return base
  return `${base}

The user will paste your answer into Unveilboard (☰ menu › “${pasteMenu}”), which checks it before applying it. If you are an agent operating the user's browser on the Unveilboard page, you may apply it yourself: either through that menu (paste into the text box, then click the button), or by running \`window.unveilboard.apply(json)\` in the page, which returns the problems found, if any, so you can correct them.`
}
