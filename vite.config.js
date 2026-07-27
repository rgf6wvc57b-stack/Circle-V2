import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
 plugins:[cloudflare()],
  base: "/",
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: true,
  },
});