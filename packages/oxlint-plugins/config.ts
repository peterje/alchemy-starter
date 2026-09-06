export default {
  // Rule implementations walk untyped ASTs, so they cannot satisfy the rules they define.
  ignorePatterns: ["**/routeTree.gen.ts", "packages/oxlint-plugins/**"],
  jsPlugins: [
    {
      name: "workspace",
      specifier: "./packages/oxlint-plugins/index.ts",
    },
  ],
  rules: {
    "workspace/no-chained-type-assertions": "error",
    "workspace/no-conditional-empty-object-spread": "error",
    "workspace/no-known-value-widening": "error",
    "workspace/no-module-mocking": "error",
    "workspace/no-object-parameters": "error",
    "workspace/no-reflect-apply": "error",
    "workspace/no-reflect-get": "error",
    "workspace/no-runtime-typeof": "error",
    "workspace/no-server-functions": "error",
    "workspace/no-service-constructor-imports": "error",
    "workspace/no-shape-in-symbol-names": "error",
    "workspace/no-unknown-parameters": "error",
    "workspace/no-unknown-returns": "error",
    "workspace/no-unknown-type-aliases": "error",
    "workspace/no-unsafe-dictionary-type": "error",
    "workspace/no-use-effect": "error",
    "workspace/no-use-state": "error",
    "workspace/no-widen-then-assert": "error",
    "workspace/require-safety-comment-for-type-assertion": "error",
  },
};
