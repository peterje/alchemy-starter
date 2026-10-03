import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Command from "alchemy/Command";
import * as GitHub from "alchemy/GitHub";
import * as Output from "alchemy/Output";
import * as Planetscale from "alchemy/Planetscale";
import { Config, Effect, Layer } from "effect";

import { region } from "./apps/api/src/database.ts";
import ApiWorker from "./apps/api/src/worker.ts";
import * as WorkOS from "./stacks/workos.ts";

export class Website extends Cloudflare.Website.Vite<Website>()("Website", {
  rootDir: "apps/website",
  // The website imports the contract package, which sits outside its directory.
  memo: { include: ["**/*", "../../packages/contract/src/**"], lockfile: true },
  dev: { port: Config.Number("PORT").pipe(Config.withDefault(1337)) },
  env: { API: ApiWorker },
  // Server rendering calls the API, which queries Postgres, so render beside the database too.
  // Static assets are still served from the edge.
  placement: { region: region.workers },
  // Starts the trace that follows each request into the API Worker and its objects. Setting this
  // replaces Alchemy's default, which keeps logs on, so logs are restated here.
  observability: {
    enabled: true,
    logs: { enabled: true, invocationLogs: true },
    traces: { enabled: true },
  },
}) {}

/** Every provider the stack's resources need; the integration tests deploy it with the same set. */
export const providers = Layer.mergeAll(
  Cloudflare.providers(),
  Command.providers(),
  GitHub.providers(),
  Planetscale.providers(),
  WorkOS.providers(),
);

export default Alchemy.Stack(
  "Starter",
  {
    providers,
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const workos = new URL(
      yield* Config.String("WORKOS_API_URL").pipe(Config.withDefault("https://api.workos.com")),
    );
    const emulated = workos.hostname === "localhost";
    // Local runs and tests sign in against WorkOS's emulator; `alchemy deploy` skips this.
    if (emulated) {
      yield* Command.Dev("WorkOSEmulator", {
        command: `node_modules/.bin/workos-emulate --port ${workos.port} --seed workos-emulate.config.yaml --interactive`,
      });
    }

    yield* ApiWorker;
    const website = yield* Website;

    // A deployed stage registers its own callback, so sign-in returns to the stage it started on.
    if (!emulated) {
      yield* WorkOS.RedirectUri("SignInCallback", {
        uri: Output.interpolate`${website.url}/api/auth/callback`,
      });
    }

    // Set only by the preview job, so a pull request's stage keeps one comment up to date.
    const github = yield* GitHub.GitHubEnv;
    if (github?.pr) {
      yield* GitHub.Comment("PreviewComment", {
        owner: github.owner,
        repository: github.repository,
        issueNumber: github.pr,
        body: Output.interpolate`Preview: ${website.url}

Built from ${github.sha.slice(0, 7)} on a database branch of its own.`,
      });
    }

    return { websiteUrl: website.url.as<string>() };
  }),
);
