import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import type { UserNotes } from "./apps/website/src/worker.ts";

export default Alchemy.Stack(
  "Starter",
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const website = yield* Cloudflare.Website.Vite("Website", {
      rootDir: "apps/website",
      main: "src/worker.ts",
      dev: { port: yield* Config.number("PORT").pipe(Config.withDefault(1337), Effect.orDie) },
      env: { NOTES: Cloudflare.DurableObject<UserNotes>("UserNotes") },
    });
    return { websiteUrl: website.url.as<string>() };
  }),
);
