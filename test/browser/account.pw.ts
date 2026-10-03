import { expect, test } from "@playwright/test";

import { signIn } from "./sign-in.ts";

test("signing in with Google survives a reload, and signing out ends the session", async ({
  page,
}) => {
  await signIn(page, "bob@example.com");
  await expect(page.locator(".account")).toContainText("Bob");

  await page.reload();
  await expect(page.locator(".account")).toContainText("Bob");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign in with Google" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "Sign in with Google" })).toBeVisible();
});
