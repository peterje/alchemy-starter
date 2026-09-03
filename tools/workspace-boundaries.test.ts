import { expect, test } from "bun:test";

const policies = [
  {
    directory: "packages/todos",
    packageName: "@starter/todos",
    allowed: new Set<string>(),
    serverImportsAllowedFrom: new Set<string>(),
  },
  {
    directory: "packages/api",
    packageName: "@starter/api",
    allowed: new Set(["@starter/todos"]),
    serverImportsAllowedFrom: new Set(["server.ts", "api.test.ts"]),
  },
  {
    directory: "apps/website",
    packageName: "@starter/website",
    allowed: new Set(["@starter/api", "@starter/todos"]),
    // The composition root is the only app module allowed to see implementations.
    // Loaders run on both client and server, so the Vite guard alone cannot catch this.
    serverImportsAllowedFrom: new Set(["routes/api.$.ts"]),
  },
] as const;

const sourceImportPattern = /(?:from\s+|import\s*\()(["'])([^"']+)\1/g;
const serverOnlyEntry = /^@starter\/[^/]+\/(?:server|testing)$/u;

const workspacePackageName = (specifier: string): string | undefined => {
  if (!specifier.startsWith("@starter/")) return undefined;
  const [scope, name] = specifier.split("/");
  return scope === undefined || name === undefined ? undefined : `${scope}/${name}`;
};

test("workspace dependency direction is acyclic and source imports use package interfaces", async () => {
  for (const policy of policies) {
    const manifest = await Bun.file(`${policy.directory}/package.json`).text();
    expect(manifest).toContain(`"name": "${policy.packageName}"`);

    const glob = new Bun.Glob("**/*.{ts,tsx}");
    for await (const relativePath of glob.scan(`${policy.directory}/src`)) {
      const source = await Bun.file(`${policy.directory}/src/${relativePath}`).text();
      for (const match of source.matchAll(sourceImportPattern)) {
        const specifier = match[2];
        if (specifier === undefined) continue;
        expect(specifier.includes("/src/"), `${policy.packageName}: ${specifier}`).toBe(false);
        if (serverOnlyEntry.test(specifier)) {
          expect(
            policy.serverImportsAllowedFrom.has(relativePath),
            `${policy.packageName}/${relativePath} imports server-only ${specifier}`,
          ).toBe(true);
        }
        const dependency = workspacePackageName(specifier);
        if (dependency === undefined) continue;
        expect(policy.allowed.has(dependency), `${policy.packageName} -> ${dependency}`).toBe(true);
        expect(manifest, `${policy.packageName} must declare ${dependency}`).toContain(
          `"${dependency}"`,
        );
      }
    }
  }
});
