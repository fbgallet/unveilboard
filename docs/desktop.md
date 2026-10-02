# Desktop app

**English** · [Français](desktop.fr.md)

Unveilboard also installs as an app on your computer (macOS, Windows, Linux), with no account and nothing else to install. Your diagrams stay on the computer. It can also use **your ChatGPT plan** for the AI, which the website can't.

## Installing

Download the file for your system from the [latest release](https://github.com/fbgallet/unveilboard/releases/latest), under “Assets”:

| Your computer | File to download |
|---|---|
| Recent Mac (Apple chip: M1, M2…) | `Unveilboard-<version>-mac-arm64.dmg` |
| Older Mac (Intel processor) | `Unveilboard-<version>-mac-x64.dmg` |
| Windows | `Unveilboard-<version>-windows-setup.exe` |
| Linux | `Unveilboard-<version>-linux-x86_64.AppImage` |

On a Mac, to find out which chip you have: Apple menu › “About This Mac” (“Chip” or “Processor” line).

The app isn't signed by Apple or Microsoft (that costs a yearly fee), so your system warns you **once**, the first time you open it. That's expected.

### On a Mac

1. Open the downloaded `.dmg` file, then drag **Unveilboard** into the **Applications** folder.
2. Open Unveilboard from the Applications folder. macOS refuses to open it: click **OK** (or **Done**).
3. Open **System Settings › Privacy & Security**, scroll down to “Unveilboard was blocked…” and click **Open Anyway**. Confirm with your password.

From then on, Unveilboard opens like any other app.

### On Windows

1. Open the downloaded `Unveilboard-…-windows-setup.exe` file.
2. If Windows shows “Windows protected your PC”, click **More info**, then **Run anyway**.
3. The app installs by itself, without administrator rights. Unveilboard appears in the Start menu.

### On Linux

1. Make the `.AppImage` file executable: right-click › Properties › Permissions › “Allow executing” (or `chmod +x` in a terminal).
2. Double-click it.

On Ubuntu 22.04 and later, if it doesn't open, install `libfuse2` (`sudo apt install libfuse2t64` on Ubuntu 24.04).

## Using your ChatGPT plan

In the app, Unveilboard's AI can use your ChatGPT subscription: no API key to create, no credit to buy elsewhere.

**What you need**: a **paid** ChatGPT plan. With a free account, ChatGPT refuses the sign-in (“A required authorization is unavailable…”) and offers to upgrade.

**The models depend on your plan.** Unveilboard shows the ones OpenAI makes available to your account. The **ChatGPT Go** plan offers few: in October 2026, GPT-5.5, GPT-5.6 Terra and GPT-5.6 Luna. If a model struggles with a heavy task (a large diagram from a long text), try another one, or use OpenRouter.

To sign in:

1. Open a diagram, click **✦** at the top right, then **AI settings…**.
2. Choose **Your ChatGPT plan**, then click **Continue with ChatGPT**.
3. Your browser opens: sign in to ChatGPT and allow Unveilboard.
4. Back in Unveilboard, your account shows, with the list of models. Pick one, click **Test**, then **Save**.

Good to know:

- **Usage and limits**: Unveilboard's requests count towards your plan's usage, shared with ChatGPT and other connected apps. The **Manage usage** link (in the AI settings) opens ChatGPT's settings, where you can follow this usage and set a limit for Unveilboard alone. When a limit is reached, requests stop until it resets.
- **Security**: the sign-in stays on your computer, encrypted by the system (Keychain on a Mac). Unveilboard doesn't see your ChatGPT conversations.
- **Signing out**: AI settings › **Sign out**. You can also remove Unveilboard from the connected apps in ChatGPT's settings.

The other AI choices remain available: copy the prompt into the assistant of your choice, OpenRouter with your key, or a local model (Ollama, LM Studio). See [Working with an AI](ai.md).

## Updates

The app checks for a new version at startup.

- **Windows and Linux**: it updates itself. It offers to restart, or installs the update when you quit.
- **Mac**: it tells you about the new version and opens the download page. Replace the app in the Applications folder with the new one (same steps as installing). Your diagrams are kept.

## Your diagrams

They stay on your computer, in the app's folder, and survive updates. To back up a diagram or move it to another computer: **Save as…** (`.tldr` file), then **Open a .tldr file** on the other computer.

Location, for the curious: `~/Library/Application Support/Unveilboard` (Mac), `%APPDATA%\Unveilboard` (Windows), `~/.config/Unveilboard` (Linux).

## What differs from the website

- **Phone remote and shared links** go through unveilboard.com: a phone can't reach the app on your computer. The connection between the two devices stays direct.
- **Internet**: still needed for the canvas fonts, the phone remote and an online AI.
- **Local model** (Ollama, LM Studio): allow the origin `http://127.0.0.1:43117`.
- **tldraw licence**: the canvas shows the “Get a license for production” mark, as any tldraw app without a licence for this use.

## For contributors

### Building the app

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

How it works: the Electron main process (`desktop/main.js`) starts Next's standalone server on `127.0.0.1:43117`, always in local mode, then shows it in a window. The port is fixed because the browser storage is tied to it: another port, and the diagrams would no longer be found. Pages of the app open in Electron windows (the projector window included); other links open in your browser. The ChatGPT sign-in (`desktop/chatgpt.js`) follows the protocol OpenAI publishes; its tokens never leave the main process.

### Publishing a release

1. Update the version in `package.json` and `desktop/package.json`, and the changelog.
2. Push a tag: `git tag v0.3.0 && git push origin v0.3.0`.
3. The [Desktop workflow](../.github/workflows/desktop.yml) builds the four installers on GitHub's machines and puts them in a **draft release**.
4. Check the draft, then publish it: installed apps see the new version from then on.

The workflow can also be run by hand (Actions tab › Desktop › Run workflow): it builds the installers without publishing them, as workflow artifacts.
