import {
  type Deck,
  DeckFile,
  DeckId,
  DeckNotFound,
  type DeckOperation,
} from "@starter/contract/slides";
import * as Cloudflare from "alchemy/Cloudflare";
import { Context, Effect, Layer, Option, Schema } from "effect";

import { ObjectDatabase } from "./object-database.ts";
import * as VersionedStore from "./versioned-store.ts";

class DeckStore extends Context.Service<DeckStore>()("DeckStore", {
  make: VersionedStore.make(DeckFile),
}) {
  static readonly layer = Layer.effect(this)(this.make).pipe(
    Layer.provide(ObjectDatabase.layer(VersionedStore.migrations)),
  );
}

/** One object per deck: the single writer for its slides and its operation log. */
export default class DeckObject extends Cloudflare.DurableObject<DeckObject>()(
  "DeckObject",
  // No bindings to resolve in the isolate phase; each instance provides its own database.
  Effect.succeed(
    Effect.gen(function* () {
      const state = yield* Cloudflare.DurableObjectState;
      // Objects are addressed by deck ID, so the object's name is its ID.
      const id = Schema.decodeUnknownSync(DeckId)(state.id.name);
      const store = yield* DeckStore;

      return {
        get: Effect.fn("DeckObject.get")(function* () {
          const current = yield* store.read;
          if (Option.isNone(current)) return yield* Effect.fail(new DeckNotFound({ id }));
          return current.value;
        }),
        set: (deck: Deck) => store.set(deck),
        apply: Effect.fn("DeckObject.apply")(function* (operation: DeckOperation) {
          const result = yield* store.apply(operation);
          if (Option.isNone(result)) return yield* Effect.fail(new DeckNotFound({ id }));
          return result.value;
        }),
      };
    }).pipe(Effect.provide(DeckStore.layer)),
  ),
) {}
