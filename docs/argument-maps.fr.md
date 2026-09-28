# Construire une carte d'argument avec Unveilboard

[English](argument-maps.md) · **Français**

Une carte d'argument rend visible la structure d'un raisonnement : la thèse discutée, les raisons qui la soutiennent, les objections, les réponses, les exemples, et ce qui est tenu pour acquis sans être dit. Unveilboard permet de la construire vite, au clavier, puis de la **dévoiler pas à pas** devant une classe.

## Le principe : la forme dit le type, la couleur dit la fonction

Chaque élément a deux caractères distincts :

- son **type** : ce qu'il *est* (un énoncé, un concept, une question, un fait…). Il se lit à sa **forme** ;
- sa **fonction** : ce qu'il *fait* dans l'argument (justifier, objecter, illustrer…). Elle dépend de la relation qui le relie à un autre élément, et se lit à sa **couleur**.

Un même énoncé peut ainsi être une justification dans un cours et une objection dans un autre : son type ne change pas, sa fonction si.

Les couleurs vont par familles : **violet** les énoncés et thèses, **rouge** les questions, difficultés et objections, **vert** les arguments et preuves, **orange** les réponses aux objections, **bleu** les concepts, définitions et distinctions, **ambre** les citations et sources, **gris** les exemples.

## Construire la carte

1. **La thèse.** Créez une boîte (outil de formes, ou clic sur le type « Énoncé » dans la palette, puis tracez-la) et écrivez la thèse à discuter.
2. **Carte d'argument.** Sélectionnez-la et cliquez sur « Carte d'argument » dans la barre qui apparaît en haut : elle devient la thèse (étiquette « THÈSE »).
3. **Ajouter des éléments.** <kbd>Tab</kbd> propose ce qu'on ajoute : *Justification · soutient*, *Objection · objecte*, *Exemple · illustre*… Choisissez avec les touches <kbd>1</kbd> à <kbd>9</kbd> (puis <kbd>a</kbd>, <kbd>b</kbd>…), ou <kbd>0</kbd> pour un élément sans relation. Le choix dépend de l'élément de départ : sous une question, on répond ; sous une objection, on répond, soutient ou objecte à son tour ; sous un concept, on définit, distingue, oppose ou rapproche. « Plus de relations… » (ou <kbd>+</kbd>) les montre toutes. Le nouvel élément reçoit le type associé, sa branche le style et le sens de la relation, et vous pouvez écrire aussitôt.
4. **Enchaîner.** Pendant la saisie, <kbd>Entrée</kbd> valide (<kbd>Maj</kbd>+<kbd>Entrée</kbd> : saut de ligne). Sur un élément sélectionné, <kbd>Entrée</kbd> ajoute un frère avec la même relation (« une autre prémisse »), <kbd>Tab</kbd> un élément qui lui répond (une objection à la prémisse, une réfutation de l'objection…).
5. **Mettre en forme.** La mise en page est automatique ; la barre de l'arbre règle l'orientation (droite, gauche, bas, haut, ou des deux côtés). Un élément déplacé à la main garde sa place ; « Réorganiser » remet tout en ordre. La pastille « − » d'un élément replie sa branche, « +n » la rouvre.
6. **Préciser.** Dans le panneau de droite, pour l'élément sélectionné : sa **source** (auteur, théorie, position, référence), sa **modalité** (descriptif ou normatif, pour les énoncés et les présupposés) et une **note** plus développée (Markdown, images), affichée pendant la présentation.

On peut aussi relier deux éléments quelconques par une flèche ordinaire, puis cliquer sur une relation dans la palette : utile pour les liens transversaux (un présupposé commun à deux branches, par exemple).

## Les types d'éléments

| Type | Forme | Définition | Exemple |
|---|---|---|---|
| **Énoncé** | rectangle violet | Ce qui est affirmé explicitement, et qu'on discute, défend ou critique. | « La technique nous rend plus libres. » |
| **Présupposé** | nuage violet | Croyance souvent implicitement admise, mais en fait discutable, au fondement d'affirmations communes. | « Chacun est l'auteur de ses choix » : présupposé du libre arbitre. |
| **Fait** | parallélogramme vert | Donnée, observation, résultat ou document sur lequel on s'appuie. | « Le taux de suicide varie selon les groupes sociaux » (Durkheim). |
| **Concept** | ovale bleu | Notion que l'on définit, analyse ou distingue d'autres. | La liberté (d'indifférence, éclairée). |
| **Distinction** | rectangle bleu, pointillés | Différence établie entre deux termes qu'on confond, ou opposition entre eux. | Liberté ≠ licence : être libre, ce n'est pas faire n'importe quoi. |
| **Question** | losange rouge | Point de discussion entre plusieurs points de vue. | « La liberté est-elle une illusion ? » |
| **Difficulté** | hexagone rouge | Ce qui fait obstacle, résiste ou appelle une résolution. | Si tout a une cause, comment être responsable ? |
| **Exemple** | rectangle gris | Cas particulier qui illustre, précise ou met à l'épreuve une idée. | L'esclave qui se sait libre en pensée (Épictète). |
| **Citation** | sans cadre, serif, guillemets, ambre | Texte d'un auteur, cité tel quel. | « L'homme est condamné à être libre » (Sartre). |

### Énoncé ou présupposé ?

Le critère n'est pas le contenu mais le **statut dans l'argument** : un *énoncé* est affirmé et mis en discussion ; un *présupposé* est tenu pour acquis, souvent sans être dit, et l'analyse le met au jour. « Chacun cherche son intérêt » est un énoncé quand Hobbes l'affirme et le défend ; c'est un présupposé quand on le dégage d'un raisonnement économique qui ne le formule jamais.

Les présupposés structurent nos représentations du monde (présupposés **descriptifs**) ou nos valeurs (présupposés **normatifs**) ; on peut les rattacher à une théorie, une position ou une option philosophique (champ « Source »).

## Les relations

Dans un arbre, une relation pointe par défaut **vers l'élément existant** (« la prémisse soutient la thèse ») ; certaines pointent vers le nouvel élément (implique, présuppose, soulève).

| Relation | Fonction de l'élément relié | Définition | Exemple |
|---|---|---|---|
| **soutient** (vert) | Justification | Donne une raison de croire ce qui est affirmé. | « Tout homme désire le bien » soutient « Nul ne fait le mal volontairement ». |
| **objecte** (rouge) | Objection | S'oppose à une affirmation, en conteste la vérité ou la portée. | « Je vois le meilleur et je fais le pire » objecte à la thèse socratique. |
| **réfute** (orange) | Réfutation | Montre qu'une objection ou une thèse est fausse (plus fort qu'objecter ou répondre). | « Ce n'est qu'une ignorance momentanée » réfute l'objection. |
| **répond à** (violet sous une question, orange sous une objection) | Réponse | Propose une réponse à une question, ou répond à une objection. | « Oui, si être libre c'est faire ce que l'on veut ». |
| **explique** (bleu clair) | Explication | Rend compte des causes ou des raisons d'un fait, sans chercher à le justifier. | « L'ignorance des causes » explique « le sentiment d'être libre » (Spinoza). |
| **implique** (noir) | Implication | A pour conséquence, logique ou pratique. | « Tout est déterminé » implique-t-il « nul n'est responsable » ? |
| **présuppose** (violet, tirets) | Présupposé | Repose, sans le dire, sur un présupposé. | « Punir le coupable » présuppose « il aurait pu agir autrement ». |
| **illustre** (gris, pointillés) | Exemple | Donne un exemple de ce qui est affirmé. | Le tyran illustre l'erreur sur le bien. |
| **définit** (bleu, tirets) | Définition | Précise le sens d'une notion. | « Pouvoir faire ce que l'on veut » définit la liberté au sens commun. |
| **soulève** (rouge, tirets) | Difficulté | Fait apparaître une difficulté ou un problème. | Le déterminisme soulève le problème de la responsabilité. |
| **se distingue de** (bleu, barres) | Distinction | Marque une différence entre deux notions là où il y a confusion. | La liberté se distingue de la licence. |
| **s'oppose à** (bleu, deux pointes) | Opposition | Oppose deux notions : contraires ou contradictoires. | La nature s'oppose à la culture. |
| **se rapproche de** (bleu, fin, pointillés) | Notion voisine | Rapproche deux notions voisines ou apparentées. | La liberté se rapproche de l'autonomie. |

*Soutient* ou *explique* ? Une justification donne une raison de **croire** que c'est vrai ; une explication rend compte de **pourquoi** c'est ainsi, sans chercher à le prouver.

## La distinction conceptuelle

Distinguer est souvent décisif dans une discussion : bien des objections tombent quand on dissipe une équivoque. Unveilboard la prend en compte à deux niveaux :

- **dans l'argument**, l'élément **Distinction** (« liberté ≠ licence ») est un coup à part entière : il peut *réfuter* une objection, *répondre* à une question ou lever une difficulté, avec les relations habituelles ;
- **entre concepts**, pour cartographier un champ notionnel : **se distingue de** (différence là où il y a confusion), **s'oppose à** (contraires, qui s'excluent sans épuiser les possibles, ou contradictoires, dont l'un est la négation de l'autre), **se rapproche de** (parenté, proximité).

## Prémisses liées

Deux raisons peuvent soutenir une thèse **chacune de son côté** (raisons convergentes : si l'une tombe, l'autre tient encore), ou **seulement ensemble** (prémisses liées : aucune ne suffit seule). « Tout homme est mortel » et « Socrate est un homme » ne prouvent « Socrate est mortel » qu'ensemble.

- Sélectionnez une justification (ou une objection, une réponse…) et cliquez **« + Prémisse liée »**, ou <kbd>Maj</kbd>+<kbd>Entrée</kbd> : une petite **pastille** prend sa place et porte la relation (« soutient »), l'élément devient une prémisse et une nouvelle prémisse s'ajoute à côté.
- Sur la pastille, <kbd>Entrée</kbd> ajoute une prémisse ; sur une prémisse, <kbd>Entrée</kbd> en ajoute une autre.
- Les prémisses prennent la couleur de la fonction de la pastille (vertes si elles soutiennent, rouges si elles objectent) et s'affichent serrées contre elle.
- **Objecter à l'inférence** : une objection attachée à la pastille (<kbd>Tab</kbd> sur la pastille) ne conteste aucune des prémisses, mais le passage des prémisses à la conclusion.
- En présentation, la pastille apparaît avec ses prémisses ; « Dévoiler la carte » leur consacre une seule étape.

## Types de raisonnement

Une flèche de soutien ou d'objection peut préciser **comment** elle soutient ou objecte : sélectionnez-la, puis choisissez dans le panneau de droite. Le type s'inscrit dans le texte de la flèche (« soutient · analogie »). C'est facultatif : sans précision, rien ne change.

| Type | Principe |
|---|---|
| déduction | La conclusion découle nécessairement des prémisses. |
| induction | Généralise à partir de cas particuliers. |
| analogie | Conclut d'un cas à un autre, semblable. |
| meilleure explication | Retient l'hypothèse qui explique le mieux les faits (abduction). |
| par l'absurde | Réfute une thèse en montrant qu'elle mène à une absurdité. |
| a fortiori | Ce qui vaut dans un cas vaut à plus forte raison dans un autre. |
| autorité | S'appuie sur la compétence ou le prestige d'une source. |
| par l'exemple | Établit ou réfute par un cas particulier (contre-exemple). |

## Présenter la carte

- Le bouton **« Dévoiler la carte »** (barre de l'arbre) ajoute à la séquence une étape par élément, dans l'ordre de l'arbre, branche par branche : la thèse, un argument, ses objections, leurs réponses… Les éléments déjà programmés sont sautés ; il ne reste qu'à écrire la narration.

- Chaque étape de la séquence peut faire apparaître des éléments, **replier ou déplier une branche**, ou **afficher la note** d'un élément dans le panneau de droite (dans son propre onglet ; <kbd>Tab</kbd> passe de la narration aux notes).
- Un élément non programmé apparaît avec son parent : montrer la thèse montre tout l'arbre, sauf les éléments que vous faites apparaître plus tard.
- <kbd>L</kbd> affiche la légende des types et relations utilisés.

## Adapter le vocabulaire

Par défaut, la palette et le choix au <kbd>Tab</kbd> ne proposent que l'**essentiel** : Énoncé, Question, Concept, Exemple, Citation ; soutient, objecte, répond à, illustre, se distingue de. Un clic sur **« Plus… »** (sous la palette) montre tout le vocabulaire, **« Moins »** revient à l'essentiel.


Tous les types d'éléments et toutes les relations sont des **préréglages** modifiables (menu ☰ › « Préréglages de styles… ») : nom, forme, couleur, étiquette, définition, sens dans un arbre, type de l'élément créé ; vous pouvez en masquer, en créer d'après une forme ou une flèche que vous avez stylée, ou revenir aux préréglages de départ. Ils sont communs à tous vos schémas, et chaque schéma garde une copie de ceux qu'il utilise, pour rester lisible ailleurs. Le « Guide des types d'éléments et des relations » (menu ☰, ou « ? » dans la palette) rappelle la définition, l'usage et un exemple de chacun.

Ce ne sont que des styles tldraw ordinaires (plus une marque `meta.preset`) : sans Unveilboard, une carte garde ses formes et ses couleurs ; seules les étiquettes, dessinées par l'application, disparaissent.
