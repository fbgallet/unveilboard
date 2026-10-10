// Format JSON d'un schéma (« unveilboard/map »), indépendant de tldraw : éléments, relations,
// arbres, vocabulaire et séquence, désignés par des identifiants courts et des noms, jamais par
// la couleur ou la position. Lu et écrit par une IA, et par l'import / export JSON.
//
// Ce schéma Zod est la source unique : types TypeScript, validation, et JSON Schema publié
// (docs/map-format.schema.json, régénéré par `pnpm map:schema`). Les descriptions sont en anglais :
// elles sont lues par les IA et par les développeurs d'autres outils.

import { z } from 'zod'
import { MODALITIES, REASONINGS } from '../presets/presets'
import { CAMERA_MODES, EFFECTS, type StepActionType } from '../sequence/types'
import { TREE_DIRECTIONS } from '../tree/layout'

export const MAP_FORMAT = 'unveilboard/map'
export const MAP_VERSION = 1

/** Actions d'étape, dans l'ordre de l'interface. */
export const ACTION_TYPES = ['show', 'hide', 'dim', 'undim', 'fold', 'unfold', 'highlight', 'focus', 'note'] as const satisfies readonly StepActionType[]

/** Actions qui ne concernent que le nœud (jamais la flèche qui le relie à son parent). */
export const NODE_ONLY_ACTIONS: readonly StepActionType[] = ['fold', 'unfold', 'note']

const Ref = z
  .string()
  .min(1)
  .max(64)
  .regex(/^\S+$/)
  .describe('Short identifier, unique in the map (elements, links and other shapes share one namespace).')

const VocabularyId = z.string().min(1).max(64).regex(/^\S+$/)

/** Case à cocher d'un élément. */
export const TASK_STATES = ['todo', 'done'] as const
export type TaskState = (typeof TASK_STATES)[number]

/** Aspect propre d'une boîte (valeurs de tldraw), au-delà de celui que lui donne son type. */
export const STYLE_GEOS = ['rectangle', 'oval', 'ellipse', 'diamond', 'hexagon', 'octagon', 'cloud', 'rhombus', 'triangle', 'pentagon', 'trapezoid', 'star'] as const
export const STYLE_COLORS = ['black', 'grey', 'light-violet', 'violet', 'blue', 'light-blue', 'yellow', 'orange', 'green', 'light-green', 'light-red', 'red', 'white'] as const
export const STYLE_FILLS = ['none', 'semi', 'solid', 'pattern', 'fill'] as const
export const STYLE_DASHES = ['draw', 'solid', 'dashed', 'dotted'] as const
export const STYLE_SIZES = ['s', 'm', 'l', 'xl'] as const
export const STYLE_FONTS = ['draw', 'sans', 'serif', 'mono'] as const

export const ElementStyleSchema = z
  .object({
    geo: z.enum(STYLE_GEOS).optional(),
    color: z.enum(STYLE_COLORS).optional(),
    fill: z.enum(STYLE_FILLS).optional().describe('none: outline only; semi: pale fill; solid: light fill; fill: full color.'),
    dash: z.enum(STYLE_DASHES).optional().describe('Outline: draw (hand-drawn), solid, dashed, dotted.'),
    size: z.enum(STYLE_SIZES).optional().describe('Outline and text size.'),
    font: z.enum(STYLE_FONTS).optional(),
  })
  .describe(
    'Appearance of this box, overriding the one its type gives it (only the keys given). Prefer types; use it for visual hierarchy (a larger root, one color per main branch of a mind map).'
  )
export type ElementStyle = z.infer<typeof ElementStyleSchema>

export const ElementSchema = z
  .object({
    id: Ref,
    text: z
      .string()
      .max(4000)
      .describe(
        'Text shown in the box: explicit and concise. Light Markdown: **bold**, *italic*, ~~strike~~, `code`, [link](url), bullet or numbered lists; one paragraph per line.'
      ),
    type: VocabularyId.optional().describe(
      'Element type (what the element is): statement, belief (assumption), fact, concept, distinction, question, problem, example, quote, or a custom type from `vocabulary`. Omitted: the type given by the relation (its `childType`), or none.'
    ),
    parent: Ref.optional().describe('Parent element in a tree. Omitted: the element is a root (or stands alone).'),
    relation: VocabularyId.optional().describe(
      'Relation that connects the element to its parent (supports, objects, refutes, answers, explains, implies, presupposes, illustrates, defines, raises, distinguishes, opposes, relates, or a custom relation). Most relations read "element RELATION parent" ("the premise supports the thesis"); those with direction "toChild" in the vocabulary read "parent RELATION element" (implies, presupposes, raises). Omitted: a plain branch (mind map).'
    ),
    reasoning: z
      .enum(REASONINGS)
      .optional()
      .describe('Type of reasoning of the relation to the parent (mostly for supports and objects).'),
    side: z.enum(['left', 'right']).optional().describe('Trees with direction "both": side of a child of the root.'),
    source: z.string().max(300).optional().describe('Source: author, theory, position, reference.'),
    modality: z
      .enum(MODALITIES)
      .optional()
      .describe('Statements and assumptions: descriptive (how things are) or prescriptive (how things ought to be).'),
    note: z.string().max(20000).optional().describe('Longer development (Markdown), shown beside the diagram on demand.'),
    folded: z.boolean().optional().describe('Branch folded at the start of the presentation.'),
    task: z
      .enum(TASK_STATES)
      .optional()
      .describe('A checkbox on the box, which the user can tick: todo (unchecked) or done (checked). Omitted: no checkbox.'),
    style: ElementStyleSchema.optional(),
    origin: z
      .enum(['text', 'reconstruction'])
      .optional()
      .describe('Generated from a source: stated in the text, or reconstructed by the analysis (an implicit assumption, a link left unsaid).'),
    excerpt: z.string().max(4000).optional().describe('Generated from a source: the passage it comes from, quoted verbatim.'),
    function: z
      .string()
      .optional()
      .describe('Read-only, derived: function of the element in an argument map (Objection, Justification…). Ignored on import.'),
    tree: z
      .object({
        kind: z.enum(['argument', 'mindmap']).describe('argument: argument map (relations give functions and colors); mindmap: plain tree.'),
        direction: z.enum(TREE_DIRECTIONS).optional().describe('Direction in which the tree opens. Default: right.'),
      })
      .optional()
      .describe('On a root: the tree it starts.'),
  })
  .describe('A box of the diagram.')

export const LinkSchema = z
  .object({
    id: Ref,
    from: Ref,
    to: Ref,
    relation: VocabularyId.optional().describe('Reads "from RELATION to". Omitted: a plain arrow.'),
    reasoning: z.enum(REASONINGS).optional(),
    label: z.string().max(300).optional().describe('Text of a plain arrow (without relation).'),
  })
  .describe('An arrow between two elements outside the trees (a cross-link).')

export const OtherSchema = z
  .object({
    id: Ref,
    kind: z.string().describe('tldraw shape type (text, frame, image, draw…).'),
    text: z.string().optional(),
  })
  .describe('Other shape of the diagram, given as context (read-only: ignored on import).')

export const VocabularySchema = z
  .object({
    id: VocabularyId,
    kind: z.enum(['type', 'relation']),
    name: z.string().max(100).describe('Name in the language of the author.'),
    description: z.string().max(1000).optional(),
    direction: z
      .enum(['toParent', 'toChild'])
      .optional()
      .describe('Relations: "toParent" reads "child RELATION parent" (default); "toChild" reads "parent RELATION child".'),
    childType: VocabularyId.optional().describe('Relations: type given to an element connected by this relation.'),
    function: z.string().max(100).optional().describe('Relations: function of the connected element in an argument map.'),
    style: z.record(z.string(), z.string()).optional().describe('tldraw style (geo, color, fill, dash, size, font, arrowheads); custom entries only.'),
  })
  .describe('An element type or relation used in the map.')

export const ActionSchema = z.object({
  do: z.enum(ACTION_TYPES).describe(
    'show, hide, dim, undim: lasting; highlight, focus (dims everything else), note (shows the note of the element): this step only; fold, unfold: a tree branch.'
  ),
  targets: z.array(Ref).min(1),
  effect: z
    .enum(EFFECTS)
    .optional()
    .describe('show: entrance effect. Omitted: the box rises (fades in for a root) and the arrow to its parent is drawn.'),
  part: z
    .enum(['node', 'edge'])
    .optional()
    .describe('Elements: only the box (node) or only the arrow to its parent (edge). Omitted: both.'),
})

export const StepSchema = z.object({
  title: z.string().max(200),
  narration: z.string().max(20000).optional().describe('Text shown to the audience beside the diagram (Markdown).'),
  camera: z
    .union([
      z.enum(CAMERA_MODES),
      z.object({
        mode: z.enum(CAMERA_MODES),
        padding: z.number().optional(),
        maxZoom: z.number().optional(),
        area: z
          .object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() })
          .optional()
          .describe('area mode: the rectangle to frame, in canvas coordinates.'),
      }),
    ])
    .optional()
    .describe(
      'follow (default): frame what the step shows; overview: the whole visible diagram; area: a fixed rectangle (object form, with `area`); keep: do not move.'
    ),
  actions: z.array(ActionSchema),
})

export const MapSchema = z
  .object({
    format: z.literal(MAP_FORMAT),
    version: z.literal(MAP_VERSION),
    title: z.string().max(200).optional(),
    lang: z.string().max(20).optional().describe('Language of the content (BCP 47), e.g. "fr".'),
    vocabulary: z.array(VocabularySchema).optional().describe('Types and relations used, with their definitions.'),
    elements: z.array(ElementSchema).describe('Parents come before their children; siblings are in display order.'),
    links: z.array(LinkSchema).optional(),
    others: z.array(OtherSchema).optional(),
    sequence: z
      .object({
        narrationScale: z.number().optional(),
        presentation: z
          .enum(['reveal', 'tour'])
          .optional()
          .describe(
            'How the diagram is presented. "reveal" (default): elements shown by a step are hidden until that step. "tour": the whole diagram is visible from the start, and each step frames (and highlights) the elements it shows.'
          ),
        intro: z
          .string()
          .max(20000)
          .optional()
          .describe('Welcome text shown under the title when the presentation starts, before the first step (Markdown).'),
        steps: z.array(StepSchema),
      })
      .optional()
      .describe(
        'Progressive presentation. An element that no step shows is visible from the start, but only while its parent is visible: showing a thesis shows its whole tree, except what later steps show.'
      ),
  })
  .describe('An Unveilboard diagram: elements (boxes), trees, cross-links and presentation sequence.')

export type UnveilMap = z.infer<typeof MapSchema>
export type MapElement = z.infer<typeof ElementSchema>
export type MapLink = z.infer<typeof LinkSchema>
export type MapOther = z.infer<typeof OtherSchema>
export type MapVocabulary = z.infer<typeof VocabularySchema>
export type MapStep = z.infer<typeof StepSchema>
export type MapAction = z.infer<typeof ActionSchema>

/** JSON Schema du format (draft 2020-12). */
export function mapJsonSchema() {
  return z.toJSONSchema(MapSchema, { target: 'draft-2020-12' })
}
