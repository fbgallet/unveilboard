# Le format JSON des schémas

[English](map-format.md) · **Français**

Unveilboard sait décrire un schéma dans un format JSON simple, indépendant de tldraw : les éléments et leurs types, les relations qui les relient, les arbres, et la séquence de présentation. Tout y est nommé : rien ne passe par la couleur ou la position.

Ce format sert à :

- **exporter** un schéma (menu ☰ › « Exporter en JSON… », ou « Copier en JSON » pour le coller dans une conversation avec une IA) ;
- **importer** un schéma écrit à la main, par une IA ou par un autre outil (menu ☰ › « Importer un schéma JSON… ») : il s'ouvre comme nouveau schéma, mis en page automatiquement ;
- faire lire et écrire les schémas par une IA.

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

Les identifiants (`id`) sont courts et libres (sans espace), uniques dans tout le schéma : éléments, liens et autres formes partagent le même espace de noms. À l'export, ils sont numérotés (`n1`, `l1`, `x1`) ; à l'import, ils ne servent qu'à relier les éléments entre eux.

## Les éléments

| Champ | Rôle |
|---|---|
| `id`, `text` | Identifiant et texte de la boîte (texte brut, sauts de ligne permis). |
| `type` | Type d'élément : `statement` (énoncé), `belief` (présupposé), `fact`, `concept`, `distinction`, `question`, `problem` (difficulté), `example`, `quote` (citation), ou un type du vocabulaire. Absent : le type que donne la relation (un élément qui « illustre » est un exemple), sinon aucun. |
| `parent` | Parent dans un arbre. Absent : l'élément est une racine, ou une boîte isolée. |
| `relation` | Relation qui relie l'élément à son parent : `supports`, `objects`, `refutes`, `answers`, `explains`, `implies`, `presupposes`, `illustrates`, `defines`, `raises`, `distinguishes`, `opposes`, `relates`, ou une relation du vocabulaire. Absente : une simple branche (carte mentale). |
| `reasoning` | Type de raisonnement de cette relation : `deduction`, `induction`, `analogy`, `abduction` (meilleure explication), `absurd`, `afortiori`, `authority`, `example`. |
| `source` | Source : auteur, théorie, position, référence. |
| `modality` | Énoncés et présupposés : `descriptive` ou `prescriptive` (normatif). |
| `note` | Développement en Markdown, affiché à côté du schéma pendant la présentation. |
| `folded` | Branche repliée au début de la présentation. |
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

Chaque étape a un `title`, une `narration` facultative (Markdown), une `camera` facultative (`follow`, par défaut : cadrer ce que l'étape montre ; `overview` : tout le schéma visible ; `keep` : ne pas bouger) et des `actions` :

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

Les positions, tailles et couleurs : la mise en page des arbres est automatique, et la couleur découle du type et de la fonction. Seule la page courante est exportée. Les formes autres que les boîtes et les flèches (`others`) ne sont pas recréées à l'import.

## Contrôle à l'import

Un schéma importé est contrôlé avant d'être ouvert :

- **erreurs** (l'import est refusé) : JSON illisible, champ hors format, identifiant en double, parent inconnu, cycle de parents, relation sans parent, type ou relation inconnus, lien qui ne relie pas deux éléments, étape qui vise un identifiant inconnu ;
- **avertissements** : type de raisonnement sans relation, réglage d'arbre sur un élément qui n'est pas une racine, modalité hors des énoncés et présupposés, `part` sans objet, note absente, élément montré alors qu'un ancêtre est encore caché (la séquence est simulée par le moteur de présentation).

Chaque problème donne son chemin dans le JSON (`elements[3].parent`) : une IA peut s'en servir pour corriger sa réponse.

## Pour les développeurs

- Schéma Zod (source unique des types, de la validation et du JSON Schema) : [`src/lib/map/format.ts`](../src/lib/map/format.ts) ; contrôles : [`check.ts`](../src/lib/map/check.ts) ; conversions : [`src/lib/canvas/mapExport.ts`](../src/lib/canvas/mapExport.ts) et [`mapImport.ts`](../src/lib/canvas/mapImport.ts).
- `pnpm map:schema` régénère [`map-format.schema.json`](map-format.schema.json) ; un test vérifie qu'il est à jour.
