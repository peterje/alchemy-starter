import {
  type Deck,
  DeckId,
  DeckNotFound,
  type DeckOperation,
  DeckOperationResult,
  DeckState,
} from "@starter/contract/slides";
import * as Cloudflare from "alchemy/Cloudflare";
import { Clock, Effect, Option, Schema } from "effect";

import { ObjectDatabase } from "./object-database.ts";
import { applyItemOperation } from "./versioned.ts";

// Append only. The whole deck is one row: image blocks hold URLs, not bytes, so a deck stays far
// below the 2 MB row limit of the object's SQLite.
const migrations = [
  "CREATE TABLE deck (id INTEGER PRIMARY KEY CHECK (id = 1), state TEXT NOT NULL)",
  "CREATE TABLE operations (operation_id TEXT PRIMARY KEY, result TEXT NOT NULL, applied_at INTEGER NOT NULL)",
];

/** Operation results are kept for replay; older ones are pruned so the table stays bounded. */
const OPERATION_HISTORY_LIMIT = 1_000;

const DeckRow = Schema.Struct({ state: Schema.fromJsonString(DeckState) });
const ResultRow = Schema.Struct({ result: Schema.fromJsonString(DeckOperationResult) });

/** One object per deck: the single writer for its slides and its operation log. */
export default class DeckObject extends Cloudflare.DurableObject<DeckObject>()(
  "DeckObject",
  // No bindings to resolve in the isolate phase; each instance provides its own database.
  Effect.succeed(
    Effect.gen(function* () {
      const state = yield* Cloudflare.DurableObjectState;
      const db = yield* ObjectDatabase;
      // Objects are addressed by deck ID, so the object's name is its ID.
      const id = Schema.decodeUnknownSync(DeckId)(state.id.name);

      const read = db.queryFirst({ schema: DeckRow, sql: "SELECT state FROM deck" });
      const write = (deck: DeckState) =>
        db.execute({
          sql: `INSERT INTO deck (id, state) VALUES (1, ?)
                ON CONFLICT (id) DO UPDATE SET state = excluded.state`,
          values: [JSON.stringify(deck)],
        });

      return {
        get: Effect.fn("DeckObject.get")(function* () {
          const row = yield* read;
          if (Option.isNone(row)) return yield* Effect.fail(new DeckNotFound({ id }));
          return row.value.state;
        }),
        /** Replace the whole deck: new revision, every slide back to version 1, replay history cleared. */
        set: Effect.fn("DeckObject.set")(function* (deck: Deck) {
          const row = yield* read;
          const next: DeckState = {
            meta: deck.meta,
            revision: (Option.isSome(row) ? row.value.state.revision : 0) + 1,
            items: deck.items.map((item) => ({ version: 1, item })),
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
        apply: Effect.fn("DeckObject.apply")(function* (operation: DeckOperation) {
          const replay = yield* db.queryFirst({
            schema: ResultRow,
            sql: "SELECT result FROM operations WHERE operation_id = ?",
            values: [operation.operationId],
          });
          if (Option.isSome(replay)) return replay.value.result;
          const row = yield* read;
          if (Option.isNone(row)) return yield* Effect.fail(new DeckNotFound({ id }));
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
