# Rule selection

The plugin structure and rule coverage were informed by [`KATTCORP/isbabyoutyet/packages/oxlint-plugins`](https://github.com/KATTCORP/isbabyoutyet/tree/main/packages/oxlint-plugins). The implementations in this directory are specific to this template.

Adopted policies:

- Ban React local-state hooks in favor of Effect Atom.
- Ban React effect hooks in favor of Effect resources and Atom reactivity.
- Ban TanStack server functions in favor of the shared Effect `HttpApi` contract.

Not adopted:

- Convex, React Hook Form, and TanStack Query rules because those libraries are not in this stack.
- React Compiler memoization rules because this template does not enable React Compiler.
- Optional-property and destructuring style rules because they are not architecture boundaries.
- Module-mocking rules because `workspace/no-module-mocking` already covers that policy.
- Custom Vitest timeout rules because this stack uses Bun Test and Playwright.
- Callback-inference and inline-JSX-callback rules because they enforce local style rather than this template's state or API architecture.
