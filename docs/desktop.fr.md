# Application de bureau

[English](desktop.md) · **Français**

Unveilboard s'installe aussi comme une application sur votre ordinateur (macOS, Windows, Linux), sans compte et sans rien d'autre à installer. Vos schémas restent sur l'ordinateur. Elle permet en plus d'utiliser **votre forfait ChatGPT** pour l'IA, ce que le site ne permet pas.

## Installer

Téléchargez le fichier de votre système dans la [dernière version](https://github.com/fbgallet/unveilboard/releases/latest), section « Assets » :

| Votre ordinateur | Fichier à télécharger |
|---|---|
| Mac récent (puce Apple : M1, M2…) | `Unveilboard-<version>-mac-arm64.dmg` |
| Mac plus ancien (processeur Intel) | `Unveilboard-<version>-mac-x64.dmg` |
| Windows | `Unveilboard-<version>-windows-setup.exe` |
| Linux | `Unveilboard-<version>-linux-x86_64.AppImage` |

Sur Mac, pour savoir quelle puce vous avez : menu Pomme › « À propos de ce Mac » (ligne « Puce » ou « Processeur »).

L'application n'est pas signée par Apple ni par Microsoft (c'est payant chaque année) : votre système vous avertit donc **une seule fois**, au premier lancement. C'est normal.

### Sur Mac

1. Ouvrez le fichier `.dmg` téléchargé, puis glissez **Unveilboard** dans le dossier **Applications**.
2. Ouvrez Unveilboard depuis le dossier Applications. macOS refuse de l'ouvrir : cliquez sur **OK** (ou **Terminé**).
3. Ouvrez **Réglages Système › Confidentialité et sécurité**, descendez jusqu'au message « Unveilboard a été bloquée… » et cliquez sur **Ouvrir quand même**. Confirmez avec votre mot de passe.

Ensuite, Unveilboard s'ouvre normalement, comme toute application.

### Sur Windows

1. Ouvrez le fichier `Unveilboard-…-windows-setup.exe` téléchargé.
2. Si Windows affiche « Windows a protégé votre ordinateur », cliquez sur **Informations complémentaires**, puis sur **Exécuter quand même**.
3. L'installation se fait toute seule, sans droits d'administrateur. Unveilboard apparaît dans le menu Démarrer.

### Sur Linux

1. Rendez le fichier `.AppImage` exécutable : clic droit › Propriétés › Permissions › « Autoriser l'exécution » (ou `chmod +x` dans un terminal).
2. Double-cliquez dessus.

Sur Ubuntu 22.04 et suivants, s'il ne s'ouvre pas, installez `libfuse2` (`sudo apt install libfuse2t64` sur Ubuntu 24.04).

## Utiliser votre forfait ChatGPT

Dans l'application, l'IA d'Unveilboard peut utiliser votre abonnement ChatGPT : pas de clé d'API à créer, pas de crédit à acheter ailleurs.

**Ce qu'il faut** : un forfait ChatGPT **payant**. Avec un compte gratuit, ChatGPT refuse la connexion (« Une autorisation requise est indisponible… ») et propose de changer d'offre.

**Les modèles dépendent de votre forfait.** Unveilboard affiche ceux qu'OpenAI ouvre à votre compte. Le forfait **ChatGPT Go** en propose peu : en octobre 2026, GPT-5.5, GPT-5.6 Terra et GPT-5.6 Luna. Si un modèle peine sur une tâche lourde (un grand schéma à partir d'un long texte), essayez-en un autre, ou passez par OpenRouter.

Pour vous connecter :

1. Ouvrez un schéma, cliquez sur **✦** en haut à droite, puis sur **Réglages de l'IA…**.
2. Choisissez **Votre forfait ChatGPT**, puis cliquez sur **Continuer avec ChatGPT**.
3. Votre navigateur s'ouvre : connectez-vous à ChatGPT et autorisez Unveilboard.
4. Revenez dans Unveilboard : votre compte s'affiche, avec la liste des modèles. Choisissez-en un, cliquez sur **Tester**, puis sur **Enregistrer**.

Bon à savoir :

- **Usage et limites** : les demandes d'Unveilboard comptent dans l'usage de votre forfait, partagé avec ChatGPT et les autres applications connectées. Le lien **Gérer l'usage** (dans les réglages de l'IA) ouvre les réglages de ChatGPT, où vous pouvez suivre cet usage et fixer une limite propre à Unveilboard. Une limite atteinte arrête les demandes jusqu'à ce qu'elle se renouvelle.
- **Sécurité** : la connexion reste sur votre ordinateur, chiffrée par le système (Trousseau sur Mac). Unveilboard ne voit pas vos conversations ChatGPT.
- **Se déconnecter** : réglages de l'IA › **Se déconnecter**. Vous pouvez aussi retirer Unveilboard des applications connectées, dans les réglages de ChatGPT.

Les autres choix d'IA restent disponibles : copier-coller la consigne dans l'assistant de votre choix, OpenRouter avec votre clé, ou un modèle local (Ollama, LM Studio). Voir [Travailler avec une IA](ai.fr.md).

## Mises à jour

L'application vérifie au démarrage s'il existe une nouvelle version.

- **Windows et Linux** : elle se met à jour toute seule. Elle propose de redémarrer, ou s'installe quand vous la quittez.
- **Mac** : elle vous signale la nouvelle version et ouvre la page de téléchargement. Remplacez l'application du dossier Applications par la nouvelle (même démarche qu'à l'installation). Vos schémas sont conservés.

## Vos schémas

Ils restent sur votre ordinateur, dans le dossier de l'application, et survivent aux mises à jour. Pour sauvegarder un schéma ou le passer sur un autre ordinateur : **Enregistrer sous…** (fichier `.tldr`), puis **Ouvrir un fichier .tldr** sur l'autre ordinateur.

Emplacement, pour les curieux : `~/Library/Application Support/Unveilboard` (Mac), `%APPDATA%\Unveilboard` (Windows), `~/.config/Unveilboard` (Linux).

## Ce qui change par rapport au site

- **Télécommande et liens partagés** passent par unveilboard.com : un téléphone ne peut pas joindre l'application sur votre ordinateur. La connexion entre les deux appareils reste directe.
- **Internet** : il en faut encore pour les polices du canevas, la télécommande et une IA en ligne.
- **Modèle local** (Ollama, LM Studio) : autorisez l'origine `http://127.0.0.1:43117`.
- **Licence tldraw** : le canevas affiche la mention « Get a license for production », comme toute application tldraw sans licence pour cet usage.

## Pour les contributeurs

### Construire l'application

À la racine du dépôt :

```bash
pnpm install --config.node-linker=hoisted   # pas de liens symboliques dans le serveur autonome
NEXT_OUTPUT=standalone pnpm build
cd desktop
npm install
npm run server   # copie le serveur autonome dans desktop/server
npm start        # lance l'application
npx electron-builder --mac --arm64 --publish never   # ou --win, --linux ; installateurs dans desktop/dist
```

Depuis un terminal de VS Code, retirez d'abord `ELECTRON_RUN_AS_NODE` (`env -u ELECTRON_RUN_AS_NODE npm start`) : VS Code la définit, et Electron se comporte alors comme un simple Node.

Fonctionnement : le processus principal d'Electron (`desktop/main.js`) lance le serveur autonome de Next sur `127.0.0.1:43117`, toujours en mode local, puis l'affiche dans une fenêtre. Le port est fixe parce que le stockage du navigateur y est rattaché : un autre port, et les schémas seraient introuvables. Les pages de l'application s'ouvrent dans des fenêtres Electron (fenêtre de projection comprise) ; les autres liens, dans votre navigateur. La connexion à ChatGPT (`desktop/chatgpt.js`) suit le protocole publié par OpenAI ; ses jetons ne quittent jamais le processus principal.

### Publier une version

1. Mettez à jour la version dans `package.json` et `desktop/package.json`, et le changelog.
2. Poussez une étiquette : `git tag v0.3.0 && git push origin v0.3.0`.
3. Le [workflow Desktop](../.github/workflows/desktop.yml) construit les quatre installateurs sur les machines de GitHub et les dépose dans une **release en brouillon**.
4. Vérifiez le brouillon, puis publiez-le : les applications installées voient la nouvelle version à partir de ce moment.

Le workflow peut aussi être lancé à la main (onglet Actions › Desktop › Run workflow) : il construit les installateurs sans les publier, en artefacts du workflow.
