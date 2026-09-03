import { Effect, Layer } from "effect";
import { HttpServer } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { StarterApi } from "./api.ts";
import { TodoRepository } from "./repository.ts";

export const TodosApiHandlers = HttpApiBuilder.group(
  StarterApi,
  "todos",
  Effect.fn(function* (handlers) {
    const repository = yield* TodoRepository;

    return handlers.handleAll({
      list: () => repository.list(),
      get: ({ params }) => repository.get(params.id),
      create: ({ payload }) => repository.create(payload),
      update: ({ params, payload }) => repository.update(params.id, payload),
      remove: ({ params }) => repository.remove(params.id),
    });
  }),
);

export const TodosApiRoutes = HttpApiBuilder.layer(StarterApi).pipe(
  Layer.provide(TodosApiHandlers),
  Layer.provide(HttpServer.layerServices),
);
