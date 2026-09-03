import { noUnknownReturnsRule } from "./no-unknown-returns.ts";
import { ruleTester } from "./rule-tester.ts";

ruleTester.run("no-unknown-returns", noUnknownReturnsRule, {
  valid: [`function load(): string { return "ready"; }`],
  invalid: [
    {
      code: `function load(): unknown { return "ready"; }`,
      errors: [{ messageId: "unknownReturn" }],
    },
  ],
});
