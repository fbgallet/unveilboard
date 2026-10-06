# The JSON diagram format

**English** · [Français](map-format.fr.md)

Unveilboard can describe a diagram in a simple JSON format, independent of tldraw: elements and their types, the relations between them, trees, and the presentation sequence. Everything is named: nothing relies on color or position.

The format is used to:

- **export** a diagram (☰ menu › File › “Export as JSON…”, or “Copy as JSON” to paste it into a conversation with an AI);
- **import** a diagram written by hand, by an AI or by another tool (☰ menu › File › “Import a list, Markdown or JSON…”): it opens as a new diagram, laid out automatically. The same window takes a plain list (bulleted, numbered or indented, copied from Roam, Logseq, Obsidian, Workflowy…), Markdown with headings or an OPML file: each line becomes a box of a mind map, paragraphs become notes, `[[page]]` becomes `page`, `{{…}}` components and `((…))` references are removed, checkboxes (`[ ]`, `[x]`, `TODO`, `DONE`) become clickable checkboxes (`task`). Several top-level items can be gathered under one root, and the whole can be added under the selected box. A list pasted on the canvas becomes a mind map directly; pasted on a box, it can become its branches. The other way, “Copy as a list (Markdown)” (File menu, or right click on a selection) writes the trees as an indented list;
- **change** the open diagram with changes in the sibling “unveilboard/patch” format (see below);
- let an AI read, create and change diagrams (☰ menu › AI › “Create or change the diagram with AI…”).

The exact schema is published as a [JSON Schema](map-format.schema.json) (draft 2020-12). The vocabulary (element types, relations, types of reasoning) is presented in [Building an argument map](argument-maps.md).

## An example

```json
{
  "format": "unveilboard/map",
  "version": 1,
  "title": "Should we always tell the truth?",
  "lang": "en",
  "elements": [
    { "id": "q", "type": "question", "text": "Should we always tell the truth?", "tree": { "kind": "argument" } },
    { "id": "t", "text": "Yes: truthfulness is an unconditional duty", "parent": "q", "relation": "answers",
      "source": "Kant", "modality": "prescriptive" },
    { "id": "j", "text": "A lie cannot become a universal law", "parent": "t", "relation": "supports",
      "reasoning": "absurd" },
    { "id": "p", "text": "The moral worth of an act lies in its principle", "parent": "t", "relation": "presupposes" },
    { "id": "o", "text": "Telling the truth is a duty only towards those who have a right to it", "parent": "t",
      "relation": "objects", "source": "Constant", "note": "*On Political Reactions* (1797)." }
  ],
  "sequence": {
    "steps": [
      { "title": "The question", "camera": "overview", "actions": [{ "do": "show", "targets": ["q"] }] },
      { "title": "Kant's answer", "narration": "**Yes, always.**", "actions": [{ "do": "show", "targets": ["t"] }] },
      { "title": "Why?", "actions": [{ "do": "show", "targets": ["j", "p"] }] },
      { "title": "The objection", "actions": [{ "do": "show", "targets": ["o"] }, { "do": "note", "targets": ["o"] }] }
    ]
  }
}
```

The app's full example is in [`src/lib/examples/truth.en.json`](../src/lib/examples/truth.en.json).

## The document

| Field | Role |
|---|---|
| `format`, `version` | Always `"unveilboard/map"` and `1`. |
| `title` | Title of the diagram (and of its sequence). |
| `lang` | Language of the content (`"en"`, `"fr"`…), optional. |
| `vocabulary` | Types and relations used, with their name and definition (see below). Optional for the default types and relations. |
| `elements` | The boxes of the diagram. Parents come before their children, siblings in display order. |
| `links` | Arrows between two elements, outside the trees (cross-links). |
| `others` | Other shapes (free text, frames, images…), given as context on export; ignored on import. |
| `sequence` | The presentation, step by step. |

Identifiers (`id`) are short and free (no spaces), unique in the whole diagram: elements, links and other shapes share one namespace. Shapes keep the identifier they received on import; the others get a short one on export (`n…`, `l…`, `x…`), stable from one export to the next.

## Elements

| Field | Role |
|---|---|
| `id`, `text` | Identifier and text of the box, explicit and concise. Light Markdown: **bold**, *italic*, ~~strike~~, `code`, [link](url), bullet or numbered lists; one paragraph per line. The rest (headings, quotations, tables) goes in the note. |
| `type` | Element type: `statement`, `belief` (assumption), `fact`, `concept`, `distinction`, `question`, `problem`, `example`, `quote`, `linked` (linked premises: a dot with an empty `text`, whose children are premises with the `premise` relation, that only support or object together), or a type from the vocabulary. Omitted: the type given by the relation (an element that “illustrates” is an example), otherwise none. |
| `parent` | Parent in a tree. Omitted: the element is a root, or a standalone box. |
| `relation` | Relation that connects the element to its parent: `supports`, `objects`, `refutes`, `answers`, `explains`, `implies`, `presupposes`, `illustrates`, `defines`, `raises`, `distinguishes`, `opposes`, `relates`, or a relation from the vocabulary. Omitted: a plain branch (mind map). |
| `reasoning` | Type of reasoning of that relation: `deduction`, `induction`, `analogy`, `abduction` (best explanation), `absurd` (reductio), `afortiori`, `authority`, `example`. |
| `source` | Source: author, theory, position, reference. |
| `modality` | Statements and assumptions: `descriptive` or `prescriptive`. |
| `note` | Markdown development, shown beside the diagram while presenting. |
| `folded` | Branch folded at the start of the presentation. |
| `task` | A checkbox on the box, ticked with a click (while editing or presenting): `todo` or `done`. |
| `style` | The look of this box, over the one its type gives it (only the keys that differ): `geo`, `color`, `fill`, `dash`, `size` (`s`, `m`, `l`, `xl`), `font` (tldraw values). Written on export when a box differs from its type; the AI uses it to improve the look of a diagram. |
| `tree` | On a root: `{ "kind": "argument" \| "mindmap", "direction": "right" \| "left" \| "down" \| "up" \| "both" }` (default direction: `right`). An argument map gives connected elements their function and color. |
| `side` | `both` trees: side (`left`, `right`) of a child of the root. |
| `origin`, `excerpt` | Diagram drawn from a text: the element is stated in it (`text`) or reconstructed by the analysis (`reconstruction`, e.g. an implicit assumption); `excerpt` quotes the passage verbatim. |
| `function` | Read-only, on export: function of the element in an argument map (Objection, Justification…). Ignored on import. |

### Reading direction of relations

A relation reads **“element RELATION parent”**: “the premise *supports* the thesis”, “the example *illustrates* the statement”. Three default relations read the other way, **“parent RELATION element”**: `implies`, `presupposes`, `raises` (“the thesis *presupposes*…”). The vocabulary gives it for each relation (`direction`: `toParent` or `toChild`).

In a link (`links`), the relation always reads **“from RELATION to”**.

## Vocabulary

Each entry describes a type (`"kind": "type"`) or a relation (`"kind": "relation"`): `id`, `name`, `description`, and for relations `direction`, `childType` (type given to the connected element) and `function` (its function in an argument map). The export lists the types and relations used, with their definitions: enough to understand the diagram without the app.

A type or relation created by the user also carries its `style` (tldraw properties: `geo`, `color`, `fill`, `dash`, `size`, `font`, `arrowheadStart`, `arrowheadEnd`): imported on another instance, it is recreated identically.

## Sequence

`sequence.intro` (optional, Markdown) is shown under the title when the presentation starts, before the first step: instructions, a question to the class, an outline.

Each step has a `title`, an optional `narration` (Markdown), an optional `camera` (`follow`, the default: frame what the step shows; `overview`: the whole visible diagram; `keep`: do not move; `{ "mode": "area", "area": { "x", "y", "w", "h" } }`: a fixed rectangle in canvas coordinates, centred with the zoom fitted to its size) and `actions`:

| `do` | Effect |
|---|---|
| `show`, `hide` | Show, hide (lasting). |
| `dim`, `undim` | Dim, restore (lasting). |
| `highlight` | Highlight, during this step. |
| `focus` | Bring forward (everything else is dimmed), during this step. |
| `note` | Show the element's note, during this step. |
| `fold`, `unfold` | Fold, unfold a branch. |

An action targets identifiers (`targets`). **An element stands for its box and the arrow that connects it to its parent**: “show the objection” makes the box rise and draws the arrow. `part` (`node` or `edge`) limits the action to one of them; `effect` (`fade`, `rise`, `draw`, `none`) picks the entrance effect of a `show`.

**Visibility rule**: an element that no step shows is visible from the start, but only while its parent is visible. Showing the thesis therefore shows its whole tree, except what later steps show.

## What the format leaves out

Positions and sizes: tree layout is automatic. Color follows from type and function, except a box's own `style`. Only the current page is exported. Shapes other than boxes and arrows (`others`) are not recreated on import.

## Checks on import

An imported diagram is checked before it opens:

- **errors** (the import is refused): unreadable JSON, a field outside the format, a duplicate identifier, an unknown parent, a cycle of parents, a relation without a parent, an unknown type or relation, a link that does not connect two elements, a step that targets an unknown identifier;
- **warnings**: a type of reasoning without a relation, tree settings on an element that is not a root, a modality outside statements and assumptions, a `part` that does not apply, a missing note, an element shown while an ancestor is still hidden (the sequence is simulated by the presentation engine).

Each problem gives its path in the JSON (`elements[3].parent`): an AI can use it to correct its answer.

## Changes (“unveilboard/patch”)

To change an existing diagram, an AI (or a tool) does not rewrite it: it sends changes, applied in order, which refer to elements by their identifiers in the export ([JSON Schema](patch-format.schema.json)).

```json
{
  "format": "unveilboard/patch",
  "version": 1,
  "summary": "Adds Constant's second objection and Kant's answer.",
  "operations": [
    { "op": "add", "id": "obj2", "text": "A lie can save a life", "parent": "thesis", "relation": "objects" },
    { "op": "add", "id": "ans2", "text": "Duty does not depend on consequences", "parent": "obj2", "relation": "answers" },
    { "op": "update", "id": "justification", "reasoning": "deduction" },
    { "op": "sequence", "mode": "append", "steps": [{ "title": "Another objection", "actions": [{ "do": "show", "targets": ["obj2", "ans2"] }] }] }
  ]
}
```

| `op` | Effect |
|---|---|
| `add` | Adds an element (any element field; a new `id`). Its `parent` is an existing element or one added earlier. `rationale`: why the AI proposes it (one sentence), shown for a suggestion. |
| `update` | Changes fields of an element (`text`, `type`, `relation`, `reasoning`, `source`, `modality`, `note`, `folded`, `task`, `style`, `origin`, `excerpt`, `tree`); `null` removes a field (`style`: only the keys given change; `null` returns to the look of the type). |
| `move` | Attaches an element, with its branch, to another parent (optional `relation`: otherwise it keeps its own). |
| `remove` | Removes an element with its whole branch (and the links touching them), or a link. Steps no longer target it. |
| `link` | Adds a cross-link. |
| `sequence` | Writes the sequence: `"mode": "replace"` replaces it, `"append"` adds the steps at the end. |

`summary` tells the user what the changes do; `vocabulary` declares new types or relations, if any.

Changes are first applied to the exported diagram, then checked like a whole diagram (same errors and warnings, referred to by identifier: `elements[id=obj2].parent`). They reach the canvas only if everything is valid, as a single operation: <kbd>Ctrl/⌘</kbd>+<kbd>Z</kbd> undoes them all, sequence included.

Identifiers are stable: an element created by an import or a change keeps its own; the others get a short identifier derived from tldraw's. You can therefore go back and forth with an AI on the same diagram.

## Working with an AI

See [Working with an AI](ai.md) (providers, tasks, rich diagrams, review…) and [Source texts](source-texts.md) (a diagram built from a text, with the text beside it).

## For developers

- Zod schema (single source of the types, validation and JSON Schema): [`src/lib/map/format.ts`](../src/lib/map/format.ts); checks: [`check.ts`](../src/lib/map/check.ts); conversions: [`src/lib/canvas/mapExport.ts`](../src/lib/canvas/mapExport.ts) and [`mapImport.ts`](../src/lib/canvas/mapImport.ts).
- Changes: [`src/lib/map/patch.ts`](../src/lib/map/patch.ts) and [`src/lib/canvas/mapPatch.ts`](../src/lib/canvas/mapPatch.ts); reading pasted JSON: [`read.ts`](../src/lib/map/read.ts); prompts and page API: [`src/lib/canvas/assistant.ts`](../src/lib/canvas/assistant.ts).
- `pnpm map:schema` regenerates [`map-format.schema.json`](map-format.schema.json) and [`patch-format.schema.json`](patch-format.schema.json); a test checks that they are up to date.
