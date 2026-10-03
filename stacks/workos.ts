import { CredentialsFromEnv, Services } from "@distilled.cloud/workos";
import { Resource } from "alchemy";
import * as Provider from "alchemy/Provider";
import { Effect, Layer, Option, Schema } from "effect";
import { FetchHttpClient } from "effect/http";

/**
 * A redirect URI registered with a WorkOS environment. Each stage registers its own callback,
 * so a pull request's preview can complete sign-in, and destroying the stage removes it.
 * Authenticates with `WORKOS_API_KEY` (and `WORKOS_API_URL`) from the deploying environment.
 */
export interface RedirectUriProps {
  readonly uri: string;
}
export interface RedirectUriAttributes {
  readonly id: string;
  readonly uri: string;
}
export type RedirectUri = Resource<"WorkOS.RedirectUri", RedirectUriProps, RedirectUriAttributes>;
export const RedirectUri = Resource<RedirectUri>("WorkOS.RedirectUri");

const Registered = Schema.Struct({ id: Schema.String, uri: Schema.String });
const workos = Layer.mergeAll(CredentialsFromEnv, FetchHttpClient.layer);

const find = Effect.fn("RedirectUri.find")(function* (uri: string) {
  let after: string | undefined;
  while (true) {
    const page = yield* Services.workos.ListRedirectUrisController(
      after === undefined ? { limit: 100 } : { limit: 100, after },
    );
    const match = page.data?.find((registered) => registered.uri === uri);
    if (match !== undefined)
      return Option.some(yield* Schema.decodeUnknownEffect(Registered)(match));
    after = page.list_metadata?.after ?? undefined;
    if (after === undefined) return Option.none();
  }
});

const remove = (id: string) =>
  Services.workos.DeleteRedirectUrisController({ id }).pipe(
    Effect.asVoid,
    // Already gone, or the environment's default, which WorkOS refuses to delete.
    Effect.catchTags({ NotFound: () => Effect.void, Conflict: () => Effect.void }),
  );

export const providers = () =>
  Provider.succeed(
    RedirectUri,
    RedirectUri.Provider.of({
      reconcile: ({ news, output }) =>
        Effect.gen(function* () {
          // Another deploy, or the dashboard, may have registered it already.
          const existing = yield* find(news.uri);
          const registered = Option.isSome(existing)
            ? existing.value
            : yield* Services.workos
                .CreateRedirectUrisController({ uri: news.uri })
                .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Registered)));
          // A changed URI leaves the previous registration behind; remove it.
          if (output !== undefined && output.id !== registered.id) yield* remove(output.id);
          return registered;
        }).pipe(Effect.provide(workos)),
      // Deletes whatever WorkOS has registered for the URI now: it may have been removed and
      // registered again under a new id since this resource last ran.
      delete: ({ output }) =>
        Effect.gen(function* () {
          const registered = yield* find(output.uri);
          if (Option.isSome(registered)) yield* remove(registered.value.id);
        }).pipe(Effect.provide(workos)),
      list: () => Effect.succeed([]),
    }),
  );
