import { Context, type Effect } from "effect";
import type { Todo, TodoCreate, TodoNotFound, TodoStorageError, TodoUpdate } from "./api.ts";

export class TodoRepository extends Context.Service<
  TodoRepository,
  {
    readonly list: () => Effect.Effect<ReadonlyArray<Todo>, TodoStorageError>;
    readonly get: (id: string) => Effect.Effect<Todo, TodoNotFound | TodoStorageError>;
    readonly create: (input: TodoCreate) => Effect.Effect<Todo, TodoStorageError>;
    readonly update: (
      id: string,
      input: TodoUpdate,
    ) => Effect.Effect<Todo, TodoNotFound | TodoStorageError>;
    readonly remove: (id: string) => Effect.Effect<Todo, TodoNotFound | TodoStorageError>;
  }
>()("starter/TodoRepository") {}
