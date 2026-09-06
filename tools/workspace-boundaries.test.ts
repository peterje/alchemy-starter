import { expect, test } from "bun:test";

// The contract is shared with the browser. Only the Worker may import platform bindings.
test("the notes contract stays client-safe", async () => {
  const contract = await Bun.file("apps/website/src/notes.ts").text();
  expect(contract).not.toContain("cloudflare:workers");
  expect(contract).not.toContain("./worker");
  const ui = await Bun.file("apps/website/src/main.tsx").text();
  expect(ui).not.toContain("cloudflare:workers");
  expect(ui).not.toContain("./worker");
});
