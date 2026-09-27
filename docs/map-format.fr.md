# Le format JSON des schémas

[English](map-format.md) · **Français**

Unveilboard sait décrire un schéma dans un format JSON simple, indépendant de tldraw : les éléments et leurs types, les relations qui les relient, les arbres, et la séquence de présentation. Tout y est nommé : rien ne passe par la couleur ou la position.

Ce format sert à :

- **exporter** un schéma (menu ☰ › « Exporter en JSON… », ou « Copier en JSON » pour le coller dans une conversation avec une IA) ;
- **importer** un schéma écrit à la main, par une IA ou par un autre outil (menu ☰ › « Coller du JSON… ») : il s'ouvre comme nouveau schéma, mis en page automatiquement ;
- **modifier** le schéma ouvert par des modifications au format voisin « unveilboard/patch » (voir plus bas) ;
- faire lire, créer et modifier les schémas par une IA (menu ☰ › « Consigne pour une IA… »).

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
| `update` | Change des champs d'un élément (`text`, `type`, `relation`, `reasoning`, `source`, `modality`, `note`, `folded`, `origin`, `excerpt`, `tree`) ; `null` retire un champ. |
| `move` | Rattache un élément, avec sa branche, à un autre parent (`relation` facultative : sinon, il garde la sienne). |
| `remove` | Supprime un élément avec toute sa branche (et les liens qui les touchent), ou un lien. Les étapes ne le visent plus. |
| `link` | Ajoute un lien transversal. |
| `sequence` | Écrit la séquence : `"mode": "replace"` la remplace, `"append"` ajoute les étapes à la fin. |

`summary` explique à l'utilisateur ce que font les modifications ; `vocabulary` déclare d'éventuels nouveaux types ou relations.

Les modifications sont d'abord appliquées au schéma exporté, puis contrôlées comme un schéma entier (mêmes erreurs et avertissements, désignés par identifiant : `elements[id=obj2].parent`). Elles ne s'appliquent au canevas que si tout est valide, en une seule opération : <kbd>Ctrl/⌘</kbd>+<kbd>Z</kbd> les annule toutes, séquence comprise.

Les identifiants sont stables : un élément créé par import ou par modification garde le sien ; les autres reçoivent un identifiant court tiré de celui de tldraw. On peut donc échanger plusieurs fois avec une IA sur le même schéma.

## Travailler avec une IA

On peut se servir de sa propre IA sans rien brancher, ou en brancher une. Toutes ces fonctions sont aussi dans le menu de l'icône ✦, en haut à droite du canevas, en édition (un point y signale des remarques de relecture en attente).

Les étiquettes des relations (« soutient », « objecte »…) sont écrites dans la langue du contenu (`lang` du schéma, gardée dans le document), quelle que soit la langue de l'interface, tant que la relation n'a pas été renommée.

- **Menu ☰ › « Consigne pour une IA… »** : choisir une tâche (créer un schéma, enrichir, écrire la séquence, autre modification), la préciser, éventuellement se limiter à la sélection. La consigne contient le schéma, le vocabulaire (préréglages de l'utilisateur compris, avec leurs définitions), le format de réponse et les règles de fidélité (ne pas inventer de citation ni de source).
  - Sans IA branchée : « Copier la consigne », la coller dans l'assistant de son choix, puis coller sa réponse dans la même boîte.
  - Avec une IA branchée : « Demander à l'IA » ; la réponse arrive au fur et à mesure (« Arrêter » l'interrompt). Si elle ne passe pas les contrôles, elle est renvoyée une fois au modèle avec les problèmes trouvés. Elle s'affiche ensuite, avec son résumé, pour être vérifiée puis appliquée.
- **Menu ☰ › « Relecture critique… »** : un panneau, à gauche du schéma.
  - **Vérifications automatiques**, sans IA et gratuites : objection sans réponse, thèse sans justification, élément d'une carte d'argument rattaché sans relation, élément que la séquence montre avant son parent, boîte trop longue.
  - **« Relire avec l'IA »** (ou copier la consigne, puis coller la réponse) : l'IA relit le schéma comme un professeur exigeant et renvoie une relecture au format « unveilboard/review » ([JSON Schema](review-format.schema.json)) : un jugement d'ensemble, puis des remarques typées (incohérence, lacune, confusion, type, relation, structure, redondance, formulation, séquence, fidélité), avec une priorité, les éléments visés et, quand elle est claire, une correction (des opérations de modification). Une correction invalide est renvoyée une fois au modèle ; ensuite, la remarque reste sans correction.
  - Chaque remarque a un numéro (« R1 ») affiché au coin des éléments visés ; cliquer sur un élément le sélectionne et le cadre. « Appliquer la correction » la contrôle de nouveau sur le schéma tel qu'il est devenu, puis l'applique (annulable) ; « Écarter » la retire. Les remarques de l'IA sont gardées sur cet appareil, pour ce schéma (ni dans le document, ni dans les partages).
- **Boîte et note** : la consigne demande une boîte explicite et suffisante (une thèse complète, pas un titre), concise, et, si l'option « Précisions dans la note » est cochée (par défaut), une note brève quand elle apporte une précision, jamais l'essentiel seul. Décochée : tout dans la boîte.
- **Réflexion du modèle** (réglages de l'IA) : celle du modèle, sans, légère, moyenne ou poussée. Envoyée comme `reasoning` à OpenRouter (et à l'IA de l'instance, qui ajoute alors une marge de jetons à la réponse), comme `reasoning_effort` aux autres serveurs compatibles OpenAI. Plus de réflexion donne des réponses plus justes, mais plus lentes et plus chères. La transcription se fait toujours sans réflexion.
- **Menu ☰ › « Créer un schéma depuis un texte… »** : coller un texte (un cours, un texte d'auteur) ou choisir un fichier.
  - **Texte et Markdown** sont lus tels quels ; un **PDF** par sa couche de texte, dans le navigateur (pdf.js) : rien n'est envoyé pour le lire.
  - **Photo, ou PDF scanné** (sans couche de texte) : « Transcrire avec l'IA » les fait transcrire par un modèle multimodal (sur OpenRouter, le `transcription` de `models.json`, et le lecteur de PDF « native », sans reconnaissance de caractères facturée en plus), fidèlement, avec la référence si le document la porte. Le texte transcrit s'affiche, à relire. 3 Mo au plus. (Consignes reprises des exercices de bac-philo-agent.)
  - Choix du **type de schéma** (au choix de l'IA, carte d'argument, carte mentale), de la **séquence et sa narration**, et une demande facultative. Au-delà de 60 000 caractères, un avertissement ; au-delà de 300 000, il faut choisir un passage.
  - **Fidélité, vérifiée par le programme** : chaque élément tiré du texte porte `"origin": "text"` et un `excerpt` copié mot pour mot ; ce que l'analyse reconstruit porte `"origin": "reconstruction"`. Chaque extrait et chaque citation (type `quote`) est cherché dans le texte (en tolérant apostrophes et guillemets typographiques, césures de fin de ligne, espaces, casse, et les coupures « […] »). À la première réponse, un extrait introuvable est renvoyé au modèle pour correction ; ensuite, le schéma s'ouvre et l'élément porte l'étiquette « à vérifier ». Le panneau de droite montre la provenance de l'élément sélectionné (« Tiré du texte » avec son extrait, ou « Reconstruction ») et permet de le « marquer comme vérifié ».
- **Menu ☰ › « Réglages de l'IA… »** : le fournisseur, gardé sur cet appareil (jamais dans le document ni sur le serveur) :
  - **OpenRouter, avec votre clé** : « Se connecter avec OpenRouter » crée une clé pour Unveilboard (OAuth PKCE : la clé est échangée dans le navigateur), ou on colle la sienne. Le navigateur appelle OpenRouter directement ;
  - **serveur compatible OpenAI**, local ou distant (Ollama, LM Studio, llama.cpp…) : adresse (jusqu'à `/v1`), clé facultative, modèle (« Lister les modèles »). Le navigateur l'appelle directement : le serveur doit accepter l'origine du site (Ollama : `OLLAMA_ORIGINS`, et un contexte assez grand, `num_ctx` ; LM Studio : activer CORS) ;
  - **l'IA de l'instance**, si elle en a une (clé côté serveur, voir `.env.example`) ;
  - « Tester » vérifie que le modèle répond, et en JSON.
- **À partir d'un élément** : sélectionner une boîte, puis « ✦ IA… » dans sa barre. Une demande toute faite (arguments, objections, réponses, exemples, présupposés, distinctions, définitions, conséquences) ou libre ; avec tout le schéma, ou seulement l'élément, ses ancêtres et sa branche. L'IA relie de nouveaux éléments à celui-ci (et, au besoin, des liens vers des éléments existants), chacun avec une phrase qui dit pourquoi (`rationale`) :
  - **en suggestions** (par défaut) : des formes estompées, étiquetées « suggestion », avec ✓ et ✕ ; accepter un élément accepte aussi son parent suggéré ; écarter un élément écarte sa branche. Une barre compte les suggestions en attente et permet de tout accepter ou tout écarter ; la raison de la suggestion sélectionnée s'y affiche. Tant qu'elles ne sont pas acceptées, les suggestions restent hors de la présentation, de l'export JSON, de « Dévoiler la carte », du polycopié et des partages ;
  - **ou directement**, en une modification annulable.
- **« Séquence (IA)… »** (barre d'un arbre) ouvre la consigne sur l'écriture de la séquence, avec l'ordre de « Dévoiler la carte » comme point de départ.
- **Modèles** : le catalogue des modèles OpenRouter proposés (et permis pour l'IA de l'instance) est dans [`src/lib/ai/models.json`](../src/lib/ai/models.json), à modifier librement ; son `default` (DeepSeek V4.1 flash) sert quand aucun modèle n'est choisi.
- **Menu ☰ › « Coller du JSON (schéma ou modifications)… »** : un schéma entier s'ouvre comme nouveau schéma ; des modifications s'appliquent au schéma ouvert. Le JSON peut être entouré de texte ou d'un bloc de code, comme dans une réponse d'IA.
- **Pour un agent qui pilote le navigateur**, la page expose `window.unveilboard` :
  - `getMap()` : le schéma ouvert, dans ce format ;
  - `getPrompt(task, instruction?)` : la consigne complète d'une tâche (`create`, `enrich`, `sequence`, `review`, `edit`, `expand`; `review` answers with a review, which `apply` shows in the review panel) ;
  - `apply(json)` : applique des modifications, ou ouvre un schéma entier comme nouveau schéma ; renvoie `{ ok, kind, problems }`, les problèmes en anglais, pour que l'agent corrige sa réponse.

**IA de l'instance** (route `/api/ai`) : le serveur reçoit la tâche, le schéma et le vocabulaire, construit lui-même la consigne et relaie la réponse du fournisseur ; ce n'est pas un relais de conversation générique. En mode cloud, elle est réservée à la session ; en mode local (instance publique), seulement avec `AI_PUBLIC=on`, avec des limites par adresse IP.

Les consignes sont dans [`src/lib/ai/prompts.ts`](../src/lib/ai/prompts.ts), versionnées (`PROMPT_VERSION`).

## Pour les développeurs

- Schéma Zod (source unique des types, de la validation et du JSON Schema) : [`src/lib/map/format.ts`](../src/lib/map/format.ts) ; contrôles : [`check.ts`](../src/lib/map/check.ts) ; conversions : [`src/lib/canvas/mapExport.ts`](../src/lib/canvas/mapExport.ts) et [`mapImport.ts`](../src/lib/canvas/mapImport.ts).
- Modifications : [`src/lib/map/patch.ts`](../src/lib/map/patch.ts) et [`src/lib/canvas/mapPatch.ts`](../src/lib/canvas/mapPatch.ts) ; lecture d'un JSON collé : [`read.ts`](../src/lib/map/read.ts) ; consigne et API de la page : [`src/lib/canvas/assistant.ts`](../src/lib/canvas/assistant.ts).
- `pnpm map:schema` régénère [`map-format.schema.json`](map-format.schema.json) et [`patch-format.schema.json`](patch-format.schema.json) ; un test vérifie qu'ils sont à jour.
