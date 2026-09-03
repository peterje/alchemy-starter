import { noServerFunctionsRule } from "./no-server-functions.ts";
import { ruleTester } from "./rule-tester.ts";

ruleTester.run("no-server-functions", noServerFunctionsRule, {
  valid: [`import { createFileRoute } from "@tanstack/react-router";`],
  invalid: [
    {
      code: `import { createServerFn } from "@tanstack/react-start";`,
      errors: [{ messageId: "serverFunction" }],
    },
    {
      code: `export { useServerFn } from "@tanstack/react-start";`,
      errors: [{ messageId: "serverFunction" }],
    },
    {
      code: `import * as Start from "@tanstack/react-start"; Start.createServerFn();`,
      errors: [{ messageId: "serverFunction" }],
    },
    {
      code: `export * from "@tanstack/react-start";`,
      errors: [{ messageId: "starExport" }],
    },
  ],
});
