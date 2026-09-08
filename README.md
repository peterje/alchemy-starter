# Alchemy starter

A small demo with **Effect, Alchemy, and TanStack Start**. Each chat, document, and slide deck is a Durable Object with its own SQLite database, and each user's object indexes the chats they belong to and the files they created. No ORM, repository adapters, or mock storage.

The UI switches between Alice and Bob, creates chats, joins them by URL, posts messages, and edits documents and decks block by block. Documents render as real pages and decks as real slides, so what prints is what the screen shows. Effect `AtomHttpApi` shares the server's schema-first contract and refreshes the affected queries after mutations.

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

| File                                                | Purpose                                                              |
| --------------------------------------------------- | -------------------------------------------------------------------- |
| `alchemy.run.ts`                                    | Deploy the API Worker and the TanStack Start website                 |
| `packages/contract/src/user.ts`                     | The user ID that selects an object                                   |
| `packages/contract/src/chats.ts`                    | The chats feature: schemas, branded IDs, errors, and two API groups  |
| `packages/contract/src/versioning.ts`               | Versioned files: items with versions, revisions, operations, results |
| `packages/contract/src/documents.ts`                | The document model: page settings, blocks, and its API group         |
| `packages/contract/src/slides.ts`                   | The slide deck model on the same versioning core, and its group      |
| `packages/contract/src/files.ts`                    | A user's file pointers and the group that creates and lists them     |
| `packages/contract/src/api.ts`                      | The HttpApi that composes every feature group                        |
| `apps/api/src/chat-room.ts`                         | One Durable Object per chat: its members, messages, and RPC methods  |
| `apps/api/src/user-store.ts`                        | One Durable Object per user: their memberships, files, and RPC       |
| `apps/api/src/versioned.ts`                         | The pure versioning core: apply an operation to a file's state       |
| `apps/api/src/document-object.ts`                   | One Durable Object per document                                      |
| `apps/api/src/deck-object.ts`                       | One Durable Object per slide deck                                    |
| `apps/api/src/object-database.ts`                   | Service for an object's own SQLite: migrations and decoded queries   |
| `apps/api/src/worker.ts`                            | The Worker that serves the API by calling the objects' methods       |
| `apps/website/src/atoms.ts`                         | The AtomHttpApi client and demo user atom shared by every route      |
| `apps/website/src/routes/index.tsx`                 | A user's chats and the create form                                   |
| `apps/website/src/routes/chats.$chatId.tsx`         | One chat: members, messages, join, and send                          |
| `apps/website/src/routes/files.tsx`                 | A user's files, the create form, and the example starters            |
| `apps/website/src/routes/documents.$documentId.tsx` | One document: pages, rename, edit and add paragraphs                 |
| `apps/website/src/routes/decks.$deckId.tsx`         | One deck: rename, add and delete slides                              |
| `apps/website/src/blocks.tsx`                       | Block renderers shared by the measuring pass and the pages           |
| `apps/website/src/document-pages.tsx`               | The paginated, print-faithful document viewer                        |
| `apps/website/src/document-layout.ts`               | Pure pagination over measured blocks                                 |
| `apps/website/src/document-measure.ts`              | Reads block heights and break offsets from the offscreen copy        |
| `apps/website/src/slide-deck.tsx`                   | Real-size 16:9 slides scaled to fit the screen                       |
| `apps/website/src/math.ts`                          | LaTeX to KaTeX HTML                                                  |
| `apps/website/src/examples.ts`                      | Example files that exercise every block kind and slide layout        |
| `apps/website/src/routes/__root.tsx`                | TanStack Start document and the demo user picker                     |
| `apps/website/src/routes/api.$.ts`                  | Same-origin API route forwarding through an Alchemy service binding  |
| `test/chats.test.ts`                                | Integration tests against actual Workers and Durable Objects         |
| `test/browser/chats.pw.ts`                          | Playwright coverage of two users sharing one chat                    |

The workspace is split by runtime. `packages/contract` runs everywhere and depends on Effect only. `apps/api` runs in workerd and depends on the contract and Alchemy. `apps/website` runs in the browser and SSR and depends on the contract and TanStack. The website never imports `@starter/api`; the Vite build fails if it does.

## Versioned files

A document is page settings plus an ordered list of blocks; a deck is a title plus slides. Both are versioned files: every item carries the version it was last written at, and the file carries a revision. An operation upserts and deletes items against the versions the writer read and applies each one independently, so a stale block comes back as a conflict with the winner while the rest land. Metadata and order are last-writer-wins. Replaying an operation ID returns its original result. `versioning.ts` derives the state, operation, and result schemas of a file kind from its metadata and item schemas, `versioned.ts` applies an operation to a state, and each object persists its own file as one row in its SQLite next to its operation log.

## Why three kinds of object

`ChatRoom` is one object per chat. It is the single writer for that chat's members and messages, so concurrent posts serialize without locks and membership checks read consistent state. `UserStore` is one object per user and holds only an index of memberships, which is what makes "each user has many chats" answerable without a global table.

Creating or joining a chat writes to both. The chat's write is authoritative and both writes are idempotent, so a retry after a partial failure converges. The user's object calls the chat's object through Alchemy's typed stub.

Objects expose RPC methods only, which is what Cloudflare recommends over `fetch` handlers. The Worker serves the whole `HttpApi` and implements each endpoint by calling a method on the right object; validation, status codes, and error encoding happen once, in the Worker. A typed failure raised inside an object crosses the stub as a plain tagged object, so each Worker handler catches the tag and rebuilds the class before the API encodes it.

The website keeps the standard TanStack Start flow: SSR, file routes, and same-origin `/api`. `routes/api.$.ts` reads `env.API` and forwards to the API Worker through a service binding. That framework adapter is the only runtime `cloudflare:workers` import. The API Worker has no public workers.dev endpoint, and the browser needs no API URL or CORS configuration.

## Change the schema

Append a SQL string to the object's migrations list in its file under `apps/api/src`. Each object stores the number of applied migrations in its synchronous KV storage and runs the pending ones on its first request after activation, inside one `storage.transactionSync`, so a failed migration rolls back and is retried next time. Never edit or remove a migration that has shipped.

Alchemy handles **DO class migrations** at deploy time. These are separate from the **per-instance SQL migrations** above. Deploying code does not eagerly migrate every object's database.

See [Alchemy's integration testing tutorial](https://alchemy.run/cloudflare/tutorial/part-3/) for the `Test.make` → `beforeAll(deploy(Stack))` → HTTP assertions → `afterAll(destroy(Stack))` pattern. These tests use `dev: true` for actual local workerd SQLite, not a fake database.

## Tooling

The template keeps TypeScript strictness, Effect/React architecture lint rules in `packages/oxlint-plugins`, oxfmt, commit hooks, Playwright, and GitHub Actions. The browser build rejects server-only imports. No React `useState`/`useEffect` or additional client state library is needed.

Provision CI credentials with `bun run ci:provision` after pointing `stacks/github.ts` at your repository. Production deploys remain gated by the repository's `CLOUDFLARE_DEPLOY_ENABLED` variable.
