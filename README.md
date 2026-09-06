# Alchemy starter

A small notes demo with **Effect, Alchemy, and React**. Each user gets a Durable Object with its own SQLite database. No ORM, repository adapters, or mock storage.

The UI switches between Alice and Bob, creates notes, edits them, and deletes them. Effect `AtomHttpApi` shares the server's schema-first contract and refreshes each user's query after mutations.

**This is a public demo, not an authenticated app.** The selected user ID controls routing, not authorization. Before storing private data, authenticate requests and select the Durable Object from the verified session instead of a client-supplied ID.

## Run

```bash
bun install
bun run dev                 # http://localhost:1337; PORT overrides the local port
bun run check               # formatting, lint, types, tooling tests, build
bun run test:integration     # deploy the stack to local workerd, test HTTP, destroy
bun run test:browser         # exercise the UI on a separate local stage and port
bun run deploy              # deploy to Cloudflare
```

Local Alchemy runs still need Cloudflare credentials for account/state resolution. Copy `.env.example` and supply your account ID and API token, or use Alchemy's Cloudflare login.

## Read the example

| File                         | Purpose                                                              |
| ---------------------------- | -------------------------------------------------------------------- |
| `alchemy.run.ts`             | Provision one Vite Worker and its SQLite-backed DO namespace         |
| `apps/website/src/notes.ts`  | Shared schemas, branded IDs, errors, and HttpApi contract            |
| `apps/website/src/worker.ts` | Worker routing, DO initialization, SQL migrations, and CRUD handlers |
| `apps/website/src/main.tsx`  | React UI and Effect Atom queries/mutations                           |
| `test/notes.test.ts`         | Integration tests against actual Workers and Durable Objects         |

The contract stays separate so the browser never imports Worker code. The native platform classes in `worker.ts` are thin HTTP entry points; Effect `HttpApiBuilder` handles decoding, handlers, responses, and typed errors. SQL rows are decoded with the same Note schema. Mutations use bound parameters and `RETURNING`, and missing notes produce a typed 404 rather than exposing a cursor over RPC.

The API lives at `/api/users/:userId/notes/`, with `GET`/`POST` for the collection and `GET`/`PUT`/`DELETE` at `/:id`. Lists return the latest 100 notes. Titles are trimmed and limited to 120 characters; bodies are limited to 20,000 characters.

## Change the schema

Append SQL to `migrations` in `worker.ts`. Each object applies pending migrations on its first request after activation. Every migration and its history row run in `storage.transactionSync`, so a failed migration rolls back and is retried on the next activation. Never edit or remove a migration that has shipped.

Alchemy handles **DO class migrations** at deploy time. These are separate from the **per-instance SQL migrations** above. Deploying code does not eagerly migrate every user's database.

See [Alchemy's integration testing tutorial](https://alchemy.run/cloudflare/tutorial/part-3/) for the `Test.make` → `beforeAll(deploy(Stack))` → HTTP assertions → `afterAll(destroy(Stack))` pattern. These tests use `dev: true` for actual local workerd SQLite, not a fake database. Browser tests also cover user isolation, reloads, and preserving drafts after failed writes.

## Tooling

The template keeps TypeScript strictness, Effect/React architecture lint rules, oxfmt, commit hooks, Playwright, and GitHub Actions. The browser build rejects server-only imports. No React `useState`/`useEffect` or additional client state library is needed.

Provision CI credentials with `bun run ci:provision`. Production deploys remain gated by the repository's `CLOUDFLARE_DEPLOY_ENABLED` variable.
