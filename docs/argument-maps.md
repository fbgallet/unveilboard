# Building argument maps with Unveilboard

**English** · [Français](argument-maps.fr.md)

An argument map makes the structure of reasoning visible: the thesis under discussion, the reasons that support it, the objections, the replies, the examples, and what is taken for granted without being said. Unveilboard lets you build one quickly, from the keyboard, then **reveal it step by step** in front of a class.

## The principle: the shape tells the type, the color tells the function

Each element has two distinct characters:

- its **type**: what it *is* (a statement, a concept, a question, a piece of evidence…). It is shown by its **shape**;
- its **function**: what it *does* in the argument (justify, object, illustrate…). It depends on the relation that connects it to another element, and is shown by its **color**.

The same statement can be a justification in one lesson and an objection in another: its type stays the same, its function changes.

Colors come in families: **purple** statements and theses, **red** questions, problems and objections, **green** arguments and evidence, **orange** replies to objections, **blue** concepts, definitions and distinctions, **amber** quotes and sources, **grey** examples.

## Building the map

1. **The thesis.** Create a box (shape tool, or click the “Statement” type in the palette, then draw it) and write the thesis to be discussed.
2. **Argument map.** Select it and click “Argument map” in the bar that appears at the top: it becomes the thesis (“THESIS” label).
3. **Adding elements.** <kbd>Tab</kbd> offers what to add: *Justification · supports*, *Objection · objects to*, *Example · illustrates*… Pick with keys <kbd>1</kbd> to <kbd>9</kbd> (then <kbd>a</kbd>, <kbd>b</kbd>…), or <kbd>0</kbd> for an element with no relation. The choice depends on the starting element: under a question, you answer; under an objection, you reply, support or object in turn; under a concept, you define, distinguish, oppose or relate. “More relations…” (or <kbd>+</kbd>) shows them all. The new element gets the associated type, its branch the style and direction of the relation, and you can type right away.
4. **Chaining.** While typing, <kbd>Enter</kbd> confirms (<kbd>Shift</kbd>+<kbd>Enter</kbd>: line break). On a selected element, <kbd>Enter</kbd> adds a sibling with the same relation (“another premise”), <kbd>Tab</kbd> an element that responds to it (an objection to the premise, a refutation of the objection…).
5. **Layout.** Layout is automatic; the tree bar sets the orientation (right, left, down, up, or both sides). An element moved by hand keeps its place; “Relayout” tidies everything up. The “−” badge of an element collapses its branch, “+n” reopens it.
6. **Details.** In the side panel, for the selected element: its **source** (author, theory, position, reference), its **modality** (descriptive or normative, for statements and assumptions) and a longer **note** (Markdown, images), shown during the presentation.

You can also connect any two elements with a regular arrow, then click a relation in the palette: useful for cross-links (an assumption shared by two branches, for instance).

## Element types

| Type | Shape | Definition | Example |
|---|---|---|---|
| **Statement** | purple rectangle | What is explicitly asserted, and discussed, defended or criticized. | “Technology makes us freer.” |
| **Assumption** | purple cloud | A belief that is often implicitly accepted, yet debatable, and that underlies common claims. | “Everyone is the author of their choices”: the assumption of free will. |
| **Evidence** | green parallelogram | A datum, observation, result or document one relies on. | “Suicide rates vary across social groups” (Durkheim). |
| **Concept** | blue oval | A notion that is defined, analysed or distinguished from others. | Freedom (of indifference, enlightened). |
| **Distinction** | blue dashed rectangle | A difference drawn between two terms that are confused, or an opposition between them. | Liberty ≠ licence: being free is not doing just anything. |
| **Question** | red diamond | A point of discussion between several points of view. | “Is freedom an illusion?” |
| **Problem** | red hexagon | What stands in the way, resists, or calls for a resolution. | If everything has a cause, how can we be responsible? |
| **Example** | grey rectangle | A particular case that illustrates, specifies or tests an idea. | The slave who knows himself free in thought (Epictetus). |
| **Quote** | frameless, serif, quotation marks, amber | An author’s text, quoted verbatim. | “Man is condemned to be free” (Sartre). |

### Statement or assumption?

The criterion is not the content but the **status in the argument**: a *statement* is asserted and put up for discussion; an *assumption* is taken for granted, often unsaid, and the analysis brings it to light. “Everyone pursues their own interest” is a statement when Hobbes asserts and defends it; it is an assumption when we draw it out of an economic argument that never states it.

Assumptions structure our picture of the world (**descriptive** assumptions) or our values (**normative** assumptions); they can be linked to a theory, position or philosophical option (“Source” field).

## Relations

In a tree, a relation points **to the existing element** by default (“the premise supports the thesis”); some point to the new element (implies, presupposes, raises).

| Relation | Function of the connected element | Definition | Example |
|---|---|---|---|
| **supports** (green) | Justification | Gives a reason to believe what is asserted. | “Every man desires the good” supports “No one does wrong willingly”. |
| **objects to** (red) | Objection | Opposes a claim, disputes its truth or scope. | “I see the better and do the worse” objects to the Socratic thesis. |
| **refutes** (orange) | Refutation | Shows that an objection or a thesis is false (stronger than objecting or replying). | “It is only a momentary ignorance” refutes the objection. |
| **answers** (purple under a question, orange under an objection) | Answer | Offers an answer to a question, or replies to an objection. | “Yes, if being free means doing what one wants”. |
| **explains** (light blue) | Explanation | Accounts for the causes or reasons of a fact, without trying to justify it. | “Ignorance of causes” explains “the feeling of being free” (Spinoza). |
| **implies** (black) | Implication | Has as a consequence, logical or practical. | Does “everything is determined” imply “no one is responsible”? |
| **presupposes** (purple, dashed) | Presupposition | Rests, without saying so, on an assumption. | “Punishing the guilty” presupposes “they could have acted otherwise”. |
| **illustrates** (grey, dotted) | Example | Gives an example of what is asserted. | The tyrant illustrates the error about the good. |
| **defines** (blue, dashed) | Definition | Specifies the meaning of a notion. | “Being able to do what one wants” defines freedom in the common sense. |
| **raises** (red, dashed) | Problem | Brings out a difficulty or a problem. | Determinism raises the problem of responsibility. |
| **is distinct from** (blue, bars) | Distinction | Marks a difference between two notions where there is confusion. | Liberty is distinct from licence. |
| **is opposed to** (blue, two heads) | Opposition | Opposes two notions: contraries or contradictories. | Nature is opposed to culture. |
| **is akin to** (blue, thin, dotted) | Related notion | Brings together two neighbouring or kindred notions. | Freedom is akin to autonomy. |

*Supports* or *explains*? A justification gives a reason to **believe** it is true; an explanation accounts for **why** it is so, without trying to prove it.

## Conceptual distinctions

Drawing a distinction is often decisive in a discussion: many objections fall once an equivocation is dispelled. Unveilboard handles it at two levels:

- **in the argument**, the **Distinction** element (“liberty ≠ licence”) is a move in its own right: it can *refute* an objection, *answer* a question or resolve a problem, with the usual relations;
- **between concepts**, to map a field of notions: **is distinct from** (a difference where there is confusion), **is opposed to** (contraries, mutually exclusive but not exhaustive, or contradictories, one being the negation of the other), **is akin to** (kinship, proximity).

## Types of reasoning

A support or objection arrow can specify **how** it supports or objects: select it, then choose in the side panel. The type is written in the arrow’s text (“supports · analogy”). It is optional: without it, nothing changes.

| Type | Principle |
|---|---|
| deduction | The conclusion follows necessarily from the premises. |
| induction | Generalises from particular cases. |
| analogy | Concludes from one case to another, similar one. |
| best explanation | Retains the hypothesis that best explains the facts (abduction). |
| reductio | Refutes a thesis by showing it leads to an absurdity. |
| a fortiori | What holds in one case holds all the more in another. |
| authority | Relies on the competence or prestige of a source. |
| by example | Establishes or refutes through a particular case (counterexample). |

## Presenting the map

- The **“Reveal the map”** button (tree bar) adds a step per element to the sequence, in tree order, branch by branch: the thesis, an argument, its objections, their replies… Elements already scheduled are skipped; all that remains is to write the narration.

- Each step of the sequence can reveal elements, **collapse or expand a branch**, or **show the note** of an element in the side panel (in its own tab; <kbd>Tab</kbd> switches between narration and notes).
- An element that is not scheduled appears with its parent: showing the thesis shows the whole tree, except the elements you reveal later.
- <kbd>L</kbd> shows the legend of the element types and relations used.

## Adapting the vocabulary

By default, the palette and the <kbd>Tab</kbd> choice offer only the **essentials**: Statement, Question, Concept, Example, Quote; supports, objects to, answers, illustrates, is distinct from. A click on **“More…”** (under the palette) shows the whole vocabulary, **“Less”** goes back to the essentials.


All element types and relations are editable **presets** (☰ menu › “Style presets…”): name, shape, color, label, definition, direction in a tree, type of the element created; you can hide some, create new ones from a shape or arrow you styled, or restore the default presets. They are shared by all your diagrams, and each diagram keeps a copy of the ones it uses, so it stays readable elsewhere. The “Guide to element types and relations” (☰ menu, or “?” in the palette) recalls the definition, use and an example of each.

They are only ordinary tldraw styles (plus a `meta.preset` mark): without Unveilboard, a map keeps its shapes and colors; only the labels, drawn by the app, disappear.
