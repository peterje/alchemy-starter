import { Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { TodosApiRoutes } from "./handlers.ts";
import { TodoRepositoryMemory } from "./repository-memory.ts";

const api = HttpRouter.toWebHandler(TodosApiRoutes.pipe(Layer.provide(TodoRepositoryMemory)), {
  disableLogger: true,
});

Bun.serve({
  hostname: "127.0.0.1",
  port: 1338,
  fetch: (request) => api.handler(request),
});
