# Alchemy starter

A small notes demo with **Effect, Alchemy, and TanStack Start**. Each user gets a Durable Object with its own SQLite database. No ORM, repository adapters, or mock storage.

The UI switches between Alice and Bob, creates notes, edits them, and deletes them. Effect `AtomHttpApi` shares the server's schema-first contract and refreshes each user's query after mutations.

**This is a public demo, not an authenticated app.** The selected user ID controls routing, not authorization. Before storing private data, authenticate requests and select the Durable Object from the verified session instead of a client-supplied ID.

## Run

```bash
bun install
bun run dev                 # UI and /api at http://localhost:1337
bun run check               # formatting, lint, types, lint-rule tests, build
bun run test:integration    # deploy the stack to local workerd, test HTTP, destroy
bun run test:browser        # exercise the UI on a separate local stage and port
bun run deploy              # deploy to Cloudflare
```

Local Alchemy runs need Cloudflare credentials for account and state resolution. Copy `.env.example` and supply your account ID and API token, or use Alchemy's Cloudflare login.

## Read the example

| File                                 | Purpose                                                             |
| ------------------------------------ | ------------------------------------------------------------------- |
| `alchemy.run.ts`                     | Deploy the Effect-native API Worker and TanStack Start website      |
| `apps/website/src/store.ts`          | Per-user store contract: the user ID that selects an object, errors |
| `apps/website/src/notes.ts`          | The notes feature: schemas, branded IDs, errors, and its API group  |
| `apps/website/src/api.ts`            | The HttpApi that composes every feature group                       |
| `apps/website/src/worker.ts`         | Worker forwarding, DO initialization, SQL migrations, and handlers  |
| `apps/website/src/atoms.ts`          | The AtomHttpApi client and demo user atom shared by every route     |
| `apps/website/src/routes/index.tsx`  | The notes page: Effect Atom queries, mutations, and one form        |
| `apps/website/src/routes/__root.tsx` | TanStack Start document and the demo user picker                    |
| `apps/website/src/routes/api.$.ts`   | Same-origin API route forwarding through an Alchemy service binding |
| `test/notes.test.ts`                 | Integration tests against actual Workers and Durable Objects        |
| `test/browser/home.pw.ts`            | Playwright coverage of the UI on a separate local stage             |

A feature is one contract module with an `HttpApiGroup`, one handlers block in the Durable Object, and one route. `api.ts` composes the groups, and every group shares the same per-user SQLite database and migrations list.

The contract stays separate so the browser never imports Worker code. `Cloudflare.Worker` and `Cloudflare.DurableObject` define the backend runtimes as Effects. The object's inner Effect runs migrations and builds its HttpApi before serving requests. The Worker validates the user ID and forwards every `/api/users/:userId/*` request to that user's object through Alchemy's typed namespace.

The website keeps the standard TanStack Start flow: SSR, file routes, and same-origin `/api`. `routes/api.$.ts` reads `env.API` and forwards to the API Worker through a service binding. That framework adapter is the only runtime `cloudflare:workers` import. The API Worker has no public workers.dev endpoint, and the browser needs no API URL or CORS configuration. Effect Atom resolves relative URLs against the current request during SSR and the page origin in the browser.

Effect `HttpApiBuilder` handles validation, responses, and typed errors. SQL rows decode through the same Note schema. Mutations use bound parameters and `RETURNING`; missing notes produce a typed 404.

The API lives at `/api/users/:userId/notes/`, with `GET`/`POST` for the collection and `GET`/`PUT`/`DELETE` at `/:id`. Lists return the latest 100 notes. Titles are trimmed and limited to 120 characters; bodies are limited to 20,000 characters.

## Change the schema

Append a SQL string to `migrations` in `worker.ts`. Each object stores the number of applied migrations in its synchronous KV storage and runs the pending ones on its first request after activation, inside one `storage.transactionSync`, so a failed migration rolls back and is retried on the next activation. Never edit or remove a migration that has shipped.

Alchemy handles **DO class migrations** at deploy time. These are separate from the **per-instance SQL migrations** above. Deploying code does not eagerly migrate every user's database.

See [Alchemy's integration testing tutorial](https://alchemy.run/cloudflare/tutorial/part-3/) for the `Test.make` → `beforeAll(deploy(Stack))` → HTTP assertions → `afterAll(destroy(Stack))` pattern. These tests use `dev: true` for actual local workerd SQLite, not a fake database. Browser tests also cover user isolation, reloads, and preserving drafts after failed writes.

## Tooling

The template keeps TypeScript strictness, Effect/React architecture lint rules in `packages/oxlint-plugins`, oxfmt, commit hooks, Playwright, and GitHub Actions. The browser build rejects server-only imports. No React `useState`/`useEffect` or additional client state library is needed. `AGENTS.md` tells coding agents how to extend the example.

Provision CI credentials with `bun run ci:provision` after pointing `stacks/github.ts` at your repository. Production deploys remain gated by the repository's `CLOUDFLARE_DEPLOY_ENABLED` variable.
