import * as Cloudflare from "alchemy/Cloudflare";
import type { RuntimeContext } from "alchemy/RuntimeContext";
import { Array, Context, Effect, Layer, Option, Schema } from "effect";

interface Statement<Rows> {
  readonly schema: Rows;
  readonly sql: string;
  readonly values?: ReadonlyArray<string | number>;
}

/**
 * The SQLite database inside the Durable Object that provides it. Storage failures are
 * defects: the Worker's HTTP boundary logs them and answers 500.
 */
export class ObjectDatabase extends Context.Service<
  ObjectDatabase,
  {
    readonly query: <Row>(
      statement: Statement<Schema.ConstraintDecoder<ReadonlyArray<Row>>>,
    ) => Effect.Effect<ReadonlyArray<Row>, never, RuntimeContext>;
    readonly queryFirst: <Row>(
      statement: Statement<Schema.ConstraintDecoder<Row>>,
    ) => Effect.Effect<Option.Option<Row>, never, RuntimeContext>;
    /** For statements that return exactly one row, such as `INSERT ... RETURNING`. */
    readonly queryOne: <Row>(
      statement: Statement<Schema.ConstraintDecoder<Row>>,
    ) => Effect.Effect<Row, never, RuntimeContext>;
    /** For statements whose rows are not needed. */
    readonly execute: (
      statement: Omit<Statement<never>, "schema">,
    ) => Effect.Effect<void, never, RuntimeContext>;
    /**
     * Runs `body` inside one SQLite transaction. Object SQL is synchronous, so the body runs to
     * completion before the transaction commits; a defect rolls it back.
     */
    readonly transaction: <A>(
      body: Effect.Effect<A, never, RuntimeContext>,
    ) => Effect.Effect<A, never, RuntimeContext>;
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

        const query = <Row>({
          schema,
          sql,
          values = [],
        }: Statement<Schema.ConstraintDecoder<ReadonlyArray<Row>>>) =>
          state.storage.sql.exec(sql, ...values).pipe(
            Effect.flatMap((cursor) => cursor.toArray()),
            Effect.flatMap(Schema.decodeUnknownEffect(schema)),
            Effect.orDie,
          );
        return ObjectDatabase.of({
          query,
          queryFirst: (statement) =>
            Effect.map(query({ ...statement, schema: Schema.Array(statement.schema) }), Array.head),
          queryOne: ({ schema, sql, values = [] }) =>
            state.storage.sql.exec(sql, ...values).pipe(
              Effect.flatMap((cursor) => cursor.one()),
              Effect.flatMap(Schema.decodeUnknownEffect(schema)),
              Effect.orDie,
            ),
          execute: ({ sql, values = [] }) => Effect.asVoid(state.storage.sql.exec(sql, ...values)),
          transaction: (body) =>
            Effect.flatMap(Effect.context<RuntimeContext>(), (context) =>
              Effect.sync(() =>
                storage.transactionSync(() => Effect.runSync(Effect.provideContext(body, context))),
              ),
            ),
        });
      }),
    );
}
