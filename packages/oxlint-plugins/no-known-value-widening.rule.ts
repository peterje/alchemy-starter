import { noKnownValueWideningRule } from "./no-known-value-widening.ts";
import { ruleTester } from "./rule-tester.ts";

ruleTester.run("no-known-value-widening", noKnownValueWideningRule, {
  valid: [`const value = { id: 1 };`],
  invalid: [
    {
      code: `const value: object = { id: 1 };`,
      errors: [{ messageId: "widening" }],
    },
  ],
});
