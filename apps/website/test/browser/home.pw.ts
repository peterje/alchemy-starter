import { expect, test } from "@playwright/test";

test("the Effect Atom client completes the todo lifecycle", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Effect all the way down." })).toBeVisible();
  await expect(page.getByText("Nothing here yet.")).toBeVisible();

  await page.getByLabel("Add a todo").fill("Ship the Effect example");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Ship the Effect example")).toBeVisible();
  await expect(page.getByText("1 total")).toBeVisible();

  await page.getByRole("button", { name: "Complete Ship the Effect example" }).click();
  await expect(page.getByText("Ship the Effect example")).toHaveClass(/completed/);

  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Nothing here yet.")).toBeVisible();
  await expect(page.getByText("0 total")).toBeVisible();
});
