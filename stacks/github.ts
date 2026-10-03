import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import { Effect, Layer, Redacted } from "effect";

// Point these at your fork before running `bun run provision`.
const GITHUB_OWNER = "peterje";
const GITHUB_REPOSITORY = "alchemy-starter";

/**
 * The repository's rules and the scoped Cloudflare credentials GitHub Actions deploys with. Minting a token takes more
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

    // The fork already exists, so this takes over its settings; Alchemy never deletes a repository.
    // Auto-merge lets a pull request merge itself once its checks pass.
    yield* GitHub.Repository("Repository", {
      owner: GITHUB_OWNER,
      name: GITHUB_REPOSITORY,
      allowAutoMerge: true,
      deleteBranchOnMerge: true,
    }).pipe(Alchemy.AdoptPolicy.adopt());

    // Everything reaches `main` through a pull request whose checks passed, so a merge deploys to
    // production without running them again. Branches need not be up to date with `main`, so
    // nobody rebases to merge; an organization-owned fork can enable GitHub's merge queue to also
    // test pull requests together before they land.
    yield* GitHub.BranchProtection("main", {
      owner: GITHUB_OWNER,
      repository: GITHUB_REPOSITORY,
      branch: "main",
      requiredStatusChecks: {
        strict: false,
        contexts: ["Verify", "Database", "API tests", "Browser tests"],
      },
      requiredPullRequestReviews: { requiredApprovingReviewCount: 0 },
      enforceAdmins: true,
    });
  }),
);
