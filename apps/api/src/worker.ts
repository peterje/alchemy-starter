import { Api } from "@starter/contract/api";
import * as Cloudflare from "alchemy/Cloudflare";
import * as SQL from "alchemy/SQL/Postgres";
import { Config, Effect, Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";

import { AuthenticationMiddleware, AuthHandlers, SessionsHandlers, WorkOSAuth } from "./auth.ts";
import { DecksHandlers, DocumentsHandlers, FilesHandlers } from "./files.ts";
import { Postgres } from "./postgres.ts";
import { region } from "./shared-database.ts";
import { Users, UsersHandlers } from "./users.ts";

/**
 * Serves the whole HTTP API. Each feature module exports its services and handler groups; this
 * file only composes them. Everything is built while the Worker is constructed, so Alchemy binds
 * each Durable Object, database, and config value it reaches.
 */
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
    const sql = SQL.PostgresLayer({
      url: postgres.connectionString,
      // The first connection to a `PS_DEV` branch through `alchemy dev` can take longer than the
      // driver's 5-second default; Hyperdrive keeps deployed connections warm.
      connectTimeout: "15 seconds",
      // Named statements die with the request's connection, and Hyperdrive replays them onto
      // whichever pooled connection it assigns: ~40ms on each request's first query, measured.
      prepare: false,
    });
    const services = Layer.mergeAll(WorkOSAuth.layer, Users.layer.pipe(Layer.provide(sql)));
    return {
      fetch: yield* HttpApiBuilder.layer(Api).pipe(
        Layer.provide([
          AuthHandlers,
          SessionsHandlers,
          UsersHandlers,
          FilesHandlers,
          DocumentsHandlers,
          DecksHandlers,
        ]),
        Layer.provide(AuthenticationMiddleware),
        Layer.provide(services),
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
