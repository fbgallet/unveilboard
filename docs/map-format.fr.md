# Le format JSON des schémas

[English](map-format.md) · **Français**

Unveilboard sait décrire un schéma dans un format JSON simple, indépendant de tldraw : les éléments et leurs types, les relations qui les relient, les arbres, et la séquence de présentation. Tout y est nommé : rien ne passe par la couleur ou la position.

Ce format sert à :

- **exporter** un schéma (menu ☰ › Fichier › « Exporter en JSON… », ou « Copier en JSON » pour le coller dans une conversation avec une IA) ;
- **importer** un schéma écrit à la main, par une IA ou par un autre outil (menu ☰ › Fichier › « Importer une liste, du Markdown ou du JSON… ») : il s'ouvre comme nouveau schéma, mis en page automatiquement. La même fenêtre accepte une simple liste (à puces, numérotée ou indentée, copiée de Roam, Logseq, Obsidian, Workflowy…), du Markdown à titres ou un fichier OPML : chaque ligne devient une boîte d'une carte mentale, les paragraphes deviennent des notes, `[[page]]` devient `page`, les composants `{{…}}` et références `((…))` sont retirés, les cases à cocher (`[ ]`, `[x]`, `TODO`, `DONE`) deviennent des cases cliquables (`task`). Plusieurs têtes de liste peuvent être réunies sous une racine, et le tout peut s'ajouter sous la boîte sélectionnée. Une liste collée sur le canevas devient directement une carte mentale ; collée sur une boîte, elle peut en devenir les branches. Dans l'autre sens, « Copier en liste (Markdown) » (menu Fichier, ou clic droit sur une sélection) écrit les arbres en liste indentée ;
- **modifier** le schéma ouvert par des modifications au format voisin « unveilboard/patch » (voir plus bas) ;
- faire lire, créer et modifier les schémas par une IA (menu ☰ › IA › « Créer ou modifier le schéma avec l’IA… »).

Le schéma exact est publié en [JSON Schema](map-format.schema.json) (draft 2020-12). Le vocabulaire (types d'éléments, relations, types de raisonnement) est présenté dans [Construire une carte d'argument](argument-maps.fr.md).

## Un exemple

```json
{
  "format": "unveilboard/map",
  "version": 1,
  "title": "Faut-il toujours dire la vérité ?",
  "lang": "fr",
  "elements": [
    { "id": "q", "type": "question", "text": "Faut-il toujours dire la vérité ?", "tree": { "kind": "argument" } },
    { "id": "t", "text": "Oui : la véracité est un devoir inconditionnel", "parent": "q", "relation": "answers",
      "source": "Kant", "modality": "prescriptive" },
    { "id": "j", "text": "Un mensonge ne peut devenir loi universelle", "parent": "t", "relation": "supports",
      "reasoning": "absurd" },
    { "id": "p", "text": "La valeur morale d'un acte tient à son principe", "parent": "t", "relation": "presupposes" },
    { "id": "o", "text": "Dire la vérité n'est un devoir qu'envers ceux qui y ont droit", "parent": "t",
      "relation": "objects", "source": "Constant", "note": "*Des réactions politiques* (1797)." }
  ],
  "sequence": {
    "steps": [
      { "title": "La question", "camera": "overview", "actions": [{ "do": "show", "targets": ["q"] }] },
      { "title": "La réponse de Kant", "narration": "**Oui, toujours.**", "actions": [{ "do": "show", "targets": ["t"] }] },
      { "title": "Pourquoi ?", "actions": [{ "do": "show", "targets": ["j", "p"] }] },
      { "title": "L'objection", "actions": [{ "do": "show", "targets": ["o"] }, { "do": "note", "targets": ["o"] }] }
    ]
  }
}
```

L'exemple complet de l'application est dans [`src/lib/examples/truth.fr.json`](../src/lib/examples/truth.fr.json).

## Le document

| Champ | Rôle |
|---|---|
| `format`, `version` | Toujours `"unveilboard/map"` et `1`. |
| `title` | Titre du schéma (et de sa séquence). |
| `lang` | Langue du contenu (`"fr"`, `"en"`…), facultative. |
| `vocabulary` | Types et relations utilisés, avec leur nom et leur définition (voir plus bas). Facultatif pour les types et relations de départ. |
| `elements` | Les boîtes du schéma. Les parents viennent avant leurs enfants, les frères dans leur ordre d'affichage. |
| `links` | Flèches entre deux éléments, hors des arbres (liens transversaux). |
| `others` | Autres formes (texte libre, cadres, images…), données comme contexte à l'export ; ignorées à l'import. |
| `sequence` | La présentation, étape par étape. |

Les identifiants (`id`) sont courts et libres (sans espace), uniques dans tout le schéma : éléments, liens et autres formes partagent le même espace de noms. Les formes gardent l'identifiant reçu à l'import ; les autres en reçoivent un court à l'export (`n…`, `l…`, `x…`), stable d'un export à l'autre.

## Les éléments

| Champ | Rôle |
|---|---|
| `id`, `text` | Identifiant et texte de la boîte, explicite et concis. Markdown léger : **gras**, *italique*, ~~barré~~, `code`, [lien](adresse), listes à puces ou numérotées ; un paragraphe par ligne. Le reste (titres, citations, tableaux) va dans la note. |
| `type` | Type d'élément : `statement` (énoncé), `belief` (présupposé), `fact`, `concept`, `distinction`, `question`, `problem` (difficulté), `example`, `quote` (citation), `linked` (prémisses liées : une pastille au `text` vide, dont les enfants sont des prémisses reliées par `premise`, qui ne soutiennent ou n'objectent qu'ensemble), ou un type du vocabulaire. Absent : le type que donne la relation (un élément qui « illustre » est un exemple), sinon aucun. |
| `parent` | Parent dans un arbre. Absent : l'élément est une racine, ou une boîte isolée. |
| `relation` | Relation qui relie l'élément à son parent : `supports`, `objects`, `refutes`, `answers`, `explains`, `implies`, `presupposes`, `illustrates`, `defines`, `raises`, `distinguishes`, `opposes`, `relates`, ou une relation du vocabulaire. Absente : une simple branche (carte mentale). |
| `reasoning` | Type de raisonnement de cette relation : `deduction`, `induction`, `analogy`, `abduction` (meilleure explication), `absurd`, `afortiori`, `authority`, `example`. |
| `source` | Source : auteur, théorie, position, référence. |
| `modality` | Énoncés et présupposés : `descriptive` ou `prescriptive` (normatif). |
| `note` | Développement en Markdown, affiché à côté du schéma pendant la présentation. |
| `folded` | Branche repliée au début de la présentation. |
| `task` | Une case à cocher sur la boîte, cochée d'un clic (en édition ou en présentation) : `todo` ou `done`. |
| `style` | L'aspect propre de la boîte, par-dessus celui que lui donne son type (seulement ce qui en diffère) : `geo`, `color`, `fill`, `dash`, `size` (`s`, `m`, `l`, `xl`), `font` (valeurs de tldraw). Écrit à l'export quand une boîte diffère de son type ; l'IA s'en sert pour améliorer l'aspect d'un schéma. |
| `tree` | Sur une racine : `{ "kind": "argument" \| "mindmap", "direction": "right" \| "left" \| "down" \| "up" \| "both" }` (direction par défaut : `right`). Une carte d'argument donne leur fonction et leur couleur aux éléments reliés. |
| `side` | Arbre `both` : côté (`left`, `right`) d'un enfant de la racine. |
| `origin`, `excerpt` | Schéma tiré d'un texte : l'élément y est `text` (énoncé) ou `reconstruction` (reconstruit par l'analyse, comme un présupposé implicite) ; `excerpt` cite le passage mot pour mot. |
| `function` | Lecture seule, à l'export : fonction de l'élément dans une carte d'argument (Objection, Justification…). Ignorée à l'import. |

### Sens de lecture des relations

Une relation se lit **« élément RELATION parent »** : « la prémisse *soutient* la thèse », « l'exemple *illustre* l'énoncé ». Trois relations de départ se lisent dans l'autre sens, **« parent RELATION élément »** : `implies`, `presupposes`, `raises` (« la thèse *présuppose*… »). Le vocabulaire l'indique pour chaque relation (`direction` : `toParent` ou `toChild`).

Dans un lien (`links`), la relation se lit toujours **« from RELATION to »**.

## Le vocabulaire

Chaque entrée décrit un type (`"kind": "type"`) ou une relation (`"kind": "relation"`) : `id`, `name`, `description`, et pour les relations `direction`, `childType` (type donné à l'élément relié) et `function` (sa fonction dans une carte d'argument). L'export y met les types et relations utilisés, avec leur définition : de quoi comprendre le schéma sans l'application.

Un type ou une relation créés par l'utilisateur y portent aussi leur `style` (propriétés tldraw : `geo`, `color`, `fill`, `dash`, `size`, `font`, `arrowheadStart`, `arrowheadEnd`) : à l'import sur une autre instance, ils sont recréés à l'identique.

## La séquence

`sequence.intro` (facultatif, Markdown) s'affiche sous le titre au lancement de la présentation, avant la première étape : consigne, question posée à la classe, plan de la séance.

Chaque étape a un `title`, une `narration` facultative (Markdown), une `camera` facultative (`follow`, par défaut : cadrer ce que l'étape montre ; `overview` : tout le schéma visible ; `keep` : ne pas bouger ; `{ "mode": "area", "area": { "x", "y", "w", "h" } }` : un rectangle fixe en coordonnées du canevas, centré, le zoom adapté à sa taille) et des `actions` :

| `do` | Effet |
|---|---|
| `show`, `hide` | Faire apparaître, cacher (durable). |
| `dim`, `undim` | Atténuer, rétablir (durable). |
| `highlight` | Surligner, pendant cette étape. |
| `focus` | Mettre en avant (le reste est atténué), pendant cette étape. |
| `note` | Afficher la note de l'élément, pendant cette étape. |
| `fold`, `unfold` | Replier, déplier une branche. |

Une action vise des identifiants (`targets`). **Un élément désigne sa boîte et la flèche qui le relie à son parent** : « montrer l'objection » fait monter la boîte et tracer la flèche. `part` (`node` ou `edge`) restreint l'action à l'une des deux ; `effect` (`fade`, `rise`, `draw`, `none`) choisit l'effet d'entrée d'un `show`.

**Règle d'apparition** : un élément qu'aucune étape ne montre est visible dès le début, mais seulement quand son parent l'est. Montrer la thèse montre donc tout son arbre, sauf ce que les étapes suivantes font apparaître.

## Ce que le format ne contient pas

Les positions et dimensions : la mise en page des arbres est automatique. La couleur découle du type et de la fonction, sauf le `style` propre d'une boîte. Seule la page courante est exportée. Les formes autres que les boîtes et les flèches (`others`) ne sont pas recréées à l'import.

## Contrôle à l'import

Un schéma importé est contrôlé avant d'être ouvert :

- **erreurs** (l'import est refusé) : JSON illisible, champ hors format, identifiant en double, parent inconnu, cycle de parents, relation sans parent, type ou relation inconnus, lien qui ne relie pas deux éléments, étape qui vise un identifiant inconnu ;
- **avertissements** : type de raisonnement sans relation, réglage d'arbre sur un élément qui n'est pas une racine, modalité hors des énoncés et présupposés, `part` sans objet, note absente, élément montré alors qu'un ancêtre est encore caché (la séquence est simulée par le moteur de présentation).

Chaque problème donne son chemin dans le JSON (`elements[3].parent`) : une IA peut s'en servir pour corriger sa réponse.

## Modifications (« unveilboard/patch »)

Pour modifier un schéma existant, une IA (ou un outil) n'a pas à le réécrire : elle envoie des modifications, appliquées dans l'ordre, qui désignent les éléments par leurs identifiants dans l'export ([JSON Schema](patch-format.schema.json)).

```json
{
  "format": "unveilboard/patch",
  "version": 1,
  "summary": "Ajoute la seconde objection de Constant et la réponse de Kant.",
  "operations": [
    { "op": "add", "id": "obj2", "text": "Mentir peut sauver une vie", "parent": "thesis", "relation": "objects" },
    { "op": "add", "id": "rep2", "text": "Le devoir ne dépend pas des conséquences", "parent": "obj2", "relation": "answers" },
    { "op": "update", "id": "justification", "reasoning": "deduction" },
    { "op": "sequence", "mode": "append", "steps": [{ "title": "Une autre objection", "actions": [{ "do": "show", "targets": ["obj2", "rep2"] }] }] }
  ]
}
```

| `op` | Effet |
|---|---|
| `add` | Ajoute un élément (tous les champs d'un élément ; `id` nouveau). Son `parent` est un élément existant ou ajouté plus haut. `rationale` : pourquoi l'IA le propose (une phrase), affiché pour une suggestion. |
| `update` | Change des champs d'un élément (`text`, `type`, `relation`, `reasoning`, `source`, `modality`, `note`, `folded`, `task`, `style`, `origin`, `excerpt`, `tree`) ; `null` retire un champ (`style` : seules les clés données changent ; `null` rend l'aspect du type). |
| `move` | Rattache un élément, avec sa branche, à un autre parent (`relation` facultative : sinon, il garde la sienne). |
| `remove` | Supprime un élément avec toute sa branche (et les liens qui les touchent), ou un lien. Les étapes ne le visent plus. |
| `link` | Ajoute un lien transversal. |
| `sequence` | Écrit la séquence : `"mode": "replace"` la remplace, `"append"` ajoute les étapes à la fin. |

`summary` explique à l'utilisateur ce que font les modifications ; `vocabulary` déclare d'éventuels nouveaux types ou relations.

Les modifications sont d'abord appliquées au schéma exporté, puis contrôlées comme un schéma entier (mêmes erreurs et avertissements, désignés par identifiant : `elements[id=obj2].parent`). Elles ne s'appliquent au canevas que si tout est valide, en une seule opération : <kbd>Ctrl/⌘</kbd>+<kbd>Z</kbd> les annule toutes, séquence comprise.

Les identifiants sont stables : un élément créé par import ou par modification garde le sien ; les autres reçoivent un identifiant court tiré de celui de tldraw. On peut donc échanger plusieurs fois avec une IA sur le même schéma.

## Travailler avec une IA

Voir [Travailler avec une IA](ai.fr.md) (fournisseurs, tâches, schémas riches, relecture…) et [Textes source](source-texts.fr.md) (un schéma construit à partir d’un texte, le texte à côté).

## Pour les développeurs

- Schéma Zod (source unique des types, de la validation et du JSON Schema) : [`src/lib/map/format.ts`](../src/lib/map/format.ts) ; contrôles : [`check.ts`](../src/lib/map/check.ts) ; conversions : [`src/lib/canvas/mapExport.ts`](../src/lib/canvas/mapExport.ts) et [`mapImport.ts`](../src/lib/canvas/mapImport.ts).
- Modifications : [`src/lib/map/patch.ts`](../src/lib/map/patch.ts) et [`src/lib/canvas/mapPatch.ts`](../src/lib/canvas/mapPatch.ts) ; lecture d'un JSON collé : [`read.ts`](../src/lib/map/read.ts) ; consigne et API de la page : [`src/lib/canvas/assistant.ts`](../src/lib/canvas/assistant.ts).
- `pnpm map:schema` régénère [`map-format.schema.json`](map-format.schema.json) et [`patch-format.schema.json`](patch-format.schema.json) ; un test vérifie qu'ils sont à jour.
