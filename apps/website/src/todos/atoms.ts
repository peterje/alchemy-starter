import { StarterApi } from "@starter/api";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http";
import { AtomHttpApi } from "effect/unstable/reactivity";
import { pageOrigin } from "./page-origin.ts";

/**
 * workerd `fetch` rejects relative URLs. The browser does not. Resolve against
 * the current page origin so the same AtomHttpApi client works during SSR.
 */
function withPageOrigin(client: HttpClient.HttpClient): HttpClient.HttpClient {
  return HttpClient.mapRequest(client, (request) => {
    try {
      new URL(request.url);
      return request;
    } catch {
      return HttpClientRequest.setUrl(request, new URL(request.url, pageOrigin()));
    }
  });
}

export const TodoApiClient = AtomHttpApi.Service()("starter/TodoApiClient", {
  api: StarterApi,
  httpClient: FetchHttpClient.layer,
  transformClient: withPageOrigin,
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
