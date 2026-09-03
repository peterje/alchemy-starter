import { noReflectApplyRule } from "./no-reflect-apply.ts";
import { ruleTester } from "./rule-tester.ts";

ruleTester.run("no-reflect-apply", noReflectApplyRule, {
  valid: [`callback(...args);`],
  invalid: [
    {
      code: `Reflect.apply(callback, receiver, args);`,
      errors: [{ messageId: "reflectApply" }],
    },
  ],
});
