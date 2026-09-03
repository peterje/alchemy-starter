import { expect, test } from "@playwright/test";

interface TodoResponse {
  readonly id: string;
}

// The local D1 database persists between runs, so start from an empty list.
test.beforeEach(async ({ request }) => {
  const todos: ReadonlyArray<TodoResponse> = await (await request.get("/api/todos/")).json();
  for (const todo of todos) {
    await request.delete(`/api/todos/${todo.id}`);
  }
});

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
