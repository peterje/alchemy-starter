import { expect, test } from "@playwright/test";

import { signIn } from "./sign-in.ts";

test("signing in with Google survives a reload, and signing out ends the session", async ({
  page,
}) => {
  await signIn(page, "bob@example.com");
  await expect(page.getByText("Bob", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("Bob", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
});

test("a sign-in that did not finish returns to the sign-in page to try again", async ({ page }) => {
  await page.goto("/api/auth/callback?code=stolen&state=guessed");
  await expect(page).toHaveURL(/\/sign-in\?error=failed$/u);
  await expect(page.getByRole("alert")).toHaveText("Sign-in didn't finish. Try again.");
  await expect(page.getByRole("link", { name: "Continue with Google" })).toBeVisible();
});
