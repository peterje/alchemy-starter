import { env } from "cloudflare:workers";
import { Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { TodosApiRoutes } from "./handlers.ts";
import { TodoRepositoryD1 } from "./repository-d1.ts";

/** Worker-only composition root: the single place that reads Cloudflare bindings. */
const api = HttpRouter.toWebHandler(
  TodosApiRoutes.pipe(Layer.provide(TodoRepositoryD1(env.TODOS))),
);

export const handleApi = api.handler;
