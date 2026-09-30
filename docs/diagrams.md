# Building diagrams

**English** · [Français](diagrams.fr.md)

Trees, mind maps and argument maps on regular tldraw shapes; style presets (element types and relations); files and formats. To build an argument map, see also [Building argument maps](argument-maps.md).

## Trees

Select a box: <kbd>Tab</kbd> adds a child (and starts a tree), <kbd>Enter</kbd> adds a sibling. While typing in a node, <kbd>Enter</kbd> confirms (<kbd>Shift</kbd>+<kbd>Enter</kbd>: line break) and <kbd>Tab</kbd> goes on with a child.

- The layout is automatic; a node moved by hand keeps its offset (and drags its branch). "Tidy up" clears the offsets.
- Direction: to the right, left, down, up, or on both sides (balanced mind map: a new child of the root goes to the less loaded side, and a branch dragged to the other side of the root stays there).
- Collapsing a branch hides it while editing. The collapsed state of the document is the starting state of the presentation; the "Collapse / Expand branch" actions change it during the sequence. Collapsing moves nothing: the branch keeps its place.
- Deleting a node deletes its branch (undoable).
- **Argument map** ("Argument map" button): the selected box becomes the thesis under discussion ("Thesis" label). <kbd>Tab</kbd> offers what to add to it (Justification · supports, Objection · objects to…; keys 1 to 9 then a, b…, 0 for none). The branch takes the style and direction of the relation (toward the parent by default: "the premise supports the thesis"; toward the child for implies, presupposes, raises), and the new node the associated type (Example for "illustrates", Assumption for "presupposes"…). <kbd>Enter</kbd> adds a sibling with the same relation.
- In an argument tree, **the shape tells the type, the color tells the function**: a connected node takes the color of its relation (stroke and light fill) and its label shows its function only (Justification, Objection, Refutation, Answer, Explanation, Implication, Presupposition, Example, Definition, Problem, Distinction). Green is reserved for support.

## Style presets

To build an argument map step by step, see the guide [Building argument maps](argument-maps.md): element types, relations, definitions and examples.

Named styles, at the top of the style panel: **element types** for shapes (Statement, Assumption, Evidence, Concept, Distinction, Question, Problem, Example, Quote) and **relations** for arrows (supports, objects to, refutes, answers, explains, implies, presupposes, illustrates, defines, raises, and between concepts: is distinct from, is opposed to, is akin to). A support or objection arrow can specify its type of reasoning (deduction, induction, analogy…). They are only ordinary tldraw properties (geometry, color, stroke…), plus a `meta.preset` mark.

- A click applies the preset to the selected shapes or arrows; with nothing selected, a type arms the shape tool: the next shape drawn gets it.
- Each type has its geometry (Concept: oval, Question: diamond, Problem: hexagon, Assumption: cloud, Evidence: parallelogram, Quote: frameless, serif, with quotation marks…) and a label above the shape ("STATEMENT · Hobbes", with the modality as a pill: descriptive / normative): source (author, theory, position) and modality are entered in the side panel. Labels are drawn by the app: without it, the diagram keeps its shapes and colors.
- Shared by all your diagrams: `settings` table in cloud mode, IndexedDB in local mode. Each diagram keeps a copy of the presets it uses, to stay readable elsewhere (and in shared links).
- ☰ menu › "Style presets…": rename, reorder, shape and label of element types, direction and child type of relations, update or create from the selection, hide a preset (checkbox: it stays usable in existing diagrams), hide the palette or the labels, restore the default presets.
- While presenting, <kbd>L</kbd> shows the legend of the element types and relations used.

## Files and formats

- **Files**: save and open `.tldr` files. The sequence is stored inside the tldraw document, so a `.tldr` file keeps it. In Chrome and Edge, a diagram opened from a file, or saved to one, stays linked to it: every change is written back automatically (<kbd>Ctrl/⌘</kbd>+<kbd>S</kbd> saves at once), so you can work directly on a file in a synced folder (Google Drive, Dropbox, iCloud Drive, OneDrive). A file changed elsewhere is reloaded when you come back to the tab, and never overwritten without asking; reopening a linked file reopens its diagram instead of duplicating it.
- **JSON format**: export a diagram as JSON (types, relations, trees, sequence, all named), or copy it for an AI; import a JSON diagram written by hand, by an AI or by another tool, laid out automatically. See [The JSON diagram format](map-format.md).

## Examples

- **Examples** on the home page (an argument tree, Kant and Constant on lying, in English or French; the water cycle in English; freedom in French), and a shortcuts help while presenting (<kbd>?</kbd>).
