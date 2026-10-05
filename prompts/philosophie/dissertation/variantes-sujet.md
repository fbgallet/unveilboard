---
title: Variantes d'un sujet
description: Transformer un sujet (modalité, termes, portée, renversement, présupposé) pour voir comment le problème se déplace.
tasks: [create, expand, enrich]
placeholder: "Le sujet de départ, par exemple : « Le travail est-il une contrainte ? »"
order: 3
---
La demande de l'utilisateur est un sujet de dissertation de philosophie (niveau Terminale). Il s'agit d'en proposer des **variantes**, pour faire voir aux élèves comment un léger changement de formulation déplace le problème, et pour s'entraîner à repérer ce qu'un sujet engage précisément.

**Types de transformations** (choisis ceux qui sont féconds pour ce sujet) :
- **changer la modalité** : question de fait, de possibilité, de droit ou d'obligation (« est-il », « peut-il », « faut-il », « doit-on ») ;
- **remplacer un terme** par un terme voisin, plus précis, plus large ou opposé (« contrainte » → « servitude », « obligation », « liberté ») ;
- **restreindre ou élargir la portée** : quantificateur (« seulement », « toujours », « tout »), précision d'un domaine, singulier ou pluriel ;
- **renverser** la question : en inverser les termes, la mettre à la forme négative ;
- **expliciter un présupposé** pour en faire le sujet lui-même ;
- **ouvrir ou fermer** la question : passer d'une question fermée (« X est-il Y ? ») à une question ouverte (« Qu'est-ce que… », « Pourquoi… ») ou inversement.

**Forme du schéma** (carte mentale, `"kind": "mindmap"`, ouverte des deux côtés, `"direction": "both"`) :
- **Racine** : le sujet de départ, mot pour mot (type `question`).
- **Têtes de branches** : un type de transformation chacune, formulé explicitement (« **Modalité** : du fait au droit »).
- Sous chaque tête, deux à quatre **variantes** (type `question`), chacune formulée comme un vrai sujet de bac : courte, claire, sans jargon ni nom d'auteur. Dans sa **note**, une ou deux phrases disent comment le problème se déplace par rapport au sujet de départ (ce qui devient central, ce qui disparaît).
- Relie par un lien (`link`, relation `relates`) deux variantes de branches différentes qui aboutissent au même problème.
- Ne propose que des sujets qui posent un vrai problème philosophique, pas de simples reformulations. Ne prétends jamais qu'un sujet a été donné au baccalauréat.

## @create

Si une séquence est demandée : le sujet de départ, puis chaque transformation avec ses variantes, en invitant la classe à chercher ce qui change avant de le dire (la narration peut poser la question : « Qu'est-ce que cette variante oblige à penser que le sujet de départ laissait de côté ? »).

## @expand @enrich

À partir de la variante ou de la transformation visée : de nouvelles variantes de même type, ou des variantes de cette variante, chacune avec sa note sur le déplacement du problème. Aucune variante ne doit répéter une variante déjà présente.
