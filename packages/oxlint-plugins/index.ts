import { eslintCompatPlugin } from "@oxlint/plugins";

import { noChainedTypeAssertionsRule } from "./no-chained-type-assertions.ts";
import { noConditionalEmptyObjectSpreadRule } from "./no-conditional-empty-object-spread.ts";
import { noKnownValueWideningRule } from "./no-known-value-widening.ts";
import { noModuleMockingRule } from "./no-module-mocking.ts";
import { noObjectParametersRule } from "./no-object-parameters.ts";
import { noReflectApplyRule } from "./no-reflect-apply.ts";
import { noReflectGetRule } from "./no-reflect-get.ts";
import { noRuntimeTypeofRule } from "./no-runtime-typeof.ts";
import { noServerFunctionsRule } from "./no-server-functions.ts";
import { noServiceConstructorImportsRule } from "./no-service-constructor-imports.ts";
import { noShapeInSymbolNamesRule } from "./no-shape-in-symbol-names.ts";
import { noUnknownParametersRule } from "./no-unknown-parameters.ts";
import { noUnknownReturnsRule } from "./no-unknown-returns.ts";
import { noUnknownTypeAliasesRule } from "./no-unknown-type-aliases.ts";
import { noUnsafeDictionaryTypeRule } from "./no-unsafe-dictionary-type.ts";
import { noUseEffectRule } from "./no-use-effect.ts";
import { noUseStateRule } from "./no-use-state.ts";
import { noWidenThenAssertRule } from "./no-widen-then-assert.ts";
import { requireSafetyCommentForTypeAssertionRule } from "./require-safety-comment-for-type-assertion.ts";

/** Shared Oxlint rules for the workspace's TypeScript, Effect, and React boundaries. */
const workspacePlugin = eslintCompatPlugin({
  meta: { name: "workspace" },
  rules: {
    "no-chained-type-assertions": noChainedTypeAssertionsRule,
    "no-conditional-empty-object-spread": noConditionalEmptyObjectSpreadRule,
    "no-known-value-widening": noKnownValueWideningRule,
    "no-module-mocking": noModuleMockingRule,
    "no-object-parameters": noObjectParametersRule,
    "no-reflect-apply": noReflectApplyRule,
    "no-reflect-get": noReflectGetRule,
    "no-runtime-typeof": noRuntimeTypeofRule,
    "no-server-functions": noServerFunctionsRule,
    "no-service-constructor-imports": noServiceConstructorImportsRule,
    "no-shape-in-symbol-names": noShapeInSymbolNamesRule,
    "no-unknown-parameters": noUnknownParametersRule,
    "no-unknown-returns": noUnknownReturnsRule,
    "no-unknown-type-aliases": noUnknownTypeAliasesRule,
    "no-unsafe-dictionary-type": noUnsafeDictionaryTypeRule,
    "no-use-effect": noUseEffectRule,
    "no-use-state": noUseStateRule,
    "no-widen-then-assert": noWidenThenAssertRule,
    "require-safety-comment-for-type-assertion": requireSafetyCommentForTypeAssertionRule,
  },
});

export default workspacePlugin;
