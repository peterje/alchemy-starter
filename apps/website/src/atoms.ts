// Not `client.ts`: TanStack Start would treat that file as the browser entry and skip hydration.
import { Api } from "@starter/contract/api";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestUrl } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { Layer } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { AtomHttpApi } from "effect/reactivity";

const pageOrigin = createIsomorphicFn()
  .client(() => globalThis.location.origin)
  .server(() => getRequestUrl().origin);

// The browser attaches the session cookie itself; a server render calls the API on the visitor's
// behalf, so it forwards the cookie the visitor sent.
const visitorCookie = createIsomorphicFn()
  .client(() => undefined)
  .server(() => getRequestHeader("cookie"));

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
  transformClient: HttpClient.mapRequest((request) => {
    const absolute = HttpClientRequest.prependUrl(request, pageOrigin());
    const cookie = visitorCookie();
    return cookie === undefined
      ? absolute
      : HttpClientRequest.setHeader(absolute, "cookie", cookie);
  }),
});

/** The signed-in user, or `Unauthorized` when nobody is. */
export const meAtom = client.query("users", "me", { reactivityKeys: ["me"] });
