# Alchemy starter

GitHub template for an Effect-native Alchemy + React application:

- Alchemy 2 on Cloudflare Workers (`bun run dev` / `bun run deploy`)
- TanStack Start, client-rendered by default, with every backend endpoint under `/api/*`
- Schema-first Effect `HttpApi` backed by Cloudflare D1
- Effect `AtomHttpApi` queries and mutations with React Atom bindings
- No React local state, effect hooks, or TanStack server functions in application code
- Bun workspaces, TypeScript 7 strictness, conventional commits
- oxlint **anti-slop** and Effect architecture rules, oxfmt, lefthook
- Playwright browser integration on `main`
- React Doctor skill and `bun run doctor`

The demo is a small todo manager. It shows one typed contract flowing from HTTP schemas and handlers through D1 persistence to client query and mutation atoms.

## Effect end to end

The app keeps one explicit path for state:

```text
Effect Schema + HttpApi contract
  → Effect service + Layer handlers
  → Cloudflare D1 repository
  → AtomHttpApi generated client
  → @effect/atom-react hooks
  → React UI
```

The domain lives in packages; the app is a thin host. Each package exposes a client-safe contract as its root entry and keeps implementation behind a `/server` entry:

| Package          | `.` (client-safe)                      | `./server`                                       |
| ---------------- | -------------------------------------- | ------------------------------------------------ |
| `@starter/todos` | schemas, errors, `TodosApiGroup`       | `TodoRepository` service, `TodoRepositoryD1`     |
| `@starter/api`   | `StarterApi`: every group under `/api` | `ApiRoutes`: handlers mapping groups to services |

Mutations invalidate the same reactivity key as the todo query, so Atom refreshes server state without `useState`, `useEffect`, or a second client-state library.

TanStack server functions are intentionally banned. Add backend behavior as a group in its domain package, register it in `StarterApi`, then expose it to React through `AtomHttpApi`. `apps/website/src/routes/api.$.ts` is the composition root: it binds D1 from `cloudflare:workers` and hands every request under `/api` to `ApiRoutes`.

Three checks keep implementation out of the browser. Package `exports` make `/server` the only path to it. A Vite plugin fails the client build if any `@starter/*/server`, `@starter/*/testing`, or `cloudflare:workers` import reaches the client graph. `tools/workspace-boundaries.test.ts` allows `/server` imports only from the composition root, which also covers loaders, since those run on both sides.

Routes are client-rendered by default (`defaultSsr: false` in `src/start.ts`), so the Worker only renders the document shell. A route can opt into SSR with `ssr: true` if it ever needs it.

- [Effect Atom](https://www.effect.website/docs/v4/api/effect/unstable/reactivity/Atom)
- [Effect AtomHttpApi](https://www.effect.website/docs/v4/api/effect/unstable/reactivity/AtomHttpApi)

## Commands

```bash
bun install
bun run dev          # Alchemy dev server at http://localhost:1337
bun run check        # format, lint, types, tests, plugin tests, build
bun run test:browser # Playwright against `alchemy dev` (local workerd + D1)
bun run doctor       # React Doctor on the changed scope
bun run deploy       # production Worker and D1 database
```

`alchemy dev` runs the Worker in local workerd with a local D1 database, so development and the browser suite exercise the same routes and D1 repository as production. The API unit test swaps in an in-memory repository Layer; nothing else knows it exists.

Provision GitHub Actions Cloudflare secrets and enable production deploys once:

```bash
bun run ci:provision
```

## Layout

```text
packages/todos                todo domain: contract, repository service, D1 adapter
packages/api                  the HttpApi: groups under /api, handlers, API test
apps/website/src/routes/api.$.ts  composition root: D1 binding into ApiRoutes
apps/website/src/todos/atoms.ts   AtomHttpApi client over the contract
apps/website/src/start.ts     TanStack Start instance, client-rendered by default
apps/website/migrations       D1 schema
apps/website/test/browser     end-to-end AtomHttpApi CRUD coverage
packages/oxlint-plugins       shared TypeScript, Effect, and React architecture rules
stacks/github.ts              CI credential bootstrap
.github/workflows             verify → browser → deploy
```
