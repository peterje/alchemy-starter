import { expect, test } from "@playwright/test";

// Users persist in the browser stage's Postgres branch, so each run adds one with a unique name.
test("a new user is stored in Postgres and selected", async ({ page }) => {
  const name = `Dana ${Date.now()}`;
  await page.goto("/");
  await page.getByLabel("New user").fill(name);
  await page.getByRole("button", { name: "Add user" }).click();
  const picker = page.getByLabel("Demo user");
  await expect(picker.getByRole("option", { selected: true })).toHaveText(name);

  await page.reload();
  await expect(picker.getByRole("option", { name })).toHaveCount(1);
});
