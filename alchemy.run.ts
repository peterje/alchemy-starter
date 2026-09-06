import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { Config, Effect } from "effect";
import ApiWorker from "./apps/api/src/worker.ts";

export class Website extends Cloudflare.Website.Vite<Website>()("Website", {
  rootDir: "apps/website",
  dev: { port: Config.number("PORT").pipe(Config.withDefault(1337)) },
  env: { API: ApiWorker },
}) {}

export default Alchemy.Stack(
  "Starter",
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    yield* ApiWorker;
    const website = yield* Website;
    return { websiteUrl: website.url.as<string>() };
  }),
);
