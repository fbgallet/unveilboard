# Application de bureau

[English](desktop.md) · **Français**

Unveilboard comme application installée sur votre ordinateur (macOS, Windows, Linux), sans rien cloner ni passer par le terminal. C'est le mode local de l'application web : les schémas restent sur l'ordinateur, sans compte.

## Installation

Téléchargez l'installateur de votre système dans la [dernière version](https://github.com/fbgallet/unveilboard/releases/latest) :

| Système | Fichier |
|---|---|
| macOS (Apple Silicon : M1 et suivants) | `Unveilboard-<version>-mac-arm64.dmg` |
| macOS (Intel) | `Unveilboard-<version>-mac-x64.dmg` |
| Windows | `Unveilboard-<version>-windows-setup.exe` |
| Linux | `Unveilboard-<version>-linux-x86_64.AppImage` |

Les installateurs ne sont pas signés par Apple ni par Microsoft (c'est payant chaque année). Votre système vous avertit donc **la première fois** que vous ouvrez l'application :

- **macOS** : ouvrez le `.dmg` et glissez Unveilboard dans Applications, puis ouvrez-la. macOS refuse : cliquez sur **OK**, puis allez dans **Réglages Système › Confidentialité et sécurité**, descendez jusqu'à « Unveilboard a été bloquée… » et cliquez sur **Ouvrir quand même**, puis confirmez. (Depuis macOS 15, clic droit › Ouvrir ne contourne plus l'avertissement.)
- **Windows** : « Windows a protégé votre ordinateur » (SmartScreen) : cliquez sur **Informations complémentaires**, puis **Exécuter quand même**. L'application s'installe pour votre seul compte, sans droits d'administrateur.
- **Linux** : rendez le fichier exécutable (Propriétés › Permissions, ou `chmod +x`), puis ouvrez-le. Sur Ubuntu 22.04 et suivants, les AppImage demandent `libfuse2` (`sudo apt install libfuse2t64` sur 24.04).

## Mises à jour

L'application cherche une nouvelle version au démarrage, puis toutes les six heures.

- **Windows et Linux** : la mise à jour se télécharge en arrière-plan ; l'application propose de redémarrer, ou l'installe quand vous la quittez.
- **macOS** : sans signature Apple, macOS ne laisse pas l'application se remplacer elle-même. Elle vous signale la nouvelle version et ouvre la page de téléchargement : remplacez l'application du dossier Applications par la nouvelle. Vos schémas sont conservés.

## Vos schémas

Ils sont enregistrés dans le dossier de données de l'application, comme dans un navigateur (IndexedDB) :

- macOS : `~/Library/Application Support/Unveilboard`
- Windows : `%APPDATA%\Unveilboard`
- Linux : `~/.config/Unveilboard`

Ils survivent aux mises à jour. Pour sauvegarder un schéma ou le passer sur un autre ordinateur : « Enregistrer sous… » (fichier `.tldr`).

## Ce qui change par rapport au site

- **Télécommande et liens partagés** pointent vers unveilboard.com, qui sert les mêmes pages : un téléphone ne peut pas joindre l'application sur votre ordinateur. La connexion elle-même reste directe entre les deux appareils.
- **Internet** : l'application fonctionne sans compte, mais certaines choses demandent encore une connexion : les polices et traductions de tldraw, la télécommande, une IA en ligne.
- **IA** : les mêmes fournisseurs que sur le site (consigne copiée, OpenRouter avec votre clé, un modèle local comme Ollama ou LM Studio). Pour un modèle local, autorisez l'origine `http://127.0.0.1:43117`.
- **Licence tldraw** : le canevas affiche la mention « Get a license for production », comme toute application tldraw sans licence pour cet usage.

## La construire vous-même

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

Fonctionnement : le processus principal d'Electron (`desktop/main.js`) lance le serveur autonome de Next sur `127.0.0.1:43117`, toujours en mode local, puis l'affiche dans une fenêtre. Le port est fixe parce que le stockage du navigateur y est rattaché : un autre port, et les schémas seraient introuvables. Les pages de l'application s'ouvrent dans des fenêtres Electron (fenêtre de projection comprise) ; les autres liens, dans votre navigateur.

## Publier une version

1. Mettez à jour la version dans `package.json` et `desktop/package.json`, et le changelog.
2. Poussez une étiquette : `git tag v0.3.0 && git push origin v0.3.0`.
3. Le [workflow Desktop](../.github/workflows/desktop.yml) construit les quatre installateurs sur les machines de GitHub et les dépose dans une **release en brouillon**.
4. Vérifiez le brouillon, puis publiez-le : les applications installées voient la nouvelle version à partir de ce moment.

Le workflow peut aussi être lancé à la main (onglet Actions › Desktop › Run workflow) : il construit les installateurs sans les publier, en artefacts du workflow.
