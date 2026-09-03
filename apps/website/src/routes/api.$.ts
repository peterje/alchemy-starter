import { ApiRoutes } from "@starter/api/server";
import { TodoRepositoryD1 } from "@starter/todos/server";
import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";

/** Worker composition root: bind platform resources to the API and serve it under /api. */
const api = HttpRouter.toWebHandler(ApiRoutes.pipe(Layer.provide(TodoRepositoryD1(env.TODOS))));

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      ANY: ({ request }) => api.handler(request),
    },
  },
});
