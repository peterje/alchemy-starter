import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Planetscale from "alchemy/Planetscale";
import { Effect } from "effect";

import { Database } from "./database.ts";

/**
 * The stage's Postgres branch behind Hyperdrive. The database itself belongs to
 * `stacks/database.ts` so it exists before any stage deploys. `prod` serves from its
 * default branch; every other stage, including each pull request, gets an empty branch of its
 * own. Alchemy applies the migrations to each branch at deploy time.
 */
export const Postgres = Effect.gen(function* () {
  const { stage } = yield* Alchemy.Stack;
  // SAFETY: `stage` is a Proxy that returns a reference for every key; only its index-signature
  // type, under noUncheckedIndexedAccess, admits undefined.
  const { name: database } = yield* Database.stage.shared!;
  const schema = { migrations: "apps/api/migrations", importFiles: ["apps/api/seed.sql"] };
  // PlanetScale creates `main` with the database, so prod adopts it instead of creating it.
  const branch = yield* stage === "prod"
    ? Planetscale.PostgresBranch("Branch", { database, name: "main", ...schema }).pipe(
        Alchemy.AdoptPolicy.adopt(),
      )
    : Planetscale.PostgresBranch("Branch", { database, clusterSize: "PS_DEV", ...schema });
  // Read and write rows, nothing else. Migrations run under a short-lived role of Alchemy's own.
  const role = yield* Planetscale.PostgresRole("Role", {
    database,
    branch,
    inheritedRoles: ["pg_read_all_data", "pg_write_all_data"],
  });
  // Cached reads could return a row from before the latest write. `alchemy dev` has no Hyperdrive,
  // so local runs connect through PlanetScale's pooler instead of opening connections directly.
  return yield* Cloudflare.Hyperdrive.Connection("Hyperdrive", {
    origin: role.origin,
    caching: { disabled: true },
    dev: role.pooledOrigin,
  });
});
