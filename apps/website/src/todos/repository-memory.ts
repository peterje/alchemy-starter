import { Effect, Layer, Ref } from "effect";
import { Todo, TodoNotFound } from "./api.ts";
import { TodoRepository } from "./repository.ts";

export const TodoRepositoryMemory = Layer.effect(
  TodoRepository,
  Effect.gen(function* () {
    const todos = yield* Ref.make<ReadonlyArray<Todo>>([]);

    return {
      list: () => Ref.get(todos),
      get: (id: string) =>
        Ref.get(todos).pipe(
          Effect.flatMap((items) => {
            const todo = items.find((item) => item.id === id);
            return todo === undefined
              ? Effect.fail(new TodoNotFound({ id }))
              : Effect.succeed(todo);
          }),
        ),
      create: (input) =>
        Effect.gen(function* () {
          const todo = new Todo({
            id: crypto.randomUUID(),
            title: input.title,
            completed: false,
          });
          yield* Ref.update(todos, (items) => [...items, todo]);
          return todo;
        }),
      update: (id, input) =>
        Effect.gen(function* () {
          const items = yield* Ref.get(todos);
          const existing = items.find((item) => item.id === id);
          if (existing === undefined) {
            return yield* Effect.fail(new TodoNotFound({ id }));
          }
          const todo = new Todo({ id, title: input.title, completed: input.completed });
          yield* Ref.update(todos, (current) =>
            current.map((item) => (item.id === id ? todo : item)),
          );
          return todo;
        }),
      remove: (id) =>
        Effect.gen(function* () {
          const items = yield* Ref.get(todos);
          const existing = items.find((item) => item.id === id);
          if (existing === undefined) {
            return yield* Effect.fail(new TodoNotFound({ id }));
          }
          yield* Ref.update(todos, (current) => current.filter((item) => item.id !== id));
          return existing;
        }),
    };
  }),
);
