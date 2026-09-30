# Source texts

**English** · [Français](source-texts.fr.md)

A diagram often comes from a text: a course, an author's text, a document. Unveilboard keeps the text **beside the diagram** and links each element to the **passages it comes from**, whether you build the diagram by hand or with an AI. You see at once what the diagram says of the text, and where.

## The source text sidebar

- **Open it** with the discreet document button at the top right of the canvas, next to ✦. It opens by itself for a diagram created from a text, and “Show in the text” (right panel, under an element's excerpt) opens it on that passage.
- **One text per page**, kept in the document. It is shown formatted (Markdown: headings, bold, italics, quotations, lists; a line break is kept). A− and A+ set the text size; the sidebar can be resized.
- **Cited passages are highlighted** in the color of their element (excerpts, and the text of quotations). The passages of the selected elements stand out, and the text scrolls to them.
- **Clicking a passage** centers the diagram on its elements (the header's selection button makes it select them too) and shows a small cross that removes the highlight: the passage leaves the element's excerpts. A right click lists the elements that cite the passage, to select one or remove its highlight.

## Associating a text with a page

Any page can get a text, whether it already has a diagram or not:

- paste it, or read it from a file (text, Markdown, or PDF with a text layer);
- on a new page, reuse the text of another page in one click;
- “Edit” opens it in the Markdown editor (toolbar and the usual shortcuts: Ctrl/⌘ + B, I, K, E; + Shift: X, 7, 8, 9; + Alt: 1 to 3), and “Remove the text” removes it (the elements keep their excerpts).

When a text is associated or edited, the **excerpts of the page are checked again**: an excerpt that can no longer be found is flagged “to check”, one found again loses the flag.

## Building a diagram from its text, by hand

Select a passage in the sidebar: a small bar offers what to do with it.

- **New element**: a box whose text is the passage, which is also its excerpt, placed without covering other shapes.
- **New child** of the selected element (choose its relation afterwards).
- **Excerpt of the element** selected on the diagram, or **Add to its excerpts** if it already has some: an element can cite **several passages**, kept in the order of the text (“A […] B”). The bottom of the sidebar lists them for the selected element, each with ✕ to remove it.
- **AI…**: opens “✦ AI” on the selected element, with a request prefilled with the passage.

## The AI and the text of the page

The ✦ button of the sidebar gathers what an AI can do from the text of the page: create a new diagram from it, enrich the diagram, structure it with a plan, write the sequence following the text, review its faithfulness to the text. More generally, when a page has a text, “Create or change the diagram”, “✦ AI…” from an element, the critical review and the plan **use it** (“Use the source text of this page”, checked by default): the AI quotes it exactly, and the excerpts it adds are searched for in the text (not found: “to check”).

## Creating a diagram from a text with an AI



**Rich diagram from a text** (checkbox in the same dialog, recommended for a long or dense text): the text is split into numbered paragraphs, and the AI first proposes a plan whose sections each analyse a range of paragraphs (editable). Each section then receives only its passage, and its excerpts are checked the same way. You can generate everything at once, or build the diagram section by section with the plan panel, as suggestions to accept or reject: see [Working with an AI](ai.md).

## How passages are found

Passages are found again at each display, with the same tolerances as the excerpt check: typographic apostrophes and quotation marks, end-of-line hyphenation, spaces, case, “[…]” cuts, and Markdown marks (so formatting the text does not break the links). A passage that cannot be found is simply not highlighted; its element keeps its excerpt, flagged “to check”. The right panel shows the provenance of the selected element (“From the text” with its excerpt, or “Reconstruction”) and lets you mark it as checked.

## Layers

For a text rich in passages, the layers button (three stacked planes, on demand) shows or hides groups of passages:

- **automatic layers**: by the element's function in an argument map (justification, objection, answer…), otherwise by its type (concept, quotation, example…);
- **custom layers** (“My layers”): create and name them, then put elements in them (“Layer” menu at the bottom of the sidebar, when an element is selected). A layer groups passages; each keeps its element's color. The **active layer** receives the elements created from a passage.

When passages of different layers overlap, each keeps its own underline.

## Presenting and sharing

- **While presenting**, the sidebar follows the steps, read-only: only the passages of the elements already revealed are highlighted, and those of the current step stand out. It shows at the start if the diagram asks for it (“Start” card of the steps panel: “Show the source text when the presentation starts”, off by default), and the “More” menu shows or hides it.
- **Sharing**: the text is included only if “Include the source text” is checked in the share dialog; readers can then show it beside the presentation. The plan of the AI is never shared.

## Limits

- Layers are not part of the JSON export yet.
- In a plan made from a text, editing the text (adding or removing paragraphs) shifts the numbering used by the sections still to develop.
