import { noWidenThenAssertRule } from "./no-widen-then-assert.ts";
import { ruleTester } from "./rule-tester.ts";

ruleTester.run("no-widen-then-assert", noWidenThenAssertRule, {
  valid: [`const value = "ready"; value.toUpperCase();`],
  invalid: [
    {
      code: `const value: unknown = "ready"; value as string;`,
      errors: [{ messageId: "widenThenAssert" }],
    },
  ],
});
