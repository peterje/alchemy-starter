import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { TodosApiRoutes } from "../todos/handlers.ts";
import { TodoRepositoryD1 } from "../todos/repository-d1.ts";

/** Worker composition root: every request under /api is handled by the Effect API. */
const api = HttpRouter.toWebHandler(
  TodosApiRoutes.pipe(Layer.provide(TodoRepositoryD1(env.TODOS))),
);

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      ANY: ({ request }) => api.handler(request),
    },
  },
});
