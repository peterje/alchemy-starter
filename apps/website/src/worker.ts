import * as Cloudflare from "alchemy/Cloudflare";
import type { HttpEffect } from "alchemy/Http";
import { Clock, Config, Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServer, HttpServerResponse } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Note, NoteId, NoteNotFound, NoteStorageError, NotesApi, UserId } from "./notes.ts";

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
const columns = "id, title, body, created_at AS createdAt, updated_at AS updatedAt";
const Notes = Schema.Array(Note);
const NonEmptyNotes = Schema.NonEmptyArray(Note);

/** The outer Effect discovers bindings; the inner Effect initializes each user's instance. */
export class UserNotes extends Cloudflare.DurableObject<UserNotes, { fetch: HttpEffect }>()(
  "UserNotes",
) {}

// The explicit `never` stops TypeScript from inferring DurableObjectState as an extra requirement.
const UserNotesLive = UserNotes.make<never>(
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
          Effect.mapError(() => new NoteStorageError()),
        );
      const queryNote = (
        id: NoteId,
        statement: string,
        ...bindings: ReadonlyArray<string | number>
      ) =>
        Effect.flatMap(query(Notes, statement, ...bindings), (rows) => {
          const note = rows[0];
          return note === undefined ? Effect.fail(new NoteNotFound({ id })) : Effect.succeed(note);
        });

      const handlers = HttpApiBuilder.group(NotesApi, "notes", (handlers) =>
        handlers.handleAll({
          // Keep the demo response bounded; introduce pagination for larger histories.
          list: () =>
            query(Notes, `SELECT ${columns} FROM notes ORDER BY updated_at DESC, id ASC LIMIT 100`),
          get: ({ params }) =>
            queryNote(params.id, `SELECT ${columns} FROM notes WHERE id = ?`, params.id),
          create: ({ payload }) =>
            Effect.gen(function* () {
              const id = yield* Effect.sync(() => NoteId.make(crypto.randomUUID()));
              const now = yield* Clock.currentTimeMillis;
              const [note] = yield* query(
                NonEmptyNotes,
                `INSERT INTO notes (id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING ${columns}`,
                id,
                payload.title,
                payload.body,
                now,
                now,
              );
              return note;
            }),
          update: ({ params, payload }) =>
            Effect.gen(function* () {
              const now = yield* Clock.currentTimeMillis;
              return yield* queryNote(
                params.id,
                `UPDATE notes SET title = ?, body = ?, updated_at = ? WHERE id = ? RETURNING ${columns}`,
                payload.title,
                payload.body,
                now,
                params.id,
              );
            }),
          remove: ({ params }) =>
            queryNote(params.id, `DELETE FROM notes WHERE id = ? RETURNING ${columns}`, params.id),
        }),
      );
      return {
        fetch: yield* HttpRouter.toHttpEffect(
          HttpApiBuilder.layer(NotesApi).pipe(
            Layer.provide(handlers),
            Layer.provide(HttpServer.layerServices),
          ),
        ),
      };
    });
  }),
);

export default class NotesWorker extends Cloudflare.Worker<NotesWorker>()(
  "NotesApi",
  Effect.gen(function* () {
    return {
      main: import.meta.url,
      workersDev: false,
      dev: { port: yield* Config.number("API_PORT").pipe(Config.withDefault(1338), Effect.orDie) },
    };
  }),
  Effect.gen(function* () {
    const notes = yield* UserNotes;
    // Demo routing only. Select the object from a verified session before storing private data.
    const forward = HttpRouter.add("*", "/api/users/:userId/*", (request) =>
      HttpRouter.schemaPathParams(Schema.Struct({ userId: UserId })).pipe(
        Effect.flatMap(({ userId }) => notes.getByName(userId).fetch(request)),
        Effect.catchTag("SchemaError", () =>
          Effect.succeed(HttpServerResponse.empty({ status: 400 })),
        ),
      ),
    );
    return { fetch: yield* HttpRouter.toHttpEffect(forward) };
  }).pipe(Effect.provide(UserNotesLive)),
) {}
