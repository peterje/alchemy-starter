import {
  type Document,
  DocumentId,
  DocumentNotFound,
  type DocumentOperation,
  DocumentOperationResult,
  DocumentState,
} from "@starter/contract/documents";
import * as Cloudflare from "alchemy/Cloudflare";
import { Clock, Effect, Option, Schema } from "effect";

import { ObjectDatabase } from "./object-database.ts";
import { applyItemOperation } from "./versioned.ts";

// Append only. The whole document is one row: image blocks hold URLs, not bytes, so a document
// stays far below the 2 MB row limit of the object's SQLite.
const migrations = [
  "CREATE TABLE document (id INTEGER PRIMARY KEY CHECK (id = 1), state TEXT NOT NULL)",
  "CREATE TABLE operations (operation_id TEXT PRIMARY KEY, result TEXT NOT NULL, applied_at INTEGER NOT NULL)",
];

/** Operation results are kept for replay; older ones are pruned so the table stays bounded. */
const OPERATION_HISTORY_LIMIT = 1_000;

const DocumentRow = Schema.Struct({ state: Schema.fromJsonString(DocumentState) });
const ResultRow = Schema.Struct({ result: Schema.fromJsonString(DocumentOperationResult) });

/** One object per document: the single writer for its blocks and its operation log. */
export default class DocumentObject extends Cloudflare.DurableObject<DocumentObject>()(
  "DocumentObject",
  // No bindings to resolve in the isolate phase; each instance provides its own database.
  Effect.succeed(
    Effect.gen(function* () {
      const state = yield* Cloudflare.DurableObjectState;
      const db = yield* ObjectDatabase;
      // Objects are addressed by document ID, so the object's name is its ID.
      const id = Schema.decodeUnknownSync(DocumentId)(state.id.name);

      const read = db.queryFirst({ schema: DocumentRow, sql: "SELECT state FROM document" });
      const write = (document: DocumentState) =>
        db.execute({
          sql: `INSERT INTO document (id, state) VALUES (1, ?)
                ON CONFLICT (id) DO UPDATE SET state = excluded.state`,
          values: [JSON.stringify(document)],
        });

      return {
        get: Effect.fn("DocumentObject.get")(function* () {
          const row = yield* read;
          if (Option.isNone(row)) return yield* Effect.fail(new DocumentNotFound({ id }));
          return row.value.state;
        }),
        /** Replace the whole document: new revision, every block back to version 1, replay history cleared. */
        set: Effect.fn("DocumentObject.set")(function* (document: Document) {
          const row = yield* read;
          const next: DocumentState = {
            meta: document.meta,
            revision: (Option.isSome(row) ? row.value.state.revision : 0) + 1,
            items: document.items.map((item) => ({ version: 1, item })),
          };
          yield* db.transaction(
            Effect.gen(function* () {
              yield* write(next);
              yield* db.execute({ sql: "DELETE FROM operations" });
            }),
          );
          return next;
        }),
        /** Replaying an operation ID returns its original result. */
        apply: Effect.fn("DocumentObject.apply")(function* (operation: DocumentOperation) {
          const replay = yield* db.queryFirst({
            schema: ResultRow,
            sql: "SELECT result FROM operations WHERE operation_id = ?",
            values: [operation.operationId],
          });
          if (Option.isSome(replay)) return replay.value.result;
          const row = yield* read;
          if (Option.isNone(row)) return yield* Effect.fail(new DocumentNotFound({ id }));
          const outcome = yield* applyItemOperation(row.value.state, operation);
          const now = yield* Clock.currentTimeMillis;
          yield* db.transaction(
            Effect.gen(function* () {
              if (outcome.state.revision !== row.value.state.revision) yield* write(outcome.state);
              yield* db.execute({
                sql: "INSERT INTO operations (operation_id, result, applied_at) VALUES (?, ?, ?)",
                values: [operation.operationId, JSON.stringify(outcome.result), now],
              });
              yield* db.execute({
                sql: `DELETE FROM operations WHERE operation_id NOT IN (
                        SELECT operation_id FROM operations ORDER BY applied_at DESC, rowid DESC LIMIT ?
                      )`,
                values: [OPERATION_HISTORY_LIMIT],
              });
            }),
          );
          return outcome.result;
        }),
      };
    }).pipe(Effect.provide(ObjectDatabase.layer(migrations))),
  ),
) {}
