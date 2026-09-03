import { noForbiddenTermInSymbolNamesRule } from "./no-shape-in-symbol-names.ts";
import { ruleTester } from "./rule-tester.ts";

ruleTester.run("no-shape-in-symbol-names", noForbiddenTermInSymbolNamesRule, {
  valid: [`const domainModel = {};`],
  invalid: [
    {
      code: `const responseShape = {};`,
      errors: [{ messageId: "forbiddenSymbolName" }],
    },
  ],
});
