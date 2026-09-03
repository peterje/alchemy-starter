import { Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { TodosApiRoutes } from "./handlers.ts";
import { TodoRepositoryD1 } from "./repository-d1.ts";

const api = HttpRouter.toWebHandler(TodosApiRoutes.pipe(Layer.provide(TodoRepositoryD1)));

export const handleTodosApi = api.handler;
