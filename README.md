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

`apps/website/src/todos/api.ts` is shared by the server and browser. Mutations invalidate the same reactivity key as the todo query, so Atom refreshes server state without `useState`, `useEffect`, or a second client-state library.

TanStack server functions are intentionally banned. Add backend behavior to the Effect API under `/api/*`, then expose it to React through `AtomHttpApi`. The `/api/$` server route in `apps/website/src/routes/api.$.ts` hands every request under `/api` to the Effect `HttpApi`, composed with the D1 binding from `cloudflare:workers`.

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
apps/website/src/todos        shared API, Atom client, handlers, repositories
apps/website/src/routes/api.$.ts  /api server route: D1 binding into the Effect API
apps/website/src/start.ts     TanStack Start instance, client-rendered by default
apps/website/migrations       D1 schema
apps/website/test/browser     end-to-end AtomHttpApi CRUD coverage
packages/oxlint-plugins       shared TypeScript, Effect, and React architecture rules
stacks/github.ts              CI credential bootstrap
.github/workflows             verify → browser → deploy
```
