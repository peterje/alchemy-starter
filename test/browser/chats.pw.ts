import { expect, test } from "@playwright/test";

// Chats persist on the browser-test stage, so each test creates its own with a unique title.
async function createChat(page: import("@playwright/test").Page, title: string) {
  await page.goto("/");
  await page.getByLabel("New chat").fill(title);
  await page.getByRole("button", { name: "Create chat" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

test("two users share one chat object, and messages survive reloads", async ({ page }) => {
  const title = `Standup ${Date.now()}`;
  await createChat(page, title);
  await expect(page.getByText("Members: alice")).toBeVisible();

  await page.getByLabel("Message", { exact: true }).fill("Hello from Alice");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Hello from Alice")).toBeVisible();
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("");

  await page.getByLabel("Demo user").selectOption("bob");
  await expect(page.getByText("Hello from Alice")).toBeVisible();
  await expect(page.getByLabel("Message", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Join as bob" }).click();
  await expect(page.getByText("Members: alice, bob")).toBeVisible();
  await page.getByLabel("Message", { exact: true }).fill("Hi Alice");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Hi Alice")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Hello from Alice")).toBeVisible();
  await expect(page.getByText("Hi Alice")).toBeVisible();
  const html = await (await page.request.get(page.url())).text();
  expect(html).toContain("Hi Alice");

  await page.getByRole("link", { name: "Alchemy + Effect starter" }).click();
  await expect(page.getByRole("link", { name: title })).toBeVisible();
  await page.getByLabel("Demo user").selectOption("bob");
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});

test("failed sends preserve the draft and allow retry", async ({ page }) => {
  await createChat(page, `Retry ${Date.now()}`);
  await page.getByLabel("Message", { exact: true }).fill("Keep this text after a failed request.");
  await page.route(/\/api\/chats\/[^/]+\/messages$/, (route) =>
    route.request().method() === "POST" ? route.abort() : route.continue(),
  );
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("alert")).toContainText("Could not save");
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue(
    "Keep this text after a failed request.",
  );
  await page.unroute(/\/api\/chats\/[^/]+\/messages$/);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Keep this text after a failed request.")).toBeVisible();
});
