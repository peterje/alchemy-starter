import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Planetscale from "alchemy/Planetscale";
import { Effect, Layer } from "effect";

import { Database, region } from "../apps/api/src/shared-database.ts";

/**
 * The Postgres database every stage branches from, deployed to the `shared` stage. `bun run
 * provision` creates it once so CI's PlanetScale token can be scoped to it; after that, CI
 * deploys this stack on every merge to `main`, before anything that needs a branch.
 */
export default Database.make(
  {
    providers: Layer.mergeAll(Cloudflare.providers(), Planetscale.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    // Production data lives here: a destroy, or renaming this stack or resource, must not delete it.
    const database = yield* Planetscale.PostgresDatabase("Database", {
      name: "alchemy-starter",
      region: { slug: region.planetscale },
      clusterSize: "PS_5",
    }).pipe(Alchemy.RemovalPolicy.retain());
    return { name: database.name.as<string>() };
  }),
);
