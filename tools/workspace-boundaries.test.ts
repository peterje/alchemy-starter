import { expect, test } from "bun:test";

// The contract is shared with the browser. Alchemy runtime code stays on the server.
test("the notes contract stays client-safe", async () => {
  const contract = await Bun.file("apps/website/src/notes.ts").text();
  expect(contract).not.toContain("cloudflare:workers");
  expect(contract).not.toContain("./worker");
  expect(contract).not.toContain('from "alchemy');
  const ui = await Bun.file("apps/website/src/routes/index.tsx").text();
  expect(ui).not.toContain("cloudflare:workers");
  expect(ui).not.toContain("./worker");
  expect(ui).not.toContain('from "alchemy');
  const worker = await Bun.file("apps/website/src/worker.ts").text();
  expect(worker).not.toContain("cloudflare:workers");
});
