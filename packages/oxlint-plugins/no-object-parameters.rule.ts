import { noObjectParametersRule } from "./no-object-parameters.ts";
import { ruleTester } from "./rule-tester.ts";

ruleTester.run("no-object-parameters", noObjectParametersRule, {
  valid: [
    `interface Input { readonly id: string } function read(input: Input) { return input.id; }`,
  ],
  invalid: [
    {
      code: `function read(input: object) { return input; }`,
      errors: [{ messageId: "objectParameter" }],
    },
  ],
});
