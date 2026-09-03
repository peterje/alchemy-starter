import { noModuleMockingRule } from "./no-module-mocking.ts";
import { ruleTester } from "./rule-tester.ts";

ruleTester.run("no-module-mocking", noModuleMockingRule, {
  valid: [`const service = { mock() {} }; service.mock();`],
  invalid: [
    {
      code: `import { vi } from "vitest"; vi.mock("./service");`,
      errors: [{ messageId: "moduleMock" }],
    },
  ],
});
