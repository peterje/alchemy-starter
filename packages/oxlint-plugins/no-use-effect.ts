import { defineRule, type ESTree } from "@oxlint/plugins";

const effectHooks = new Set(["useEffect", "useLayoutEffect"]);

function importedName(node: ESTree.ImportSpecifier): string {
  return node.imported.type === "Identifier" ? node.imported.name : node.imported.value;
}

function memberName(node: ESTree.MemberExpression): string | null {
  if (!node.computed && node.property.type === "Identifier") return node.property.name;
  if (node.property.type === "Literal" && typeof node.property.value === "string") {
    return node.property.value;
  }
  return null;
}

/** Keep synchronization inside Effect runtimes, atoms, and explicit event handlers. */
export const noUseEffectRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow React effect hooks in application code.",
    },
    messages: {
      effectHook:
        "Do not use React `{{name}}`. Use Effect resources, Atom reactivity, or an explicit event handler.",
    },
  },
  create(context) {
    const reactNamespaces = new Set<string>();

    return {
      ImportSpecifier(node) {
        if (
          node.parent?.type === "ImportDeclaration" &&
          node.parent.source.value === "react" &&
          effectHooks.has(importedName(node))
        ) {
          context.report({
            node,
            messageId: "effectHook",
            data: { name: importedName(node) },
          });
        }
      },
      ImportDefaultSpecifier(node) {
        if (node.parent?.type === "ImportDeclaration" && node.parent.source.value === "react") {
          reactNamespaces.add(node.local.name);
        }
      },
      ImportNamespaceSpecifier(node) {
        if (node.parent?.type === "ImportDeclaration" && node.parent.source.value === "react") {
          reactNamespaces.add(node.local.name);
        }
      },
      MemberExpression(node) {
        if (node.object.type !== "Identifier" || !reactNamespaces.has(node.object.name)) return;
        const name = memberName(node);
        if (name === null || !effectHooks.has(name)) return;
        context.report({ node, messageId: "effectHook", data: { name } });
      },
      VariableDeclarator(node) {
        if (
          node.id.type !== "ObjectPattern" ||
          node.init?.type !== "Identifier" ||
          !reactNamespaces.has(node.init.name)
        ) {
          return;
        }
        for (const property of node.id.properties) {
          if (
            property.type === "Property" &&
            !property.computed &&
            property.key.type === "Identifier" &&
            effectHooks.has(property.key.name)
          ) {
            context.report({
              node: property,
              messageId: "effectHook",
              data: { name: property.key.name },
            });
          }
        }
      },
      ExportNamedDeclaration(node) {
        if (node.source?.value !== "react") return;
        for (const specifier of node.specifiers) {
          if (specifier.type !== "ExportSpecifier") continue;
          const name =
            specifier.local.type === "Identifier" ? specifier.local.name : specifier.local.value;
          if (effectHooks.has(name)) {
            context.report({ node: specifier, messageId: "effectHook", data: { name } });
          }
        }
      },
    };
  },
});
