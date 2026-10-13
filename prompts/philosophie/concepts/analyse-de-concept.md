---
title: Analyse d'un concept
description: Les analyses de base d'un concept, en ne gardant que celles qui l'éclairent : ses sens, avec quoi on le confond, ce qui s'y oppose, sa catégorie et ses espèces, ses caractéristiques, ses conditions et ses conséquences.
tasks: [create, expand, enrich, review]
placeholder: "Un concept, par exemple : « la croyance », « le travail », « la justice ». Facultatif : un contexte (une notion, un domaine, un sujet) pour orienter l'analyse."
order: 1
---
La demande de l'utilisateur est un **concept** (« la croyance », « le travail », « la justice »…), parfois accompagné d'un contexte : une notion, un domaine, un sujet. Il s'agit d'en faire l'**analyse de base**, comme un travail préparatoire : cerner exactement ce que le concept désigne, par ses sens, ce qui le distingue de ses voisins, ce qui s'y oppose, ce dont il relève, ce qu'il suppose et ce qu'il engage. Mobilise une réelle culture philosophique (distinctions classiques, sens techniques), dans une langue claire, accessible à un élève de Terminale. Si un contexte est donné, analyse le concept dans le sens qu'il y prend ; s'il y a un texte source, dans le sens que lui donne le texte.

**Peu de voies, bien remplies.** Huit voies d'analyse sont possibles (ci-dessous) : ne retiens que celles qui apprennent vraiment quelque chose sur **ce** concept. Un élément n'a sa place que s'il dit ce que la définition courante ne dit pas, ou s'il évite une confusion réelle. Omets toute voie qui ne donnerait que des banalités (« la justice est une valeur », « le travail a des conséquences économiques ») : mieux vaut trois voies solides que huit survolées.

**1. Les sens.** Quand le mot a des sens nettement distincts (usages courants, sens techniques, étymologie quand elle éclaire), démêle-les d'abord : la suite de l'analyse peut en dépendre (la liberté d'agir n'a ni les mêmes contraires ni les mêmes conditions que le libre arbitre). Si le concept n'a qu'un sens qui compte, passe cette voie.

**2. À ne pas confondre (la voie principale).** Les concepts voisins avec lesquels on confond le concept, ou qu'on emploie à sa place (croyance / savoir, opinion, foi ; peur / angoisse ; justice / légalité). Pour chacun, la **différence décisive** : le critère qui permet de trancher, en une phrase (« La peur a un objet déterminé, alors que l'angoisse n'en a pas »), pas une vague différence de degré. Quand c'est possible, un **cas** où les deux se séparent (on peut croire vrai ce qui est vrai sans le savoir). Choisis les distinctions les plus instructives, celles où la confusion est fréquente ou lourde de conséquences, plutôt que les voisins évidents.

**3. Les contraires.** Ce qui s'oppose au concept. Distingue, quand c'est éclairant, le **contraire** (l'autre extrême d'un même genre : l'amour et la haine sont deux attachements) de la simple **absence** (l'indifférence n'est ni amour ni haine). Quand le concept a **plusieurs contraires**, chacun révèle un sens différent : la liberté s'oppose à la contrainte (liberté d'agir), à la servitude (liberté politique), à la nécessité (libre arbitre). C'est souvent le moyen le plus sûr de vérifier qu'on a bien démêlé les sens d'un concept.

**4. La catégorie.** La catégorie plus générale dont il relève, son **genre** (la croyance est une manière de tenir pour vrai ; le courage est une vertu), et ce qui le distingue des autres espèces de ce genre. Un concept à plusieurs sens peut relever de plusieurs catégories. Pas de catégorie vide (« une notion », « un phénomène »).

**5. Les espèces.** Les espèces ou variétés du concept (justice commutative / distributive), de préférence selon un critère de division unique et net, que tu nommes.

**6. Les caractéristiques.** Ses traits essentiels : ce que possède tout cas du concept (la croyance admet des degrés), et qui le révèle mieux qu'une définition.

**7. Les conditions.** Ses conditions, ses principes ou ses causes : ce sans quoi il n'y a pas ce concept, ce qui le fonde ou le produit (la promesse suppose une volonté qui se lie pour l'avenir ; la responsabilité suppose la liberté).

**8. Les conséquences.** Ce qui en découle : ce qu'il implique logiquement si on l'admet, ou ce qu'il produit (si la croyance n'est pas un savoir, elle peut être fausse sans être déraisonnable ; le travail transforme aussi celui qui travaille).

**Définition de travail.** Si l'analyse le permet, termine par une définition en une phrase qui en tire parti (la catégorie, la différence décisive), sans employer le concept ni un synonyme.

**Forme du schéma** (carte mentale, `"kind": "mindmap"`, ouverte des deux côtés, `"direction": "both"`) :
- **Racine** : le concept (type `concept`).
- **Pas de boîtes de rubrique** (« Distinctions », « Contraires »…) : chaque élément d'une voie est un enfant direct de la racine, et c'est la **relation** qui dit la voie (toutes sont dans le vocabulaire) :
  - sens : `defines` ; la boîte donne le sens en quelques mots (« liberté d'action : faire ce qu'on veut ») ;
  - à ne pas confondre : `distinguishes` ; la boîte est le concept voisin (type `concept`) ; son enfant (type `statement`, sans relation) formule la différence décisive ; le cas qui les sépare, s'il y en a un, est un enfant de cette différence (type `example`, relation `illustrates`) ;
  - contraire : `opposes` ; la boîte est le contraire (type `concept`) ; sa note dit, en une phrase, s'il s'agit d'un contraire ou d'une absence, et quel sens du concept il révèle ;
  - catégorie : `fallsUnder` ; la note dit ce qui distingue le concept des autres espèces de cette catégorie ;
  - espèces : `dividesInto` ; caractéristiques : `hasFeature` ;
  - conditions : `presupposes` pour une condition ou un principe, `explains` pour une cause ;
  - conséquences : `implies` pour une implication logique, `causes` pour un effet ;
  - définition de travail : type `statement`, relation `defines`.
- **Boîtes courtes** : un concept tient en un mot ou une expression ; une condition, une conséquence ou une différence en une phrase (type `statement` quand c'est une proposition). Ici, cette consigne prime sur la règle générale d'une boîte explicite. Une note, brève, seulement quand elle ajoute quelque chose.
- **Ordre** des branches : les sens, puis les concepts à ne pas confondre et les contraires, puis la catégorie, les espèces et les caractéristiques, puis les conditions et les conséquences, la définition en dernier.
- **Jamais de répétition** : un concept n'apparaît qu'une fois ; s'il intervient dans deux voies (une condition qui est aussi un voisin), relie-les par un lien (`link`, relation `relates`).
- **Références** facultatives : quand une distinction est attachée à un auteur, indique-le dans le champ `source` de la boîte (avec sa `certainty`), au plus deux ou trois fois dans le schéma. L'analyse ne doit pas en dépendre.

Exemple de forme (en notation compacte : ⟷ à ne pas confondre avec, ≠ s'oppose à, ↑ relève de, ← suppose, → entraîne, = définition), pour « la croyance » :

```
la croyance
  ⟷ le savoir
    La croyance tient pour vrai sans pouvoir le justifier entièrement ; le savoir est une croyance vraie et justifiée.
      (ex.) Croire que le train sera à l'heure parce qu'on l'espère : on peut avoir raison sans savoir.
  ⟷ l'opinion
    L'opinion est une croyance faible, prête à changer ; la croyance peut aller jusqu'à la conviction.
  ⟷ la foi
    La foi est une croyance qui ne cherche pas de preuve et engage toute la personne.
  ≠ le doute (absence : on suspend son jugement, sans tenir pour vrai ni pour faux)
  ↑ une manière de tenir pour vrai (comme le savoir et l'opinion : le degré de justification les sépare)
  ← le témoignage d'autrui
  → elle peut être fausse sans être déraisonnable
  = Tenir une chose pour vraie sans pouvoir le justifier entièrement.
```

## @create

**Taille** : à défaut d'une taille demandée par l'utilisateur, **douze à vingt-deux éléments en tout**, dont la moitié au moins pour les concepts à ne pas confondre et les contraires. Si une séquence est demandée : le concept, ses sens s'il y a lieu, puis chaque concept à ne pas confondre avec sa différence (une par étape), les contraires, puis les autres voies retenues, la définition en dernier. La narration pose la question qui fait avancer (« Mais croire, est-ce déjà savoir ? ») et ne répète pas les boîtes. Dernière étape : vue d'ensemble, avec la définition de travail et ce que l'analyse a permis d'écarter.

## @expand @enrich

Développe l'élément visé, en suivant la visée et la demande de l'utilisateur s'il en a. Sinon :
- à partir du **concept** : une voie encore absente qui l'éclaire vraiment, ou un concept de plus à ne pas confondre ;
- à partir d'un **sens** : ce qui le sépare des autres sens, ou son contraire propre ;
- à partir d'un **concept voisin** : précise la différence (un cas limite, un contre-exemple), ou distingue-le à son tour d'un troisième terme ;
- à partir d'un **contraire** : ce qui se tient entre les deux, ou le sens du concept qu'il révèle ;
- à partir d'une **catégorie** : les autres espèces de cette catégorie, et ce qui en sépare le concept ;
- à partir d'une **condition** ou d'une **conséquence** : ce qu'elle suppose ou entraîne à son tour, ou ce qui la met en doute.

Avec les mêmes relations, même si le schéma n'a pas été créé avec cette méthode. La quantité est celle que demande l'utilisateur ; à défaut, un développement ciblé, pas un nouvel inventaire. Ne répète aucun concept déjà présent dans le schéma : relie-le par un `link` s'il le faut.

## @review

Relis le schéma comme l'analyse d'un concept. Vérifie en particulier :
- que les concepts à ne pas confondre forment le cœur de l'analyse, et que chacun donne un **critère** net, non un synonyme ou une vague différence de degré (« plus large », « plus fort ») ;
- que les sens sont vraiment distincts, et que la suite de l'analyse ne les mélange pas ;
- que les relations sont justes : un voisin donné pour un contraire, une espèce donnée pour une catégorie, une condition et une conséquence inversées ;
- qu'aucune voie ne se réduit à des banalités ;
- qu'aucun concept n'est répété au lieu d'être relié ;
- que la définition de travail découle de l'analyse et n'est pas circulaire.
