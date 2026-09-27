# Unveilboard

*Show your diagrams step by step. Built with [tldraw](https://tldraw.dev).*

[English](README.md) · **Français**

![Un schéma du cycle de l'eau dévoilé étape par étape, avec sa narration](docs/demo.gif)

Unveilboard fait d'un canevas tldraw une présentation progressive. Au lieu de montrer un schéma d'un bloc, on le dévoile étape par étape : chaque étape fait apparaître, atténue, cache ou surligne des objets, déplace la caméra et affiche un texte de narration à côté du schéma.

L'app est née pour l'enseignement : on suit mieux un raisonnement quand le schéma se construit sous ses yeux, et on passe moins de temps à le recopier.

**Essayer :** [unveilboard.com](https://unveilboard.com). Sans compte ; vos schémas restent dans votre navigateur.

> Unveilboard n'est pas affilié à tldraw ni approuvé par tldraw Inc. « tldraw » est une marque de tldraw Inc.

## Fonctionnalités

- **Étapes** : faire apparaître, atténuer, cacher, rétablir, surligner ou mettre en avant des objets, avec des effets d'entrée (fondu, montée, tracé) ; replier ou déplier des branches d'arbre ; afficher une note d'objet.
- **Caméra à chaque étape** : suivre les nouveaux objets, montrer tout le schéma, ou ne pas bouger.
- **Panneau de narration** : un texte en Markdown pour chaque étape, à côté du schéma (redimensionnable, masquable), en dessous sur téléphone.
- **Mode présentation** : clavier et télécommande de présentation, vue d'ensemble et recentrage, pointeur laser (couleur, épaisseur et durée réglables), calque occultant tracé à la main, légende, et mode « déverrouillé » pour retoucher le schéma en pleine présentation.
- **En classe** : une fenêtre public pour le projecteur pendant que votre écran devient une vue présentateur, et une télécommande sur téléphone (voir plus bas).
- **Séquençage rapide** : créer des objets et les rattacher à l'étape en cours, ou à une nouvelle étape avant ou après, d'un clic.
- **Arbres, cartes mentales et arbres argumentatifs** sur des formes tldraw ordinaires, avec des préréglages de styles (types d'éléments et relations).
- **Notes d'objet** : le développement d'un objet, affiché à la demande à côté de la narration.
- **Partage en lecture seule** : un lien qui ouvre la présentation pour n'importe qui, et un lien court avec un QR code à projeter.
- **Polycopié** : ☰ › « Polycopié (imprimer / PDF)… » donne une partie par étape, le schéma à ce stade (objets atténués en gris) et sa narration, à imprimer ou enregistrer en PDF pour les élèves.
- **Exemples** sur l'accueil (un arbre argumentatif, Kant et Constant sur le mensonge, en français ou en anglais ; le cycle de l'eau en anglais ; la liberté en français), et une aide des raccourcis en présentation (<kbd>?</kbd>).
- **Fichiers** : enregistrer et ouvrir des fichiers `.tldr`. La séquence est stockée dans le document tldraw : un fichier `.tldr` la garde. Sur Chrome et Edge, un schéma ouvert depuis un fichier, ou enregistré dans un fichier, reste lié à lui : chaque modification y est écrite automatiquement (<kbd>Ctrl/⌘</kbd>+<kbd>S</kbd> enregistre aussitôt). On peut ainsi travailler directement sur un fichier d'un dossier synchronisé (Google Drive, Dropbox, iCloud Drive, OneDrive). Un fichier modifié ailleurs est rechargé au retour sur l'onglet, et jamais écrasé sans le demander ; rouvrir un fichier lié rouvre son schéma au lieu d'en créer un doublon.
- **Format JSON** : exporter un schéma en JSON (types, relations, arbres, séquence, tout nommé), ou le copier pour une IA ; importer un schéma JSON écrit à la main, par une IA ou par un autre outil, mis en page automatiquement. Voir [Le format JSON des schémas](docs/map-format.fr.md).
- **Mode sombre**, et **interface en anglais et en français**.

## Partage en lecture seule

« Partager » (en-tête du panneau des étapes, ou menu ☰) donne un lien qui ouvre la présentation pour n'importe qui : étape par étape, avec la narration, sans pouvoir modifier le schéma (page `/p`).

- **Lien contenant le schéma**, sur toute instance : le document est compressé dans le lien, après le `#`, que le navigateur n'envoie jamais au serveur. Rien n'est stocké, donc rien à modérer. Les images intégrées au document sont retirées (elles rendraient le lien démesuré), et les modifications ultérieures demandent un nouveau lien.
- **Lien publié**, en mode cloud : un lien court (`/p/<id>`) vers une copie de la dernière version enregistrée (table `shares`), images comprises. « Publier la dernière version » met à jour le même lien ; « Dépublier » le désactive. La publication exige la session ; la lecture est publique.
- **Partage public**, sur une instance en mode local avec un stockage Upstash Redis (`KV_REST_API_URL`, `KV_REST_API_TOKEN`, via la marketplace Vercel) : n'importe quel visiteur peut publier un lien court. Garde-fous :
  - seuls le schéma et ses textes sont publiés : liens cliquables, cartes de site et images intégrées sont retirés ; les images du web doivent être en `https` et passer le filtre d'adresses ;
  - filtre de mots-clés volontairement court (`src/lib/share/blocklist.ts`, complétable par `SHARE_BLOCKLIST`), pour ne pas bloquer des sujets de cours ;
  - 256 Ko au plus ; 3 publications par heure et 10 par jour par adresse IP, 200 par jour au total ;
  - effacement 30 jours après la dernière publication ; `SHARING=off` arrête aussitôt les publications (les liens existants restent lisibles) ;
  - la clé de gestion (mise à jour, dépublication) reste dans le navigateur de l'auteur, jamais dans le document.
- **Signalement** : le lecteur d'un lien publié a un bouton « Signaler » ; le formulaire envoie un e-mail à `REPORT_EMAIL` via Resend (`RESEND_API_KEY`), sans que l'adresse ne quitte le serveur. Pour retirer un partage public : supprimer la clé `share:<id>` dans la console Upstash.
- **QR code** : à côté d'un lien court publié, le bouton « QR code » l'affiche en grand, sur toute la fenêtre, pour le projeter : les élèves ouvrent la présentation sur leur téléphone. Toujours noir sur blanc, même en mode sombre, pour rester lisible à travers un projecteur. Le lien contenant le schéma est trop long pour un QR code.

L'adresse IP vient de l'en-tête `X-Forwarded-For` : derrière Vercel, elle ne peut pas être falsifiée ; en auto-hébergement, placer l'app derrière un proxy qui le pose.

## En classe

**Double affichage.** Pendant la présentation, ⋯ › « Projeter sur un second écran » ouvre une **fenêtre public** pour le projecteur. Sur Chrome et Edge, elle se place d'elle-même sur le second écran (le navigateur demande l'autorisation une fois) ; ailleurs, on la glisse sur le projecteur. Un clic sur « Plein écran » (ou F) la passe en plein écran.

- Le projecteur montre le schéma seul ; la narration s'y affiche à la demande (case « Narration au projecteur »).
- Il suit l'écran du présentateur : étapes, vue d'ensemble et recentrage, laser, calque occultant tracé à la main, notes ouvertes, légende, et les retouches faites en mode déverrouillé.
- L'écran du présentateur devient une vue présentateur : chronomètre (cliquer pour remettre à zéro), étape suivante, narration et notes.
- Une touche pressée dans la fenêtre public (télécommande de présentation, clavier) agit comme si elle l'était chez le présentateur, sauf F.
- Aucun serveur : les deux fenêtres, dans le même navigateur, se parlent par un `BroadcastChannel`, et partagent le document par le cache local de tldraw (`src/lib/presentation/screen.ts`, page `/d/<id>/screen`).

**Télécommande sur téléphone.** Pendant la présentation, ⋯ › « Télécommande (téléphone) » affiche un QR code : scanné, il fait du téléphone une télécommande (précédent, suivant, vue d'ensemble, recentrer) qui montre aussi la narration de l'étape, l'étape suivante et un chronomètre, et garde l'écran allumé. Les deux appareils se connectent directement (WebRTC) : le service public de PeerJS ne sert qu'à les mettre en relation, et rien ne passe par le serveur du site. L'identifiant de l'ordinateur, aléatoire, est dans le fragment de l'adresse (`/r#…`) : c'est lui qui donne la main.

La connexion directe peut échouer sur certains réseaux (Wi-Fi d'établissement qui isole les appareils, 5G derrière un partage d'adresse, filtrage de l'UDP) : l'app le dit, et indique sinon le chemin obtenu (même réseau local, ou à travers Internet). Le plus sûr en classe : connecter l'ordinateur au partage de connexion du téléphone. Un relais de secours (HTTPS, via Upstash) pourra s'ajouter si les échecs sont fréquents.

**Sur téléphone**, en portrait, la narration passe sous le schéma ; en paysage, elle reste à côté, plus étroite.

## Arbres

Sélectionner une boîte : <kbd>Tab</kbd> ajoute un enfant (et commence un arbre), <kbd>Entrée</kbd> ajoute un frère. Pendant la saisie d'un nœud, <kbd>Entrée</kbd> valide (<kbd>Maj</kbd>+<kbd>Entrée</kbd> : saut de ligne) et <kbd>Tab</kbd> enchaîne sur un enfant.

- La mise en page est automatique ; un nœud déplacé à la main garde son décalage (et entraîne sa branche). « Réorganiser » efface les décalages.
- Orientation : vers la droite, la gauche, le bas, le haut, ou des deux côtés (carte mentale équilibrée : un nouvel enfant de la racine va du côté le moins chargé, et une branche glissée de l'autre côté de la racine y reste).
- Replier une branche la masque en édition : pastille « − » sur un nœud sélectionné ou survolé, « +n » pour la rouvrir. L'état replié du document est l'état de départ de la présentation ; les actions « Replier / Déplier la branche » le changent en cours de séquence. Replier ne déplace rien : la place de la branche reste réservée.
- Supprimer un nœud supprime sa branche (annulable).
- **Carte d'argument** (bouton « Carte d'argument ») : la boîte sélectionnée devient la thèse à discuter (étiquette « Thèse »). <kbd>Tab</kbd> propose ce qu'on lui ajoute (Justification · soutient, Objection · objecte…) (touches 1 à 9 puis a, b…, 0 sans relation). La branche prend le style et le sens de la relation (par défaut vers le parent : « la prémisse soutient la thèse » ; vers l'enfant pour implique, présuppose, soulève), et le nouveau nœud le type associé (Exemple pour « illustre », Présupposé pour « présuppose »…). <kbd>Entrée</kbd> ajoute un frère avec la même relation.
- Dans un arbre argumentatif, **la forme dit le type, la couleur dit la fonction** : un nœud relié prend la couleur de sa relation (trait et fond pâle) et son étiquette affiche sa fonction seule (Justification, Objection, Réfutation, Réponse, Explication, Implication, Présupposé, Exemple, Définition, Difficulté, Distinction). Le vert est réservé au soutien.

## Préréglages de styles

Pour construire une carte d'argument pas à pas, voir le guide [Construire une carte d'argument](docs/argument-maps.fr.md) : types d'éléments, relations, définitions et exemples.

Des styles nommés, en tête du panneau de styles : des **types d'éléments** pour les formes (Énoncé, Présupposé, Fait, Concept, Distinction, Question, Difficulté, Exemple, Citation) et des **relations** pour les flèches (soutient, objecte, réfute, répond à, explique, implique, présuppose, illustre, définit, soulève, et entre concepts : se distingue de, s'oppose à, se rapproche de). Une flèche de soutien ou d'objection peut préciser son type de raisonnement (déduction, induction, analogie…). Ce ne sont que des propriétés tldraw ordinaires (géométrie, couleur, trait…), plus une marque `meta.preset`.

- Un clic applique le préréglage aux formes ou flèches sélectionnées ; sans sélection, un type arme l'outil de formes : la prochaine forme tracée la reçoit.
- Chaque type a sa géométrie (Concept : ovale, Question : losange, Difficulté : hexagone, Présupposé : nuage, Fait : parallélogramme, Citation : sans cadre, en serif, avec guillemets…) et une étiquette au-dessus de la forme (« ÉNONCÉ · Hobbes », avec la modalité en pastille : descriptif / normatif) : source (auteur, théorie, position) et modalité se saisissent dans le panneau de droite. Les étiquettes sont dessinées par l'application : sans elle, le schéma garde ses formes et ses couleurs.
- Communs à tous les schémas : table `settings` en mode cloud, IndexedDB en mode local. Chaque schéma garde une copie des préréglages qu'il utilise, pour rester lisible ailleurs (et dans les liens partagés).
- Menu ☰ › « Préréglages de styles… » : renommer, réordonner, forme et étiquette des types, sens et type de l'enfant des relations, mettre à jour ou créer d'après la sélection, masquer un préréglage (case à cocher : il reste utilisable dans les schémas existants), masquer la palette ou les étiquettes, revenir aux préréglages de départ.
- En présentation, <kbd>L</kbd> affiche la légende des types et relations utilisés.

## Notes d'objet et narration

Le développement d'un objet (citation longue, explication) ne surcharge pas le schéma : il se rédige dans le panneau de droite (« Note de l'objet ») et s'affiche pendant la présentation dans son propre onglet du panneau de droite, à côté de la narration : au double-clic sur l'objet (une marque ¶ signale les objets qui en ont une), ou à une étape avec l'action « Afficher la note » (la note s'affiche alors d'emblée, la narration reste à un onglet). <kbd>Tab</kbd> passe d'un onglet à l'autre. Les « détails dépliables » des versions précédentes sont convertis en notes à l'ouverture du document.

**Saisie de la narration et des notes** : Markdown (titres, listes, liens, tableaux, citations, images ; un retour à la ligne en est un), avec une barre d'outils, les raccourcis <kbd>Ctrl/⌘</kbd>+<kbd>B</kbd> / <kbd>I</kbd> / <kbd>K</kbd> (lien), un aperçu et un grand éditeur. Une image collée ou déposée est téléversée (Vercel Blob) ou, à défaut, rangée dans le document comme ressource tldraw (`asset:…` dans le texte, 1 Mo maximum).

**Taille du texte du panneau** : chaque schéma a sa taille par défaut. En présentation, <kbd>+</kbd> / <kbd>−</kbd>, <kbd>Ctrl</kbd> + molette (ou pincement) au-dessus du panneau et les boutons A− / A+ l'ajustent pour la séance ; le bouton « n % » la garde comme défaut du schéma, <kbd>0</kbd> y revient.

## Raccourcis en présentation

`→` / `Espace` / `PageDown` suivant · `←` / `PageUp` précédent · `Début` / `Fin` · `O` vue d'ensemble · `C` recentrer · `K` laser · `M` calque occultant · `N` narration · `+` / `−` / `0` (ou Ctrl + molette) taille du texte du panneau · `Tab` narration / notes · `L` légende · `F` plein écran · `?` aide des raccourcis · `Échap` quitter (le premier Échap désactive le laser)

Le menu ⋯ de la barre de présentation regroupe les actions moins fréquentes : recentrer, aide des raccourcis, déverrouiller, projeter sur un second écran, télécommande sur téléphone. Déverrouiller fait réapparaître l'interface tldraw pour retoucher le schéma ; seules `PageUp` / `PageDown` naviguent alors entre les étapes.

## Langues

L'interface existe en anglais et en français (sélecteur EN · FR sur l'accueil et la page de connexion) ; par défaut, elle suit la langue du navigateur, et le choix est mémorisé dans un cookie. L'interface de tldraw suit la même langue. Les textes sont dans `src/i18n/` : `en.ts` fait référence, et TypeScript signale toute clé manquante dans `fr.ts`. Ajouter une langue, c'est ajouter un fichier. Le contenu des schémas n'est jamais traduit ; seules les valeurs par défaut suivent la langue (titres, préréglages de départ, exemple : la liberté en français, le cycle de l'eau en anglais).

## Mode sombre

Dans l'éditeur, les panneaux de l'app (étapes, narration, barres d'outils) suivent le thème choisi dans les préférences de tldraw : clair, sombre ou celui du système. L'accueil, la connexion et les mentions légales suivent le thème du système. En mode sombre, la palette Tailwind est redéfinie dans `globals.css` (utilitaire `dark-palette` : gris inversés) : les couleurs de l'interface passent donc par ses variables (`bg-white`, `var(--color-stone-500)`…), jamais par des valeurs en dur.

## Deux modes de stockage

Le mode dépend de la présence de `DATABASE_URL` :

- **Mode local** (sans `DATABASE_URL`) : aucun serveur de données ni mot de passe. Les schémas sont enregistrés dans le navigateur de chacun (IndexedDB). « Enregistrer sous… » (panneau des étapes ou menu ☰) crée un fichier `.tldr`, séquence comprise ; « Ouvrir un fichier .tldr… » (accueil ou menu ☰), ou un glisser-déposer sur l'accueil, le rouvre comme nouveau schéma. Idéal pour partager l'app par une simple URL.
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

## Tests

```bash
pnpm test         # tests unitaires (Vitest) : moteur de séquence, arbres, préréglages, partage
pnpm test:e2e     # tests de bout en bout (Playwright), en mode local, sur un serveur de dev lancé sur le port 3100
```

La première fois : `pnpm exec playwright install chromium`. Pour réutiliser un serveur de dev déjà lancé : `E2E_BASE_URL=http://localhost:3000 pnpm test:e2e`. Le test de la télécommande passe par le service public de PeerJS et n'est lancé qu'avec `E2E_PEERJS=1`. L'intégration continue (GitHub Actions) vérifie types, lint, tests unitaires et de bout en bout.

## Mise en ligne (Vercel)

- **Mode local** : importer le dépôt dans Vercel et définir `TLDRAW_LICENSE_KEY`. C'est tout.
- **Mode cloud** :
  1. Créer une base Postgres (par exemple Neon).
  2. Appliquer les migrations avec l'URL de connexion **directe** (non « pooled »), entre guillemets simples car elle contient des `&` :
     `DATABASE_URL='postgresql://…/neondb?sslmode=require' pnpm db:migrate`
     À refaire après chaque nouvelle migration dans `drizzle/`.
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
| `SITE_URL` | Adresse des aperçus de lien (par défaut `https://unveilboard.com`) |

## Sauvegarde et synchronisation

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
- `src/lib/share/` : liens partagés (compression dans le lien, contrôles avant publication publique) ; `src/lib/presentation/screen.ts` et `src/lib/remote/` : double affichage et télécommande.
- `src/lib/map/` : le format JSON des schémas (schéma Zod, contrôles, conversion de la séquence), sans tldraw ; `src/lib/canvas/mapExport.ts` et `mapImport.ts` : conversion depuis et vers le document tldraw.

La séquence est stockée dans le document tldraw : elle bénéficie de l'annuler/rétablir et de la persistance locale (IndexedDB).

## Contribuer

Les contributions sont bienvenues : voir [CONTRIBUTING.md](CONTRIBUTING.md) (en anglais). Le projet suit le [Contributor Covenant](CODE_OF_CONDUCT.md). Pour signaler une faille, voir [SECURITY.md](SECURITY.md). Les changements sont listés dans [CHANGELOG.md](CHANGELOG.md).

## Licence

Code d'Unveilboard sous licence [MIT](LICENSE). Les fichiers de la police Source Serif 4 dans `assets/fonts/` (utilisés pour les images d'aperçu de lien) sont sous [SIL Open Font License](assets/fonts/OFL.txt).

Le SDK tldraw dont il dépend a sa propre [licence](https://tldraw.dev/community/license) : chaque déploiement en production nécessite une clé tldraw (gratuite pour un usage non commercial, avec le filigrane « made with tldraw »).
