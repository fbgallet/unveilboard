---
title: Plan de dissertation
description: Un plan simple en trois parties progressives, où chaque partie dit son rôle dans la discussion : la réponse la plus évidente et sa justification, les objections, la réponse à ces objections.
tasks: [create, expand, enrich, sequence]
placeholder: "Le sujet de dissertation, par exemple : « Peut-on être heureux sans être libre ? »"
order: 5
source: none
---
La demande de l'utilisateur est un sujet de dissertation de philosophie (niveau Terminale). Il s'agit de proposer un **plan simple**, non rédigé : les grandes étapes d'une discussion progressive, et le **rôle** de chacune dans le raisonnement d'ensemble. Ce n'est pas un catalogue de références, mais un raisonnement qui avance.

**La progression** (à adapter au sujet) :
- **I. La réponse la plus évidente** : celle qui semble aller de soi ou que soutient l'opinion commune, et ce qui la justifie ;
- **II. Les objections** : ce qui met cette réponse en difficulté (un contre-exemple, une distinction qu'elle néglige, une croyance qu'elle présuppose sans l'examiner) ;
- **III. La réponse aux objections**, selon leur force : si elles réfutent vraiment la première réponse, on examine la réponse contraire ou une autre voie ; si elles sont elles-mêmes contestables, on leur répond pour défendre à nouveau la première réponse, mais sur des fondements repensés.

Une autre structure est possible si elle convient mieux au sujet, à condition de rester une discussion progressive. Ce qui fait avancer d'une partie à l'autre, c'est un **basculement conceptuel** : une distinction ou un concept qui fait voir la question autrement.

**Forme du schéma** (carte argumentative, `"kind": "argument"`) :
- **Racine** : le sujet, mot pour mot (type `question`).
- **I** : enfant de la racine, relation `answers`. **II** : enfant de I, relation `objects`. **III** : enfant de II, relation `answers` (ou `refutes` si elle montre que les objections ne tiennent pas). La chaîne des parties fait voir la discussion.
- Chaque partie est une boîte de type `statement` qui commence par son numéro et son rôle en gras, puis donne son idée directrice en une phrase : « **I. La réponse évidente** : être heureux, c'est satisfaire ses désirs, ce qui suppose d'être libre de le faire. »
- Sous chaque partie, **deux ou trois sous-parties** (type `statement`), reliées par `supports` : chacune est un argument en une phrase, avec en gras le concept ou la distinction qui le porte (un outil conceptuel précis, pas une notion du programme). Une référence philosophique est facultative : au plus une par partie, dans le champ `source` (un auteur du programme de Terminale), et au moins une sous-partie par partie sans référence.
- **Taille** : **dix à quatorze éléments en tout**. Pas de note, sauf pour préciser le rôle d'une partie quand la boîte ne suffit pas.

## @create @sequence

Si une séquence est demandée (ou écrite) : le sujet, puis chaque partie suivie de ses sous-parties. La narration explique le **rôle** de chaque étape dans le raisonnement d'ensemble et surtout les **transitions** : la difficulté qui oblige à passer à la partie suivante (« Mais cette réponse suppose que… »). Dernière étape : vue d'ensemble, avec la réponse à laquelle conduit la discussion, en une ou deux phrases.

## @expand @enrich

Développe l'élément visé, en suivant la demande de l'utilisateur s'il en a une. Sinon :
- une **partie** : une sous-partie de plus, qui apporte un argument absent ;
- une **sous-partie** : l'exemple qui l'ancre dans le réel (type `example`, relation `illustrates`), la distinction qui la précise, ou une référence qui l'approfondit ;
- la **dernière partie** : une autre manière de répondre aux objections, comme partie alternative (relation `answers`, enfant de II).

**Deux à cinq éléments en tout.** Ne répète rien de ce que le plan dit déjà.
