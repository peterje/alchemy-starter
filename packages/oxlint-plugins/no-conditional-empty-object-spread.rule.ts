import { noConditionalEmptyObjectSpreadRule } from "./no-conditional-empty-object-spread.ts";
import { ruleTester } from "./rule-tester.ts";

ruleTester.run("no-conditional-empty-object-spread", noConditionalEmptyObjectSpreadRule, {
  valid: [`const value = { ...source };`],
  invalid: [
    {
      code: `const value = { ...(enabled ? { ready: true } : {}) };`,
      errors: [{ messageId: "avoid" }],
    },
  ],
});
