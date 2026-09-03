# `@starter/oxlint-plugins`

Shared Oxlint configuration and workspace rules.

Keep the package flat. Each rule uses one implementation and one colocated Node test:

```text
no-example.ts
no-example.rule.ts
```

The `.rule.ts` suffix keeps Oxlint `RuleTester` suites out of Bun Test discovery. Run them with `bun run test:plugins` or this package's `bun run test`.

`config.ts` owns the workspace configuration. The root `oxlint.config.ts` is only Oxlint's discovery entrypoint.
