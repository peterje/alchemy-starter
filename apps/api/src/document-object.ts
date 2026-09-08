import {
  type Document,
  DocumentFile,
  DocumentId,
  DocumentNotFound,
  type DocumentOperation,
} from "@starter/contract/documents";
import * as Cloudflare from "alchemy/Cloudflare";
import { Context, Effect, Layer, Option, Schema } from "effect";

import { ObjectDatabase } from "./object-database.ts";
import * as VersionedStore from "./versioned-store.ts";

class DocumentStore extends Context.Service<DocumentStore>()("DocumentStore", {
  make: VersionedStore.make(DocumentFile),
}) {
  static readonly layer = Layer.effect(this)(this.make).pipe(
    Layer.provide(ObjectDatabase.layer(VersionedStore.migrations)),
  );
}

/** One object per document: the single writer for its blocks and its operation log. */
export default class DocumentObject extends Cloudflare.DurableObject<DocumentObject>()(
  "DocumentObject",
  // No bindings to resolve in the isolate phase; each instance provides its own database.
  Effect.succeed(
    Effect.gen(function* () {
      const state = yield* Cloudflare.DurableObjectState;
      // Objects are addressed by document ID, so the object's name is its ID.
      const id = Schema.decodeUnknownSync(DocumentId)(state.id.name);
      const store = yield* DocumentStore;

      return {
        get: Effect.fn("DocumentObject.get")(function* () {
          const current = yield* store.read;
          if (Option.isNone(current)) return yield* Effect.fail(new DocumentNotFound({ id }));
          return current.value;
        }),
        set: (document: Document) => store.set(document),
        apply: Effect.fn("DocumentObject.apply")(function* (operation: DocumentOperation) {
          const result = yield* store.apply(operation);
          if (Option.isNone(result)) return yield* Effect.fail(new DocumentNotFound({ id }));
          return result.value;
        }),
      };
    }).pipe(Effect.provide(DocumentStore.layer)),
  ),
) {}
