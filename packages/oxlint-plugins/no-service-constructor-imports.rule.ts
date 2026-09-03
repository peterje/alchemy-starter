import { noServiceConstructorImportsRule } from "./no-service-constructor-imports.ts";
import { ruleTester } from "./rule-tester.ts";

ruleTester.run("no-service-constructor-imports", noServiceConstructorImportsRule, {
  valid: [
    `import { RepositoryLive } from "./repository";`,
    {
      code: `import { makeRepository } from "./repository";`,
      filename: "repository.test.ts",
    },
  ],
  invalid: [
    {
      code: `import { makeRepository } from "./repository";`,
      filename: "service.ts",
      errors: [{ messageId: "serviceConstructorImport" }],
    },
  ],
});
