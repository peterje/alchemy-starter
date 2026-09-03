import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

const TodoTitle = Schema.Trim.check(Schema.isNonEmpty(), Schema.isMaxLength(80));

export class Todo extends Schema.Class<Todo>("Todo")({
  id: Schema.String,
  title: TodoTitle,
  completed: Schema.Boolean,
}) {}

export class TodoCreate extends Schema.Class<TodoCreate>("TodoCreate")({
  title: TodoTitle,
}) {}

export class TodoUpdate extends Schema.Class<TodoUpdate>("TodoUpdate")({
  title: TodoTitle,
  completed: Schema.Boolean,
}) {}

export class TodoNotFound extends Schema.TaggedError<TodoNotFound>()(
  "TodoNotFound",
  { id: Schema.String },
  { httpApiStatus: 404 },
) {}

export class TodoStorageError extends Schema.TaggedError<TodoStorageError>()(
  "TodoStorageError",
  {
    operation: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 500 },
) {}

const endpointErrors = [TodoStorageError] as const;

export class TodosApiGroup extends HttpApiGroup.make("todos")
  .add(
    HttpApiEndpoint.get("list", "/", {
      success: Schema.Array(Todo),
      error: endpointErrors,
    }),
    HttpApiEndpoint.get("get", "/:id", {
      params: { id: Schema.String },
      success: Todo,
      error: [TodoNotFound, ...endpointErrors],
    }),
    HttpApiEndpoint.post("create", "/", {
      payload: TodoCreate,
      success: Todo,
      error: endpointErrors,
    }),
    HttpApiEndpoint.put("update", "/:id", {
      params: { id: Schema.String },
      payload: TodoUpdate,
      success: Todo,
      error: [TodoNotFound, ...endpointErrors],
    }),
    HttpApiEndpoint.delete("remove", "/:id", {
      params: { id: Schema.String },
      success: Todo,
      error: [TodoNotFound, ...endpointErrors],
    }),
  )
  .prefix("/todos") {}

export const apiPrefix = "/api";

export class StarterApi extends HttpApi.make("StarterApi").add(TodosApiGroup).prefix(apiPrefix) {}
