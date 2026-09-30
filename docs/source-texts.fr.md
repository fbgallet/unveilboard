# Textes source

[English](source-texts.md) · **Français**

Un schéma vient souvent d'un texte : un cours, un texte d'auteur, un document. Unveilboard garde le texte **à côté du schéma** et relie chaque élément aux **passages dont il vient**, que vous construisiez le schéma à la main ou avec une IA. On voit d'un coup d'œil ce que le schéma dit du texte, et où.

## La barre du texte source

- **L'ouvrir** : bouton discret en forme de page, en haut à droite du canevas, à côté de ✦. Elle s'ouvre d'elle-même pour un schéma créé depuis un texte, et « Voir dans le texte » (panneau de droite, sous l'extrait d'un élément) l'ouvre sur ce passage.
- **Un texte par page**, gardé dans le document. Il est affiché mis en forme (Markdown : titres, gras, italique, citations, listes ; un retour à la ligne est gardé). A− et A+ règlent la taille du texte ; la barre se redimensionne.
- **Les passages cités sont surlignés** à la couleur de leur élément (extraits, et texte des citations). Ceux des éléments sélectionnés ressortent, et le texte défile jusqu'à eux.
- **Cliquer sur un passage** recentre le schéma sur ses éléments (le bouton de sélection de l'en-tête les sélectionne aussi) et affiche une petite croix qui retire le surlignement : le passage quitte les extraits de l'élément. Le clic droit liste les éléments qui citent le passage, pour en sélectionner un ou retirer son surlignement.

## Associer un texte à une page

N'importe quelle page peut recevoir un texte, qu'elle ait déjà un schéma ou non :

- le coller, ou le lire d'un fichier (texte, Markdown, ou PDF avec une couche de texte) ;
- sur une nouvelle page, reprendre en un clic le texte d'une autre page ;
- « Modifier » l'ouvre dans l'éditeur Markdown (barre d'outils et raccourcis usuels : Ctrl/⌘ + B, I, K, E ; + Maj : X, 7, 8, 9 ; + Alt : 1 à 3), et « Retirer le texte » l'enlève (les éléments gardent leurs extraits).

À l'association et à chaque modification, **les extraits de la page sont revérifiés** : un extrait devenu introuvable est marqué « à vérifier », un extrait retrouvé perd cette marque.

## Construire le schéma à partir du texte, à la main

Sélectionnez un passage dans la barre : une petite barre propose ce qu'on en fait.

- **Nouvel élément** : une boîte dont le texte est le passage, qui en est aussi l'extrait, placée sans recouvrir les autres formes.
- **Nouvel enfant** de l'élément sélectionné (sa relation se choisit ensuite).
- **Extrait de l'élément** sélectionné sur le schéma, ou **Ajouter à ses extraits** s'il en a déjà : un élément peut citer **plusieurs passages**, gardés dans l'ordre du texte (« A […] B »). Le bas de la barre les liste pour l'élément sélectionné, chacun avec ✕ pour le retirer.
- **IA…** : ouvre « ✦ IA » sur l'élément sélectionné, avec une demande préremplie par le passage.

## L'IA et le texte de la page

Le bouton ✦ de la barre rassemble ce qu'une IA peut faire à partir du texte de la page : en créer un nouveau schéma, enrichir le schéma, le structurer avec un plan, écrire la séquence en suivant le texte, relire sa fidélité au texte. Plus généralement, quand une page a un texte, « Créer ou modifier le schéma », « ✦ IA… » à partir d'un élément, la relecture critique et le plan **s'appuient dessus** (« S'appuyer sur le texte source de la page », coché par défaut) : l'IA le cite exactement, et les extraits qu'elle ajoute sont cherchés dans le texte (introuvables : « à vérifier »).

## Créer un schéma depuis un texte avec une IA



**Schéma riche depuis un texte** (case de la même fenêtre, recommandée pour un texte long ou dense) : le texte est découpé en paragraphes numérotés, et l'IA propose d'abord un plan dont chaque section analyse une plage de paragraphes (modifiable). Chaque section ne reçoit ensuite que son passage, et ses extraits sont vérifiés de la même façon. On peut tout générer d'un coup, ou construire le schéma section par section avec le panneau du plan, en suggestions à accepter ou écarter : voir [Travailler avec une IA](ai.fr.md).

## Comment les passages sont retrouvés

Les passages sont retrouvés à chaque affichage, avec les mêmes tolérances que le contrôle des extraits : apostrophes et guillemets typographiques, césures de fin de ligne, espaces, casse, coupures « […] », et marques Markdown (mettre le texte en forme ne casse donc pas les liens). Un passage introuvable n'est simplement pas surligné ; son élément garde son extrait, marqué « à vérifier ». Le panneau de droite montre la provenance de l'élément sélectionné (« Tiré du texte » avec son extrait, ou « Reconstruction ») et permet de le marquer comme vérifié.

## Calques

Pour un texte riche en passages, le bouton des calques (trois plans superposés, sur demande) affiche ou masque des groupes de passages :

- **calques automatiques** : selon la fonction de l'élément dans une carte d'argument (justification, objection, réponse…), sinon selon son type (concept, citation, exemple…) ;
- **calques libres** (« Mes calques ») : on les crée et les nomme, puis on y range des éléments (menu « Calque » en bas de la barre, quand un élément est sélectionné). Un calque regroupe des passages ; chacun garde la couleur de son élément. Le **calque actif** reçoit les éléments créés depuis un passage.

Quand des passages de calques différents se recouvrent, chacun garde son propre soulignement.

## Présenter et partager

- **En présentation**, la barre suit les étapes, en lecture seule : seuls les passages des éléments déjà dévoilés sont surlignés, et ceux de l'étape en cours ressortent. Elle s'affiche au lancement si le schéma le demande (carte « Départ » du panneau des étapes : « Afficher le texte source au lancement de la présentation », non par défaut), et le menu « Plus » l'affiche ou la masque.
- **Partage** : le texte n'est inclus que si l'on coche « Inclure le texte source » dans la fenêtre de partage ; le lecteur peut alors l'afficher à côté de la présentation. Le plan de l'IA n'est jamais partagé.

## Limites

- Les calques ne font pas encore partie de l'export JSON.
- Dans un plan tiré d'un texte, modifier le texte (ajouter ou retirer des paragraphes) décale la numérotation utilisée par les sections qui restent à développer.
