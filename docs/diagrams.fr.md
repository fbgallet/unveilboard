# Construire des schémas

[English](diagrams.md) · **Français**

Arbres, cartes mentales et cartes d’argument sur des formes tldraw ordinaires ; préréglages de styles (types d’éléments et relations) ; fichiers et formats. Pour construire une carte d’argument, voir aussi [Construire une carte d’argument](argument-maps.fr.md).

## Arbres

Sélectionner une boîte : <kbd>Tab</kbd> ajoute un enfant (et commence un arbre), <kbd>Entrée</kbd> ajoute un frère. Pendant la saisie d'un nœud, <kbd>Entrée</kbd> valide (<kbd>Maj</kbd>+<kbd>Entrée</kbd> : saut de ligne) et <kbd>Tab</kbd> enchaîne sur un enfant.

- La mise en page est automatique ; un nœud déplacé à la main garde son décalage (et entraîne sa branche). « Réorganiser » efface les décalages.
- Orientation : vers la droite, la gauche, le bas, le haut, ou des deux côtés (carte mentale équilibrée : un nouvel enfant de la racine va du côté le moins chargé, et une branche glissée de l'autre côté de la racine y reste).
- Replier une branche la masque en édition : pastille « − » sur un nœud sélectionné ou survolé, « +n » pour la rouvrir. L'état replié du document est l'état de départ de la présentation ; les actions « Replier / Déplier la branche » le changent en cours de séquence. Replier ne déplace rien : la place de la branche reste réservée.
- Supprimer un nœud supprime sa branche (annulable).
- **Cases à cocher** : clic droit sur des boîtes › « Ajouter une case à cocher ». Un clic sur la case la coche (le texte est barré), en édition comme en présentation ; pas dans un lien partagé ni sur l'écran de projection.
- **Carte d'argument** (bouton « Carte d'argument ») : la boîte sélectionnée devient la thèse à discuter (étiquette « Thèse »). <kbd>Tab</kbd> propose ce qu'on lui ajoute (Justification · soutient, Objection · objecte…) (touches 1 à 9 puis a, b…, 0 sans relation). La branche prend le style et le sens de la relation (par défaut vers le parent : « la prémisse soutient la thèse » ; vers l'enfant pour implique, présuppose, soulève), et le nouveau nœud le type associé (Exemple pour « illustre », Présupposé pour « présuppose »…). <kbd>Entrée</kbd> ajoute un frère avec la même relation.
- Dans un arbre argumentatif, **la forme dit le type, la couleur dit la fonction** : un nœud relié prend la couleur de sa relation (trait et fond pâle) et son étiquette affiche sa fonction seule (Justification, Objection, Réfutation, Réponse, Explication, Implication, Présupposé, Exemple, Définition, Difficulté, Distinction). Le vert est réservé au soutien.

## Préréglages de styles

Pour construire une carte d'argument pas à pas, voir le guide [Construire une carte d'argument](argument-maps.fr.md) : types d'éléments, relations, définitions et exemples.

Des styles nommés, en tête du panneau de styles : des **types d'éléments** pour les formes (Énoncé, Présupposé, Fait, Concept, Distinction, Question, Difficulté, Exemple, Citation) et des **relations** pour les flèches (soutient, objecte, réfute, répond à, explique, implique, présuppose, illustre, définit, soulève, et entre concepts : se distingue de, s'oppose à, se rapproche de). Une flèche de soutien ou d'objection peut préciser son type de raisonnement (déduction, induction, analogie…). Ce ne sont que des propriétés tldraw ordinaires (géométrie, couleur, trait…), plus une marque `meta.preset`.

- Un clic applique le préréglage aux formes ou flèches sélectionnées ; sans sélection, un type arme l'outil de formes : la prochaine forme tracée la reçoit.
- Chaque type a sa géométrie (Concept : ovale, Question : losange, Difficulté : hexagone, Présupposé : nuage, Fait : parallélogramme, Citation : sans cadre, en serif, avec guillemets…) et une étiquette au-dessus de la forme (« ÉNONCÉ · Hobbes », avec la modalité en pastille : descriptif / normatif) : source (auteur, théorie, position) et modalité se saisissent dans le panneau de droite. Les étiquettes sont dessinées par l'application : sans elle, le schéma garde ses formes et ses couleurs.
- Communs à tous les schémas : table `settings` en mode cloud, IndexedDB en mode local. Chaque schéma garde une copie des préréglages qu'il utilise, pour rester lisible ailleurs (et dans les liens partagés).
- Menu ☰ › Styles et types d’éléments › « Préréglages de styles… » : renommer, réordonner, forme et étiquette des types, sens et type de l'enfant des relations, mettre à jour ou créer d'après la sélection, masquer un préréglage (case à cocher : il reste utilisable dans les schémas existants), masquer la palette ou les étiquettes, revenir aux préréglages de départ.
- En présentation, <kbd>L</kbd> affiche la légende des types et relations utilisés.

## Fichiers et formats

- **Fichiers** : enregistrer et ouvrir des fichiers `.tldr`. La séquence est stockée dans le document tldraw : un fichier `.tldr` la garde. Sur Chrome et Edge, un schéma ouvert depuis un fichier, ou enregistré dans un fichier, reste lié à lui : chaque modification y est écrite automatiquement (<kbd>Ctrl/⌘</kbd>+<kbd>S</kbd> enregistre aussitôt). On peut ainsi travailler directement sur un fichier d'un dossier synchronisé (Google Drive, Dropbox, iCloud Drive, OneDrive). Un fichier modifié ailleurs est rechargé au retour sur l'onglet, et jamais écrasé sans le demander ; rouvrir un fichier lié rouvre son schéma au lieu d'en créer un doublon.
- **Listes** : une liste collée sur le canevas (à puces, numérotée ou indentée, copiée de Roam, Logseq, Obsidian, Workflowy…) devient une carte mentale, cases à cocher comprises ; collée sur une boîte (sélectionnée, ou pendant la saisie de son texte), elle peut en devenir les branches, ou rester du texte. ☰ › Fichier › « Importer une liste, du Markdown ou du JSON… » accepte aussi le Markdown à titres et les fichiers `.md`, `.txt` ou `.opml`. « Copier en liste (Markdown) » fait l'inverse, pour toute la page ou la sélection.
- **Format JSON** : exporter un schéma en JSON (types, relations, arbres, séquence, tout nommé), ou le copier pour une IA ; importer un schéma JSON écrit à la main, par une IA ou par un autre outil, mis en page automatiquement. Voir [Le format JSON des schémas](map-format.fr.md).

## Exemples

- **Exemples** sur l'accueil (un arbre argumentatif, Kant et Constant sur le mensonge, en français ou en anglais ; le cycle de l'eau en anglais ; la liberté en français), et une aide des raccourcis en présentation (<kbd>?</kbd>).
