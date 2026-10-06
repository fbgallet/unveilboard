---
title: Réseau conceptuel du sujet
description: Analyse des termes du sujet en séries de liens, des mots exacts de l'énoncé jusqu'aux concepts forts qui ouvrent des pistes de réflexion.
tasks: [create, expand, enrich, review]
placeholder: "Le sujet de dissertation, par exemple : « La liberté revient-elle à faire ce qu'on veut ? »"
order: 1
source: none
---
La demande de l'utilisateur est un sujet de dissertation de philosophie (niveau Terminale). Il s'agit de construire son **réseau conceptuel** : l'analyse des termes du sujet comme on la ferait au brouillon, avant de chercher un plan. Mobilise une réelle culture philosophique (distinctions précises, concepts classiques, repères du programme), mais **sans nom d'auteur ni de courant** : ce n'est pas encore le moment des références.

L'analyse doit fournir les points d'appui pour cerner le problème et trouver les pistes à creuser dans le développement, en évitant les hors-sujets.

**Cible l'essentiel.** Mieux vaut quelques séries décisives, qui font apparaître le problème, que l'inventaire de tout ce qu'évoque chaque mot. Le réseau pourra être enrichi ensuite, terme par terme ou concept par concept : laisse de côté les pistes secondaires.

**Séries de liens.** Pour chaque terme clé du sujet, déploie des séries de liens (chaînes d'associations d'idées) qui partent du terme et remontent vers des concepts forts ou classiques, pertinents pour traiter le sujet. Chaque série est une piste de réflexion. C'est à travers ces séries que les différents sens du terme, les distinctions et les oppositions apparaissent, pas comme des listes séparées.

**Forme du schéma** (carte mentale, `"kind": "mindmap"`, ouverte des deux côtés, `"direction": "both"`) :
- **Racine** : le sujet, mot pour mot (type `question`).
- **Premier niveau** : une **citation exacte** de chaque terme ou expression clé du sujet, entre guillemets « … » (type `concept`, sans relation). Pour une expression composée (« faire ce qu'on veut »), ses premières branches reprennent ses mots-clés exacts, eux aussi entre guillemets (« faire », « veut »). Ce n'est qu'à partir de ces mots-clés qu'apparaissent les concepts philosophiques.
- **Séries** : chaque concept est l'enfant du précédent dans la chaîne. Déclare dans le vocabulaire une relation `leadsTo` (« conduit à », `"direction": "toChild"`) pour les liens d'association (→) ; utilise `opposes` pour une opposition (≠) ; une distinction est un élément de type `distinction` dont le texte a la forme « A / B » (« liberté d'action / liberté de la volonté »), relié par `leadsTo`.
- **Pistes** : au bout de chaque série, ajoute un élément de type `question`, relié par `raises`, qui dit en une ou deux phrases ce que cette piste éclaire dans le sujet, de préférence sous forme de question ou de tension (« Vouloir ce qu'on désire, est-ce vouloir ce que la raison approuve ? »).
- **Jamais de répétition** : un concept n'apparaît qu'une fois. S'il ouvre plusieurs pistes, celles-ci sont ses enfants. Quand une même idée rejoint une autre série (la « volonté » sous « la liberté » et sous « veut »), relie-les par un lien (`link`, relation `relates`) au lieu de la dupliquer : c'est ce qui fait du schéma un réseau.
- **Boîtes courtes** : le concept seul (un mot, une expression), la distinction « A / B », sans définition ni explication : ici, cette consigne prime sur la règle générale d'une boîte explicite. C'est la piste, au bout de la série, qui explique. Une définition utile peut aller dans la note, brièvement.

Pour chaque terme, retiens d'abord ce qui compte le plus pour le problème (le sens courant décisif, l'opposition ou la distinction classique qui fait débat). L'exploration part toujours des termes précis de la question, pas des notions du programme. Évite toute remarque creuse ou triviale.

Exemple de forme (pas de taille : à la création, on en retiendrait moins), pour « La liberté revient-elle à faire ce qu'on veut ? » (en notation compacte : → conduit à, ≠ s'oppose à, ↳ piste) :

```
« la liberté »
  → volonté → autonomie → loi morale
    ↳ L'autonomie : obéir à la loi qu'on se donne, est-ce encore faire ce qu'on veut ?
  → liberté d'action / liberté de la volonté
    ↳ On peut être libre de faire sans être libre de vouloir (et inversement).
  ≠ nécessité → contingence
    ↳ Cadre le débat entre déterminisme et libre arbitre.
« faire ce qu'on veut »
  « faire » → action → puissance d'agir
    ↳ La liberté se réduit-elle à une capacité d'agir effective ?
  « veut »
    → volonté (lien vers la « volonté » de la première série) → désir
      ↳ Vouloir ce qu'on désire, est-ce vouloir ce que la raison approuve ?
    → caprice → arbitraire
      ↳ « Ce qu'on veut » peut n'être qu'un caprice : la liberté serait alors licence.
  → satisfaction → bonheur
    ↳ Si faire ce qu'on veut vise la satisfaction, la liberté se confond-elle avec le bonheur ?
```

## @create

**Taille** : une à deux séries par terme clé (trois au plus pour le terme central), chaque série de deux ou trois concepts avant sa piste, soit **quinze à vingt-cinq éléments en tout**. Les mots-outils du sujet (« revient-il à », « peut-on ») ne sont retenus comme termes que si leur analyse change le problème. Pas de note. Si une séquence est demandée, révèle d'abord le sujet, puis chaque terme avec ses séries, une série par étape, chaque piste avec sa série ; la narration aide la classe à voir le chemin d'un mot du sujet jusqu'au concept, sans répéter les boîtes. Dernière étape : vue d'ensemble, avec une narration qui dégage en deux ou trois phrases le problème que le réseau fait apparaître.

## @expand @enrich

Prolonge le réseau à partir de l'élément ou des termes visés, en suivant la demande de l'utilisateur s'il en a une. Sinon :
- à partir d'un **terme du sujet** : une ou deux nouvelles séries (→, ≠, distinctions) qui ouvrent des pistes encore absentes ;
- à partir d'un **concept** : prolonge sa série d'un ou deux concepts plus forts, ou ouvre à partir de lui une série parallèle (une opposition, une distinction) ;
- à partir d'une **piste** : approfondis-la par une distinction ou un concept qui permet de mieux la poser.

Chaque nouvelle série se termine par sa piste (`question`, relation `raises`). **Deux à six éléments en tout** : un développement ciblé, pas un nouvel inventaire. Ne répète aucun concept déjà présent dans le schéma : relie-le par un `link` s'il le faut.

## @review

Relis le schéma comme un réseau conceptuel de sujet de dissertation. Vérifie en particulier :
- que chaque série part d'une citation exacte d'un terme du sujet (et qu'aucun terme clé n'est oublié) ;
- que les liens sont justes (une opposition marquée comme association, une distinction mal formée) ;
- qu'aucun concept n'est répété au lieu d'être relié ;
- que chaque série aboutit à une piste qui éclaire vraiment le sujet, sans remarque creuse ni hors-sujet ;
- qu'aucun nom d'auteur ou de courant n'apparaît à ce stade.
