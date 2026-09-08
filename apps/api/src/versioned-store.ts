import { type InvalidOperation, Revision, Version } from "@starter/contract/versioning";
import type { RuntimeContext } from "alchemy/RuntimeContext";
import { Clock, Context, Effect, Layer, Option, Schema } from "effect";

import { ObjectDatabase } from "./object-database.ts";
import {
  applyItemOperation,
  type ItemOperation,
  type ItemOperationResult,
  type VersionedState,
} from "./versioned.ts";

// Append only. Items live in their own rows so an image-heavy file never approaches the per-row limit.
const migrations = [
  "CREATE TABLE file (id INTEGER PRIMARY KEY CHECK (id = 1), meta TEXT NOT NULL, revision INTEGER NOT NULL)",
  `CREATE TABLE items (
    position INTEGER PRIMARY KEY,
    item_id TEXT NOT NULL UNIQUE,
    version INTEGER NOT NULL,
    item TEXT NOT NULL
  )`,
  "CREATE TABLE operations (operation_id TEXT PRIMARY KEY, result TEXT NOT NULL, applied_at INTEGER NOT NULL)",
];

/** Operation results are kept for replay; older ones are pruned so the table stays bounded. */
const OPERATION_HISTORY_LIMIT = 1_000;

const FileRow = Schema.Struct({ meta: Schema.String, revision: Revision });
const ItemRow = Schema.Struct({ version: Version, item: Schema.String });
const ResultRow = Schema.Struct({ result: Schema.String });

interface Store<Meta, Item extends { readonly id: string }> {
  readonly read: Effect.Effect<Option.Option<VersionedState<Meta, Item>>, never, RuntimeContext>;
  /** Replace the whole file: new revision, every item back to version 1, replay history cleared. */
  readonly set: (content: {
    readonly meta: Meta;
    readonly items: ReadonlyArray<Item>;
  }) => Effect.Effect<VersionedState<Meta, Item>, never, RuntimeContext>;
  /** None when no file has been set yet. Replaying an operation returns its original result. */
  readonly apply: (
    operation: ItemOperation<Meta, Item>,
  ) => Effect.Effect<Option.Option<ItemOperationResult<Item>>, InvalidOperation, RuntimeContext>;
}

/**
 * Declares the service that persists one kind of versioned file in the object's database:
 * `class DocumentStore extends VersionedStore.Service<DocumentStore>()("DocumentStore", DocumentFile) {}`.
 * Its `layer` migrates the database and decodes JSON columns through the file's schemas.
 */
export const Service =
  <Self>() =>
  <const Id extends string, Meta, Item extends { readonly id: string }>(
    id: Id,
    file: {
      readonly Meta: Schema.ConstraintDecoder<Meta>;
      readonly Item: Schema.ConstraintDecoder<Item>;
      readonly Result: Schema.ConstraintDecoder<ItemOperationResult<Item>>;
    },
  ) => {
    type State = VersionedState<Meta, Item>;
    const Store = Context.Service<Self, Store<Meta, Item>>()(id);
    const decodeMeta = Schema.decodeUnknownSync(Schema.fromJsonString(file.Meta));
    const decodeItem = Schema.decodeUnknownSync(Schema.fromJsonString(file.Item));
    const decodeResult = Schema.decodeUnknownSync(Schema.fromJsonString(file.Result));

    const layer = Layer.effect(Store)(
      Effect.gen(function* () {
        const db = yield* ObjectDatabase;

        const read = Effect.gen(function* () {
          const row = yield* db.queryFirst({
            schema: FileRow,
            sql: "SELECT meta, revision FROM file",
          });
          if (Option.isNone(row)) return Option.none<State>();
          const rows = yield* db.query({
            schema: Schema.Array(ItemRow),
            sql: "SELECT version, item FROM items ORDER BY position ASC",
          });
          return Option.some<State>({
            meta: decodeMeta(row.value.meta),
            revision: row.value.revision,
            items: rows.map((entry) => ({ version: entry.version, item: decodeItem(entry.item) })),
          });
        });

        const write = (state: State) =>
          Effect.gen(function* () {
            yield* db.execute({ sql: "DELETE FROM items" });
            yield* db.execute({
              sql: `INSERT INTO file (id, meta, revision) VALUES (1, ?, ?)
                    ON CONFLICT (id) DO UPDATE SET meta = excluded.meta, revision = excluded.revision`,
              values: [JSON.stringify(state.meta), state.revision],
            });
            for (const [position, entry] of state.items.entries()) {
              yield* db.execute({
                sql: "INSERT INTO items (position, item_id, version, item) VALUES (?, ?, ?, ?)",
                values: [position, entry.item.id, entry.version, JSON.stringify(entry.item)],
              });
            }
          });

        return Store.of({
          read,
          set: (content) =>
            Effect.gen(function* () {
              const current = yield* read;
              const revision = (Option.isSome(current) ? current.value.revision : 0) + 1;
              const state: State = {
                meta: content.meta,
                revision,
                items: content.items.map((item) => ({ version: 1, item })),
              };
              yield* db.transaction(
                Effect.gen(function* () {
                  yield* write(state);
                  yield* db.execute({ sql: "DELETE FROM operations" });
                }),
              );
              return state;
            }),
          apply: (operation) =>
            Effect.gen(function* () {
              const replay = yield* db.queryFirst({
                schema: ResultRow,
                sql: "SELECT result FROM operations WHERE operation_id = ?",
                values: [operation.operationId],
              });
              if (Option.isSome(replay)) return Option.some(decodeResult(replay.value.result));
              const current = yield* read;
              if (Option.isNone(current)) return Option.none();
              const outcome = yield* applyItemOperation(current.value, operation);
              const now = yield* Clock.currentTimeMillis;
              yield* db.transaction(
                Effect.gen(function* () {
                  if (outcome.state.revision !== current.value.revision) {
                    yield* write(outcome.state);
                  }
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
              return Option.some(outcome.result);
            }),
        });
      }),
    ).pipe(Layer.provide(ObjectDatabase.layer(migrations)));

    return Object.assign(Store, { layer });
  };
