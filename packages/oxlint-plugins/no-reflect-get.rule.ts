import { noReflectGetRule } from "./no-reflect-get.ts";
import { ruleTester } from "./rule-tester.ts";

ruleTester.run("no-reflect-get", noReflectGetRule, {
  valid: [`const value = record.key;`],
  invalid: [
    {
      code: `const value = Reflect.get(record, "key");`,
      errors: [{ messageId: "reflectGet" }],
    },
  ],
});
