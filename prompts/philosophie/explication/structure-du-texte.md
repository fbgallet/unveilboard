---
title: Structure argumentative du texte
description: La question à laquelle le texte répond, la thèse (face à l'opinion commune) et les étapes du raisonnement dans l'ordre du texte, avec leur fonction. La séquence peut servir d'explication linéaire.
tasks: [create, expand, enrich, sequence]
placeholder: "Facultatif : une précision (le niveau, un passage à privilégier…). Le texte à expliquer est le texte source."
order: 1
source: required
---
Le texte à expliquer est le **texte source** : un extrait philosophique, à étudier comme pour une explication de texte (niveau Terminale). Sa référence (auteur, œuvre), si elle est donnée, est celle du texte source. Il s'agit d'une analyse préparatoire, comme au brouillon : identifier précisément ce que l'auteur dit et comment il le dit. Ne cite aucun autre auteur que celui du texte.

**Cible l'essentiel.** Le schéma doit faire voir d'un coup d'œil le mouvement du texte : la question, la thèse, les grandes étapes. Les détails (sous-arguments, prémisses implicites, difficultés) pourront être ajoutés ensuite, étape par étape.

**Ce qu'il faut dégager :**
- la **question** précise à laquelle le texte répond ou contribue : une question qui prête à discussion, pas une notion vague (« la liberté »), formulée sans reprendre les mots de l'auteur ;
- la **thèse** : l'affirmation centrale que l'auteur soutient, forte et discutable, reformulée sans ses termes techniques ni ses expressions typiques, pour être immédiatement parlante. Elle peut être implicite et ne se dégager que de l'ensemble du raisonnement ;
- l'**opinion commune** ou la thèse adverse à laquelle elle s'oppose (« On aurait tendance à penser que… ») : c'est ce qui rend la thèse problématique ;
- les **étapes du raisonnement**, dans l'ordre du texte : ce que l'auteur y fait (affirme, distingue, justifie, objecte, illustre, conclut) et leur fonction dans l'argumentation. Le découpage épouse la logique du texte, non un plan plaqué ; deux à cinq étapes en général.

**Forme du schéma** (carte argumentative, `"kind": "argument"`) :
- **Racine** : la question (type `question`, `"origin": "reconstruction"`).
- Ses enfants, reliés par `answers` : la **thèse** de l'auteur (type `statement`), puis l'**opinion commune** ou thèse adverse (type `statement`). La thèse a l'`excerpt` du passage qui l'énonce le mieux, si elle est explicite ; sinon, `"origin": "reconstruction"`. L'opinion est une reconstruction, sauf si le texte l'énonce.
- Sous la thèse, une boîte par **étape**, dans l'ordre du texte, reliée par la relation qui dit sa fonction : `supports` (argument, justification), `explains` (définition, explicitation), `illustrates` (exemple, type `example`), `objects` (objection que l'auteur se fait), suivie de sa réponse (`answers`). La boîte résume en une phrase ce que l'auteur y fait et soutient ; son `excerpt` est la formule clé de l'étape (courte), et sa note délimite le passage : « De « … » à « … ». »
- Une étape n'a d'enfant que si c'est indispensable pour comprendre le raisonnement (l'exemple qui porte l'argument, l'objection à laquelle répond l'étape suivante).
- **Taille** : **huit à quinze éléments en tout**.

## @create

Si une séquence est demandée : la question, l'opinion commune, puis la thèse, puis chaque étape dans l'ordre du texte. La narration présente ce que fait l'auteur à chaque étape et l'articulation logique avec la précédente (en citant brièvement ses connecteurs : « or », « donc », « mais »), sans répéter les boîtes. Dernière étape : vue d'ensemble, qui dit en une ou deux phrases ce qui est en jeu dans le texte.

## @expand @enrich

Développe l'élément visé, en suivant la demande de l'utilisateur s'il en a une. Sinon, selon l'élément :
- une **étape** : son raisonnement reconstitué (les prémisses, dont celles que l'auteur ne dit pas, en prémisses liées si elles ne valent qu'ensemble ; la conclusion qu'il en tire), ou ses sous-étapes ;
- la **thèse** : ce qu'elle présuppose (`presupposes`, type `belief`), ou ce qui est en jeu si l'auteur a raison : ce que cela oblige à abandonner, corriger, préserver ou redéfinir dans nos croyances ou nos pratiques (un enjeu pratique, un enjeu théorique) ;
- l'**opinion commune** : ce qui la rend vraisemblable.

Chaque élément tiré du texte a son `excerpt` (bref) ; ce que tu reconstitues est marqué `"origin": "reconstruction"`. **Deux à six éléments en tout.**

## @sequence

Écris la séquence comme une **explication linéaire** du texte, à dire devant la classe.
- `intro` : la question, la thèse problématisée (en quoi elle s'oppose à l'opinion commune et pourquoi elle ne va pas de soi), et le plan du texte en une phrase.
- Une étape (ou deux) par étape du raisonnement, dans l'ordre du texte. La narration :
  - **cite** brièvement (expressions, formules clés, entre guillemets) pour montrer ce qu'on explique ;
  - **explicite** ce que l'auteur veut dire, avec ses propres mots, sans paraphraser : elle doit faire comprendre ce que le texte ne dit pas explicitement ;
  - **s'étonne** d'un mot, d'une image, d'une idée forte, et propose une interprétation ;
  - **justifie** la place du passage dans le raisonnement, et la transition vers le suivant par son articulation logique (jamais un simple « ensuite »).
- Dernière étape : vue d'ensemble, ce que l'explication a permis de mieux comprendre, la réponse à la question et ce qui est en jeu.

Rends justice à l'auteur : on suppose que ce qu'il dit a un sens, une cohérence et un intérêt. Trois à cinq phrases par étape au plus.
