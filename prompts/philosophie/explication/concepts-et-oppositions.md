---
title: Concepts et oppositions du texte
description: Les concepts clés du texte, dans le sens que leur donne l'auteur, et les oppositions conceptuelles qui structurent son raisonnement.
tasks: [create, expand, enrich]
placeholder: "Facultatif : une précision (un concept à privilégier, le niveau…). Le texte à expliquer est le texte source."
order: 2
source: required
---
Le texte à expliquer est le **texte source** : un extrait philosophique, à étudier comme pour une explication de texte (niveau Terminale). Il s'agit d'en dégager les **concepts clés** et les **oppositions conceptuelles** qui traversent le texte et structurent le raisonnement. Ne cite aucun autre auteur que celui du texte.

**Cible l'essentiel.** Ne retiens que les concepts et oppositions décisifs pour le raisonnement (trois ou quatre concepts, une ou deux oppositions en général), pas tous les termes philosophiques du texte. On pourra en ajouter ensuite.

**Pour chaque concept** : le terme exact de l'auteur, le **sens qu'il lui donne** dans ce texte (qui peut différer du sens courant) et ce qui le rend décisif pour le raisonnement.

**Pour chaque opposition** : les deux **pôles**, chacun avec les termes équivalents que l'auteur emploie pour le désigner (« imaginaire », « illusoire » d'un côté ; « réel », « effectif » de l'autre), et ce que l'opposition permet à l'auteur de penser.

**Forme du schéma** (carte mentale, `"kind": "mindmap"`, ouverte des deux côtés, `"direction": "both"`) :
- **Racine** : la question à laquelle le texte répond (type `question`, `"origin": "reconstruction"`), formulée sans reprendre les mots de l'auteur.
- **Un concept** : une boîte de type `concept` dont le texte est le terme de l'auteur entre guillemets (« la volonté »), avec l'`excerpt` d'un passage où il l'emploie ; son enfant (type `statement`, relation `defines`) dit en une phrase le sens que l'auteur lui donne, et pourquoi il compte. Quand ce sens s'écarte du sens courant, ajoute le sens courant (type `concept`, relation `distinguishes`).
- **Une opposition** : une boîte de type `distinction` (« imaginaire / réel ») ; ses deux enfants sont les **pôles** (type `concept`, sans relation), chacun listant les termes équivalents de l'auteur entre guillemets, avec un `excerpt`. La note de la distinction dit en une ou deux phrases ce que l'opposition permet à l'auteur de penser.
- Quand un concept appartient à un pôle d'une opposition, relie-les par un lien (`link`, relation `relates`) plutôt que de le répéter.
- **Taille** : **huit à seize éléments en tout**.

## @create

Si une séquence est demandée : la question, puis chaque opposition et chaque concept, dans l'ordre où ils apparaissent dans le texte. La narration fait observer les mots de l'auteur (« Remarquez qu'il dit… et non… ») et ce qu'ils engagent.

## @expand @enrich

Développe l'élément visé, en suivant la demande de l'utilisateur s'il en a une. Sinon : pour un **concept**, un autre sens qu'il prend dans le texte, la distinction avec un concept voisin, ou ce qu'il implique dans le raisonnement ; pour une **opposition**, un terme équivalent de plus pour un pôle, ou la manière dont l'opposition se déplace au fil du texte. Chaque élément tiré du texte a son `excerpt` (bref). **Deux à cinq éléments en tout.**
