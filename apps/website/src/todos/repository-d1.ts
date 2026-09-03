import { Effect, Layer } from "effect";
import { Todo, TodoNotFound, TodoStorageError } from "./api.ts";
import { TodoRepository } from "./repository.ts";

interface TodoRow {
  readonly id: string;
  readonly title: string;
  readonly completed: number;
}

const toTodo = (row: TodoRow) =>
  new Todo({
    id: row.id,
    title: row.title,
    completed: row.completed === 1,
  });

const storageError = (operation: string) => () =>
  new TodoStorageError({ operation, message: "Todo storage is unavailable" });

/** D1-backed repository. Takes the binding so only the composition root touches `cloudflare:workers`. */
export const TodoRepositoryD1 = (db: D1Database) => {
  const getTodo = (id: string) =>
    Effect.tryPromise({
      try: () =>
        db.prepare("SELECT id, title, completed FROM todos WHERE id = ?").bind(id).first<TodoRow>(),
      catch: storageError("get"),
    }).pipe(
      Effect.flatMap((row) =>
        row === null ? Effect.fail(new TodoNotFound({ id })) : Effect.succeed(toTodo(row)),
      ),
    );

  return Layer.succeed(TodoRepository, {
    list: () =>
      Effect.tryPromise({
        try: async () => {
          const result = await db
            .prepare("SELECT id, title, completed FROM todos ORDER BY created_at ASC, id ASC")
            .all<TodoRow>();
          return result.results.map(toTodo);
        },
        catch: storageError("list"),
      }),
    get: getTodo,
    create: (input) => {
      const todo = new Todo({
        id: crypto.randomUUID(),
        title: input.title,
        completed: false,
      });
      return Effect.tryPromise({
        try: () =>
          db
            .prepare("INSERT INTO todos (id, title, completed) VALUES (?, ?, ?)")
            .bind(todo.id, todo.title, 0)
            .run(),
        catch: storageError("create"),
      }).pipe(Effect.as(todo));
    },
    update: (id, input) =>
      Effect.gen(function* () {
        yield* getTodo(id);
        yield* Effect.tryPromise({
          try: () =>
            db
              .prepare("UPDATE todos SET title = ?, completed = ? WHERE id = ?")
              .bind(input.title, input.completed ? 1 : 0, id)
              .run(),
          catch: storageError("update"),
        });
        return new Todo({ id, title: input.title, completed: input.completed });
      }),
    remove: (id) =>
      Effect.gen(function* () {
        const todo = yield* getTodo(id);
        yield* Effect.tryPromise({
          try: () => db.prepare("DELETE FROM todos WHERE id = ?").bind(id).run(),
          catch: storageError("remove"),
        });
        return todo;
      }),
  });
};
