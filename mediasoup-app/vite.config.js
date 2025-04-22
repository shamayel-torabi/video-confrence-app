// vite.config.js
import { sync } from "glob";
import tailwindcss from "@tailwindcss/vite";
import { ViteMinifyPlugin } from "vite-plugin-minify";
import { resolve } from "path";

export default {
  resolve: {
    alias: {
      "@js": resolve(__dirname, "src/assets/js"),
    },
  },
  plugins: [tailwindcss(), ViteMinifyPlugin()],
  root: "./src",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: sync("./src/**/*.html".replace(/\\/g, "/")),
    },
  },
};
