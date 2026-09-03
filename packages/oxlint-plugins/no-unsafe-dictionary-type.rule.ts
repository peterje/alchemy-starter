import { noUnsafeDictionaryTypeRule } from "./no-unsafe-dictionary-type.ts";
import { ruleTester } from "./rule-tester.ts";

ruleTester.run("no-unsafe-dictionary-type", noUnsafeDictionaryTypeRule, {
  valid: [`type Values = Readonly<Record<string, string>>;`],
  invalid: [
    {
      code: `type Values = Readonly<Record<string, unknown>>;`,
      errors: [{ messageId: "unsafeDictionary" }],
    },
  ],
});
