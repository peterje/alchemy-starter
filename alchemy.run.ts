import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import NotesWorker from "./apps/website/src/worker.ts";

export default Alchemy.Stack(
  "Starter",
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const api = yield* NotesWorker;
    const website = yield* Cloudflare.Website.Vite("Website", {
      rootDir: "apps/website",
      dev: { port: yield* Config.number("PORT").pipe(Config.withDefault(1337), Effect.orDie) },
      env: { NOTES: api },
    });
    return { websiteUrl: website.url.as<string>() };
  }),
);
