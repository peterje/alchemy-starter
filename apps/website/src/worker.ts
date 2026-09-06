import * as Cloudflare from "alchemy/Cloudflare";
import type { HttpEffect } from "alchemy/Http";
import { Clock, Config, Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServer, HttpServerRequest } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Note, NoteId, NoteNotFound, NoteStorageError, NotesApi, type UserId } from "./notes.ts";

// Append only: every user's database applies these on its next activation.
const migrations = [
  {
    id: "0001_notes",
    sql: `CREATE TABLE notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
  },
  {
    id: "0002_notes_updated_at",
    sql: "CREATE INDEX notes_updated_at ON notes (updated_at DESC, id ASC)",
  },
];
const columns = "id, title, body, created_at AS createdAt, updated_at AS updatedAt";

/** The outer Effect discovers bindings; the inner Effect initializes each user's instance. */
export class UserNotes extends Cloudflare.DurableObject<UserNotes, { fetch: HttpEffect }>()(
  "UserNotes",
) {}

const UserNotesLive = UserNotes.make<never>(
  Effect.gen(function* () {
    const state = yield* Cloudflare.DurableObjectState;
    return Effect.gen(function* () {
      const storage = state.raw.storage;
      // No asynchronous work inside transactionSync: schema and history commit together.
      // A failed initialization must not serve requests against a partial schema.
      yield* Effect.sync(() => {
        storage.sql.exec(`CREATE TABLE IF NOT EXISTS __migrations (
          id TEXT PRIMARY KEY,
          applied_at INTEGER NOT NULL
        )`);
        for (const migration of migrations) {
          storage.transactionSync(() => {
            const applied = storage.sql
              .exec("SELECT id FROM __migrations WHERE id = ?", migration.id)
              .toArray();
            if (applied.length > 0) return;
            storage.sql.exec(migration.sql);
            storage.sql.exec(
              "INSERT INTO __migrations (id, applied_at) VALUES (?, ?)",
              migration.id,
              Date.now(),
            );
          });
        }
      });

      const query = Effect.fn("Notes.query")(function* (
        operation: string,
        statement: string,
        ...bindings: ReadonlyArray<string | number>
      ) {
        return yield* Effect.try(() => storage.sql.exec(statement, ...bindings).toArray()).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(Note))),
          Effect.tapError(Effect.logError),
          Effect.mapError(() => new NoteStorageError({ operation })),
        );
      });

      const requireNote = Effect.fn("Notes.requireNote")(function* (
        id: NoteId,
        rows: ReadonlyArray<Note>,
      ) {
        const note = rows[0];
        return note === undefined ? yield* Effect.fail(new NoteNotFound({ id })) : note;
      });

      const handlers = HttpApiBuilder.group(NotesApi, "notes", (handlers) =>
        handlers.handleAll({
          // Keep the demo response bounded; introduce pagination for larger histories.
          list: Effect.fn("Notes.list")(function* () {
            return yield* query(
              "list",
              `SELECT ${columns} FROM notes ORDER BY updated_at DESC, id ASC LIMIT 100`,
            );
          }),
          get: Effect.fn("Notes.get")(function* ({ params }) {
            return yield* query("get", `SELECT ${columns} FROM notes WHERE id = ?`, params.id).pipe(
              Effect.flatMap((rows) => requireNote(params.id, rows)),
            );
          }),
          create: Effect.fn("Notes.create")(function* ({ payload }) {
            const id = yield* Effect.sync(() => NoteId.make(crypto.randomUUID()));
            const now = yield* Clock.currentTimeMillis;
            const rows = yield* query(
              "create",
              `INSERT INTO notes (id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING ${columns}`,
              id,
              payload.title,
              payload.body,
              now,
              now,
            );
            const note = rows[0];
            return note === undefined
              ? yield* Effect.fail(new NoteStorageError({ operation: "create" }))
              : note;
          }),
          update: Effect.fn("Notes.update")(function* ({ params, payload }) {
            const now = yield* Clock.currentTimeMillis;
            return yield* query(
              "update",
              `UPDATE notes SET title = ?, body = ?, updated_at = ? WHERE id = ? RETURNING ${columns}`,
              payload.title,
              payload.body,
              now,
              params.id,
            ).pipe(Effect.flatMap((rows) => requireNote(params.id, rows)));
          }),
          remove: Effect.fn("Notes.remove")(function* ({ params }) {
            return yield* query(
              "remove",
              `DELETE FROM notes WHERE id = ? RETURNING ${columns}`,
              params.id,
            ).pipe(Effect.flatMap((rows) => requireNote(params.id, rows)));
          }),
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
    const forward = Effect.fn("Notes.forward")(function* (
      userId: UserId,
      request: HttpServerRequest.HttpServerRequest,
    ) {
      // Demo routing only. Select the object from a verified session before storing private data.
      return yield* notes
        .getByName(userId)
        .fetch(request)
        .pipe(
          Effect.tapError(Effect.logError),
          Effect.mapError(() => new NoteStorageError({ operation: "forward" })),
        );
    });
    const proxy = HttpApiBuilder.group(NotesApi, "notes", (handlers) =>
      handlers
        .handleRaw("list", ({ params, request }) => forward(params.userId, request))
        .handleRaw("get", ({ params, request }) => forward(params.userId, request))
        .handleRaw("create", ({ params, request }) => forward(params.userId, request))
        .handleRaw("update", ({ params, request }) => forward(params.userId, request))
        .handleRaw("remove", ({ params, request }) => forward(params.userId, request)),
    );
    return {
      fetch: yield* HttpRouter.toHttpEffect(
        HttpApiBuilder.layer(NotesApi).pipe(
          Layer.provide(proxy),
          Layer.provide(HttpServer.layerServices),
        ),
      ),
    };
  }).pipe(Effect.provide(UserNotesLive)),
) {}
