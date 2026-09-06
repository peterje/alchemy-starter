# Alchemy starter

A small chat demo with **Effect, Alchemy, and TanStack Start**. Each chat is a Durable Object with its own SQLite database, and each user's object indexes the chats they belong to. No ORM, repository adapters, or mock storage.

The UI switches between Alice and Bob, creates chats, joins them by URL, and posts messages. Effect `AtomHttpApi` shares the server's schema-first contract and refreshes the affected queries after mutations.

**This is a public demo, not an authenticated app.** The selected user ID controls routing and names the author of a message. Before storing private data, authenticate requests and take the user from the verified session instead of the client.

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

| File                                        | Purpose                                                             |
| ------------------------------------------- | ------------------------------------------------------------------- |
| `alchemy.run.ts`                            | Deploy the API Worker and the TanStack Start website                |
| `packages/contract/src/user.ts`             | The user ID that selects an object                                  |
| `packages/contract/src/chats.ts`            | The chats feature: schemas, branded IDs, errors, and two API groups |
| `packages/contract/src/api.ts`              | Which object serves which group, and the union the browser sees     |
| `apps/api/src/chat-room.ts`                 | One Durable Object per chat: members, messages, and its API         |
| `apps/api/src/user-store.ts`                | One Durable Object per user: their memberships and its API          |
| `apps/api/src/database.ts`                  | Migrations plus schema-decoded queries over an object's SQLite      |
| `apps/api/src/worker.ts`                    | The Worker that validates the path ID and routes to an object       |
| `apps/website/src/atoms.ts`                 | The AtomHttpApi client and demo user atom shared by every route     |
| `apps/website/src/routes/index.tsx`         | A user's chats and the create form                                  |
| `apps/website/src/routes/chats.$chatId.tsx` | One chat: members, messages, join, and send                         |
| `apps/website/src/routes/__root.tsx`        | TanStack Start document and the demo user picker                    |
| `apps/website/src/routes/api.$.ts`          | Same-origin API route forwarding through an Alchemy service binding |
| `test/chats.test.ts`                        | Integration tests against actual Workers and Durable Objects        |
| `test/browser/chats.pw.ts`                  | Playwright coverage of two users sharing one chat                   |

The workspace is split by runtime. `packages/contract` runs everywhere and depends on Effect only. `apps/api` runs in workerd and depends on the contract and Alchemy. `apps/website` runs in the browser and SSR and depends on the contract and TanStack. The website never imports `@starter/api`; the Vite build fails if it does.

## Why two kinds of object

`ChatRoom` is one object per chat. It is the single writer for that chat's members and messages, so concurrent posts serialize without locks and membership checks read consistent state. `UserStore` is one object per user and holds only an index of memberships, which is what makes "each user has many chats" answerable without a global table.

Creating or joining a chat writes to both. The chat's write is authoritative and both writes are idempotent, so a retry after a partial failure converges. The user's object calls the chat's object through Alchemy's typed stub; those RPC methods return plain values, and typed HTTP errors are raised by whichever object serves the request.

Each object serves its own `HttpApi` because Effect requires every group of an API to be handled by one server. `api.ts` names that topology: a user API, a chat API, and the union the browser and tests use. The Worker validates the ID in the path and forwards `/api/users/:userId/*` and `/api/chats/:chatId/*` to the matching object.

The website keeps the standard TanStack Start flow: SSR, file routes, and same-origin `/api`. `routes/api.$.ts` reads `env.API` and forwards to the API Worker through a service binding. That framework adapter is the only runtime `cloudflare:workers` import. The API Worker has no public workers.dev endpoint, and the browser needs no API URL or CORS configuration.

## Change the schema

Append a SQL string to the object's migrations list in its file under `apps/api/src`. Each object stores the number of applied migrations in its synchronous KV storage and runs the pending ones on its first request after activation, inside one `storage.transactionSync`, so a failed migration rolls back and is retried next time. Never edit or remove a migration that has shipped.

Alchemy handles **DO class migrations** at deploy time. These are separate from the **per-instance SQL migrations** above. Deploying code does not eagerly migrate every object's database.

See [Alchemy's integration testing tutorial](https://alchemy.run/cloudflare/tutorial/part-3/) for the `Test.make` → `beforeAll(deploy(Stack))` → HTTP assertions → `afterAll(destroy(Stack))` pattern. These tests use `dev: true` for actual local workerd SQLite, not a fake database.

## Tooling

The template keeps TypeScript strictness, Effect/React architecture lint rules in `packages/oxlint-plugins`, oxfmt, commit hooks, Playwright, and GitHub Actions. The browser build rejects server-only imports. No React `useState`/`useEffect` or additional client state library is needed.

Provision CI credentials with `bun run ci:provision` after pointing `stacks/github.ts` at your repository. Production deploys remain gated by the repository's `CLOUDFLARE_DEPLOY_ENABLED` variable.
