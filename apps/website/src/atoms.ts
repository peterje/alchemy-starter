import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http";
import { Atom, AtomHttpApi } from "effect/unstable/reactivity";
import { Api } from "./api.ts";
import { UserId } from "./user.ts";

const pageOrigin = createIsomorphicFn()
  .client(() => globalThis.location.origin)
  .server(() => getRequestUrl().origin);

// Not `client.ts`: TanStack Start would treat that file as the browser entry and skip hydration.

/** One client for every API group. Routes query and mutate through its atoms. */
export const client = AtomHttpApi.Service()("ApiClient", {
  api: Api,
  httpClient: FetchHttpClient.layer,
  // workerd requires absolute URLs; resolve against the request origin during SSR.
  transformClient: HttpClient.mapRequest((request) =>
    HttpClientRequest.prependUrl(request, pageOrigin()),
  ),
});

export const userAtom = Atom.make(UserId.make("alice"));
