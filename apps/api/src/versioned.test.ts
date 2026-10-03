import { describe, expect, test } from "bun:test";

import { Effect } from "effect";

import { applyItemOperation, type ItemOperation, type VersionedState } from "./versioned.ts";

interface Meta {
  readonly title: string;
}
interface Item {
  readonly id: string;
  readonly text: string;
}

const state: VersionedState<Meta, Item> = {
  meta: { title: "Quiz" },
  revision: 3,
  items: [
    { version: 1, item: { id: "a", text: "first" } },
    { version: 2, item: { id: "b", text: "second" } },
  ],
};

const apply = (operation: ItemOperation<Meta, Item>) =>
  Effect.runSync(applyItemOperation(state, operation));
const reject = (operation: ItemOperation<Meta, Item>) =>
  Effect.runSync(Effect.flip(applyItemOperation(state, operation)));

describe("applyItemOperation", () => {
  test("applies edits based on the current version and reports stale ones as conflicts", () => {
    const { state: next, result } = apply({
      operationId: "op",
      upserts: [
        { baseVersion: 1, item: { id: "a", text: "edited" } },
        { baseVersion: 1, item: { id: "b", text: "stale" } },
        { baseVersion: 0, item: { id: "c", text: "new" } },
      ],
    });
    expect(result.status).toBe("partial");
    expect(result.conflicts).toEqual([{ id: "b", current: state.items[1] ?? null }]);
    expect(next.revision).toBe(4);
    expect(next.items.map(({ version, item }) => [item.id, version, item.text])).toEqual([
      ["a", 2, "edited"],
      ["b", 2, "second"],
      ["c", 1, "new"],
    ]);
  });

  test("rejects an operation made against an older revision without changing anything", () => {
    const { state: next, result } = apply({
      operationId: "op",
      expectedRevision: 2,
      deletes: [{ id: "a", baseVersion: 1 }],
    });
    expect(result.status).toBe("rejected");
    expect(next).toBe(state);
  });

  test("keeps the revision when a retried delete finds nothing left to do", () => {
    const { state: next, result } = apply({
      operationId: "op",
      deletes: [{ id: "gone", baseVersion: 1 }],
    });
    expect(result).toMatchObject({ status: "applied", deleted: [], revision: 3 });
    expect(next.revision).toBe(3);
  });

  test("fails operations that are malformed rather than conflicting", () => {
    expect(
      reject({
        operationId: "op",
        upserts: [
          { baseVersion: 1, item: { id: "a", text: "x" } },
          { baseVersion: 1, item: { id: "a", text: "y" } },
        ],
      }).message,
    ).toBe("upserts contain duplicate item ids");
    expect(reject({ operationId: "op", order: ["b"] }).message).toContain("omitted: a");
  });
});
