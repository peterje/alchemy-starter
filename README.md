# Alchemy starter

Fork this repository, open it in Claude Code, and say **set this up**. The agent follows the bootstrap guide in `AGENTS.md` from install to a production URL.

A small demo with **Effect, Alchemy, TanStack Start, PlanetScale Postgres, and WorkOS**. People sign in with GitHub; their accounts live in Postgres. Each document and slide deck is a Durable Object with its own SQLite database, and each user's object indexes the files they created. No ORM, repository adapters, or mock storage.

The UI signs in with GitHub, lists each user's files, creates documents and decks from scratch or from an example, and edits them block by block. Documents render as real pages and decks as real slides, so what prints is what the screen shows. Effect `AtomHttpApi` shares the server's schema-first contract and refreshes the affected queries after mutations.

**Files are not yet authorized individually.** Signing in decides whose file list you see, but a document or deck is reachable by anyone holding its link. Check ownership on each file before storing private data.

## Run

```bash
bun install
bun run dev                 # UI and /api at http://localhost:1337
bun run check               # formatting, lint, types, lint-rule tests, build
bun run test:integration    # deploy the stack to local workerd, test HTTP, destroy
bun run test:browser        # exercise the UI on a separate local stage and port
bun run deploy              # deploy to Cloudflare
```

Local Alchemy runs need Cloudflare and PlanetScale credentials: run `bun alchemy profile create` and connect both with OAuth. `bun run provision` creates the shared database once; the bootstrap guide in `AGENTS.md` covers the rest.

## Read the example

| File                                                | Purpose                                                                     |
| --------------------------------------------------- | --------------------------------------------------------------------------- |
| `alchemy.run.ts`                                    | Deploy the API Worker and the TanStack Start website                        |
| `stacks/database.ts`                                | The shared Postgres database, deployed by CI on every merge                 |
| `stacks/github.ts`                                  | CI's scoped Cloudflare token, deployed once under the `admin` profile       |
| `stacks/workos.ts`                                  | The WorkOS redirect URI each deployed stage registers for its callback      |
| `workos-emulate.config.yaml`                        | The emulator's users for local runs and tests: Alice and Bob                |
| `packages/contract/src/user.ts`                     | Users, sessions, the `Authentication` middleware, and the sign-in routes    |
| `packages/contract/src/versioning.ts`               | Versioned files: items with versions, revisions, operations, results        |
| `packages/contract/src/documents.ts`                | The document model: page settings, blocks, and its API group                |
| `packages/contract/src/slides.ts`                   | The slide deck model on the same versioning core, and its group             |
| `packages/contract/src/files.ts`                    | A user's file pointers and the group that creates and lists them            |
| `packages/contract/src/api.ts`                      | The HttpApi that composes every feature group                               |
| `apps/api/src/database.ts`                          | The typed handle other stacks use to read the shared database               |
| `apps/api/src/auth.ts`                              | Sign-in through WorkOS: code exchange, sealed cookie, token checks, refresh |
| `apps/api/src/postgres.ts`                          | The stage's PlanetScale branch, role, and Hyperdrive connection             |
| `apps/api/migrations/`                              | Postgres migrations, applied to every branch at deploy time                 |
| `apps/api/src/user-store.ts`                        | One Durable Object per user: the index of their files                       |
| `apps/api/src/versioned.ts`                         | The pure versioning core: apply an operation to a file's state              |
| `apps/api/src/document-object.ts`                   | One Durable Object per document                                             |
| `apps/api/src/deck-object.ts`                       | One Durable Object per slide deck                                           |
| `apps/api/src/object-database.ts`                   | Service for an object's own SQLite: migrations and decoded queries          |
| `apps/api/src/worker.ts`                            | The Worker that serves the API from Postgres and the objects                |
| `apps/website/src/atoms.ts`                         | The AtomHttpApi client and the signed-in user atom shared by every route    |
| `apps/website/src/routes/index.tsx`                 | A user's files, the create form, and the example starters                   |
| `apps/website/src/routes/documents.$documentId.tsx` | One document: pages, rename, edit and add paragraphs                        |
| `apps/website/src/routes/decks.$deckId.tsx`         | One deck: rename, add and delete slides                                     |
| `apps/website/src/blocks.tsx`                       | Block renderers shared by the measuring pass and the pages                  |
| `apps/website/src/document-pages.tsx`               | The paginated, print-faithful document viewer                               |
| `apps/website/src/document-layout.ts`               | Pure pagination over measured blocks                                        |
| `apps/website/src/document-measure.ts`              | Reads block heights and break offsets from the offscreen copy               |
| `apps/website/src/slide-deck.tsx`                   | Real-size 16:9 slides scaled to fit the screen                              |
| `apps/website/src/math.ts`                          | LaTeX to KaTeX HTML                                                         |
| `apps/website/src/examples.ts`                      | Example files that exercise every block kind and slide layout               |
| `apps/website/src/routes/__root.tsx`                | TanStack Start document and the account bar: sign in with GitHub, sign out  |
| `apps/website/src/routes/api.$.ts`                  | Same-origin API route forwarding through an Alchemy service binding         |
| `test/api.test.ts`                                  | Integration tests against actual Workers, objects, and Postgres             |
| `test/browser/files.pw.ts`                          | Playwright coverage of creating, editing, and paginating files              |

The workspace is split by runtime. `packages/contract` runs everywhere and depends on Effect only. `apps/api` runs in workerd and depends on the contract and Alchemy. `apps/website` runs in the browser and SSR and depends on the contract and TanStack. The website never imports `@starter/api`; the Vite build fails if it does.

## Sign-in

People sign in with GitHub through [WorkOS AuthKit](https://workos.com/docs/authkit). AuthKit owns identities, the GitHub OAuth exchange, and sessions on its side; the API owns the session resource. `GET /api/auth/github` sends the browser to AuthKit's page, which offers only GitHub and runs any step sign-in needs, such as verifying a new email; the callback exchanges the code, records the user, and sets a sealed, HttpOnly `session` cookie. Every endpoint behind `Authentication` verifies the access token inside it against WorkOS's signing keys and refreshes it when it expires. Signing out is deleting a session: `DELETE /api/sessions/current`, or another device's from `GET /api/sessions`. A revoked session's cookie keeps working until its short-lived access token expires, because tokens are checked without a call to WorkOS.

Local runs and tests use WorkOS's own [emulator](https://github.com/workos/emulate), which `alchemy dev` starts, so they need no WorkOS account and leave nothing behind. Pull request previews use a WorkOS Staging environment, each registering its own callback URI, and production uses WorkOS Production.

## Postgres and preview deployments

Postgres is the control plane: who exists and what they own, the data you query across users. Durable Objects are the data plane: hot state with one writer each. Each user's row is recorded the first time they sign in to a stage.

Every stage gets its own [PlanetScale branch](https://planetscale.com/docs/postgres/branching). `prod` serves from the database's `main` branch, and every other stage — yours from `bun run dev`, each test run, and each pull request — gets an empty `PS-DEV` branch. Branches share no data, so Alchemy applies `apps/api/migrations` to each one at deploy time. The database itself belongs to its own stack, `stacks/database.ts`, so it exists before any stage needs a branch; CI deploys it on every merge to `main` and plans it on every pull request.

The Worker reaches its branch through [Hyperdrive](https://developers.cloudflare.com/hyperdrive/) with query caching off, so a read never returns a row from before the latest write; Hyperdrive still pools connections near the database. Queries use `@effect/sql-pg` through Alchemy's `SQL.Postgres`, which opens a pool on a request's first query and closes it when the request ends.

Each pull request deploys to its own `pr-<number>` stage the moment it is pushed, without waiting for checks, and the stack comments the preview URL on the pull request. Verification runs beside it, each suite on a stage and branch of its own that later pushes reuse. Closing the pull request destroys all three. Branch protection, declared in `stacks/github.ts`, only lets a pull request merge once its checks pass against the latest `main`, so a merge deploys to production without running them again.

## Observability

Every request is one trace in [Workers Observability](https://developers.cloudflare.com/workers/observability/): the website Worker starts it, and Cloudflare carries it into the API Worker and each Durable Object call. `Cloudflare.Telemetry()` in `worker.ts` places the Effect spans from each `Effect.fn` inside it, including `@effect/sql`'s query spans, which matter because Cloudflare does not trace Hyperdrive. Workers Logs is on for both Workers. Traces are in beta, so span names may change.

To find out why a request failed, query its events with Cloudflare's [`cf` CLI](https://developers.cloudflare.com/cf/): the trace shows each outbound call and its status, and the log lines carry the full error, which `alchemy logs` truncates to its first line. For example, every event from a preview's API Worker in a time window:

```sh
npx cf observability telemetry query --body '{"queryId":"debug","view":"events","dry":true,"timeframe":{"from":<ms>,"to":<ms>},"parameters":{"needle":{"value":"starter-api-pr-<n>"}}}'
```

To send traces and logs to Axiom, Honeycomb, or any OpenTelemetry backend, leave the code alone and export from Cloudflare: add a [`Cloudflare.Workers.ObservabilityDestination`](https://alchemy.run/cloudflare/observability/axiom-observability/) per signal and list it in each Worker's `observability.traces.destinations` or `logs.destinations`. Do not add a second tracer in the Worker; Effect has one, and `Cloudflare.Telemetry()` provides it.

## Versioned files

A document is page settings plus an ordered list of blocks; a deck is a title plus slides. Both are versioned files: every item carries the version it was last written at, and the file carries a revision. An operation upserts and deletes items against the versions the writer read and applies each one independently, so a stale block comes back as a conflict with the winner while the rest land. Metadata and order are last-writer-wins. Replaying an operation ID returns its original result. `versioning.ts` derives the state, operation, and result schemas of a file kind from its metadata and item schemas, `versioned.ts` applies an operation to a state, and each object persists its own file as one row in its SQLite next to its operation log.

## Why two kinds of object

`DocumentObject` and `DeckObject` are one object per file. Each is the single writer for its content and its operation log, so concurrent edits serialize without locks and every conflict check reads consistent state. `UserStore` is one object per user and holds only an index of the files they created, which is what makes "each user has many files" answerable without a global table.

Creating a file writes to both. The file's write is authoritative and the user's row is idempotent, so a retry after a partial failure converges. The user's object calls the file's object through Alchemy's typed stub.

Objects expose RPC methods only, which is what Cloudflare recommends over `fetch` handlers. The Worker serves the whole `HttpApi` and implements each endpoint by calling a method on the right object; validation, status codes, and error encoding happen once, in the Worker. A typed failure raised inside an object crosses the stub as a plain tagged object, so each Worker handler catches the tag and rebuilds the class before the API encodes it.

The website keeps the standard TanStack Start flow: SSR, file routes, and same-origin `/api`. `routes/api.$.ts` reads `env.API` and forwards to the API Worker through a service binding. That framework adapter is the only runtime `cloudflare:workers` import. The API Worker has no public workers.dev endpoint, and the browser needs no API URL or CORS configuration.

## Change the schema

For Postgres, add a numbered `.sql` file to `apps/api/migrations`. For an object, append a SQL string to the object's migrations list in its file under `apps/api/src`. Each object stores the number of applied migrations in its synchronous KV storage and runs the pending ones on its first request after activation, inside one `storage.transactionSync`, so a failed migration rolls back and is retried next time. Never edit or remove a migration that has shipped.

Alchemy handles **DO class migrations** at deploy time. These are separate from the **per-instance SQL migrations** above. Deploying code does not eagerly migrate every object's database.

See [Alchemy's integration testing tutorial](https://alchemy.run/cloudflare/tutorial/part-3/) for the `Test.make` → `beforeAll(deploy(Stack))` → HTTP assertions → `afterAll(destroy(Stack))` pattern. These tests use `dev: true` for actual local workerd SQLite, not a fake database.

## Tooling

The template keeps TypeScript strictness, Effect/React architecture lint rules in `packages/oxlint-plugins`, oxfmt, commit hooks, Playwright, and GitHub Actions. The browser build rejects server-only imports. No React `useState`/`useEffect` or additional client state library is needed.

Changes reach `main` only through pull requests whose checks pass, each merge deploys to production, and every pull request gets a preview. `bun run provision` creates the shared database and CI's scoped Cloudflare token; the bootstrap guide in `AGENTS.md` walks through it.
