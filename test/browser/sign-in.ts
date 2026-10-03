import { expect, type Page } from "@playwright/test";

/** Signs in "with GitHub" through the WorkOS emulator's login page, which stands in for GitHub. */
export const signIn = async (page: Page, email = "alice@example.com") => {
  await page.goto("/");
  await page.getByRole("link", { name: "Sign in with GitHub" }).click();
  await page.getByRole("textbox").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Signed in as")).toBeVisible();
};
