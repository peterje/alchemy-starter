import { expect, test } from "@playwright/test";

// Files persist on the browser-test stage, so each test creates its own with a unique title.
test("a document is created from the library, edited block by block, and survives reloads", async ({
  page,
}) => {
  const title = `Quiz ${Date.now()}`;
  await page.goto("/files");
  await page.getByLabel("New file").fill(title);
  await page.getByLabel("Kind").selectOption("document");
  await page.getByRole("button", { name: "Create file" }).click();
  await expect(page.getByRole("region", { name: title })).toBeVisible();
  // The paginated viewer measures blocks offscreen first, so assert inside the printed page.
  const pageOne = page.getByRole("region", { name: /^Page 1 of/u });
  await expect(pageOne.locator("p", { hasText: "Start writing." })).toBeVisible();

  await page.getByLabel("New paragraph").fill("First question");
  await page.getByRole("button", { name: "Add paragraph" }).click();
  await expect(pageOne.locator("p", { hasText: "First question" })).toBeVisible();
  await expect(page.getByLabel("New paragraph")).toHaveValue("");

  await page.getByText("Edit paragraph").first().click();
  await page.getByLabel("Text").first().fill("Start here.");
  await page.getByRole("button", { name: "Save paragraph" }).first().click();
  await expect(pageOne.locator("p", { hasText: "Start here." })).toBeVisible();

  await page.getByLabel("Title", { exact: true }).fill(`${title} renamed`);
  await page.getByRole("button", { name: "Rename" }).click();
  await expect(page.getByRole("region", { name: `${title} renamed` })).toBeVisible();

  await page.reload();
  await expect(pageOne.locator("p", { hasText: "Start here." })).toBeVisible();
  await expect(pageOne.locator("p", { hasText: "First question" })).toBeVisible();
  await expect(page.getByText("Revision 4", { exact: false })).toBeVisible();

  await page.getByRole("link", { name: "Files" }).click();
  await expect(page.getByRole("link", { name: title })).toBeVisible();
  await page.getByLabel("Demo user").selectOption("bob");
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);
});

test("a deck is created from the library and gains and loses slides", async ({ page }) => {
  const title = `Lesson ${Date.now()}`;
  await page.goto("/files");
  await page.getByLabel("New file").fill(title);
  await page.getByLabel("Kind").selectOption("deck");
  await page.getByRole("button", { name: "Create file" }).click();
  await expect(page.getByRole("region", { name: title })).toBeVisible();
  await expect(page.getByRole("figure", { name: "Slide 1" })).toBeVisible();

  await page.getByLabel("New slide").fill("Objectives");
  await page.getByRole("button", { name: "Add slide" }).click();
  await expect(page.getByRole("figure", { name: "Slide 2" })).toContainText("Objectives");

  await page
    .getByRole("figure", { name: "Slide 1" })
    .getByRole("button", { name: "Delete slide" })
    .click();
  await expect(page.getByRole("figure", { name: "Slide 2" })).toHaveCount(0);
  await expect(page.getByRole("figure", { name: "Slide 1" })).toContainText("Objectives");
});
