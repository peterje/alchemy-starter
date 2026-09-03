import { noChainedTypeAssertionsRule } from "./no-chained-type-assertions.ts";
import { ruleTester } from "./rule-tester.ts";

ruleTester.run("no-chained-type-assertions", noChainedTypeAssertionsRule, {
  valid: [`const value = input as string;`],
  invalid: [
    {
      code: `const value = input as unknown as string;`,
      errors: [{ messageId: "chained" }],
    },
  ],
});
