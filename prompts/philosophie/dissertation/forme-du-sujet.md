---
title: Analyse de la forme du sujet
description: Ce que la formulation du sujet engage : forme logique, présupposés, tensions, ambiguïtés, opinions et croyances fondamentales, et le sens de la question qui en ressort.
tasks: [create, expand, enrich]
placeholder: "Le sujet de dissertation, par exemple : « Peut-on renoncer à la vérité ? »"
order: 2
source: none
---
La demande de l'utilisateur est un sujet de dissertation de philosophie (niveau Terminale). Il s'agit d'analyser la **forme de la question** : identifier les éléments structurants de sa formulation, ceux qu'un élève ne doit pas négliger sous peine de hors-sujet, puis en dégager le sens de la question. C'est une analyse préalable, comme au brouillon : mobilise une réelle culture philosophique, mais **sans nom d'auteur ni de courant**.

**Cible l'essentiel.** Ne retiens que ce qui change la manière de comprendre ou de traiter le sujet : un ou deux points par aspect au plus, et aucun pour un aspect sans enjeu ici. Évite toute remarque creuse, triviale ou scolaire (« la question est fermée »), toute répétition. L'analyse pourra être approfondie ensuite, aspect par aspect.

La liste ci-dessous dit où chercher, pas ce qu'il faut remplir.

**Ce qu'il faut repérer :**
- la **forme logique** de la question et ce qu'elle engage : question de possibilité (« peut-on »), de légitimité ou d'obligation (« faut-il », « doit-on »), de fait (« est-ce que »), d'essence ou de définition (« qu'est-ce que »), d'identité ou de réduction (« revient-il à », « n'est-il que ») ; les quantificateurs et restrictions (« tout », « seulement », « toujours »), la négation, le singulier ou le pluriel, l'article (« la » vérité, « une » vérité) ;
- les **présupposés** ou implicites de la question : ce qu'il faut tenir pour acquis pour qu'elle ait un sens ;
- les **tensions ou paradoxes** dans la formulation ;
- les **ambiguïtés** : un terme qui peut s'entendre en plusieurs sens, dont le choix change la question ;
- les **opinions communes** ou lieux communs qu'elle convoque, et surtout les **croyances fondamentales** sur lesquelles elles reposent et qu'il faudra discuter : c'est la condition principale d'une réflexion philosophique.

**Forme du schéma** (carte mentale, `"kind": "mindmap"`, ouverte des deux côtés, `"direction": "both"`) :
- **Racine** : le sujet, mot pour mot (type `question`).
- **Têtes de branches**, une par aspect retenu (trois ou quatre en général), chacune explicite (pas un simple intitulé) : « **Forme** : une question de droit (« faut-il »), non de fait », « **Présupposés** : … », « **Tensions** : … », « **Ambiguïtés** : … », « **Opinions et croyances** : … ». Omets un aspect quand le sujet n'offre rien de notable de ce côté. Quand une tête dit déjà tout, elle n'a pas besoin d'enfant.
- Sous chaque tête, les points repérés, chacun court et ciblé :
  - un présupposé : type `belief`, relation `presupposes` ;
  - une tension, un paradoxe, un risque de hors-sujet : type `problem`, relation `raises` ;
  - une ambiguïté : type `distinction` dont le texte a la forme « sens A / sens B » ;
  - une opinion commune : type `statement` ; la croyance fondamentale qui la fonde : son enfant, type `belief`, relation `presupposes`.
- **Sens de la question** : une dernière branche, la conclusion de l'analyse : une boîte (type `question`) qui formule aussi clairement que possible le problème que pose le sujet, en s'appuyant sur ce qui précède, de préférence comme une alternative (« … ou bien … ? »).
- Au plus deux liens (`link`) entre des points qui se répondent vraiment d'une branche à l'autre (une ambiguïté qui crée une tension, une croyance qui fonde un présupposé).
- **Taille** : **dix à seize éléments en tout**, racine comprise. Pas de note.

## @create

Si une séquence est demandée : le sujet d'abord, puis chaque branche dans l'ordre (la forme, les présupposés, les tensions, les ambiguïtés, les opinions et croyances), et le sens de la question en dernier. La narration fait observer à la classe ce que la formulation engage (« Remarquez le mot… ») et prépare le passage au problème.

## @expand @enrich

Approfondis l'analyse à partir de l'élément ou de l'aspect visé, en suivant la demande de l'utilisateur s'il en a une. Sinon, selon l'élément :
- un **aspect** (tête de branche) : un ou deux points de plus, parmi les plus significatifs qui manquent ;
- une **opinion** : la croyance fondamentale qui la fonde ;
- un **présupposé** : ce qu'il présuppose à son tour, ou la tension qu'il crée ;
- une **ambiguïté** : les deux sens (type `concept`, relation `defines`) et ce que chacun fait du sujet ;
- le **sens de la question** : l'alternative précisée, avec pour chaque branche une raison en sa faveur.

**Deux à cinq éléments en tout** : un approfondissement ciblé. Ne répète rien de ce que le schéma dit déjà.
