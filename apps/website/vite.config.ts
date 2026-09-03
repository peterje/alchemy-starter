import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const serverOnlySpecifier = /^(?:cloudflare:workers|@starter\/[^/]+\/(?:server|testing))$/u;

/**
 * Fail the build if server-only code reaches the browser. TanStack strips route
 * `server` handlers from the client bundle, but nothing stops a component or
 * loader from importing an implementation module directly. This makes that a
 * build error with the importer named, rather than a silently shipped secret.
 */
const serverOnlyGuard: Plugin = {
  name: "starter:server-only-guard",
  enforce: "pre",
  resolveId(source, importer) {
    if (this.environment.name === "client" && serverOnlySpecifier.test(source)) {
      throw new Error(`"${source}" is server-only but was imported by ${importer ?? "the client"}`);
    }
    return null;
  },
};

/** Vite and TanStack Start build configuration for the Cloudflare website. */
export default defineConfig({
  plugins: [
    serverOnlyGuard,
    tanstackStart({
      router: {
        generatedRouteTree: "./.tanstack/routeTree.gen.ts",
      },
    }),
    viteReact(),
  ],
  build: {
    rollupOptions: {
      external: ["cloudflare:workers"],
    },
  },
});
