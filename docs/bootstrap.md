# Bootstrap

When someone forks this template and asks you to set it up, take them from zero to a production URL. Assume they are not technical: explain each step in one plain sentence, run everything you can yourself, and hand them a `! <command>` line for anything that opens a browser or takes a secret. Never ask them to paste a secret into the chat. Check each step's state before acting so asking again resumes where they left off.

- **Tools.** Confirm `bun`, `gh`, a Cloudflare account, and a PlanetScale account with a payment method on its organization (PlanetScale will not create a database without one). Install what is missing (`curl -fsSL https://bun.sh/install | bash`, `brew install gh pscale`) and have them run `! gh auth login`.
- **Repository.** Read the fork with `gh repo view --json owner,name` and set `GITHUB_OWNER` and `GITHUB_REPOSITORY` in `stacks/github.ts`. Run `bun install`, then `cp .env.example .env`; the example explains each setting.
- **Logins.** Have them run `! bun alchemy profile create` and connect Cloudflare (OAuth, All Scopes) and PlanetScale (OAuth, then their organization). `bun alchemy profile show` confirms both and shows the Cloudflare account ID and PlanetScale organization. Then have them run `! pscale auth login` for the CI token step below.
- **WorkOS.** Sign-in is "Sign in with Google" through WorkOS AuthKit. Previews use a WorkOS Staging environment, which the CLI provisions with no account; capture its credentials straight into `.env` so they never reach the output:
  ```sh
  json=$(npx workos env provision --json)
  printf 'WORKOS_API_KEY_STAGING=%s\nWORKOS_CLIENT_ID_STAGING=%s\n' "$(printf '%s' "$json" | jq -r .data.apiKey)" "$(printf '%s' "$json" | jq -r .data.clientId)" >> .env
  ```
  Then have them run `! npx workos env claim` to link the environment to a WorkOS account they create in the browser. In the WorkOS dashboard, under Authentication, have them leave Google as the only sign-in method so AuthKit's page shows a single "Continue with Google" button; WorkOS has no API for this setting. Staging signs in through WorkOS's shared Google credentials, so nothing else is needed for previews. In the same environment's Redirects page, have them make `http://localhost:1337/api/auth/callback` the default redirect URI; the per-stage callbacks are registered by code.
- **Shared infrastructure.** `bun run provision` deploys `stacks/database.ts`, the Postgres database every stage branches from, and `stacks/github.ts`, CI's scoped Cloudflare token and the secrets that hold it. Minting a token needs more access than OAuth grants, so the second stack deploys under a separate `admin` profile. Have them create a short-lived Cloudflare token under **Manage Account → Account API Tokens** with **Account API Tokens → Edit** to mint CI's token, plus **Workers Scripts → Edit** and **Secrets Store → Edit** to reach the state store, then run `! bun alchemy profile create admin` and connect Cloudflare with that API token and GitHub through the `gh` CLI. Run `bun run provision` and confirm each plan, then have them delete the temporary token in the dashboard. CI deploys `stacks/database.ts` from here on; only credential changes need `provision` again.
- **PlanetScale token for CI.** Alchemy has no resource for PlanetScale service tokens, so create CI's with `pscale` once the database exists. Pipe the token straight into the secret so it never reaches the output:
  ```sh
  json=$(pscale service-token create --org "$ORG" --name "$REPO-ci" --format json)
  id=$(printf '%s' "$json" | jq -r .id)
  pscale service-token add-access "$id" read_databases --org "$ORG"
  pscale service-token add-access "$id" read_database write_database read_branch create_branch delete_branch connect_branch connect_production_branch delete_branch_password delete_production_branch_password --database "$REPO" --org "$ORG"
  printf '%s' "$json" | jq -r .token | gh secret set PLANETSCALE_API_TOKEN
  gh secret set PLANETSCALE_API_TOKEN_ID --body "$id"
  gh secret set PLANETSCALE_ORGANIZATION --body "$ORG"
  ```
- **Local app.** Local runs and tests sign in against the WorkOS emulator, whose settings `.env.example` already holds. Generate the secret that seals session cookies:
  ```sh
  printf 'WORKOS_COOKIE_PASSWORD=%s\n' "$(openssl rand -hex 32)" >> .env
  ```
  Start `bun run dev` and have them open http://localhost:1337 and sign in as Alice or Bob, the emulator's users from `workos-emulate.config.yaml`. The first run creates their own database branch, which takes a few minutes.
- **Production sign-in.** Before the first merge, production needs WorkOS Production credentials and a Google OAuth client, neither of which has an API. In the WorkOS dashboard, have them open the Production environment and copy its API key and client ID into `.env` as `WORKOS_API_KEY_PRODUCTION` and `WORKOS_CLIENT_ID_PRODUCTION` without echoing the key (`! printf 'WORKOS_API_KEY_PRODUCTION=%s\n' "$(read -rs k; echo $k)" >> .env`), then run `bun run provision` again. In Google Cloud Console, have them create an OAuth client (Web application) with the redirect URI WorkOS shows under Google sign-in for Production, and enter its client ID and secret there; leave Google as Production's only sign-in method too.
- **Production.** `main` only accepts pull requests whose checks pass, and each merge deploys to the `prod` stage. Every pull request also gets a preview deployment with its own database branch the moment it is pushed. Commit the `stacks/github.ts` change on a branch, open a pull request with `gh pr create`, give them the preview URL the stack comments, and merge with `gh pr merge --squash` once the checks pass. Watch the deploy with `gh run watch` and give them the production URL from its log.
- **Next.** Point them at the feature recipe in `AGENTS.md`.
