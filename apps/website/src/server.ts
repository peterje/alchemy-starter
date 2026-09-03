import startServer, { type ServerEntry } from "@tanstack/react-start/server-entry";

const serverEntry: ServerEntry = {
  fetch: async (request, options) => {
    const pathname = new URL(request.url).pathname;
    const isApiRequest = pathname === "/api" || pathname.startsWith("/api/");

    if (isApiRequest) {
      const api = await import("./todos/http-production.ts");
      return api.handleTodosApi(request);
    }
    return startServer.fetch(request, options);
  },
};

export default serverEntry;
