# Meeting Brief — browser extension

## Load this in Chrome / Edge

Chrome only looks for `manifest.json` in the folder you choose for **Load unpacked**.

1. Build once (from this `extension` folder):

   ```bash
   npm install
   npm run build
   ```

   `npm run build` runs two steps: ES-module bundles for the popup/service worker, then a **single-file IIFE** for `content.js` (required because Meet injects the content script as a classic script, not an ES module).

   If you use `npm run dev`, open a **second** terminal and run `vite build --watch --config vite.content.config.ts` so `content.js` stays rebuilt while you edit `src/content.ts`.

2. In `chrome://extensions` or `edge://extensions`, enable **Developer mode** → **Load unpacked**.

3. Select the **`dist`** folder inside this directory — **not** the repo root, **not** `extension` itself:

   **Correct path:** `…\meeting-brief-chrome-ext\extension\dist`

   You should see `manifest.json`, `background.js`, and `popup.html` directly inside that folder.

If `dist` is missing, the build step has not been run yet.
