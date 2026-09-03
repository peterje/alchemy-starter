import startServer, { type ServerEntry } from "@tanstack/react-start/server-entry";
import { apiPrefix } from "./todos/api.ts";

const serverEntry: ServerEntry = {
  fetch: async (request, options) => {
    if (!new URL(request.url).pathname.startsWith(`${apiPrefix}/`)) {
      return startServer.fetch(request, options);
    }
    // Deferred on purpose: TanStack prerenders the SPA shell by running this
    // entry in Node, where `cloudflare:workers` cannot load. Importing the
    // Worker-only composition lazily keeps it out of that graph.
    const { handleApi } = await import("./todos/worker.ts");
    return handleApi(request);
  },
};

export default serverEntry;
