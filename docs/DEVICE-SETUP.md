# Working on the desktop and laptop

## Project state

- Repository: https://github.com/stozi93-cell/gym-app.git
- Current development branch: `codex-safe-work`.
- Desktop folder: `C:\Users\stozi\Desktop\gym-booking`.
- Redesign checkpoint: `a4a7d84` (`Checkpoint redesign and progress update`).
- The redesign is under review on a Firebase Hosting preview channel. Do not
  deploy Hosting, Functions, or Storage rules to production as part of device setup.
- Preview channel: `redesign-preview`.
- Preview address: https://gym-booking-a75f8--redesign-preview-33uxnr0g.web.app
  (the channel expires unless renewed).

The checkpoint contains the brand redesign, navigation and dashboard changes,
profile tabs, booking day picker, chat improvements, notification settings, and
the optional sleep, nutrition, training, and measurement features in Napredak.
The next product step is the owner's review of the preview before further polish.
Project discussion and documentation are in English; app text uses Serbian Latin.

Firebase project `gym-booking-a75f8` holds the app's data. Local and hosted previews
currently connect to that same project. Creating or editing a booking, payment,
subscription, message, or profile from a preview can change live data. Cloning,
installing dependencies, and building do not themselves change that data.

## Prepare the laptop

1. Inspect the existing gym folder before changing anything. Record its path,
   remote, branch, latest commit, and `git status --short --branch`. Keep any local
   changes and commits. Do not use reset, clean, or an overwrite to update it.
2. Use a fresh folder for the current copy. Leave the old folder where it is for
   comparison. The destination below must not already exist.
3. Check that Git and Node.js are installed. Node.js 24 matches the version in
   `functions/package.json` and is suitable for this project. Check versions with
   `git --version`, `node --version`, and `npm --version`.
4. In PowerShell, choose the parent folder, then download the development branch:

   ```powershell
   git clone --branch codex-safe-work https://github.com/stozi93-cell/gym-app.git gym-booking-current
   Set-Location -LiteralPath .\gym-booking-current
   ```

   Sign into GitHub through its normal sign-in flow if requested. Do not paste
   passwords or access tokens into a chat or a command.
5. Verify the downloaded version:

   ```powershell
   git status --short --branch
   git rev-parse HEAD
   git ls-remote --heads origin codex-safe-work
   ```

   The two full commit IDs should match. Confirm the branch is `codex-safe-work`.
6. Install the frontend libraries from the saved dependency versions and build:

   ```powershell
   npm ci
   npm run build
   ```

   The current repository already tracks the frontend Firebase configuration in
   `.env` and `.env.production`. Do not replace it with files from the older
   laptop copy. Machine-specific `.env.local` overrides, if present in a reused
   folder, need inspection because Git does not transfer them.
7. Add the fresh project folder to Codex on the laptop. Point the task to this
   document for project context. Downloading the repository does not copy Codex
   conversation history or account sign-ins.
8. Start the local preview when needed:

   ```powershell
   npm run dev
   ```

   Open the Local URL printed by Vite. Port 5173 is usual; Vite may choose another
   port if it is occupied. The laptop's localhost address belongs to the laptop,
   while the desktop's localhost address belongs to the desktop.

Firebase CLI login is not needed to run the frontend locally. If later working
on backend code, install its dependencies with `npm --prefix functions ci`.
Deployment remains a separate, explicitly requested step.

## Switching computers

GitHub carries saved code changes between computers. Connecting to the desktop
remotely operates its existing copy; it does not continuously synchronize an
independent laptop copy.

Before finishing on one computer, review the intended source changes, commit
them, and run `git push origin codex-safe-work`. Leave database backups, screenshots,
credentials, and generated caches out of commits. Local artifact folders are
ignored; an already tracked Firebase cache can still appear as modified.

On the other computer, first run `git status --short --branch`. When the working
tree is clean and the branch is `codex-safe-work`, run:

```powershell
git pull --ff-only origin codex-safe-work
```

If there are unsaved changes, a different branch, or Git refuses the update,
stop and compare the versions. Do not force-push, reset, discard, or overwrite
either copy. Prefer working on this shared branch from one computer at a time.
After a dependency-lockfile change, run `npm ci` before the next build.

Git does not transfer installed libraries, running servers, Firebase or GitHub
sign-ins, local backups, or files outside the repository. The original logo
source assets are outside this repository; the app-ready assets are included
under `public/assets/brand`.

## Remaining verification before a release

- Review the redesign with the owner before a live deployment.
- Check permissions for saving optional `healthLogs` in Napredak. This repository
  has Storage rules but no versioned Firestore rules; a successful frontend build
  does not verify database write permissions.
- The checkpoint includes server changes to notifications and check-in cleanup.
  A Hosting preview deploy alone does not deploy those Functions changes.
- Preserve all existing billing, payment, subscription, and booking data.
