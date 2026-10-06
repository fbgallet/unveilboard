---
title: Difficultés du texte
description: Les difficultés de compréhension (sens à éclairer) et de recevabilité (propos contestable à justifier), chacune avec sa piste de résolution. Utile aussi sur une étape d'un schéma déjà construit.
tasks: [create, expand, enrich]
placeholder: "Facultatif : une précision (un passage à privilégier, le niveau…). Le texte à expliquer est le texte source."
order: 3
source: required
---
Le texte à expliquer est le **texte source** : un extrait philosophique, à étudier comme pour une explication de texte (niveau Terminale). Il s'agit d'en repérer les **difficultés** : c'est le cœur du travail d'explication, car une explication qui n'en traite aucune n'est qu'une paraphrase. Ne cite aucun autre auteur que celui du texte.

**Deux sortes de difficultés :**
- **de compréhension** : le sens d'un propos n'est pas évident (une ambiguïté, une image ou une métaphore à interpréter, un terme pris dans un sens inhabituel ou technique, un raisonnement elliptique, un présupposé implicite). Il faut éclairer le sens par une interprétation argumentée, cohérente avec le reste du texte ;
- **de recevabilité** : une affirmation semble contestable, on aurait tendance à penser autrement, voire le contraire. Il faut d'abord dire **pourquoi** on penserait autrement (quelle opinion courante ou quel argument s'y oppose), puis montrer en quel sens l'auteur peut néanmoins avoir raison, par ses arguments dans le texte ou par un argument qu'on lui prête. Il ne s'agit pas de réfuter l'auteur, mais de montrer que son propos ne va pas de soi et peut pourtant être défendu.

**Cible l'essentiel.** Trois ou quatre difficultés, les plus fécondes pour l'explication, en mêlant les deux sortes ; chacune porte sur une expression précise, pas sur une phrase entière. On pourra en chercher d'autres ensuite, passage par passage.

**Forme du schéma** (carte argumentative, `"kind": "argument"`) :
- **Racine** : la thèse du texte, reformulée sans les termes techniques de l'auteur (type `statement`, `"origin": "reconstruction"`).
- Chaque **difficulté** est un enfant de la racine (type `problem`, relation `raises`) : sa boîte commence par « **Compréhension** : » ou « **Recevabilité** : » et dit en une phrase en quoi il y a difficulté ; son `excerpt` est l'expression concernée, aussi brève que possible.
- Sous une difficulté de **compréhension** : l'interprétation proposée (type `statement`, relation `explains`), avec si besoin l'`excerpt` d'un autre passage du texte qui la confirme. Quand deux lectures sont possibles, donne-les toutes deux et dis dans la seconde pourquoi elle convient mieux au texte.
- Sous une difficulté de **recevabilité** : l'objection, ce qu'on penserait plutôt (type `statement`, relation `objects`), puis sous elle la réponse qui justifie l'auteur (type `statement`, relation `answers`), avec l'`excerpt` de l'argument du texte qu'elle mobilise ou `"origin": "reconstruction"`.
- **Taille** : **dix à seize éléments en tout**.

## @create

Si une séquence est demandée : la thèse, puis chaque difficulté dans l'ordre du texte : d'abord la difficulté seule (la narration invite la classe à chercher ce qui fait problème), puis sa résolution.

## @expand @enrich

Cherche les difficultés du passage visé (une étape du raisonnement, un concept, une thèse), en suivant la demande de l'utilisateur s'il en a une. Rattache chacune à l'élément visé (type `problem`, relation `raises`), avec sa résolution comme ci-dessus. Si l'élément visé est déjà une difficulté, propose une autre interprétation, ou une objection plus forte avec sa réponse. **Une ou deux difficultés, deux à six éléments en tout.** Ne répète aucune difficulté déjà présente.
