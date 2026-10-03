import { expect, test } from "@playwright/test";

test("the home page is an empty chat beside the sidebar, which collapses and reopens", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What should we work on?" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  await expect(page.getByText("No chats yet")).toBeVisible();

  // A collapsed sidebar slides out of view rather than leaving the page.
  // One toggle stays in place: a collapsed sidebar slides out of view rather than leaving the page.
  const toggle = page.getByRole("button", { name: "Toggle sidebar" });
  const before = await toggle.boundingBox();
  await toggle.click();
  await expect(page.getByText("No chats yet")).not.toBeInViewport();
  expect(await toggle.boundingBox()).toEqual(before);
  await toggle.click();
  await expect(page.getByText("No chats yet")).toBeInViewport();
});
