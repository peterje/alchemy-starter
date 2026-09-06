import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    viteReact(),
    {
      name: "server-only-guard",
      enforce: "pre",
      resolveId(source, importer) {
        if (this.environment.name === "client" && source === "cloudflare:workers") {
          throw new Error(`Server-only code imported by ${importer}`);
        }
      },
    },
  ],
  build: { rollupOptions: { external: ["cloudflare:workers"] } },
});
