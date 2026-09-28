# The JSON diagram format

**English** · [Français](map-format.fr.md)

Unveilboard can describe a diagram in a simple JSON format, independent of tldraw: elements and their types, the relations between them, trees, and the presentation sequence. Everything is named: nothing relies on color or position.

The format is used to:

- **export** a diagram (☰ menu › “Export as JSON…”, or “Copy as JSON” to paste it into a conversation with an AI);
- **import** a diagram written by hand, by an AI or by another tool (☰ menu › “Paste JSON…”): it opens as a new diagram, laid out automatically;
- **change** the open diagram with changes in the sibling “unveilboard/patch” format (see below);
- let an AI read, create and change diagrams (☰ menu › “Prompt for an AI…”).

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
| `type` | Element type: `statement`, `belief` (assumption), `fact`, `concept`, `distinction`, `question`, `problem`, `example`, `quote`, or a type from the vocabulary. Omitted: the type given by the relation (an element that “illustrates” is an example), otherwise none. |
| `parent` | Parent in a tree. Omitted: the element is a root, or a standalone box. |
| `relation` | Relation that connects the element to its parent: `supports`, `objects`, `refutes`, `answers`, `explains`, `implies`, `presupposes`, `illustrates`, `defines`, `raises`, `distinguishes`, `opposes`, `relates`, or a relation from the vocabulary. Omitted: a plain branch (mind map). |
| `reasoning` | Type of reasoning of that relation: `deduction`, `induction`, `analogy`, `abduction` (best explanation), `absurd` (reductio), `afortiori`, `authority`, `example`. |
| `source` | Source: author, theory, position, reference. |
| `modality` | Statements and assumptions: `descriptive` or `prescriptive`. |
| `note` | Markdown development, shown beside the diagram while presenting. |
| `folded` | Branch folded at the start of the presentation. |
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

Positions, sizes and colors: tree layout is automatic, and color follows from type and function. Only the current page is exported. Shapes other than boxes and arrows (`others`) are not recreated on import.

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
| `update` | Changes fields of an element (`text`, `type`, `relation`, `reasoning`, `source`, `modality`, `note`, `folded`, `origin`, `excerpt`, `tree`); `null` removes a field. |
| `move` | Attaches an element, with its branch, to another parent (optional `relation`: otherwise it keeps its own). |
| `remove` | Removes an element with its whole branch (and the links touching them), or a link. Steps no longer target it. |
| `link` | Adds a cross-link. |
| `sequence` | Writes the sequence: `"mode": "replace"` replaces it, `"append"` adds the steps at the end. |

`summary` tells the user what the changes do; `vocabulary` declares new types or relations, if any.

Changes are first applied to the exported diagram, then checked like a whole diagram (same errors and warnings, referred to by identifier: `elements[id=obj2].parent`). They reach the canvas only if everything is valid, as a single operation: <kbd>Ctrl/⌘</kbd>+<kbd>Z</kbd> undoes them all, sequence included.

Identifiers are stable: an element created by an import or a change keeps its own; the others get a short identifier derived from tldraw's. You can therefore go back and forth with an AI on the same diagram.

## Working with an AI

You can use your own AI without connecting anything, or connect one. All these features are also in the menu of the ✦ icon, at the top right of the canvas while editing (a dot marks pending review remarks).

Relation labels (“supports”, “objects to”…) are written in the language of the content (the map's `lang`, kept in the document), whatever the interface language, as long as the relation has not been renamed.

- **☰ menu › “Prompt for an AI…”**: pick a task (create a diagram, enrich, write the sequence, other change), describe it, optionally focus on the selection. The prompt contains the diagram, the vocabulary (including the user's presets, with their definitions), the answer format and the faithfulness rules (never invent a quotation or a source).
  - With no AI connected: “Copy the prompt”, paste it into the assistant of your choice, then paste its answer into the same dialog.
  - With an AI connected: “Ask the AI”; the answer streams in (“Stop” interrupts it). If it fails the checks, it is sent back once to the model with the problems found. It is then shown, with its summary, to be checked and applied.
- **☰ menu › “Critical review…”**: a panel, left of the diagram.
  - **Automatic checks**, free and without AI: an objection without answer, a thesis without justification, an argument-map element attached without a relation, an element the sequence shows before its parent, a box too long.
  - **“Review with the AI”** (or copy the prompt, then paste the answer): the AI reviews the diagram as a demanding teacher would and returns a review in the “unveilboard/review” format ([JSON Schema](review-format.schema.json)): an overall judgement, then typed remarks (inconsistency, gap, confusion, type, relation, structure, redundancy, wording, sequence, faithfulness), with a priority, the elements concerned and, when it is clear, a correction (change operations). An invalid correction is sent back once to the model; after that, the remark stays without correction.
  - Each remark has a number (“R1”) shown at the corner of its elements; clicking an element selects and frames it. “Apply the correction” checks it again on the diagram as it now is, then applies it (undoable); “Dismiss” removes it. The AI's remarks are kept on this device, for this diagram (neither in the document nor in shares).
- **Box and note**: the prompt asks for an explicit, self-sufficient box (a complete claim, not a title), concise, and, if the “Details in the element’s note” option is checked (the default), a brief note when it adds a precision, never the essential alone. Unchecked: everything in the box.
- **Model's thinking** (AI settings): the model's default, none, light, medium or deep. Sent as `reasoning` to OpenRouter (and to the instance's AI, which then adds headroom to the answer's token budget), as `reasoning_effort` to other OpenAI-compatible servers. More thinking gives sharper answers, but slower and dearer ones. Transcription always runs without thinking.
- **☰ menu › “Create a diagram from a text…”**: paste a text (a course, an author's text) or choose a file.
  - **Text and Markdown** are read as they are; a **PDF** through its text layer, in the browser (pdf.js): nothing is sent to read it.
  - **Photo, or scanned PDF** (no text layer): “Transcribe with the AI” has it transcribed by a multimodal model (on OpenRouter, the `transcription` model of `models.json`, with the “native” PDF reader, without the extra-cost OCR), faithfully, with the reference if the document shows one. The transcribed text is shown, to be proofread. 3 MB at most. (Rules taken from bac-philo-agent's exercises.)
  - Choose the **kind of diagram** (the AI's choice, argument map, mind map), the **sequence and its narration**, and an optional request. Beyond 60,000 characters, a warning; beyond 300,000, pick a passage.
  - **Faithfulness, checked by the program**: every element drawn from the text has `"origin": "text"` and an `excerpt` copied word for word; what the analysis reconstructs has `"origin": "reconstruction"`. Every excerpt and quotation (`quote` type) is searched in the text (tolerating typographic apostrophes and quotation marks, end-of-line hyphenation, spaces, case, and “[…]” cuts). In the first answer, an excerpt that cannot be found is sent back to the model for correction; after that, the diagram opens and the element is labelled “to check”. The right panel shows the provenance of the selected element (“From the text” with its excerpt, or “Reconstruction”) and lets you “mark it as checked”.
- **☰ menu › “AI settings…”**: the provider, kept on this device (never in the document or on the server):
  - **OpenRouter, with your key**: “Sign in with OpenRouter” creates a key for Unveilboard (OAuth PKCE: the key is exchanged in the browser), or paste your own. The browser calls OpenRouter directly;
  - **OpenAI-compatible server**, local or remote (Ollama, LM Studio, llama.cpp…): address (up to `/v1`), optional key, model (“List the models”). The browser calls it directly: the server must accept the site's origin (Ollama: `OLLAMA_ORIGINS`, and a large enough context, `num_ctx`; LM Studio: enable CORS);
  - **the instance's AI**, if it has one (server-side key, see `.env.example`);
  - “Test” checks that the model answers, and in JSON.
- **From an element**: select a box, then “✦ AI…” in its toolbar. A ready-made request (arguments, objections, answers, examples, assumptions, distinctions, definitions, consequences) or your own; with the whole diagram, or only the element, its ancestors and its branch. The AI connects new elements to it (and, if needed, links to existing elements), each with a sentence saying why (`rationale`):
  - **as suggestions** (default): dimmed shapes, labelled “suggestion”, with ✓ and ✕; accepting an element also accepts its suggested parent; rejecting an element rejects its branch. A bar counts the pending suggestions, accepts or rejects them all, and shows why the selected one is suggested. Until accepted, suggestions stay out of the presentation, the JSON export, “Reveal the map”, the handout and shares;
  - **or directly**, as one undoable change.
- **“Sequence (AI)…”** (a tree's toolbar) opens the prompt on writing the sequence, with the order of “Reveal the map” as a starting point.
- **Models**: the catalogue of OpenRouter models offered (and allowed for the instance's AI) is in [`src/lib/ai/models.json`](../src/lib/ai/models.json), free to edit; its `default` (DeepSeek V4.1 flash) is used when no model is chosen.
- **☰ menu › “Paste JSON (diagram or changes)…”**: a whole diagram opens as a new diagram; changes apply to the open diagram. The JSON may be surrounded by text or a code block, as in an AI's answer.
- **For an agent that operates the browser**, the page exposes `window.unveilboard`:
  - `getMap()`: the open diagram, in this format;
  - `getPrompt(task, instruction?)`: the full prompt for a task (`create`, `enrich`, `sequence`, `review`, `edit`, `expand`; `review` answers with a review, which `apply` shows in the review panel);
  - `apply(json)`: applies changes, or opens a whole diagram as a new one; returns `{ ok, kind, problems }`, with problems in English, so the agent can correct its answer.

**The instance's AI** (route `/api/ai`): the server receives the task, the diagram and the vocabulary, builds the prompt itself and relays the provider's answer; it is not a generic chat relay. In cloud mode it is reserved to the session; in local mode (public instance), only with `AI_PUBLIC=on`, with per-IP limits.

The prompts are in [`src/lib/ai/prompts.ts`](../src/lib/ai/prompts.ts), versioned (`PROMPT_VERSION`).

## For developers

- Zod schema (single source of the types, validation and JSON Schema): [`src/lib/map/format.ts`](../src/lib/map/format.ts); checks: [`check.ts`](../src/lib/map/check.ts); conversions: [`src/lib/canvas/mapExport.ts`](../src/lib/canvas/mapExport.ts) and [`mapImport.ts`](../src/lib/canvas/mapImport.ts).
- Changes: [`src/lib/map/patch.ts`](../src/lib/map/patch.ts) and [`src/lib/canvas/mapPatch.ts`](../src/lib/canvas/mapPatch.ts); reading pasted JSON: [`read.ts`](../src/lib/map/read.ts); prompts and page API: [`src/lib/canvas/assistant.ts`](../src/lib/canvas/assistant.ts).
- `pnpm map:schema` regenerates [`map-format.schema.json`](map-format.schema.json) and [`patch-format.schema.json`](patch-format.schema.json); a test checks that they are up to date.
