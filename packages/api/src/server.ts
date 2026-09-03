import { TodoRepository } from "@starter/todos/server";
import { Effect, Layer } from "effect";
import { HttpServer } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { StarterApi } from "./contract.ts";

const TodosApiHandlers = HttpApiBuilder.group(
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

/** HTTP router for the whole API. Requires each domain's repository Layer from the host. */
export const ApiRoutes = HttpApiBuilder.layer(StarterApi).pipe(
  Layer.provide(TodosApiHandlers),
  Layer.provide(HttpServer.layerServices),
);
