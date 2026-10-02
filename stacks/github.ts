import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import { Effect, Layer, Redacted } from "effect";

// Point these at your fork before running `bun run provision`.
const GITHUB_OWNER = "peterje";
const GITHUB_REPOSITORY = "alchemy-starter";

/**
 * The scoped Cloudflare credentials GitHub Actions deploys with. Minting a token takes more
 * access than CI should hold, so a person deploys this stack once under the `admin` profile with
 * `bun run provision`, and CI never does. Alchemy has no PlanetScale service token resource, so
 * the bootstrap guide creates CI's PlanetScale token with `pscale`.
 */
export default Alchemy.Stack(
  "StarterGitHub",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment;
    const apiToken = yield* Cloudflare.ApiToken.AccountApiToken("StarterCI", {
      accountId,
      policies: [
        {
          effect: "allow",
          permissionGroups: [
            "Workers Scripts Write",
            "Account Settings Write",
            "Secrets Store Write",
            "Hyperdrive Write",
          ],
          resources: {
            [`com.cloudflare.api.account.${accountId}`]: "*",
          },
        },
      ],
    });

    yield* GitHub.Secret("cloudflare-api-token", {
      owner: GITHUB_OWNER,
      repository: GITHUB_REPOSITORY,
      name: "CLOUDFLARE_API_TOKEN",
      value: apiToken.value,
    });
    yield* GitHub.Secret("cloudflare-account-id", {
      owner: GITHUB_OWNER,
      repository: GITHUB_REPOSITORY,
      name: "CLOUDFLARE_ACCOUNT_ID",
      value: Redacted.make(accountId),
    });
  }),
);
