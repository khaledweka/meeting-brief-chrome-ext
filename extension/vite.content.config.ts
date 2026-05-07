import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

/**
 * Content scripts cannot use ES module `import` in the page context.
 * Build a single IIFE so Meet receives plain script syntax.
 */
const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    sourcemap: true,
    lib: {
      entry: fileURLToPath(new URL("src/content.ts", import.meta.url)),
      name: "MeetingBriefContent",
      formats: ["iife"],
      fileName: () => "content.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
