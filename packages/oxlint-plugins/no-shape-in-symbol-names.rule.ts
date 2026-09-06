import { noShapeInSymbolNamesRule } from "./no-shape-in-symbol-names.ts";
import { ruleTester } from "./rule-tester.ts";

ruleTester.run("no-shape-in-symbol-names", noShapeInSymbolNamesRule, {
  valid: [`const domainModel = {};`],
  invalid: [
    {
      code: `const responseShape = {};`,
      errors: [{ messageId: "forbiddenSymbolName" }],
    },
  ],
});
