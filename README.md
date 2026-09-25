# Schémas animés

Présentation progressive de schémas sur un canevas tldraw : chaque étape fait apparaître, atténue, cache ou surligne des objets, déplace la caméra et affiche un texte de narration.

## Démarrage en local

Prérequis : Postgres local (ex. Postgres.app).

```bash
pnpm install
createdb animated_tldraw
cp .env.example .env.local   # puis renseigner DATABASE_URL, APP_PASSWORD, SESSION_SECRET
pnpm db:migrate
pnpm dev
```

## Mise en ligne (Vercel + Neon)

1. Créer un projet Neon et copier l'URL de connexion **pooled** (hôte en `-pooler`).
2. Appliquer le schéma sur Neon, **avec l'URL entre guillemets simples** (elle contient des `&`) :
   `DATABASE_URL='postgresql://…-pooler…/neondb?sslmode=require' pnpm db:migrate`
3. Sur Vercel, définir les variables : `DATABASE_URL`, `APP_PASSWORD`, `SESSION_SECRET` (`openssl rand -base64 48`), `NEXT_PUBLIC_TLDRAW_LICENSE_KEY`.
4. Optionnel : créer un store Vercel Blob (ajoute `BLOB_READ_WRITE_TOKEN`) pour stocker les images hors du document.

## Sauvegarde

- Chaque document a un cache local (IndexedDB, via `persistenceKey`) : ouverture instantanée, travail hors ligne.
- Les modifications sont envoyées au serveur ~1 s après la dernière action (`src/lib/sync/cloudSync.ts`), sous forme d'instantané tldraw stocké en `jsonb`.
- Verrouillage optimiste : si le document a été modifié sur un autre appareil entre-temps, le serveur refuse (409) et un bandeau propose de charger la version en ligne ou de garder la sienne. Les modifications locales écartées sont copiées dans `localStorage` (`backup:<id>`).
- Au retour sur l'onglet, une version plus récente enregistrée ailleurs est chargée automatiquement.

L'accès est protégé par un mot de passe unique (`APP_PASSWORD`) et un cookie de session signé : suffisant pour un usage personnel, à remplacer par de vrais comptes avant une ouverture au public.

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

## Raccourcis en présentation

`→` / `Espace` / `PageDown` suivant · `←` / `PageUp` précédent · `Début` / `Fin` · `O` vue d'ensemble · `C` recentrer · `K` laser · `N` narration · `F` plein écran · `Échap` quitter (le premier Échap désactive le laser)

Le cadenas de la barre de présentation déverrouille le document : l'interface tldraw réapparaît et seules `PageUp` / `PageDown` naviguent entre les étapes.
