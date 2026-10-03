import { expect, type Page } from "@playwright/test";

/** Signs in "with Google" through the WorkOS emulator's login page, which stands in for Google. */
export const signIn = async (page: Page, email = "alice@example.com") => {
  await page.goto("/");
  await page.getByRole("link", { name: "Sign in with Google" }).click();
  await page.getByRole("textbox").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
};
