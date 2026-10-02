# Desktop app

**English** · [Français](desktop.fr.md)

Unveilboard as an app installed on your computer (macOS, Windows, Linux), with nothing to clone and no terminal. It is the local mode of the web app: diagrams stay on the computer, without an account.

## Installing

Download the installer for your system from the [latest release](https://github.com/fbgallet/unveilboard/releases/latest):

| System | File |
|---|---|
| macOS (Apple Silicon: M1 and later) | `Unveilboard-<version>-mac-arm64.dmg` |
| macOS (Intel) | `Unveilboard-<version>-mac-x64.dmg` |
| Windows | `Unveilboard-<version>-windows-setup.exe` |
| Linux | `Unveilboard-<version>-linux-x86_64.AppImage` |

The installers are not signed by Apple or Microsoft (that costs a yearly fee). Your system therefore warns you **the first time** you open the app:

- **macOS**: open the `.dmg` and drag Unveilboard into Applications, then open it. macOS refuses: click **Done**, then go to **System Settings › Privacy & Security**, scroll down to "Unveilboard was blocked…" and click **Open Anyway**, then confirm. (Since macOS 15, right-click › Open no longer bypasses the warning.)
- **Windows**: "Windows protected your PC" (SmartScreen): click **More info**, then **Run anyway**. The app installs for your user only, without administrator rights.
- **Linux**: make the file executable (Properties › Permissions, or `chmod +x`), then open it. On Ubuntu 22.04 and later, AppImages need `libfuse2` (`sudo apt install libfuse2t64` on 24.04).

## Updates

The app checks for a new version at startup, then every six hours.

- **Windows and Linux**: the update downloads in the background; the app offers to restart, or installs it when you quit.
- **macOS**: without an Apple signature, macOS doesn't let the app replace itself. It tells you a new version is out and opens the download page: replace the app in Applications with the new one. Your diagrams are kept.

## Your diagrams

They are stored in the app's data folder, as in a browser (IndexedDB):

- macOS: `~/Library/Application Support/Unveilboard`
- Windows: `%APPDATA%\Unveilboard`
- Linux: `~/.config/Unveilboard`

They survive updates. To back up a diagram or move it to another computer, use "Save as…" (`.tldr` file).

## What differs from the website

- **Phone remote and shared links** point to unveilboard.com, which serves the same pages: a phone can't reach the app on your computer. The connection itself stays direct between the two devices.
- **Internet**: the app works without an account, but some things still need a connection: tldraw's fonts and translations, the phone remote, an online AI.
- **AI**: the same providers as on the website (copied prompt, OpenRouter with your key, a local model such as Ollama or LM Studio). For a local model, allow the origin `http://127.0.0.1:43117`.
- **tldraw licence**: the canvas shows the "Get a license for production" mark, as any tldraw app without a licence for this use.

## Building it yourself

From the repository root:

```bash
pnpm install --config.node-linker=hoisted   # no symlinks in the standalone server
NEXT_OUTPUT=standalone pnpm build
cd desktop
npm install
npm run server   # copies the standalone server into desktop/server
npm start        # runs the app
npx electron-builder --mac --arm64 --publish never   # or --win, --linux; installers in desktop/dist
```

Launched from a VS Code terminal, unset `ELECTRON_RUN_AS_NODE` first (`env -u ELECTRON_RUN_AS_NODE npm start`): VS Code sets it, and Electron then behaves as plain Node.

How it works: the Electron main process (`desktop/main.js`) starts Next's standalone server on `127.0.0.1:43117`, always in local mode, then shows it in a window. The port is fixed because the browser storage is tied to it: another port, and the diagrams would no longer be found. Pages of the app open in Electron windows (the projector window included); other links open in your browser.

## Publishing a release

1. Update the version in `package.json` and `desktop/package.json`, and the changelog.
2. Push a tag: `git tag v0.3.0 && git push origin v0.3.0`.
3. The [Desktop workflow](../.github/workflows/desktop.yml) builds the four installers on GitHub's machines and puts them in a **draft release**.
4. Check the draft, then publish it: installed apps see the new version from then on.

The workflow can also be run by hand (Actions tab › Desktop › Run workflow): it builds the installers without publishing them, as workflow artifacts.
