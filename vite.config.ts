import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: true,
    port: 5173,
    open: true
  },

  preview: {
    port: 4173
  },

  build: {
    outDir: "dist",
    sourcemap: true,
    emptyOutDir: true
  },

  assetsInclude: [
    "**/*.svg",
    "**/*.png",
    "**/*.jpg",
    "**/*.jpeg"
  ]
});
