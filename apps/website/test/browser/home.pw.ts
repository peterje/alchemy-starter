import { expect, test } from "@playwright/test";
import { Schema } from "effect";
import { Note } from "../../src/notes.ts";

// These two users belong to the public demo. Only clear their notes in the local test app.
test.beforeEach(async ({ request }) => {
  for (const user of ["alice", "bob"]) {
    const response = await request.get(`/api/users/${user}/notes/`);
    expect(response.ok()).toBe(true);
    const notes = await Schema.decodeUnknownPromise(Schema.Array(Note))(await response.json());
    for (const note of notes) {
      expect((await request.delete(`/api/users/${user}/notes/${note.id}`)).ok()).toBe(true);
    }
  }
});

test("the notes demo supports CRUD, user isolation, and reloads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your notes, your object." })).toBeVisible();
  await expect(page.getByText("No notes yet.", { exact: false })).toBeVisible();

  await page.getByLabel("Title", { exact: true }).fill("First note");
  await page.getByLabel("Note", { exact: true }).fill("Saved in Alice's SQLite database.");
  await page.getByRole("button", { name: "Add note" }).click();
  const note = page.getByRole("article", { name: "First note" });
  await expect(note).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true }).first()).toHaveValue("");

  await page.getByLabel("Demo user").selectOption("bob");
  await expect(page.getByText("No notes yet.", { exact: false })).toBeVisible();
  await expect(note).not.toBeVisible();
  await page.getByLabel("Demo user").selectOption("alice");
  await expect(note).toBeVisible();
  await page.reload();
  await expect(note).toBeVisible();

  await note.getByText("Edit note", { exact: true }).click();
  await note.getByLabel("Title", { exact: true }).fill("Updated note");
  await note.getByLabel("Note", { exact: true }).fill("An edited body.");
  await note.getByRole("button", { name: "Save changes" }).click();
  const updated = page.getByRole("article", { name: "Updated note" });
  await expect(updated.locator(".note-body")).toHaveText("An edited body.");
  await updated.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("No notes yet.", { exact: false })).toBeVisible();
});

test("failed writes preserve drafts and allow retry", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("No notes yet.", { exact: false })).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill("Do not lose this draft");
  await page.getByLabel("Note", { exact: true }).fill("Keep this text after a failed request.");
  await page.route(/\/api\/users\/alice\/notes\/?$/, (route) =>
    route.request().method() === "POST" ? route.abort() : route.continue(),
  );
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByRole("alert")).toContainText("Could not save");
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Do not lose this draft");
  await expect(page.getByLabel("Note", { exact: true })).toHaveValue(
    "Keep this text after a failed request.",
  );
  await page.unroute(/\/api\/users\/alice\/notes\/?$/);
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByRole("article", { name: "Do not lose this draft" })).toBeVisible();
});
