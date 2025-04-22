// vite.config.js
import { sync } from "glob";
import { ViteMinifyPlugin } from "vite-plugin-minify";
import { resolve } from "path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const base = process.env.BASE || '/'

export default defineConfig({
  server:{
     middlewareMode: true,
     proxy: {
      '/ws':{
        target: 'ws://localhost:5173',
        ws: true,
      }
     }
  },
  base,
  resolve: {
    alias: {
      "@": resolve(__dirname, "app"),
    },
  },
  root: "./app",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: sync("./app/**/*.html".replace(/\\/g, "/")),
    },
  },
  plugins: [tailwindcss(), ViteMinifyPlugin()],
});
