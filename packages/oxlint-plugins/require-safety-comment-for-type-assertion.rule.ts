import { requireSafetyCommentForTypeAssertionRule } from "./require-safety-comment-for-type-assertion.ts";
import { ruleTester } from "./rule-tester.ts";

ruleTester.run(
  "require-safety-comment-for-type-assertion",
  requireSafetyCommentForTypeAssertionRule,
  {
    valid: [`// SAFETY: validated at the request boundary\nconst value = input as string;`],
    invalid: [
      {
        code: `const value = input as string;`,
        errors: [{ messageId: "missingSafetyComment" }],
      },
    ],
  },
);
