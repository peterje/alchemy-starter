# Agent guide

This repository is a template. Every file is an example future code will copy, so keep changes idiomatic and delete anything that is not pulling its weight.

## Bootstrap

When someone forks this template and asks you to set it up, take them from zero to a production URL. Assume they are not technical: explain each step in one plain sentence, run everything you can yourself, and hand them a `! <command>` line for anything that opens a browser or takes a secret. Never ask them to paste a secret into the chat. Check each step's state before acting so asking again resumes where they left off.

- **Tools.** Confirm `bun`, `gh`, a Cloudflare account, and a PlanetScale account with a payment method on its organization (PlanetScale will not create a database without one). Install what is missing (`curl -fsSL https://bun.sh/install | bash`, `brew install gh pscale`) and have them run `! gh auth login`.
- **Repository.** Read the fork with `gh repo view --json owner,name` and set `GITHUB_OWNER` and `GITHUB_REPOSITORY` in `stacks/github.ts`. Run `bun install`.
- **Logins.** Have them run `! bun alchemy profile create` and connect Cloudflare (OAuth, All Scopes) and PlanetScale (OAuth, then their organization). `bun alchemy profile show` confirms both and shows the Cloudflare account ID and PlanetScale organization. Then have them run `! pscale auth login` for the CI token step below.
- **WorkOS.** Sign-in is "Sign in with GitHub" through WorkOS AuthKit. Previews use a WorkOS Staging environment, which the CLI provisions with no account; capture its credentials straight into `.env` so they never reach the output:
  ```sh
  json=$(npx workos env provision --json)
  printf 'WORKOS_API_KEY_STAGING=%s\nWORKOS_CLIENT_ID_STAGING=%s\n' "$(printf '%s' "$json" | jq -r .data.apiKey)" "$(printf '%s' "$json" | jq -r .data.clientId)" >> .env
  ```
  Then have them run `! npx workos env claim` to link the environment to a WorkOS account they create in the browser. In the WorkOS dashboard, under Authentication, have them leave GitHub as the only sign-in method so AuthKit's page shows a single "Continue with GitHub" button; WorkOS has no API for this setting.
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
- **Local app.** Local runs and tests sign in against the WorkOS emulator, so append its settings to `.env`:
  ```sh
  printf 'WORKOS_API_URL=http://localhost:4100\nWORKOS_API_KEY=sk_test_default\nWORKOS_CLIENT_ID=client_emulator\nWORKOS_COOKIE_PASSWORD=%s\n' "$(openssl rand -hex 32)" >> .env
  ```
  Start `bun run dev` and have them open http://localhost:1337 and sign in as Alice or Bob, the emulator's users from `workos-emulate.config.yaml`. The first run creates their own database branch, which takes a few minutes.
- **Production sign-in.** Before the first merge, production needs WorkOS Production credentials and a GitHub OAuth app, neither of which has an API. In the WorkOS dashboard, have them open the Production environment and copy its API key and client ID into `.env` as `WORKOS_API_KEY_PRODUCTION` and `WORKOS_CLIENT_ID_PRODUCTION` (use the `read -rs` pattern above), then run `bun run provision` again. Have them create a GitHub OAuth app with the callback URL WorkOS shows under GitHub sign-in, and enter its client ID and secret there.
- **Production.** `main` only accepts pull requests whose checks pass, and each merge deploys to the `prod` stage. Every pull request also gets a preview deployment with its own database branch the moment it is pushed. Commit the `stacks/github.ts` change on a branch, open a pull request with `gh pr create`, give them the preview URL the stack comments, and merge with `gh pr merge --squash` once the checks pass. Watch the deploy with `gh run watch` and give them the production URL from its log.
- **Next.** Point them at the feature recipe below. Documents and decks are reachable by anyone holding their link until per-file authorization lands.

## Architecture

- Sign-in is GitHub through WorkOS AuthKit. AuthKit owns identities and sessions; the API Worker owns the session resource: `apps/api/src/auth.ts` exchanges the callback's code, seals the tokens into an HttpOnly cookie, verifies them on every request against WorkOS's keys, and refreshes them. Endpoints behind the contract's `Authentication` middleware read `CurrentUser`. Local runs and tests use the WorkOS emulator, which `alchemy dev` starts; deployed stages register their callback with `stacks/workos.ts`.
- Postgres is the control plane: who exists and what they own, queried across users. Durable Objects are the data plane: one object per unit of hot state, the single writer for it.
- Each stage has its own PlanetScale branch: `prod` serves from `main`, and every other stage, including each pull request, gets an empty branch that Alchemy migrates at deploy time. `apps/api/src/postgres.ts` declares it; the Worker queries it through Hyperdrive with caching off.
- The workspace is split by runtime. `packages/contract` (schemas, IDs, errors, `HttpApi` groups) runs everywhere and depends on Effect only. `apps/api` (the Worker and one file per Durable Object) runs in workerd. `apps/website` (routes, atoms) runs in the browser and SSR. The website never imports `@starter/api`; the Vite build fails if it does.
- A feature is one contract module with its `HttpApiGroup`s added in `api.ts`, its state in Postgres tables or on the object that owns it under `apps/api/src`, a handlers block in `worker.ts` that queries Postgres or calls those methods, and a route under `apps/website/src/routes`.
- Objects are the consistency boundary and expose RPC methods only, never `fetch`. Put state that must be read and written together in one object. Objects raise typed errors; they cross the stub as plain tagged objects, so the Worker handler catches the tag and rebuilds the class. Cross-object writes are idempotent.
- Documents and decks are versioned files. Derive a new file kind's schemas with `VersionedFile` in `packages/contract/src/versioning.ts`, give it an object that owns its tables and runs `applyItemOperation`, and add it to the user's files.
- `atoms.ts` holds the single AtomHttpApi client and the signed-in user atom. Routes read them; they do not create their own.
- `routeTree.gen.ts` is generated by the Vite plugin. Never edit it.
- Change the Postgres schema by adding a numbered file to `apps/api/migrations`, and an object's schema by appending to its migrations list. Never edit or remove a shipped migration.

## Rules

- Application state lives in Effect Atom. Do not use React `useState`, `useReducer`, or `useEffect`.
- Data access goes through the shared `HttpApi` contract. Do not add TanStack server functions.
- Parse input at the I/O boundary with Schema. Do not accept `unknown` or `object` parameters or narrow with `typeof`.
- Every type assertion needs a `SAFETY:` comment stating the checked invariant. Prefer fixing the type.
- Put imports at the top of the module. In a `switch` over a union, add a `never` check in `default`.
- Comments explain why, not what. Keep them for I/O, validation, and edge cases.

## Commands

```bash
bun run check               # formatting, lint, types, lint-rule tests, build
bun run test:integration    # deploy to local workerd and test the HTTP API
bun run test:browser        # Playwright against a separate local stage
```
