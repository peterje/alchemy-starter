import { defineRule, type ESTree } from "@oxlint/plugins";

const bannedExports = new Set(["createServerFn", "useServerFn"]);
const tanstackStartModules = new Set([
  "@tanstack/react-start",
  "@tanstack/react-start/server",
  "@tanstack/react-start/server-rpc",
  "@tanstack/react-start/client-rpc",
  "@tanstack/start-client-core",
]);

function specifierName(node: ESTree.ImportSpecifier | ESTree.ExportSpecifier): string {
  const specifier = node.type === "ImportSpecifier" ? node.imported : node.local;
  return specifier.type === "Identifier" ? specifier.name : specifier.value;
}

function memberName(node: ESTree.MemberExpression): string | null {
  if (!node.computed && node.property.type === "Identifier") return node.property.name;
  if (node.property.type === "Literal" && typeof node.property.value === "string") {
    return node.property.value;
  }
  return null;
}

/** Keep backend behavior behind the schema-first /api HttpApi contract. */
export const noServerFunctionsRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow TanStack Start server functions.",
    },
    messages: {
      serverFunction:
        "Do not use TanStack server functions. Define a typed Effect HttpApi endpoint under `/api` and call it through AtomHttpApi.",
      starExport:
        "Do not re-export a TanStack Start module wholesale because it exposes banned server functions.",
    },
  },
  create(context) {
    const namespaces = new Set<string>();

    return {
      ImportDeclaration(node) {
        if (!tanstackStartModules.has(node.source.value)) return;
        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportNamespaceSpecifier") {
            namespaces.add(specifier.local.name);
          } else if (
            specifier.type === "ImportSpecifier" &&
            bannedExports.has(specifierName(specifier))
          ) {
            context.report({ node: specifier, messageId: "serverFunction" });
          }
        }
      },
      MemberExpression(node) {
        if (node.object.type !== "Identifier" || !namespaces.has(node.object.name)) return;
        const name = memberName(node);
        if (name !== null && bannedExports.has(name)) {
          context.report({ node, messageId: "serverFunction" });
        }
      },
      ExportAllDeclaration(node) {
        if (tanstackStartModules.has(node.source.value)) {
          context.report({ node, messageId: "starExport" });
        }
      },
      ExportNamedDeclaration(node) {
        if (node.source === null || !tanstackStartModules.has(node.source.value)) return;
        for (const specifier of node.specifiers) {
          if (specifier.type !== "ExportSpecifier") continue;
          if (bannedExports.has(specifierName(specifier))) {
            context.report({ node: specifier, messageId: "serverFunction" });
          }
        }
      },
    };
  },
});
