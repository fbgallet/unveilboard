# Unveilboard

*Show your diagrams step by step. Built with [tldraw](https://tldraw.dev).*

Présentation progressive de schémas sur un canevas tldraw : chaque étape fait apparaître, atténue, cache ou surligne des objets, déplace la caméra et affiche un texte de narration.

> Unveilboard n'est pas affilié à tldraw ni approuvé par tldraw Inc. « tldraw » est une marque de tldraw Inc.

## Deux modes de stockage

Le mode dépend de la présence de `DATABASE_URL` :

- **Mode local** (sans `DATABASE_URL`) : aucun serveur de données ni mot de passe. Les schémas sont enregistrés dans le navigateur de chacun (IndexedDB). « Enregistrer sous… » (panneau des étapes ou menu ☰ d'un schéma) crée un fichier `.tldr`, séquence comprise ; « Ouvrir un fichier .tldr… » (accueil ou menu ☰), ou un glisser-déposer sur l'accueil, le rouvre comme nouveau schéma. Idéal pour partager l'app par une simple URL.
- **Mode cloud** (avec `DATABASE_URL`) : les schémas sont enregistrés sur Postgres (Neon), accessibles depuis tous vos appareils, et l'accès est protégé par mot de passe.

## Démarrage en local

Mode local : `pnpm install && pnpm dev`, rien d'autre à configurer.

Mode cloud, avec un Postgres local (ex. Postgres.app) :

```bash
pnpm install
createdb animated_tldraw
cp .env.example .env.local   # puis renseigner DATABASE_URL, APP_PASSWORD, SESSION_SECRET
pnpm db:migrate
pnpm dev
```

## Mise en ligne (Vercel + Neon)

En mode local, seul `NEXT_PUBLIC_TLDRAW_LICENSE_KEY` est nécessaire sur Vercel. En mode cloud :

1. Créer un projet Neon et copier l'URL de connexion **pooled** (hôte en `-pooler`).
2. Appliquer le schéma sur Neon (à refaire après chaque nouvelle migration dans `drizzle/`), **avec l'URL entre guillemets simples** (elle contient des `&`) :
   `DATABASE_URL='postgresql://…-pooler…/neondb?sslmode=require' pnpm db:migrate`
3. Sur Vercel, définir les variables : `DATABASE_URL`, `APP_PASSWORD`, `SESSION_SECRET` (`openssl rand -base64 48`), `NEXT_PUBLIC_TLDRAW_LICENSE_KEY`.
4. Optionnel : créer un store Vercel Blob (ajoute `BLOB_READ_WRITE_TOKEN`) pour stocker les images hors du document.

## Sauvegarde

- Le stockage passe par une interface commune, `DocumentStore` (`src/lib/storage/`) : `cloud.ts` (routes `/api/documents`, Postgres) ou `local.ts` (IndexedDB).
- Chaque document a un cache local (IndexedDB, via `persistenceKey`) : ouverture instantanée, travail hors ligne.
- Les modifications sont enregistrées ~1 s après la dernière action (`src/lib/sync/documentSync.ts`), sous forme d'instantané tldraw (`jsonb` sur le serveur).
- Verrouillage optimiste : si le document a été modifié ailleurs entre-temps, l'enregistrement est refusé et un bandeau propose de charger l'autre version ou de garder la sienne. Les modifications locales écartées sont copiées dans `localStorage` (`backup:<id>`).
- Plusieurs onglets sur le même document : tldraw les synchronise, et un seul d'entre eux (verrou du navigateur) enregistre pour tous. Il n'y a donc pas de conflit entre onglets.
- Au retour sur l'onglet, une version plus récente enregistrée ailleurs est chargée automatiquement.

En mode cloud, l'accès est protégé par un mot de passe unique (`APP_PASSWORD`) et un cookie de session signé : suffisant pour un usage personnel, à remplacer par de vrais comptes avant une ouverture au public.

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
- Replier une branche la masque en édition. L'état replié du document est l'état de départ de la présentation ; les actions « Replier / Déplier la branche » le changent en cours de séquence. Replier ne déplace rien : la place de la branche reste réservée.
- Supprimer un nœud supprime sa branche (annulable).

## Préréglages de styles

Des styles nommés (Énoncé, Concept, Question… ; soutient, objecte, réfute…), en tête du panneau de styles : un clic les applique aux formes ou aux flèches sélectionnées. Ce ne sont que des styles tldraw ordinaires, plus une marque `meta.preset`.

- Communs à tous les schémas : table `settings` en mode cloud, IndexedDB en mode local. Chaque schéma garde une copie des préréglages qu'il utilise, pour rester lisible ailleurs.
- Menu ☰ › « Préréglages de styles… » : renommer, réordonner, mettre à jour ou créer d'après la sélection, masquer la palette, revenir aux préréglages de départ.

## Détails dépliables

Sur une boîte sélectionnée, « + Détail » ajoute sous elle un texte qui la suit (position, largeur) et disparaît avec elle. Replié, il est masqué en édition (pastille « … » pour le déplier) ; en présentation, les actions « Déplier / Replier le détail » le font apparaître ou disparaître. Dans un arbre, sa place reste réservée.

## Raccourcis en présentation

`→` / `Espace` / `PageDown` suivant · `←` / `PageUp` précédent · `Début` / `Fin` · `O` vue d'ensemble · `C` recentrer · `K` laser · `N` narration · `F` plein écran · `Échap` quitter (le premier Échap désactive le laser)

Le cadenas de la barre de présentation déverrouille le document : l'interface tldraw réapparaît et seules `PageUp` / `PageDown` naviguent entre les étapes.
