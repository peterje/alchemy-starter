import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

/** Deployable Alchemy stack for the SPA, Effect API, and its D1 state. */
export default Alchemy.Stack(
  "Starter",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const todos = yield* Cloudflare.D1.Database("Todos", {
      migrationsDir: "apps/website/migrations",
    });
    const website = yield* Cloudflare.Website.Vite<{ TODOS: typeof todos }>("Website", {
      rootDir: "apps/website",
      memo: {
        include: ["**/*"],
        lockfile: true,
      },
      compatibility: {
        flags: ["nodejs_compat"],
      },
      env: {
        TODOS: todos,
      },
    });

    return {
      websiteUrl: website.url.as<string>(),
    };
  }),
);
