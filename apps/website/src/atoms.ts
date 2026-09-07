// Not `client.ts`: TanStack Start would treat that file as the browser entry and skip hydration.
import { Api } from "@starter/contract/api";
import { UserId } from "@starter/contract/user";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { Layer } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http";
import { Atom, AtomHttpApi } from "effect/unstable/reactivity";

const pageOrigin = createIsomorphicFn()
  .client(() => globalThis.location.origin)
  .server(() => getRequestUrl().origin);

// During SSR the website Worker reaches the API through its service binding, which runs in
// process, instead of an HTTP round trip to its own origin. Only the browser uses the network.
const transport = createIsomorphicFn()
  .client(() => FetchHttpClient.layer)
  .server(() =>
    FetchHttpClient.layer.pipe(
      Layer.provide(
        Layer.succeed(FetchHttpClient.Fetch, (input, init) => env.API.fetch(input, init)),
      ),
    ),
  );

/** One client for every API group. Routes query and mutate through its atoms. */
export const client = AtomHttpApi.Service()("ApiClient", {
  api: Api,
  httpClient: transport(),
  // workerd requires absolute URLs; resolve against the request origin during SSR.
  transformClient: HttpClient.mapRequest((request) =>
    HttpClientRequest.prependUrl(request, pageOrigin()),
  ),
});

export const userAtom = Atom.make(UserId.make("alice"));
