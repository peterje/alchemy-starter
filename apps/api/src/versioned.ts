import { InvalidOperation, type OperationStatus } from "@starter/contract/versioning";
import { Effect } from "effect";

/**
 * The versioning core shared by every file kind. Storage runs it inside its
 * own critical section and persists the returned state.
 */

export interface VersionedItem<Item> {
  readonly version: number;
  readonly item: Item;
}

export interface VersionedState<Meta, Item> {
  readonly meta: Meta;
  readonly revision: number;
  readonly items: ReadonlyArray<VersionedItem<Item>>;
}

export interface ItemOperation<Meta, Item> {
  readonly operationId: string;
  readonly expectedRevision?: number | undefined;
  readonly upserts?:
    | ReadonlyArray<{ readonly baseVersion: number; readonly item: Item }>
    | undefined;
  readonly deletes?:
    | ReadonlyArray<{ readonly id: string; readonly baseVersion: number }>
    | undefined;
  readonly order?: ReadonlyArray<string> | undefined;
  readonly meta?: Meta | undefined;
}

export interface ItemOperationResult<Item> {
  readonly status: OperationStatus;
  readonly revision: number;
  readonly applied: ReadonlyArray<VersionedItem<Item>>;
  readonly deleted: ReadonlyArray<string>;
  readonly conflicts: ReadonlyArray<{
    readonly id: string;
    readonly current: VersionedItem<Item> | null;
  }>;
  readonly order: ReadonlyArray<string>;
}

export interface ItemOperationOutcome<Meta, Item> {
  readonly state: VersionedState<Meta, Item>;
  readonly result: ItemOperationResult<Item>;
}

const same = <T>(a: T, b: T): boolean => JSON.stringify(a) === JSON.stringify(b);

const rejected = <Meta, Item extends { readonly id: string }>(
  state: VersionedState<Meta, Item>,
): ItemOperationOutcome<Meta, Item> => ({
  state,
  result: {
    status: "rejected",
    revision: state.revision,
    applied: [],
    deleted: [],
    conflicts: [],
    order: state.items.map((entry) => entry.item.id),
  },
});

/** Structural checks that fail the whole operation before it touches state. */
const validate = <Meta, Item extends { readonly id: string }>(
  operation: ItemOperation<Meta, Item>,
): Effect.Effect<void, InvalidOperation> => {
  const invalid = (message: string) =>
    Effect.fail(new InvalidOperation({ operationId: operation.operationId, message }));
  const upsertIds = (operation.upserts ?? []).map((upsert) => upsert.item.id);
  if (new Set(upsertIds).size !== upsertIds.length) {
    return invalid("upserts contain duplicate item ids");
  }
  const deleteIds = new Set((operation.deletes ?? []).map((entry) => entry.id));
  if (upsertIds.some((id) => deleteIds.has(id))) {
    return invalid("an item cannot be upserted and deleted in the same operation");
  }
  if (operation.order !== undefined && new Set(operation.order).size !== operation.order.length) {
    return invalid("order contains duplicate item ids");
  }
  return Effect.void;
};

export const applyItemOperation = <Meta, Item extends { readonly id: string }>(
  state: VersionedState<Meta, Item>,
  operation: ItemOperation<Meta, Item>,
): Effect.Effect<ItemOperationOutcome<Meta, Item>, InvalidOperation> =>
  Effect.gen(function* () {
    yield* validate(operation);
    if (operation.expectedRevision !== undefined && operation.expectedRevision !== state.revision) {
      return rejected(state);
    }

    const byId = new Map<string, VersionedItem<Item>>(
      state.items.map((entry) => [entry.item.id, entry]),
    );
    const applied: Array<VersionedItem<Item>> = [];
    const deleted: Array<string> = [];
    const conflicts: Array<{ id: string; current: VersionedItem<Item> | null }> = [];
    const appended: Array<string> = [];

    for (const upsert of operation.upserts ?? []) {
      const id = upsert.item.id;
      const current = byId.get(id);
      const currentVersion = current?.version ?? 0;
      if (currentVersion !== upsert.baseVersion) {
        conflicts.push({ id, current: current ?? null });
        continue;
      }
      const next = { version: currentVersion + 1, item: upsert.item };
      byId.set(id, next);
      applied.push(next);
      if (current === undefined) appended.push(id);
    }

    for (const request of operation.deletes ?? []) {
      const current = byId.get(request.id);
      // Deleting something already gone is a no-op, so retries stay harmless.
      if (current === undefined) continue;
      if (current.version !== request.baseVersion) {
        conflicts.push({ id: request.id, current });
        continue;
      }
      byId.delete(request.id);
      deleted.push(request.id);
    }

    let order: ReadonlyArray<string>;
    if (operation.order === undefined) {
      order = [
        ...state.items.map((entry) => entry.item.id).filter((id) => byId.has(id)),
        ...appended,
      ];
    } else {
      const surviving = new Set(byId.keys());
      const unknown = operation.order.filter((id) => !surviving.has(id));
      const omitted = [...surviving].filter((id) => !operation.order?.includes(id));
      if (unknown.length > 0 || omitted.length > 0) {
        return yield* Effect.fail(
          new InvalidOperation({
            operationId: operation.operationId,
            message: `order must list every surviving item exactly once (unknown: ${unknown.join(", ") || "none"}; omitted: ${omitted.join(", ") || "none"})`,
          }),
        );
      }
      order = operation.order;
    }

    const meta = operation.meta ?? state.meta;
    const previousOrder = state.items.map((entry) => entry.item.id);
    const changed =
      applied.length > 0 ||
      deleted.length > 0 ||
      !same(meta, state.meta) ||
      order.length !== previousOrder.length ||
      order.some((id, index) => previousOrder[index] !== id);
    const revision = changed ? state.revision + 1 : state.revision;
    const items = order.flatMap((id) => {
      const entry = byId.get(id);
      return entry === undefined ? [] : [entry];
    });
    return {
      state: { meta, revision, items },
      result: {
        status: conflicts.length === 0 ? "applied" : "partial",
        revision,
        applied,
        deleted,
        conflicts,
        order,
      },
    } satisfies ItemOperationOutcome<Meta, Item>;
  });
