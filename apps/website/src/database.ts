import { Effect, Schema } from "effect";
import { StorageError } from "./store.ts";

/**
 * Applies pending migrations to a Durable Object's SQLite database, then
 * returns schema-decoded query helpers over it. Schema and version commit
 * together, so a failed migration rolls back and is retried on the next activation.
 */
export const openDatabase = (storage: DurableObjectStorage, migrations: ReadonlyArray<string>) =>
  Effect.sync(() => {
    storage.transactionSync(() => {
      const version = Schema.decodeUnknownSync(Schema.Number)(storage.kv.get("schemaVersion") ?? 0);
      for (const sql of migrations.slice(version)) storage.sql.exec(sql);
      storage.kv.put("schemaVersion", migrations.length);
    });

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
    return { query, queryOne };
  });
