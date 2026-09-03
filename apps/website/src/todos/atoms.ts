import { StarterApi } from "@starter/api";
import { FetchHttpClient } from "effect/unstable/http";
import { AtomHttpApi } from "effect/unstable/reactivity";

export const TodoApiClient = AtomHttpApi.Service()("starter/TodoApiClient", {
  api: StarterApi,
  httpClient: FetchHttpClient.layer,
});

export const todoReactivityKeys: ReadonlyArray<unknown> = ["todos"];

export const todosAtom = TodoApiClient.query("todos", "list", {
  reactivityKeys: todoReactivityKeys,
  serializationKey: "list",
  timeToLive: "30 seconds",
});

export const createTodoAtom = TodoApiClient.mutation("todos", "create", {
  responseMode: "decoded-only",
});

export const updateTodoAtom = TodoApiClient.mutation("todos", "update", {
  responseMode: "decoded-only",
});

export const removeTodoAtom = TodoApiClient.mutation("todos", "remove", {
  responseMode: "decoded-only",
});
