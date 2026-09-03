import { noUnknownTypeAliasesRule } from "./no-unknown-type-aliases.ts";
import { ruleTester } from "./rule-tester.ts";

ruleTester.run("no-unknown-type-aliases", noUnknownTypeAliasesRule, {
  valid: [`type UserId = string;`],
  invalid: [
    {
      code: `type Payload = unknown;`,
      errors: [{ messageId: "unknownAlias" }],
    },
  ],
});
