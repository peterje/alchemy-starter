import * as Cloudflare from "alchemy/Cloudflare";
import type { RuntimeContext } from "alchemy/RuntimeContext";
import { Array, Context, Effect, Layer, Option, Schema } from "effect";

/**
 * The SQLite database inside the Durable Object that provides it. Storage failures are
 * defects: the Worker's HTTP boundary logs them and answers 500.
 */
export class ObjectDatabase extends Context.Service<
  ObjectDatabase,
  {
    readonly query: <Row>(
      rows: Schema.ConstraintDecoder<ReadonlyArray<Row>>,
      statement: string,
      ...bindings: ReadonlyArray<string | number>
    ) => Effect.Effect<ReadonlyArray<Row>, never, RuntimeContext>;
    readonly queryFirst: <Row>(
      row: Schema.ConstraintDecoder<Row>,
      statement: string,
      ...bindings: ReadonlyArray<string | number>
    ) => Effect.Effect<Option.Option<Row>, never, RuntimeContext>;
    /** For statements that return exactly one row, such as `INSERT ... RETURNING`. */
    readonly queryOne: <Row>(
      row: Schema.ConstraintDecoder<Row>,
      statement: string,
      ...bindings: ReadonlyArray<string | number>
    ) => Effect.Effect<Row, never, RuntimeContext>;
  }
>()("ObjectDatabase") {
  /** Applies pending migrations once per activation, then serves schema-decoded queries. */
  static layer = (migrations: ReadonlyArray<string>) =>
    Layer.effect(ObjectDatabase)(
      Effect.gen(function* () {
        const state = yield* Cloudflare.DurableObjectState;
        // Schema and version commit together, so a failed migration rolls back and is retried on
        // the next activation. transactionSync has no Effect wrapper, so this block uses raw storage.
        const storage = state.raw.storage;
        storage.transactionSync(() => {
          const version = Schema.decodeUnknownSync(Schema.Number)(
            storage.kv.get("schemaVersion") ?? 0,
          );
          for (const sql of migrations.slice(version)) storage.sql.exec(sql);
          storage.kv.put("schemaVersion", migrations.length);
        });

        const query = <Row>(
          rows: Schema.ConstraintDecoder<ReadonlyArray<Row>>,
          statement: string,
          ...bindings: ReadonlyArray<string | number>
        ) =>
          state.storage.sql.exec(statement, ...bindings).pipe(
            Effect.flatMap((cursor) => cursor.toArray()),
            Effect.flatMap(Schema.decodeUnknownEffect(rows)),
            Effect.orDie,
          );
        return ObjectDatabase.of({
          query,
          queryFirst: (row, statement, ...bindings) =>
            Effect.map(query(Schema.Array(row), statement, ...bindings), Array.head),
          queryOne: (row, statement, ...bindings) =>
            state.storage.sql.exec(statement, ...bindings).pipe(
              Effect.flatMap((cursor) => cursor.one()),
              Effect.flatMap(Schema.decodeUnknownEffect(row)),
              Effect.orDie,
            ),
        });
      }),
    );
}
