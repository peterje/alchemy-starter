import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Vite and TanStack Start build configuration for the Cloudflare website. */
export default defineConfig({
  plugins: [
    tanstackStart({
      spa: {
        enabled: true,
      },
      server: {
        entry: "./server.ts",
      },
      router: {
        generatedRouteTree: "./.tanstack/routeTree.gen.ts",
      },
    }),
    viteReact(),
  ],
  server: {
    proxy: {
      "/api/todos": "http://127.0.0.1:1338",
    },
  },
  build: {
    rollupOptions: {
      external: ["cloudflare:workers"],
    },
  },
});
