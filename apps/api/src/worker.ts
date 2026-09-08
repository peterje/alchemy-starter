import { Api } from "@starter/contract/api";
import { DocumentNotFound } from "@starter/contract/documents";
import { DeckNotFound } from "@starter/contract/slides";
import { InvalidOperation } from "@starter/contract/versioning";
import * as Cloudflare from "alchemy/Cloudflare";
import { Config, Effect, Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";

import DeckObject from "./deck-object.ts";
import DocumentObject from "./document-object.ts";
import UserStore from "./user-store.ts";

// A typed failure crosses an object stub as a plain tagged object, so each handler rebuilds
// the class before the API encodes it. Goes away with alchemy-run/alchemy#1513.

export default class ApiWorker extends Cloudflare.Worker<ApiWorker>()(
  "Api",
  {
    main: import.meta.url,
    workersDev: false,
    dev: { port: Config.number("API_PORT").pipe(Config.withDefault(1338)) },
  },
  Effect.gen(function* () {
    const users = yield* UserStore;
    const documents = yield* DocumentObject;
    const decks = yield* DeckObject;

    // Demo routing only. Select the user's object from a verified session before storing private data.
    const files = HttpApiBuilder.group(Api, "files", (handlers) =>
      handlers.handleAll({
        list: ({ params }) => users.getByName(params.userId).list(),
        createDocument: ({ params, payload }) =>
          users.getByName(params.userId).createDocument(payload),
        createDeck: ({ params, payload }) => users.getByName(params.userId).createDeck(payload),
      }),
    );
    const documentsGroup = HttpApiBuilder.group(Api, "documents", (handlers) =>
      handlers.handleAll({
        get: ({ params }) =>
          documents
            .getByName(params.documentId)
            .get()
            .pipe(
              Effect.catchTag("DocumentNotFound", (error) =>
                Effect.fail(new DocumentNotFound({ id: error.id })),
              ),
            ),
        set: ({ params, payload }) => documents.getByName(params.documentId).set(payload),
        apply: ({ params, payload }) =>
          documents
            .getByName(params.documentId)
            .apply(payload)
            .pipe(
              Effect.catchTag("DocumentNotFound", (error) =>
                Effect.fail(new DocumentNotFound({ id: error.id })),
              ),
              Effect.catchTag("InvalidOperation", (error) =>
                Effect.fail(
                  new InvalidOperation({ operationId: error.operationId, message: error.message }),
                ),
              ),
            ),
      }),
    );
    const decksGroup = HttpApiBuilder.group(Api, "decks", (handlers) =>
      handlers.handleAll({
        get: ({ params }) =>
          decks
            .getByName(params.deckId)
            .get()
            .pipe(
              Effect.catchTag("DeckNotFound", (error) =>
                Effect.fail(new DeckNotFound({ id: error.id })),
              ),
            ),
        set: ({ params, payload }) => decks.getByName(params.deckId).set(payload),
        apply: ({ params, payload }) =>
          decks
            .getByName(params.deckId)
            .apply(payload)
            .pipe(
              Effect.catchTag("DeckNotFound", (error) =>
                Effect.fail(new DeckNotFound({ id: error.id })),
              ),
              Effect.catchTag("InvalidOperation", (error) =>
                Effect.fail(
                  new InvalidOperation({ operationId: error.operationId, message: error.message }),
                ),
              ),
            ),
      }),
    );
    return {
      fetch: HttpApiBuilder.layer(Api).pipe(
        Layer.provide([files, documentsGroup, decksGroup]),
        Layer.provide(HttpServer.layerServices),
        HttpRouter.toHttpEffect,
      ),
    };
  }),
) {}
