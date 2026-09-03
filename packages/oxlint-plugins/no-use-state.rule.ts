import { noUseStateRule } from "./no-use-state.ts";
import { ruleTester } from "./rule-tester.ts";

ruleTester.run("no-use-state", noUseStateRule, {
  valid: [`import { useAtom } from "@effect/atom-react";`, `import { useRef } from "react";`],
  invalid: [
    {
      code: `import { useState } from "react";`,
      errors: [{ messageId: "stateHook" }],
    },
    {
      code: `import * as React from "react"; React.useReducer((state) => state, 0);`,
      errors: [{ messageId: "stateHook" }],
    },
    {
      code: `export { useSyncExternalStore } from "react";`,
      errors: [{ messageId: "stateHook" }],
    },
  ],
});
