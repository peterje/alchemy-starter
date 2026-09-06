import * as Cloudflare from "alchemy/Cloudflare";
import type { HttpEffect } from "alchemy/Http";
import { Clock, Config, Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServer, HttpServerResponse } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Api } from "./api.ts";
import { Note, NoteId, NoteNotFound, noteListLimit } from "./notes.ts";
import { StorageError, UserId } from "./store.ts";

// Append only: each user's database runs the statements past its stored version on its next activation.
const migrations = [
  `CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  "CREATE INDEX notes_updated_at ON notes (updated_at DESC, id ASC)",
];

/** One SQLite database per user. The outer Effect discovers bindings; the inner Effect initializes each instance. */
export class UserStore extends Cloudflare.DurableObject<UserStore, { fetch: HttpEffect }>()(
  "UserStore",
) {}

// The explicit `never` stops TypeScript from inferring DurableObjectState as an extra requirement.
const UserStoreLive = UserStore.make<never>(
  Effect.gen(function* () {
    const state = yield* Cloudflare.DurableObjectState;
    return Effect.gen(function* () {
      const storage = state.raw.storage;
      // Schema and version commit together, so a failed migration is retried on the next activation.
      yield* Effect.sync(() =>
        storage.transactionSync(() => {
          const version = Schema.decodeUnknownSync(Schema.Number)(
            storage.kv.get("schemaVersion") ?? 0,
          );
          for (const sql of migrations.slice(version)) storage.sql.exec(sql);
          storage.kv.put("schemaVersion", migrations.length);
        }),
      );

      const query = <Rows extends Schema.Top>(
        rows: Rows,
        statement: string,
        ...bindings: ReadonlyArray<string | number>
      ) =>
        Effect.try(() => storage.sql.exec(statement, ...bindings).toArray()).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(rows)),
          Effect.tapError(Effect.logError),
          Effect.mapError(() => new StorageError()),
        );
      const queryOne = <Row extends Schema.Top, E>(
        row: Row,
        onEmpty: () => E,
        statement: string,
        ...bindings: ReadonlyArray<string | number>
      ) =>
        Effect.flatMap(query(Schema.Array(row), statement, ...bindings), (rows) => {
          const first = rows[0];
          return first === undefined ? Effect.fail(onEmpty()) : Effect.succeed(first);
        });

      const noteColumns = "id, title, body, created_at AS createdAt, updated_at AS updatedAt";
      const notes = HttpApiBuilder.group(Api, "notes", (handlers) =>
        handlers.handleAll({
          list: () =>
            query(
              Schema.Array(Note),
              `SELECT ${noteColumns} FROM notes ORDER BY updated_at DESC, id ASC LIMIT ${noteListLimit}`,
            ),
          get: ({ params }) =>
            queryOne(
              Note,
              () => new NoteNotFound({ id: params.id }),
              `SELECT ${noteColumns} FROM notes WHERE id = ?`,
              params.id,
            ),
          create: ({ payload }) =>
            Effect.gen(function* () {
              const id = yield* Effect.sync(() => NoteId.make(crypto.randomUUID()));
              const now = yield* Clock.currentTimeMillis;
              return yield* queryOne(
                Note,
                () => new StorageError(),
                `INSERT INTO notes (id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING ${noteColumns}`,
                id,
                payload.title,
                payload.body,
                now,
                now,
              );
            }),
          update: ({ params, payload }) =>
            Effect.gen(function* () {
              const now = yield* Clock.currentTimeMillis;
              return yield* queryOne(
                Note,
                () => new NoteNotFound({ id: params.id }),
                `UPDATE notes SET title = ?, body = ?, updated_at = ? WHERE id = ? RETURNING ${noteColumns}`,
                payload.title,
                payload.body,
                now,
                params.id,
              );
            }),
          remove: ({ params }) =>
            queryOne(
              Note,
              () => new NoteNotFound({ id: params.id }),
              `DELETE FROM notes WHERE id = ? RETURNING ${noteColumns}`,
              params.id,
            ),
        }),
      );

      return {
        fetch: yield* HttpRouter.toHttpEffect(
          HttpApiBuilder.layer(Api).pipe(
            Layer.provide(notes),
            Layer.provide(HttpServer.layerServices),
          ),
        ),
      };
    });
  }),
);

export default class ApiWorker extends Cloudflare.Worker<ApiWorker>()(
  "Api",
  Effect.gen(function* () {
    return {
      main: import.meta.url,
      workersDev: false,
      dev: { port: yield* Config.number("API_PORT").pipe(Config.withDefault(1338), Effect.orDie) },
    };
  }),
  Effect.gen(function* () {
    const stores = yield* UserStore;
    // Demo routing only. Select the object from a verified session before storing private data.
    const forward = HttpRouter.add("*", "/api/users/:userId/*", (request) =>
      HttpRouter.schemaPathParams(Schema.Struct({ userId: UserId })).pipe(
        Effect.flatMap(({ userId }) => stores.getByName(userId).fetch(request)),
        Effect.catchTag("SchemaError", () =>
          Effect.succeed(HttpServerResponse.empty({ status: 400 })),
        ),
      ),
    );
    return { fetch: yield* HttpRouter.toHttpEffect(forward) };
  }).pipe(Effect.provide(UserStoreLive)),
) {}
