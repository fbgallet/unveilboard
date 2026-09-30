# Héberger Unveilboard

[English](self-hosting.md) · **Français**

Faire tourner Unveilboard en local ou sur votre serveur : les deux modes de stockage, l’installation, la mise en ligne sur Vercel, les services facultatifs, la sauvegarde et la synchronisation.

## Deux modes de stockage

Le mode dépend de la présence de `DATABASE_URL` :

- **Mode local** (sans `DATABASE_URL`) : aucun serveur de données ni mot de passe. Les schémas sont enregistrés dans le navigateur de chacun (IndexedDB). « Enregistrer sous… » (panneau des étapes ou menu ☰ › Fichier) crée un fichier `.tldr`, séquence comprise ; « Ouvrir un fichier .tldr… » (accueil ou menu ☰ › Fichier), ou un glisser-déposer sur l'accueil, le rouvre comme nouveau schéma. Idéal pour partager l'app par une simple URL.
- **Mode cloud** (avec `DATABASE_URL`) : les schémas sont enregistrés sur Postgres (par exemple [Neon](https://neon.tech)), accessibles depuis tous vos appareils, et l'accès est protégé par mot de passe. Pensé pour une instance personnelle pour l'instant : il n'y a pas encore de comptes.

## Démarrage en local

Le mode local ne demande aucune configuration :

```bash
pnpm install
pnpm dev
```

Si votre `.env.local` définit `DATABASE_URL` (mode cloud), `pnpm dev:local` démarre quand même en mode local, comme l'instance publique.

Mode cloud, avec un Postgres local (par exemple Postgres.app) :

```bash
pnpm install
createdb unveilboard
cp .env.example .env.local   # puis renseigner DATABASE_URL, APP_PASSWORD, SESSION_SECRET
pnpm db:migrate
pnpm dev
```

## Mise en ligne (Vercel)

- **Mode local** : importer le dépôt dans Vercel et définir `TLDRAW_LICENSE_KEY`. C'est tout.
- **Mode cloud** :
  1. Créer une base Postgres (par exemple Neon).
  2. Appliquer les migrations avec l'URL de connexion **directe** (non « pooled »), entre guillemets simples car elle contient des `&` :
     `DATABASE_URL='postgresql://…/neondb?sslmode=require' pnpm db:migrate`
     Ensuite, chaque déploiement applique les nouvelles migrations avant la compilation (`scripts/migrate.mjs`), avec `DATABASE_URL_UNPOOLED` si elle est définie (l'intégration Neon pour Vercel la pose), sinon `DATABASE_URL`. `SKIP_DB_MIGRATE=1` désactive cette étape.
  3. Sur Vercel, définir `DATABASE_URL` (l'URL **pooled**, hôte en `-pooler`), `APP_PASSWORD`, `SESSION_SECRET` (`openssl rand -base64 48`) et `TLDRAW_LICENSE_KEY`.
  4. Optionnel : créer un store Vercel Blob (`BLOB_READ_WRITE_TOKEN`) pour stocker les images hors du document.

`TLDRAW_LICENSE_KEY` est lue à l'exécution : la changer ne demande pas de redéploiement. Sans clé valide pour votre domaine (`www.` compris, s'il est utilisé), tldraw masque l'éditeur quelques secondes après son chargement.

Services et réglages facultatifs (détails dans `.env.example`) :

| Variables | Rôle |
|---|---|
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis : partage public sur une instance en mode local |
| `SHARING=off`, `SHARE_BLOCKLIST` | Arrêter les publications ; termes refusés en plus |
| `RESEND_API_KEY`, `REPORT_EMAIL`, `REPORT_FROM` | Signalements et formulaire de contact, envoyés par e-mail |
| `LEGAL_PUBLISHER`, `LEGAL_LINKS`, `LEGAL_HOST` | Page mentions légales et confidentialité (`/legal`) ; sans `LEGAL_PUBLISHER`, pas de page |
| `OPENROUTER_API_KEY` (ou `AI_BASE_URL`, `AI_API_KEY`), `AI_MODEL`, `AI_MAX_TOKENS`, `AI_JSON_MODE` | IA de l’instance, côté serveur (mode cloud ; en mode local seulement avec `AI_PUBLIC=on` et Upstash, avec des limites par adresse IP ; toujours, sans limite, en développement). Voir [Travailler avec une IA](ai.fr.md) |
| `SITE_URL` | Adresse des aperçus de lien (par défaut `https://unveilboard.com`) |

Le site envoie une politique de sécurité du contenu (CSP, `src/proxy.ts`) : si vous ajoutez un script, une police ou une iframe d'une autre origine, autorisez-la là. Modèle de sécurité : voir [SECURITY.md](../SECURITY.md) (en anglais).

## Sauvegarde et synchronisation

- Le stockage passe par une interface commune, `DocumentStore` (`src/lib/storage/`) : `cloud.ts` (routes `/api/documents`, Postgres) ou `local.ts` (IndexedDB).
- Chaque document a un cache local (IndexedDB, via `persistenceKey`) : ouverture instantanée, travail hors ligne.
- Les modifications sont enregistrées ~1 s après la dernière action (`src/lib/sync/documentSync.ts`), sous forme d'instantané tldraw (`jsonb` sur le serveur).
- Verrouillage optimiste : si le document a été modifié ailleurs entre-temps, l'enregistrement est refusé et un bandeau propose de charger l'autre version ou de garder la sienne. Les modifications locales écartées sont copiées dans `localStorage` (`backup:<id>`).
- Plusieurs onglets sur le même document : tldraw les synchronise, et un seul d'entre eux (verrou du navigateur) enregistre pour tous. Il n'y a donc pas de conflit entre onglets.
- Au retour sur l'onglet, une version plus récente enregistrée ailleurs est chargée automatiquement.

En mode cloud, l'accès est protégé par un mot de passe unique (`APP_PASSWORD`) et un cookie de session signé : suffisant pour un usage personnel, à remplacer par de vrais comptes avant d'ouvrir le mode cloud à d'autres utilisateurs.
