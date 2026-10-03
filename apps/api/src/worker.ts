import { Api } from "@starter/contract/api";
import { DocumentNotFound } from "@starter/contract/documents";
import { DeckNotFound } from "@starter/contract/slides";
import { User, UserId } from "@starter/contract/user";
import { InvalidOperation } from "@starter/contract/versioning";
import * as Cloudflare from "alchemy/Cloudflare";
import * as SQL from "alchemy/SQL/Postgres";
import { Config, Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";
import { SqlSchema } from "effect/sql";

import { region } from "./database.ts";
import DeckObject from "./deck-object.ts";
import DocumentObject from "./document-object.ts";
import { Postgres } from "./postgres.ts";
import UserStore from "./user-store.ts";

// A typed failure crosses an object stub as a plain tagged object, so each handler rebuilds
// the class before the API encodes it. Goes away with alchemy-run/alchemy#1513.

export default class ApiWorker extends Cloudflare.Worker<ApiWorker>()(
  "Api",
  {
    main: import.meta.url,
    // Cloudflare.Telemetry needs tracing.startActiveSpan, which this date enables.
    compatibility: { date: "2026-08-25" },
    placement: { region: region.workers },
    workersDev: false,
    dev: { port: Config.Number("API_PORT").pipe(Config.withDefault(1338)) },
  },
  Effect.gen(function* () {
    const postgres = yield* Cloudflare.Hyperdrive.Connect(Postgres);
    // Opens a pool on a request's first query and closes it when the request ends: Hyperdrive
    // already keeps the connections to the database warm.
    const sql = yield* SQL.Postgres({
      url: postgres.connectionString,
      // The first connection to a `PS_DEV` branch through `alchemy dev` can take longer than the
      // driver's 5-second default; Hyperdrive keeps deployed connections warm.
      connectTimeout: "15 seconds",
      // Named statements die with the request's connection, and Hyperdrive replays them onto
      // whichever pooled connection it assigns: ~40ms on each request's first query, measured.
      prepare: false,
    });
    const userStores = yield* UserStore;
    const documents = yield* DocumentObject;
    const decks = yield* DeckObject;

    // Storage failures are defects: the HTTP boundary logs them and answers 500.
    const listUsers = SqlSchema.findAll({
      Request: Schema.Void,
      Result: User,
      execute: () => sql`SELECT id, name FROM users ORDER BY created_at, id`,
    });
    const insertUser = SqlSchema.findOne({
      Request: User,
      Result: User,
      execute: (user) => sql`INSERT INTO users ${sql.insert(user)} RETURNING id, name`,
    });
    const usersGroup = HttpApiBuilder.group(Api, "users", (handlers) =>
      handlers.handleAll({
        list: () => Effect.orDie(listUsers(undefined)),
        create: ({ payload }) =>
          Effect.orDie(insertUser({ id: UserId.make(crypto.randomUUID()), name: payload.name })),
      }),
    );

    // Demo routing only. Select the user's object from a verified session before storing private data.
    const files = HttpApiBuilder.group(Api, "files", (handlers) =>
      handlers.handleAll({
        list: ({ params }) => userStores.getByName(params.userId).list(),
        createDocument: ({ params, payload }) =>
          userStores.getByName(params.userId).createDocument(payload),
        createDeck: ({ params, payload }) =>
          userStores.getByName(params.userId).createDeck(payload),
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
        Layer.provide([usersGroup, files, documentsGroup, decksGroup]),
        Layer.provide(HttpServer.layerServices),
        HttpRouter.toHttpEffect,
      ),
    };
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        Cloudflare.Hyperdrive.ConnectBinding,
        // Effect spans join Cloudflare's trace, which already follows the website Worker into
        // this one and on into each Durable Object call. Cloudflare samples and exports it.
        Cloudflare.Telemetry(),
      ),
    ),
  ),
) {}
