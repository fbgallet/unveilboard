# Présenter un schéma pas à pas

[English](presenting.md) · **Français**

Comment un schéma devient une présentation : étapes, caméra, narration et notes ; le mode présentation et ses raccourcis ; la classe (vidéoprojecteur, télécommande sur téléphone) ; le polycopié et le partage en lecture seule.

## Vue d’ensemble

- **Étapes** : faire apparaître, atténuer, cacher, rétablir, surligner ou mettre en avant des objets, avec des effets d'entrée (fondu, montée, tracé) ; replier ou déplier des branches d'arbre ; afficher une note d'objet.
- **Deux manières de présenter** (onglet Séquence, au-dessus de « ▶ Présenter », pour tout le document) : **Révélation** (par défaut), chaque étape fait apparaître des objets, cachés au départ ; **Parcours**, tout le schéma est visible dès le départ et chaque étape cadre les objets qu'elle montre (ajouter des objets à une étape dit ce qu'elle montre), le reste légèrement atténué (« Atténuer le reste », coché par défaut).
- **Cliquer un objet pour aller à son étape** : en présentation, un clic sur un objet mène à la prochaine étape qui le montre (ou le surligne, le met en avant, affiche sa note), ou à la première ; rien ne se passe s'il est de l'étape en cours. Le double-clic ouvre toujours sa note.
- **Affichage** (`V`, ou menu ⋯ › « Affichage ») : par-dessus la séquence, montrer **tout le schéma** (les objets à venir apparaissent, l'étape en cours ressort ; un clic sur l'un d'eux mène à son étape) ou **l'étape seule**. Changer d'étape ramène à la séquence ; la fenêtre du projecteur suit.
- **Caméra à chaque étape** : suivre les nouveaux objets, montrer tout le schéma, ou ne pas bouger.
- **Panneau de narration** : un texte en Markdown pour chaque étape, à côté du schéma (redimensionnable, masquable), en dessous sur téléphone.
- **Mode présentation** : clavier et télécommande de présentation, vue d'ensemble et recentrage, pointeur laser (couleur, épaisseur et durée réglables), calque occultant tracé à la main, légende, et mode « déverrouillé » pour retoucher le schéma en pleine présentation.
- **Séquençage rapide** : créer des objets et les rattacher à l'étape en cours, ou à une nouvelle étape avant ou après, d'un clic.
- **Polycopié** : ☰ › « Polycopié (imprimer / PDF)… » donne une partie par étape, le schéma à ce stade (objets atténués en gris) et sa narration, à imprimer ou enregistrer en PDF pour les élèves.

## Notes d'objet et narration

Le développement d'un objet (citation longue, explication) ne surcharge pas le schéma : il se rédige dans le panneau de droite (« Note de l'objet ») et s'affiche pendant la présentation dans son propre onglet du panneau de droite, à côté de la narration : au double-clic sur l'objet (une marque ¶ signale les objets qui en ont une), ou à une étape avec l'action « Afficher la note » (la note s'affiche alors d'emblée, la narration reste à un onglet). <kbd>Tab</kbd> passe d'un onglet à l'autre. Les « détails dépliables » des versions précédentes sont convertis en notes à l'ouverture du document.

**Saisie de la narration et des notes** : Markdown (titres, listes, liens, tableaux, citations, images ; un retour à la ligne en est un), avec une barre d'outils, les raccourcis <kbd>Ctrl/⌘</kbd>+<kbd>B</kbd> / <kbd>I</kbd> / <kbd>K</kbd> (lien), un aperçu et un grand éditeur. Une image collée ou déposée est téléversée (Vercel Blob) ou, à défaut, rangée dans le document comme ressource tldraw (`asset:…` dans le texte, 1 Mo maximum).

**Taille du texte du panneau** : chaque schéma a sa taille par défaut. En présentation, <kbd>+</kbd> / <kbd>−</kbd>, <kbd>Ctrl</kbd> + molette (ou pincement) au-dessus du panneau et les boutons A− / A+ l'ajustent pour la séance ; le bouton « n % » la garde comme défaut du schéma, <kbd>0</kbd> y revient.

## Raccourcis en présentation

`→` / `Espace` / `PageDown` suivant · `←` / `PageUp` précédent · `Début` / `Fin` · `O` vue d'ensemble · `C` recentrer · `K` laser · `M` calque occultant · `N` narration · `+` / `−` / `0` (ou Ctrl + molette) taille du texte du panneau · `Tab` narration / notes · `L` légende · `V` affichage (séquence, tout le schéma, étape seule) · `F` plein écran · `?` aide des raccourcis · `Échap` quitter (le premier Échap désactive le laser)

Le menu ⋯ de la barre de présentation regroupe les actions moins fréquentes : recentrer, affichage, aide des raccourcis, déverrouiller, projeter sur un second écran, télécommande sur téléphone. Déverrouiller fait réapparaître l'interface tldraw pour retoucher le schéma ; seules `PageUp` / `PageDown` naviguent alors entre les étapes.

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
