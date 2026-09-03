import { noRuntimeTypeofRule } from "./no-runtime-typeof.ts";
import { ruleTester } from "./rule-tester.ts";

ruleTester.run("no-runtime-typeof", noRuntimeTypeofRule, {
  valid: [`const isReady = value === ready;`],
  invalid: [
    {
      code: `const isText = typeof value === "string";`,
      errors: [{ messageId: "runtimeTypeof" }],
    },
  ],
});
