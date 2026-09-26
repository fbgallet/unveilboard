# Unveilboard

*Show your diagrams step by step. Built with [tldraw](https://tldraw.dev).*

[English](README.md) · **Français**

Présentation progressive de schémas sur un canevas tldraw : chaque étape fait apparaître, atténue, cache ou surligne des objets, déplace la caméra et affiche un texte de narration.

> Unveilboard n'est pas affilié à tldraw ni approuvé par tldraw Inc. « tldraw » est une marque de tldraw Inc.

## Langues

L'interface existe en anglais et en français (sélecteur EN · FR sur l'accueil et la page de connexion) ; par défaut, elle suit la langue du navigateur, et le choix est mémorisé dans un cookie. L'interface de tldraw suit la même langue. Les textes sont dans `src/i18n/` : `en.ts` fait référence, et TypeScript signale toute clé manquante dans `fr.ts`. Le contenu des schémas n'est jamais traduit ; seules les valeurs par défaut suivent la langue (titres, préréglages de départ, exemple : la liberté en français, le cycle de l'eau en anglais).

## Deux modes de stockage

Le mode dépend de la présence de `DATABASE_URL` :

- **Mode local** (sans `DATABASE_URL`) : aucun serveur de données ni mot de passe. Les schémas sont enregistrés dans le navigateur de chacun (IndexedDB). « Enregistrer sous… » (panneau des étapes ou menu ☰ d'un schéma) crée un fichier `.tldr`, séquence comprise ; « Ouvrir un fichier .tldr… » (accueil ou menu ☰), ou un glisser-déposer sur l'accueil, le rouvre comme nouveau schéma. Idéal pour partager l'app par une simple URL.
- **Mode cloud** (avec `DATABASE_URL`) : les schémas sont enregistrés sur Postgres (Neon), accessibles depuis tous vos appareils, et l'accès est protégé par mot de passe.

## Démarrage en local

Mode local : `pnpm install && pnpm dev`, rien d'autre à configurer. Si votre `.env.local` définit `DATABASE_URL` (mode cloud), `pnpm dev:local` démarre quand même en mode local, comme l'instance publique.

Mode cloud, avec un Postgres local (ex. Postgres.app) :

```bash
pnpm install
createdb animated_tldraw
cp .env.example .env.local   # puis renseigner DATABASE_URL, APP_PASSWORD, SESSION_SECRET
pnpm db:migrate
pnpm dev
```

## Mise en ligne (Vercel + Neon)

En mode local, seul `TLDRAW_LICENSE_KEY` est nécessaire sur Vercel. En mode cloud :

1. Créer un projet Neon et copier l'URL de connexion **pooled** (hôte en `-pooler`).
2. Appliquer le schéma sur Neon (à refaire après chaque nouvelle migration dans `drizzle/`), **avec l'URL entre guillemets simples** (elle contient des `&`) :
   `DATABASE_URL='postgresql://…-pooler…/neondb?sslmode=require' pnpm db:migrate`
3. Sur Vercel, définir les variables : `DATABASE_URL`, `APP_PASSWORD`, `SESSION_SECRET` (`openssl rand -base64 48`), `TLDRAW_LICENSE_KEY`.
4. Optionnel : créer un store Vercel Blob (ajoute `BLOB_READ_WRITE_TOKEN`) pour stocker les images hors du document.

`TLDRAW_LICENSE_KEY` est lue à l'exécution : la changer ne demande pas de redéploiement. Sans clé valide pour votre domaine (`www.` compris, s'il est utilisé), tldraw masque l'éditeur quelques secondes après son chargement.

## Sauvegarde

- Le stockage passe par une interface commune, `DocumentStore` (`src/lib/storage/`) : `cloud.ts` (routes `/api/documents`, Postgres) ou `local.ts` (IndexedDB).
- Chaque document a un cache local (IndexedDB, via `persistenceKey`) : ouverture instantanée, travail hors ligne.
- Les modifications sont enregistrées ~1 s après la dernière action (`src/lib/sync/documentSync.ts`), sous forme d'instantané tldraw (`jsonb` sur le serveur).
- Verrouillage optimiste : si le document a été modifié ailleurs entre-temps, l'enregistrement est refusé et un bandeau propose de charger l'autre version ou de garder la sienne. Les modifications locales écartées sont copiées dans `localStorage` (`backup:<id>`).
- Plusieurs onglets sur le même document : tldraw les synchronise, et un seul d'entre eux (verrou du navigateur) enregistre pour tous. Il n'y a donc pas de conflit entre onglets.
- Au retour sur l'onglet, une version plus récente enregistrée ailleurs est chargée automatiquement.

En mode cloud, l'accès est protégé par un mot de passe unique (`APP_PASSWORD`) et un cookie de session signé : suffisant pour un usage personnel, à remplacer par de vrais comptes avant d'ouvrir le mode cloud à d'autres utilisateurs.

## Architecture

- `src/lib/sequence/` : modèle de séquence et calcul de l'état à une étape donnée. Données pures, sans dépendance à tldraw.
- `src/lib/canvas/adapter.ts` : seul point de contact entre le moteur de présentation et tldraw (lecture/écriture de la séquence dans `document.meta`, caméra, géométrie).
- `src/components/usePresentation.ts` : applique l'état calculé (classes CSS sur les formes), pilote la caméra et le clavier.
- `src/components/PresShapeWrapper.tsx` : enveloppe chaque forme rendue ; le document n'est jamais modifié pendant la présentation.
- `src/lib/tree/` et `src/lib/canvas/tree.ts` : arbres (cartes mentales) sur des formes tldraw ordinaires, reliées par des flèches marquées `meta.branch`. Sans ce module, le document reste un schéma tldraw normal.

La séquence est stockée dans le document tldraw : elle bénéficie de l'annuler/rétablir et de la persistance locale (IndexedDB).

## Arbres

Sélectionner une boîte : <kbd>Tab</kbd> ajoute un enfant (et commence un arbre), <kbd>Entrée</kbd> ajoute un frère. Pendant la saisie d'un nœud, <kbd>Entrée</kbd> valide (<kbd>Maj</kbd>+<kbd>Entrée</kbd> : saut de ligne) et <kbd>Tab</kbd> enchaîne sur un enfant.

- La mise en page est automatique ; un nœud déplacé à la main garde son décalage (et entraîne sa branche). « Réorganiser » efface les décalages.
- Orientation : vers la droite, la gauche, le bas, le haut, ou des deux côtés (carte mentale équilibrée : un nouvel enfant de la racine va du côté le moins chargé, et une branche glissée de l'autre côté de la racine y reste).
- Replier une branche la masque en édition. L'état replié du document est l'état de départ de la présentation ; les actions « Replier / Déplier la branche » le changent en cours de séquence. Replier ne déplace rien : la place de la branche reste réservée.
- Supprimer un nœud supprime sa branche (annulable).
- **Arbre argumentatif** (bouton « Argumentatif ») : <kbd>Tab</kbd> propose une relation (touches 1 à 9 puis a, b…, 0 sans relation). La branche prend le style et le sens de la relation (par défaut vers le parent : « la prémisse soutient la thèse » ; vers l'enfant pour implique, présuppose, soulève), et le nouveau nœud la nature associée (Exemple pour « illustre », Croyance fondamentale pour « présuppose »…). <kbd>Entrée</kbd> ajoute un frère avec la même relation.
- Dans un arbre argumentatif, **la forme dit la nature, la couleur dit la fonction** : un nœud relié prend la couleur de sa relation (trait et fond pâle) et son étiquette affiche sa fonction seule (Justification, Objection, Réfutation, Réponse, Explication, Implication, Présupposé, Exemple, Définition, Difficulté, Distinction). Le vert est réservé au soutien.

## Préréglages de styles

Des styles nommés, en tête du panneau de styles : des **natures** pour les formes (Énoncé, Croyance fondamentale, Concept, Question, Difficulté, Exemple, Citation) et des **relations** pour les flèches (soutient, objecte, réfute, répond à, explique, implique, présuppose, illustre, définit, soulève, distingue). Ce ne sont que des propriétés tldraw ordinaires (géométrie, couleur, trait…), plus une marque `meta.preset`.

- Un clic applique le préréglage aux formes ou flèches sélectionnées ; sans sélection, une nature arme l'outil de formes : la prochaine forme tracée la reçoit.
- Chaque nature a sa géométrie (Concept : ovale, Question : losange, Difficulté : hexagone, Croyance fondamentale : nuage, Citation : sans cadre, en serif, avec guillemets…) et une étiquette au-dessus de la forme (« ÉNONCÉ NORMATIF · Hobbes ») : auteur et modalité (descriptif / normatif) se saisissent dans le panneau de droite. Les étiquettes sont dessinées par l'application : sans elle, le schéma garde ses formes et ses couleurs.

- Communs à tous les schémas : table `settings` en mode cloud, IndexedDB en mode local. Chaque schéma garde une copie des préréglages qu'il utilise, pour rester lisible ailleurs.
- Menu ☰ › « Préréglages de styles… » : renommer, réordonner, forme et étiquette des natures, sens et nature de l'enfant des relations, mettre à jour ou créer d'après la sélection, masquer la palette ou les étiquettes, revenir aux préréglages de départ.
- En présentation, <kbd>L</kbd> affiche la légende des natures et relations utilisées.

## Notes d'objet

Le développement d'un objet (citation longue, explication) ne surcharge pas le schéma : il se rédige dans le panneau de droite (« Note de l'objet », même Markdown léger que la narration) et s'affiche dans le panneau de narration pendant la présentation, au double-clic sur l'objet (une marque ¶ signale les objets qui en ont une), ou à une étape avec l'action « Afficher la note ». Les « détails dépliables » des versions précédentes sont convertis en notes à l'ouverture du document.

## Raccourcis en présentation

`→` / `Espace` / `PageDown` suivant · `←` / `PageUp` précédent · `Début` / `Fin` · `O` vue d'ensemble · `C` recentrer · `K` laser · `N` narration · `+` / `−` / `0` taille du texte de la narration · `L` légende · `F` plein écran · `Échap` quitter (le premier Échap désactive le laser)

Le cadenas de la barre de présentation déverrouille le document : l'interface tldraw réapparaît et seules `PageUp` / `PageDown` naviguent entre les étapes.

## Licence

Code d'Unveilboard sous licence [MIT](LICENSE). Le SDK tldraw dont il dépend a sa propre [licence](https://tldraw.dev/community/license) : chaque déploiement en production nécessite une clé tldraw (gratuite pour un usage non commercial, avec le filigrane « made with tldraw »).
