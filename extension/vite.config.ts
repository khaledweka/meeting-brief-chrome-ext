import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: "./",
  publicDir: "public",
  root,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    // Avoid Vite's import preload helper (uses window/document) in the MV3 service worker bundle.
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: fileURLToPath(new URL("popup.html", import.meta.url)),
        offscreen: fileURLToPath(new URL("offscreen.html", import.meta.url)),
        download: fileURLToPath(new URL("download.html", import.meta.url)),
        setup: fileURLToPath(new URL("setup.html", import.meta.url)),
        background: fileURLToPath(new URL("src/background.ts", import.meta.url)),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name][extname]",
        format: "es",
      },
    },
  },
});
