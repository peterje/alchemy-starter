import { Effect, Layer, Ref } from "effect";
import { Todo, TodoNotFound } from "./api.ts";
import { TodoRepository } from "./repository.ts";

/** In-memory test double for the D1 repository. */
export const TodoRepositoryMemory = Layer.effect(
  TodoRepository,
  Effect.gen(function* () {
    const todos = yield* Ref.make<ReadonlyArray<Todo>>([]);

    // Read and write in one Ref.modify so concurrent requests cannot interleave.
    const modifyExisting = (
      id: string,
      next: (items: ReadonlyArray<Todo>) => ReadonlyArray<Todo>,
    ) =>
      Ref.modify(
        todos,
        (items): readonly [Effect.Effect<Todo, TodoNotFound>, ReadonlyArray<Todo>] => {
          const existing = items.find((item) => item.id === id);
          return existing === undefined
            ? [Effect.fail(new TodoNotFound({ id })), items]
            : [Effect.succeed(existing), next(items)];
        },
      ).pipe(Effect.flatten);

    return {
      list: () => Ref.get(todos),
      get: (id) => modifyExisting(id, (items) => items),
      create: (input) => {
        const todo = new Todo({
          id: crypto.randomUUID(),
          title: input.title,
          completed: false,
        });
        return Ref.update(todos, (items) => [...items, todo]).pipe(Effect.as(todo));
      },
      update: (id, input) => {
        const todo = new Todo({ id, title: input.title, completed: input.completed });
        return modifyExisting(id, (items) =>
          items.map((item) => (item.id === id ? todo : item)),
        ).pipe(Effect.as(todo));
      },
      remove: (id) => modifyExisting(id, (items) => items.filter((item) => item.id !== id)),
    };
  }),
);
