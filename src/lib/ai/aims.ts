// Visées d'un développement à partir d'un élément : des demandes toutes faites (arguments,
// objections, contraires…), rangées par famille. Leur consigne part avec la demande, comme une
// méthode, et la zone de saisie reste libre pour une précision. Une méthode de la bibliothèque peut
// ajouter les siennes (« ## @quick … », src/lib/prompts/template.ts).
//
// Les consignes sont en anglais, comme le reste de ce qui est envoyé au modèle ; les libellés et
// les infobulles sont traduits (t.elementAi.aims). Toute modification d'une consigne change PROMPT_VERSION.

/** Familles de visées : argumenter, analyser un concept, questionner, illustrer, observer (une image). */
export const AIM_FAMILIES = ['argue', 'analyse', 'question', 'illustrate', 'observe'] as const
export type AimFamily = (typeof AIM_FAMILIES)[number]

/** Consigne de chaque visée de l'app. */
export const AIM_TEXT = {
  arguments:
    'Arguments for the element, as strong and conclusive as possible: each one a real argument, not a mere assertion or a restatement of the element. Give it as a short `statement` connected with `supports`, with its `reasoning` (deduction, induction, analogy…). When the conclusion only follows from two premises together (a general principle and a fact or a case), use linked premises rather than separate children, so that the inference is visible; justify a premise that could be contested by its own support. Prefer arguments that would convince someone who doubts the element (a valid deduction from acceptable premises, decisive facts, a telling analogy) to weak or merely popular ones, and arguments independent of each other to variants of the same idea.',
  objections:
    'Objections to the element, in their strongest form: the version a serious opponent would defend, never a straw man. Each one is aimed at something precise (a false or doubtful premise, an inference that does not follow, a hidden assumption, a counterexample, the scope of the claim, an ambiguity), as a `statement` connected with `objects`, with its `reasoning` when it is clear; an objection to the inference itself is attached to the linked premises, if there are any. Say in its `rationale` what it targets. No weak, rhetorical or merely emotional objection.',
  answers:
    'Answers. If the element is a question: the main positions that answer it (`answers`), each with the reason that best supports it. If it is an objection: the strongest replies, aimed at its actual point and not at a weaker version: `refutes` when the reply shows that the objection fails (a false premise, an invalid inference, a distinction it overlooks), `answers` when it concedes part of it and limits its reach. Otherwise: what responds to it.',
  assumptions:
    'Assumptions: what the element takes for granted without saying it, and which could be disputed, as `belief` elements connected with `presupposes`, with their `modality` (descriptive or prescriptive). Only assumptions that are really implied and worth discussing.',
  consequences:
    'Consequences: what follows from the element. What it implies logically if it is accepted (`implies`), and what it produces or leads to (`causes`), as short `statement` elements. Prefer consequences that are not obvious, or that put the element to the test.',
  fallacies:
    'Fallacies, as an exercise: plausible but fallacious arguments for or against the element, of the kind one actually hears, each a `statement` connected with `supports` or `objects`, worded so that it is tempting at first sight (its text must not give the fallacy away). Set its `fallacy` to the name of the fallacy or bias (ad hominem, straw man, slippery slope, false dilemma, hasty generalisation, appeal to nature, post hoc, begging the question, appeal to popularity, confirmation bias…): the teacher sees it, the audience does not. Its note says in one or two sentences why the argument fails and, when useful, what a sound version would need. Vary the fallacies, and keep them realistic rather than caricatural.',
  references:
    'References: authors, works or doctrines that hold, discuss or reject the element, as `statement` elements whose `source` names the author and, when you know it, the work (a `quote` only for a quotation you are certain of, word for word). Give each one a `certainty`: `established` when it is well known and certain, `likely` when you are fairly but not fully sure (of the attribution, the work or the wording), `uncertain` when it must be checked before use; for the last two, say in the `rationale` what to check. Never invent a reference: a few sure references are better than many doubtful ones.',
  senses:
    'Senses of the word: its main distinct meanings (everyday uses, technical or philosophical senses, an etymology when it sheds light), each a `concept` connected with `defines`, giving the sense in a few words (“freedom of action: doing what one wants”). Only senses that really differ and matter; when two senses are easily confused, say what separates them.',
  confusions:
    'Not to be confused with: the neighbouring concepts most often confused with the element or used in its place (the most instructive ones, not the obvious neighbours), each a `concept` connected with `distinguishes`. Under each, the decisive difference as a `statement` (no relation): a clear criterion in one sentence (“X …, whereas Y …”), not a mere difference of degree; when possible, under the difference, a case that separates them (`example`, `illustrates`). This is the most valuable part of the analysis of a concept.',
  opposites:
    'Opposites: what is opposed to the element, each a `concept` connected with `opposes`. When useful, tell apart the contrary (the other extreme of the same kind: love and hate are both attachments) from the mere absence (indifference). When the element has several opposites, each brings out a different sense of it (freedom as opposed to constraint, to servitude, to necessity): say which sense, briefly.',
  category:
    'Category: the more general kind the element belongs to (its genus; several if it has several senses), each a `concept` connected with `fallsUnder`, with what sets the element apart from the other species of this genus (its specific difference). No empty genus (“a notion”, “a phenomenon”).',
  species:
    'Species: the forms or varieties into which the element divides (justice: commutative, distributive), each a `concept` connected with `dividesInto`, with what distinguishes it from the others when it is not obvious. Prefer a division by one clear criterion, and name it.',
  features:
    'Characteristics: the essential features that every case of the element has (belief admits of degrees), each a short `concept` or `statement` connected with `hasFeature`. Only defining or revealing features, not accidental ones.',
  conditions:
    'Conditions: what the element requires in order to exist: its conditions or principles (connected with `presupposes`), its causes or origins (connected with `explains`), each a short `concept` or `statement`. Prefer what is not obvious and sheds light on the element.',
  definition:
    'Definition: a working definition of the element in one sentence (`statement`, relation `defines`), drawn from what the diagram already says about it (its category, its decisive differences), without using the term itself or a synonym. If the diagram says little about it, give the definition that best captures its common use, and present it as provisional. A single element, unless the element has several senses that each need their own definition.',
  questions:
    'Questions: the questions the element raises, as `question` elements connected with `raises`: real questions, which the element does not settle and which could be discussed (not questions of fact, nor rhetorical ones).',
  difficulties:
    'Difficulties: what stands in the way of the element or makes it problematic, without being yet a full objection: a fact it accounts for badly, an obscure or ambiguous notion it relies on, an awkward consequence, what remains to be explained. Each a `problem` connected with `raises`, stated precisely (not “it is complex”).',
  problem:
    'Problem: the problem the element raises, in proper form, as an argument map. If the element is in an argument map, the problem is its child: a `question` connected with `raises`. Otherwise (a mind map), make it a separate argument tree beside the diagram: the `question` as a new root (no `parent`, with `"tree": { "kind": "argument" }`), and a `link` from the element to it with the relation `raises`. Under the question, two plausible but opposed answers (`statement` elements connected with `answers`), each with the reason that makes it plausible (`supports`). Under each answer (not under its reason), an objection (`objects`) strong enough to put that answer itself in question (a counterexample, a consequence that makes it unacceptable, a presupposition that fails), not merely a weakness of its argument. The two answers must both be defensible, so that the question is a real problem and not a question of fact; if the element raises several problems, the most important first.',
  tensions:
    'Tensions: the difficulties the element brings out (a paradox, two requirements that pull against each other, a consequence that seems to contradict it), as `problem` elements connected with `raises`, each stated so that the tension is clear (“If …, then …; but …”).',
  stakes:
    'Stakes: why the element matters: what depends on it (moral, political, practical or theoretical consequences), what changes if we accept or reject it, as short `statement` elements connected with `hasStake`.',
  examples:
    'Examples: concrete, precise cases that illustrate the element, as `example` elements connected with `illustrates`, from varied areas (everyday life, history, science, literature, art), each saying in a few words what it shows.',
  counterexamples:
    'Counterexamples: cases that the element seems unable to account for, or that contradict it, as `example` elements connected with `objects`, each saying what it puts in question.',
  borderline:
    'Borderline cases: cases where one hesitates to apply the element (“is it still …?”), as `example` elements connected with `tests`, each saying in one sentence what makes it borderline. They test the boundaries of the element.',
  analogies:
    'Analogies: comparisons that help to grasp the element (“just as …, so …”), as `example` elements connected with `illustrates`, each with its limit: where the analogy stops working.',
  news:
    'Current cases: recent, real and dated cases (events, decisions, debates, scientific findings) that illustrate the element, put it to the test or show what is at stake, as `example` elements connected with `illustrates` (or `objects` when the case goes against it), each saying in a few words what it shows, with its date, and its `source` (the publication) and `url`. Prefer cases documented by reliable sources, which an audience can grasp without a long explanation.',
  figures:
    'Facts and figures: precise, sourced data (statistics, measurements, results of studies, dates) that support the element or put it in question, as `fact` elements connected with `supports` or `objects`, each with its figure, its date and its scope (where, who, how it was measured), its `source` and `url`. Give the figures as the source gives them, without stretching them into a stronger claim; when sources disagree, say so.',
  describe:
    'Description of the image, as elements under it: what is seen, without interpretation. Its subject first, then its main parts in a clear order (foreground, background; left, right; or the order in which the eye reads it), each a short `statement` (plain branch, no relation) saying where it is and what it shows, with under it the details that matter (gestures, expressions, objects, light, colours, contrasts). Note what is striking or unexpected. No meaning, no symbol, no intention of the author: only what anyone can check by looking.',
  interpret:
    'Interpretation of the image: what it means, shows or argues beyond what is seen. Each reading is a `statement` (plain branch) under the image, justified by the visible details it rests on, as `fact` children connected with `supports` (“the light falls only on …”). When the image is a known work, its context (author, period, movement) may support a reading: give it with its `source` and `certainty`. When several readings are possible, give the competing ones, and an objection (`objects`) to a reading that the image itself puts in doubt. Keep observation and interpretation apart: a detail is in a `fact`, a meaning in a `statement`.',
  problematize:
    'From the image to philosophy: the concepts at stake in what it shows (each a `concept`, plain branch, with in its note the detail of the image that brings it out), then the philosophical questions it raises (`question` connected with `raises`), each a real question that could be discussed, not a question about the image itself (who painted it, what it represents). Under the most fruitful question, two opposed answers (`statement` connected with `answers`). The image is a starting point: each question must arise from something it really shows.',
  caption:
    'Captions: name the parts of the image that matter (the figures, objects, places, organs, components or symbols that one must be able to point at to understand or explain it), each as a short box (a few words: “Marianne”, “the barricade”, “left ventricle”), with no `parent`, linked to the image by a `link` without relation whose `point` is the spot it designates or, for a part that spreads over a region (a crowd, the sky, a group of figures), whose `area` circles it. Coordinates are fractions of the image (0 to 1, from its top-left corner): place them precisely on what is named, by looking at the image. Name only what is really visible; when an identification is uncertain, give it as such in the box (“Delacroix himself?”). A box may carry a note of one or two sentences when the part needs an explanation.',
  reproduce:
    'Reproduce the diagram shown in the image (a mind map, a scheme, a table, a blackboard, handwritten notes, a chart turned into a tree), faithfully, as a tree under the image: its main box as a child of the image (plain branch, no relation), every other box beneath, following its hierarchy and the order of its branches. Copy the text of each box word for word, in its own language; an illegible word is written [illegible]. When an arrow or a layout clearly means a relation (an arrow labelled “because”: `supports`; “but”, “however”: `objects`; “e.g.”: `illustrates`), use it, with the matching type; otherwise a plain branch. Do not add, correct, complete or summarise anything: reproduce every box, whatever the amount asked. If the image is not a diagram but a text, reproduce its outline (headings, then the points under each).',
} as const satisfies Record<string, string>

export type AimId = keyof typeof AIM_TEXT

/** Visées de chaque famille, dans l'ordre des boutons (une visée peut être de deux familles). */
export const FAMILY_AIMS: Record<AimFamily, AimId[]> = {
  argue: ['arguments', 'objections', 'answers', 'assumptions', 'consequences', 'references', 'figures', 'fallacies'],
  analyse: ['senses', 'confusions', 'opposites', 'category', 'species', 'features', 'conditions', 'consequences', 'definition'],
  question: ['questions', 'difficulties', 'tensions', 'problem', 'stakes'],
  illustrate: ['examples', 'counterexamples', 'borderline', 'analogies', 'news'],
  observe: ['describe', 'caption', 'interpret', 'problematize', 'reproduce'],
}

/** Famille proposée seulement pour une image (et d'abord pour elle). */
export const IMAGE_FAMILY: AimFamily = 'observe'

/** Visées qui couvrent tout ce qu'il y a à prendre (reproduire un schéma) : l'ampleur n'a pas de sens. */
export const AIM_WHOLE: AimId[] = ['reproduce']

/** Visées qui demandent de voir l'image (des coordonnées) : un modèle qui la voit, à défaut celui de lecture. */
export const AIM_SEES: AimId[] = ['caption']

/**
 * Visées qui s'appuient sur le web : « required », sans lui elles n'ont pas de sens (l'actualité,
 * des chiffres sourcés), la recherche s'active et reste active ; « useful », elle s'active quand le
 * fournisseur le permet (vérifier les références), et peut être coupée.
 */
export const AIM_WEB: Partial<Record<AimId, 'required' | 'useful'>> = {
  references: 'useful',
  news: 'required',
  figures: 'required',
}

/**
 * Famille proposée d'abord pour un élément, d'après son type, sinon la forme de son arbre :
 * analyser un concept, questionner une question, illustrer un exemple, argumenter sur un énoncé.
 */
export function familyFor(type: string | undefined, argumentMap: boolean): AimFamily {
  if (type === 'concept' || type === 'distinction') return 'analyse'
  if (type === 'question' || type === 'problem') return 'question'
  if (type === 'example') return 'illustrate'
  if (type === 'statement' || type === 'belief' || type === 'fact' || type === 'quote') return 'argue'
  return argumentMap ? 'argue' : 'analyse'
}

/**
 * Approfondir ce qui vient d'être ajouté (les éléments sélectionnés) : leurs enfants, plutôt que de
 * nouveaux éléments au premier niveau. `aim` : la visée pour laquelle ils avaient été proposés.
 */
export function deepenText(aim?: string): string {
  return `Deepen the selected elements, which were just added from this element${aim ? ` (as: ${aim})` : ''}: develop each of them by its own children, according to what each one most needs (a justification or an example for a claim, an answer for an objection, a difference or a case for a distinction, a definition for a notion…), rather than adding new elements at the first level. Spread the additions over the selected elements, the most important first.`
}

/** Ampleur d'un développement : nombre d'éléments ajoutés, enfants compris. */
export const AMOUNTS = ['brief', 'normal', 'developed', 'exhaustive'] as const
export type Amount = (typeof AMOUNTS)[number]
export const DEFAULT_AMOUNT: Amount = 'normal'

/** Bornes de chaque ampleur (sans plafond : exhaustif). */
export const AMOUNT_RANGE: Record<Amount, [number, number | null]> = {
  brief: [2, 4],
  normal: [5, 8],
  developed: [9, 15],
  exhaustive: [15, null],
}

/** Consigne de l'ampleur voulue : elle prime sur les nombres d'une méthode ou d'une visée. */
export function amountText(amount: Amount): string {
  const [min, max] = AMOUNT_RANGE[amount]
  const count = 'counting every element you add (children and grandchildren included; links do not count)'
  const body =
    max === null
      ? `as much as the material really offers (usually more than ${min} elements), ${count}. Look for everything relevant, but add nothing trivial, redundant or padded`
      : `about ${min} to ${max} elements in all, ${count}`
  return `**How much to add**: ${body}. The user chose this amount: it takes precedence over any number given by the method or the aim, unless the aim calls for a single element.`
}
