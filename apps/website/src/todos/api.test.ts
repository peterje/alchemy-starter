import { afterAll, expect, test } from "bun:test";
import { Layer, Schema } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { Todo } from "./api.ts";
import { TodosApiRoutes } from "./handlers.ts";
import { TodoRepositoryMemory } from "./repository-memory.ts";

const api = HttpRouter.toWebHandler(TodosApiRoutes.pipe(Layer.provide(TodoRepositoryMemory)), {
  disableLogger: true,
});
const decodeTodo = Schema.decodeUnknownPromise(Todo);
const decodeTodos = Schema.decodeUnknownPromise(Schema.Array(Todo));

const request = (path: string, init?: RequestInit) =>
  api.handler(new Request(`http://localhost${path}`, init));

interface TodoRequestBody {
  readonly title: string;
  readonly completed?: boolean;
}

const jsonRequest = (method: string, body: TodoRequestBody): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

afterAll(() => api.dispose());

test("the Effect API supports the todo CRUD lifecycle", async () => {
  const initialResponse = await request("/api/todos/");
  expect(initialResponse.status).toBe(200);
  expect(await decodeTodos(await initialResponse.json())).toEqual([]);

  const invalidResponse = await request("/api/todos/", jsonRequest("POST", { title: "   " }));
  expect(invalidResponse.status).toBe(400);

  const missingResponse = await request("/api/todos/missing");
  expect(missingResponse.status).toBe(404);

  const createResponse = await request(
    "/api/todos/",
    jsonRequest("POST", { title: "Ship the Effect example" }),
  );
  expect(createResponse.status).toBe(200);
  const created = await decodeTodo(await createResponse.json());
  expect(created.title).toBe("Ship the Effect example");
  expect(created.completed).toBe(false);

  const getResponse = await request(`/api/todos/${created.id}`);
  expect(getResponse.status).toBe(200);
  expect(await decodeTodo(await getResponse.json())).toEqual(created);

  const updateResponse = await request(
    `/api/todos/${created.id}`,
    jsonRequest("PUT", { title: created.title, completed: true }),
  );
  expect(updateResponse.status).toBe(200);
  const updated = await decodeTodo(await updateResponse.json());
  expect(updated.completed).toBe(true);

  const deleteResponse = await request(`/api/todos/${created.id}`, { method: "DELETE" });
  expect(deleteResponse.status).toBe(200);
  expect(await decodeTodo(await deleteResponse.json())).toEqual(updated);

  const finalResponse = await request("/api/todos/");
  expect(await decodeTodos(await finalResponse.json())).toEqual([]);
});
