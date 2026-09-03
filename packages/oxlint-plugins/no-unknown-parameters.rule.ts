import { noUnknownParametersRule } from "./no-unknown-parameters.ts";
import { ruleTester } from "./rule-tester.ts";

ruleTester.run("no-unknown-parameters", noUnknownParametersRule, {
  valid: [`function report(cause: unknown) { return cause; }`],
  invalid: [
    {
      code: `function parse(input: unknown) { return input; }`,
      errors: [{ messageId: "unknownParameter" }],
    },
  ],
});
