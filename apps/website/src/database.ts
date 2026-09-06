import type * as Cloudflare from "alchemy/Cloudflare";
import { Array, Effect, Schema } from "effect";

/**
 * Applies pending migrations, then returns schema-decoded queries over the object's SQLite
 * database. Storage failures are defects: the Worker's HTTP boundary logs them and answers 500.
 */
export const openDatabase = (
  state: typeof Cloudflare.DurableObjectState.Service,
  migrations: ReadonlyArray<string>,
) =>
  Effect.sync(() => {
    // Schema and version commit together, so a failed migration rolls back and is retried on
    // the next activation. transactionSync has no Effect wrapper, so this block uses raw storage.
    const storage = state.raw.storage;
    storage.transactionSync(() => {
      const version = Schema.decodeUnknownSync(Schema.Number)(storage.kv.get("schemaVersion") ?? 0);
      for (const sql of migrations.slice(version)) storage.sql.exec(sql);
      storage.kv.put("schemaVersion", migrations.length);
    });

    const query = <Row, RD>(
      rows: Schema.ConstraintDecoder<ReadonlyArray<Row>, RD>,
      statement: string,
      ...bindings: ReadonlyArray<string | number>
    ) =>
      state.storage.sql.exec(statement, ...bindings).pipe(
        Effect.flatMap((cursor) => cursor.toArray()),
        Effect.flatMap(Schema.decodeUnknownEffect(rows)),
        Effect.orDie,
      );
    const queryFirst = <Row, RD>(
      row: Schema.ConstraintDecoder<Row, RD>,
      statement: string,
      ...bindings: ReadonlyArray<string | number>
    ) => Effect.map(query(Schema.Array(row), statement, ...bindings), Array.head);
    /** For statements that return exactly one row, such as `INSERT ... RETURNING`. */
    const queryOne = <Row, RD>(
      row: Schema.ConstraintDecoder<Row, RD>,
      statement: string,
      ...bindings: ReadonlyArray<string | number>
    ) =>
      state.storage.sql.exec(statement, ...bindings).pipe(
        Effect.flatMap((cursor) => cursor.one()),
        Effect.flatMap(Schema.decodeUnknownEffect(row)),
        Effect.orDie,
      );
    return { query, queryFirst, queryOne };
  });
