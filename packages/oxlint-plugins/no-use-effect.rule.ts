import { noUseEffectRule } from "./no-use-effect.ts";
import { ruleTester } from "./rule-tester.ts";

ruleTester.run("no-use-effect", noUseEffectRule, {
  valid: [
    `import { Effect } from "effect";`,
    `function useEffect() { return "local"; } useEffect();`,
  ],
  invalid: [
    {
      code: `import { useEffect } from "react";`,
      errors: [{ messageId: "effectHook" }],
    },
    {
      code: `import React from "react"; React.useLayoutEffect(() => {}, []);`,
      errors: [{ messageId: "effectHook" }],
    },
    {
      code: `export { useEffect } from "react";`,
      errors: [{ messageId: "effectHook" }],
    },
  ],
});
