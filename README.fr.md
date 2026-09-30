# Unveilboard

*Montrez vos schémas étape par étape. Construit avec [tldraw](https://tldraw.dev).*

[English](README.md) · **Français**

![Un schéma du cycle de l'eau dévoilé étape par étape, avec sa narration](docs/demo.gif)

Unveilboard transforme un canevas tldraw en présentation progressive. Au lieu de montrer tout un schéma d'un coup, vous le dévoilez étape par étape, avec un texte d'accompagnement à côté. Il a été pensé pour l'enseignement : un public suit mieux un raisonnement quand le schéma se construit sous ses yeux.

Vous travaillez sur un texte ? Construisez le schéma à partir de lui : le texte reste à côté du schéma, et chaque élément est relié aux passages dont il vient.

**Essayer :** [unveilboard.com](https://unveilboard.com). Sans compte ; vos schémas restent dans votre navigateur.

> Unveilboard n'est pas affilié à tldraw Inc. ni approuvé par elle. « tldraw » est une marque de tldraw Inc.

## Ce qu'il fait

**Dévoiler un schéma pas à pas.** Chaque étape fait apparaître, atténue, cache ou surligne des formes, déplace la caméra et affiche sa narration. Présentez au clavier ou à la télécommande, avec un pointeur laser, une fenêtre pour le vidéoprojecteur et une télécommande sur téléphone. → [Présenter](docs/presenting.fr.md)

**Le construire à partir d'un texte.** Collez un texte ou ouvrez un fichier : il reste dans une barre latérale, ses passages cités surlignés aux couleurs de leurs éléments, jusque dans la présentation. Sélectionnez un passage pour en faire un élément, ou le relier à un élément existant. → [Textes source](docs/source-texts.fr.md)

**S'aider d'une IA, si vous voulez.** La vôtre (par une consigne copiée ou votre clé OpenRouter), un modèle local, ou celle de l'instance : créer, enrichir, séquencer ou relire un schéma, ou en construire un riche section par section à partir d'un plan. Les réponses sont contrôlées, et les extraits cherchés dans le texte. → [Travailler avec une IA](docs/ai.fr.md)

## En bref

- **Schémas** : arbres, cartes mentales et cartes d'argument sur des formes tldraw ordinaires, avec types d'éléments et relations (la forme dit le type, la couleur la fonction). → [Construire des schémas](docs/diagrams.fr.md), [Construire une carte d'argument](docs/argument-maps.fr.md)
- **Présentation** : étapes et caméra, narration et notes d'objet, vue d'ensemble, calque de masquage, légende, raccourcis. → [Présenter](docs/presenting.fr.md)
- **En classe** : une fenêtre public pour le vidéoprojecteur, une télécommande sur téléphone, un polycopié à imprimer. → [En classe](docs/presenting.fr.md#en-classe)
- **Partage** : un lien en lecture seule, un lien court avec QR code à projeter, le texte source si vous choisissez de l'inclure. → [Partage en lecture seule](docs/presenting.fr.md#partage-en-lecture-seule)
- **Fichiers et formats** : fichiers `.tldr` (tenus à jour avec un fichier dans Chrome et Edge), un format JSON documenté pour les schémas et les modifications. → [Le format JSON des schémas](docs/map-format.fr.md)
- Interface en **anglais et en français**, mode sombre.

## Démarrer

```bash
pnpm install
pnpm dev
```

C'est tout pour le mode local : pas de base de données, pas de mot de passe, les schémas restent dans le navigateur. Pour mettre en ligne sur Vercel, renseignez `TLDRAW_LICENSE_KEY` ; pour le mode cloud (Postgres, mot de passe), le partage public et l'IA de l'instance, voir [Héberger Unveilboard](docs/self-hosting.fr.md).

## Documentation

| | |
|---|---|
| [Présenter](docs/presenting.fr.md) | Étapes, caméra, narration, raccourcis, classe, polycopié, partage |
| [Textes source](docs/source-texts.fr.md) | Le texte à côté du schéma, passages, construire à partir d'un texte, calques |
| [Travailler avec une IA](docs/ai.fr.md) | Fournisseurs, tâches, schémas riches, relecture critique |
| [Construire des schémas](docs/diagrams.fr.md) | Arbres, cartes d'argument, préréglages de styles, fichiers |
| [Construire une carte d'argument](docs/argument-maps.fr.md) | Types d'éléments et relations, avec des exemples |
| [Le format JSON des schémas](docs/map-format.fr.md) | Schémas, modifications et relectures en JSON |
| [Héberger Unveilboard](docs/self-hosting.fr.md) | Modes de stockage, mise en ligne, réglages, sauvegarde et synchronisation |
| [Architecture](docs/architecture.fr.md) | Organisation du code, tests, langues |

## Contribuer

Les contributions sont les bienvenues : voir [CONTRIBUTING.md](CONTRIBUTING.md). Ce projet suit le [Contributor Covenant](CODE_OF_CONDUCT.md). Pour signaler une vulnérabilité, voir [SECURITY.md](SECURITY.md). Les changements sont listés dans [CHANGELOG.md](CHANGELOG.md).

## Licence

Le code d'Unveilboard est publié sous [licence MIT](LICENSE). Les fichiers de la police Source Serif 4 dans `assets/fonts/` (utilisés pour les images d'aperçu des liens) sont sous [SIL Open Font License](assets/fonts/OFL.txt).

Il dépend du SDK tldraw, qui a sa propre [licence](https://tldraw.dev/community/license) : tout déploiement en production demande une clé de licence tldraw. Une licence « hobby » gratuite existe pour un usage non commercial ; elle affiche un filigrane « made with tldraw ».
