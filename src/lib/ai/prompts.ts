// Consignes données à une IA pour lire, créer ou modifier un schéma. Pures (sans tldraw ni
// navigateur) : copiées dans le presse-papiers pour un assistant, ou envoyées à un fournisseur.
//
// Les instructions sont en anglais (les modèles les suivent mieux) ; le contenu produit est dans la
// langue du schéma. Toute modification d'une consigne change PROMPT_VERSION.

import { z } from 'zod'
import { MapSchema, type UnveilMap } from '../map/format'

export const PROMPT_VERSION = 3

export const TASKS = ['create', 'enrich', 'sequence', 'review', 'edit', 'expand'] as const
export type Task = (typeof TASKS)[number]
/**
 * Tâches de la boîte « Consigne pour une IA » : « expand » part d'un élément (barre de l'arbre),
 * « review » a son panneau (« Relecture »).
 */
export const ASSISTANT_TASKS = TASKS.filter((t) => t !== 'expand' && t !== 'review')

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
  /** Développer au besoin dans la note des éléments (par défaut : oui) ; sinon, tout dans la boîte. */
  notes?: boolean
  vocabulary: VocabularyLine[]
  /** Langue du contenu à écrire (« fr », « en »…). */
  lang: string
  /** La réponse sera collée par l'utilisateur (ou appliquée par un agent dans son navigateur). */
  delivery: 'clipboard' | 'api'
  /** Libellé du menu « Coller du JSON… » dans la langue de l'interface (pour un agent qui la pilote). */
  pasteMenu?: string
}

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
  notes: z.boolean().optional(),
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

const LANG_NAMES: Record<string, string> = { fr: 'French', en: 'English' }

export function buildPrompt(input: PromptInput): string {
  const output = input.task === 'create' ? 'map' : input.task === 'review' ? 'review' : 'patch'
  const parts = [
    `<!-- Unveilboard prompt v${PROMPT_VERSION}, task: ${input.task} -->`,
    INTRO,
    input.task === 'create' && input.source ? sourceTaskText(input) : TASK_TEXT[input.task].replace('{focus}', input.focus ?? ''),
    input.instruction.trim() ? `## The user's request\n\n${input.instruction.trim()}` : '',
    input.task === 'create' && input.source ? sourceText(input.source) : '',
    input.task === 'sequence' && input.order?.length
      ? `## Default order\n\nA default order, depth first (what the app's “Reveal the map” button does): ${input.order.map((s) => `\`${s}\``).join(', ')}. Follow it unless the user's instructions, or the logic of the argument, call for another.`
      : '',
    input.selection?.length
      ? `## Selected elements\n\nThe user selected these elements; focus on them: ${input.selection.map((s) => `\`${s}\``).join(', ')}.`
      : '',
    vocabularyText(input.vocabulary),
    MAP_FORMAT_TEXT,
    output === 'patch' ? PATCH_FORMAT_TEXT : output === 'review' ? REVIEW_FORMAT_TEXT : '',
    SEQUENCE_TEXT,
    rules(input.lang, input.notes !== false),
    input.map
      ? `## The current diagram${input.partial ? ' (extract)\n\nOnly part of the diagram is shown: the element, its ancestors up to the root, and its branch.' : ''}\n\n\`\`\`json\n${JSON.stringify(input.map, null, 1)}\n\`\`\``
      : '',
    deliveryText(output, input.delivery, input.pasteMenu ?? 'Paste JSON (diagram or changes)…'),
  ]
  return parts.filter(Boolean).join('\n\n') + '\n'
}

const INTRO = `# Unveilboard

You are helping a teacher with Unveilboard, an app that shows diagrams step by step (argument maps and mind maps, often for teaching philosophy). A diagram is made of **elements** (boxes) of a given **type**, arranged in **trees**: each child is connected to its parent by a **relation** (supports, objects to…). In an argument map, the relation gives the child its **function** (Justification, Objection…). A **sequence** of steps reveals the diagram progressively, with a narration for the audience.`

const TASK_TEXT: Record<Task, string> = {
  create: `## Your task: create a diagram

Build a complete diagram from the user's request below (a subject, a course, or a text to analyse), with its presentation sequence. Choose an argument map when the material is a debate or a reasoning (a question, theses, reasons, objections, answers), a mind map when it is a set of notions to organise.`,
  enrich: `## Your task: enrich the diagram

Propose new elements for the diagram below, as requested (arguments, objections, answers, examples, assumptions, distinctions, definitions…): add them where they belong in the tree, with the right type and relation. Do not repeat what the diagram already says. If the request is vague, add what the reasoning most needs (an unanswered objection, a missing premise, an implicit assumption, an example).`,
  sequence: `## Your task: write the presentation sequence

Write the sequence that reveals the diagram below step by step, following the user's instructions if any: a clear order (usually the question or thesis first, then each line of argument with its objections and answers), a short title per step, and a narration the teacher can read or say (2 to 5 sentences, Markdown allowed). Replace the current sequence (\`"mode": "replace"\`) unless asked to extend it.`,
  review: `## Your task: review the diagram critically

Read the diagram below as a demanding philosophy teacher preparing a lesson would, and point out what should be improved, following the user's request if any:
- **inconsistency**: elements that contradict each other, a conclusion that does not follow, a relation that says the opposite of the texts;
- **gap**: a premise the argument needs but does not state, an objection left without answer, a thesis without justification, a key notion never defined;
- **confusion**: an equivocation (a word taken in two senses), two distinct notions treated as one;
- **type** / **relation**: a reason marked as an objection, an explanation marked as a justification, a question typed as a statement, an assumption typed as a statement, a wrong direction;
- **structure**: an element attached to the wrong parent, a branch that belongs elsewhere;
- **redundancy**: two elements that say the same thing;
- **wording**: a box that holds several ideas or a whole paragraph (its development belongs in \`note\`), a vague or loaded formulation;
- **sequence**: an order that does not follow the reasoning, a narration that is missing or merely repeats the boxes;
- **faithfulness**: a quotation or a source that seems doubtful.

Give each remark its \`targets\` (the ids concerned), a clear \`message\` (what is wrong and why, for the teacher) and a \`priority\`. When a correction is clear, give it as \`operations\` (the changes format below); when it is a matter of judgement, give only the remark. Do not repeat what the app already checks by itself (an objection without answer, a thesis without justification, a missing relation, an element shown before its parent, a box too long): focus on what needs understanding. Fewer, sharper remarks are better than many small ones; if the diagram is sound, say so in \`summary\`.`,
  edit: `## Your task: change the diagram

Change the diagram below as the user asks.`,
  expand: `## Your task: develop the diagram from one element

Starting from the element \`{focus}\`, do what the user asks below. Add new elements connected to it: as its children, with the right relation and type (justifications, objections, answers, examples, assumptions, distinctions, definitions…), deeper when useful (an answer to a new objection), and cross-links (\`link\`) between new elements and existing ones when they are really related. Do not change, move or remove existing elements, and do not write the sequence. Give each added element and link a short \`rationale\` (one sentence, for the user): the user will accept or reject each of them. Propose a handful of strong elements rather than many weak ones.`,
}

/** Créer un schéma à partir d'un texte : type de schéma, fidélité, séquence. */
function sourceTaskText(input: PromptInput) {
  const kind = {
    argument: 'Build an **argument map** (`"tree": { "kind": "argument" }`): the question or thesis at the root, then the reasons, objections, answers, examples, assumptions and distinctions of the text.',
    mindmap: 'Build a **mind map** (`"tree": { "kind": "mindmap" }`): the central notion at the root, then its aspects, distinctions, definitions and examples, as the text organises them.',
    auto: 'Choose the kind of diagram: an **argument map** (`"tree": { "kind": "argument" }`) when the text defends a thesis or discusses a question (reasons, objections, answers), a **mind map** (`"tree": { "kind": "mindmap" }`) when it presents a set of notions to organise.',
  }[input.kind ?? 'auto']
  const sequence =
    input.withSequence === false
      ? 'Do not write a sequence.'
      : 'Write the presentation sequence too: the steps follow the progression of the text (usually the question or thesis first), each with a narration that explains the text to students, in its own terms, as a teacher would.'
  return `## Your task: create a diagram from a source text

Analyse the source text below and draw its structure as a diagram, following the user's request if any. ${kind}

${sequence}

**Faithfulness to the text** (checked by the app, character by character):
- Every element that states something the text says has \`"origin": "text"\` and an \`excerpt\`: the shortest passage of the text that says it (one or two sentences at most), copied **character for character**, without any change. To skip words inside it, write “[…]”.
- What the text does not say but your analysis brings out (an implicit assumption, an unstated link, a connecting question) has \`"origin": "reconstruction"\` and no \`excerpt\`.
- A \`quote\` element is a quotation copied exactly from the text (its \`text\` must appear in it).
- Give a \`source\` only when the text names it, or from the reference below.`
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

- **Element**: \`{ "id", "text", "type"?, "parent"?, "relation"?, "reasoning"?, "source"?, "modality"?, "note"?, "tree"?, "origin"?, "excerpt"? }\`
  - \`id\`: short and unique, without spaces (e.g. \`thesis\`, \`obj1\`). Parents come before their children; siblings are in display order.
  - \`parent\` + \`relation\`: the tree. An element without parent is a root (or a standalone box). Without \`relation\`, a plain branch (mind map).
  - \`type\`: omitted, the relation's default child type applies.
  - \`source\`: author, work, theory or position the element comes from.
  - \`note\`: a longer development in Markdown (a full quotation, an explanation), shown beside the diagram on demand.
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
- \`{ "op": "update", "id", "text"?, "type"?, "relation"?, "reasoning"?, "source"?, "modality"?, "note"?, "tree"? }\`: change fields; \`null\` removes one.
- \`{ "op": "move", "id", "parent", "relation"? }\`: attach an element (with its branch) to another parent.
- \`{ "op": "remove", "id" }\`: remove an element with its whole branch, or a link.
- \`{ "op": "link", "id", "from", "to", "relation"?, "rationale"? }\`: a new cross-link.
- \`{ "op": "sequence", "mode": "replace" | "append", "title"?, "steps": [ Step… ] }\`: write the sequence.

Refer to existing elements by their \`id\` in the current diagram.`

const REVIEW_FORMAT_TEXT = `## The review format (JSON)

\`\`\`
{ "format": "unveilboard/review", "version": 1, "summary": "…",
  "remarks": [ { "id": "r1", "kind": "gap", "priority": "high" | "medium" | "low", "targets": [ids], "message": "…", "operations": [ … ]? } ] }
\`\`\`

- \`summary\`: your overall judgement in a few sentences (strengths, main problems), in the content language.
- \`kind\`: \`inconsistency\`, \`gap\`, \`confusion\`, \`type\`, \`relation\`, \`structure\`, \`redundancy\`, \`wording\`, \`sequence\`, \`faithfulness\` or \`other\`.
- \`operations\` (optional): the correction, applied only if the user accepts it, independently of the other remarks:
  - \`{ "op": "add", "id", "text", "parent"?, "relation"?, "type"?, … }\`: a new element (a new \`id\`);
  - \`{ "op": "update", "id", "text"?, "type"?, "relation"?, "reasoning"?, "source"?, "modality"?, "note"? }\`: change fields (\`null\` removes one);
  - \`{ "op": "move", "id", "parent", "relation"? }\`: attach an element (with its branch) to another parent;
  - \`{ "op": "remove", "id" }\`: remove an element with its branch;
  - \`{ "op": "link", "id", "from", "to", "relation"? }\`: a new cross-link;
  - \`{ "op": "sequence", "mode": "replace" | "append", "steps": [ Step… ] }\`: rewrite the sequence.

Refer to existing elements by their \`id\` in the current diagram.`

const SEQUENCE_TEXT = `## The sequence

A **Step**: \`{ "title", "narration"?, "camera"?: "follow" | "overview" | "keep", "actions": [ { "do", "targets": [ids], "effect"?, "part"? } ] }\`

- \`do\`: \`show\`, \`hide\`, \`dim\`, \`undim\` (lasting); \`highlight\`, \`focus\` (everything else is dimmed), \`note\` (shows the element's note beside the diagram): this step only; \`fold\`, \`unfold\` (a branch).
- Targeting an element acts on its box **and** the arrow to its parent (\`show\` makes the box rise and draws the arrow). \`part\`: \`"node"\` or \`"edge"\` to act on one of them only.
- **Visibility rule**: an element that no step shows is visible from the start, but only while its parent is visible. So showing a thesis shows its whole tree, except what later steps show. To reveal a tree progressively, show every element in its own step (or group elements that go together); never show a child before its parent.
- \`camera\`: \`follow\` (default) frames what the step shows; use \`overview\` for the first and last steps.
- \`narration\`: what the teacher says at that step (Markdown), not a repetition of the box.`

/** Boîte et note : l'essentiel, explicite, dans la boîte ; la note précise, sans le remplacer. */
function writingRules(notes: boolean) {
  const box = `- **Box text** (\`text\`): the element itself, explicit and self-sufficient: a complete claim for a statement, an objection or an answer (“Lying destroys trust in speech”, not “Trust”), the notion and its gist for a concept. Anyone must understand the diagram from the boxes alone. Be concise: one idea per box, usually one sentence under 20 words. Markdown is allowed sparingly (**bold** for the key word, *italic*, a short list when the idea is a list).`
  if (!notes) return `${box}
- Do not write notes: everything goes in the boxes, concisely.`
  return `${box}
- **Note** (\`note\`, optional, Markdown): only when it helps, a precision the box cannot hold: the argument spelled out, an example, a full quotation, a reference. Brief (two to four sentences), longer only if the user asks for developments. Never put the essential in the note alone: the box must still say it.`
}

function rules(lang: string, notes: boolean) {
  const name = LANG_NAMES[lang] ?? lang
  return `## Rules

${writingRules(notes)}
- Write all content (texts, notes, titles, narration, summary) in ${name}, except quotations, kept in their language.
- Be faithful: never invent a quotation, a source or a reference. A \`quote\` element must be an exact quotation with its \`source\`; when you are not sure of the exact words, write a \`statement\` without \`source\`. Mark your own reconstructions with \`"origin": "reconstruction"\`.
- Use the vocabulary above (ids, not names). If a request really needs another type or relation, declare it in \`vocabulary\` (\`{ "id", "kind": "type" | "relation", "name", "description" }\`).
- Nothing may rely on colors or positions: they are computed by the app.`
}

function deliveryText(output: 'map' | 'patch' | 'review', delivery: PromptInput['delivery'], pasteMenu: string) {
  const what = {
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
