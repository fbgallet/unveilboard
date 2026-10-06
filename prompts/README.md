# Prompt library

Shared prompts ("methods") that users can pick in Unveilboard's AI dialogs: create a diagram, develop an element, enrich, edit, write the sequence, review. A method guides **what** the AI produces (the analysis to carry out, the shape of the diagram, the vocabulary to use); the app still adds its own instructions on the JSON format, ids and faithfulness, so a method never has to describe them.

Users can also write their own prompts in the app (AI menu › *Prompt library…*): they are kept with their settings (in the browser, or on the server when the instance stores documents in the cloud).

## Folders are collections

Each folder is a collection, which users can show or hide in the prompt library. A `_collection.md` file gives its title, description and language (inherited by subfolders):

```markdown
---
title: Philosophie
description: Prompts pour l'enseignement de la philosophie.
lang: fr
---
```

By default, a collection is shown when its language is the interface language (or when it has none).

## A prompt file

```markdown
---
title: Réseau conceptuel du sujet
description: One line, shown under the picker.
tasks: [create, expand, enrich]
placeholder: Text shown in the request box, e.g. "The essay question…"
order: 1
source: none
---
Common part, sent with every task.

## @create

Sent only when creating a diagram, and in each pass of a multi-pass creation (`plan`, `develop`, `finish`) unless that pass has its own variant.

## @expand @enrich

Sent when developing an element or enriching the diagram.
```

- `tasks`: where the prompt is offered: `create`, `enrich`, `expand` (develop the selected element), `edit`, `sequence`, `review`, `plan`, `chat`. Omitted: all tasks. Offering `create` also offers the prompt for the plan of a multi-pass creation; offering `enrich`, `edit` or `expand` also offers it in the chat (which then uses the `@chat` variant, or else the `@edit` one).
- `source`: `required` for a prompt that works on the page's source text (a text to explain): offered only when the request uses a source text (“Create a diagram from a text”, or “Use the source text of this page” checked); `none` for a prompt that works without one (an essay question): offered only then. Omitted: both.
- The user's text (the subject, the notions…) is sent as "the user's request": refer to it as such. A source text is sent as "the source text", and the app already asks for verbatim excerpts.
- Write the method in the language of its users; the app tells the model which language the content must be written in.
- Element types and relations are those of the app's default vocabulary (`statement`, `belief`, `concept`, `distinction`, `question`, `problem`, `example`, `quote`; `supports`, `objects`, `answers`, `presupposes`, `raises`, `defines`, `distinguishes`, `opposes`, `relates`…). A method may ask the model to declare new ones in the diagram's `vocabulary`.

After adding or changing a file, regenerate the library bundled with the app:

```sh
pnpm prompts:build
```

(`pnpm test` fails while `src/lib/prompts/library.json` is out of date.)
