import { Schema } from "effect";

/**
 * Versioned files. A file is metadata plus an ordered list of items, each
 * carrying the version it was last written at. An operation upserts and
 * deletes items against the versions the writer read and applies each one
 * independently: stale items come back as conflicts with the winner while
 * the rest land. Metadata and order are last-writer-wins. Replaying an
 * operation returns its original result.
 */

/** Stable identity of an item. Writers address items by id; versions live beside them. */
export const ItemId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{1,64}$/u));
export type ItemId = typeof ItemId.Type;

/** Bumped on every accepted write to an item. Writers echo it back as `baseVersion`. */
export const Version = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));

/** Incremented once per operation that changed anything. */
export const Revision = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

/** Client-chosen idempotency key. */
export const OperationId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_.:-]{1,128}$/u));
export type OperationId = typeof OperationId.Type;

/** `applied`: everything landed. `partial`: some items conflicted. `rejected`: nothing changed. */
export const OperationStatus = Schema.Literals(["applied", "partial", "rejected"]);
export type OperationStatus = typeof OperationStatus.Type;

export class InvalidOperation extends Schema.TaggedError<InvalidOperation>()(
  "InvalidOperation",
  { operationId: OperationId, message: Schema.String },
  { httpApiStatus: 422 },
) {}

const MAX_ITEMS = 2_000;

const uniqueIds = <Item extends { readonly id: string }>() =>
  Schema.makeFilter<ReadonlyArray<Item>>(
    (items) =>
      new Set(items.map((item) => item.id)).size === items.length || "item ids must be unique",
    { title: "uniqueIds" },
  );

/** The schemas of one file kind, derived from its metadata and item schemas. */
export const VersionedFile = <
  Meta extends Schema.Top,
  Item extends Schema.Top & { readonly Type: { readonly id: string } },
>(
  meta: Meta,
  item: Item,
) => {
  const VersionedItem = Schema.Struct({ version: Version, item });
  return {
    Meta: meta,
    Item: item,
    /** A file as authored: content only. Storage assigns versions and the revision. */
    Content: Schema.Struct({
      meta,
      items: Schema.Array(item).check(Schema.isMaxLength(MAX_ITEMS), uniqueIds<Item["Type"]>()),
    }),
    VersionedItem,
    /** The stored file: content plus the revision and per-item versions that concurrency checks use. */
    State: Schema.Struct({
      meta,
      revision: Revision,
      items: Schema.Array(VersionedItem).check(Schema.isMaxLength(MAX_ITEMS)),
    }),
    Operation: Schema.Struct({
      operationId: OperationId,
      /** When set, the whole operation is rejected unless the file is at exactly this revision. */
      expectedRevision: Schema.optionalKey(Revision),
      /** `baseVersion` 0 asserts the item does not exist yet. */
      upserts: Schema.optionalKey(
        Schema.Array(
          Schema.Struct({ baseVersion: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)), item }),
        ).check(Schema.isMaxLength(MAX_ITEMS)),
      ),
      deletes: Schema.optionalKey(
        Schema.Array(Schema.Struct({ id: ItemId, baseVersion: Version })).check(
          Schema.isMaxLength(MAX_ITEMS),
        ),
      ),
      /** Full item order after the operation. Omit to keep the existing order and append new items. */
      order: Schema.optionalKey(Schema.Array(ItemId).check(Schema.isMaxLength(MAX_ITEMS))),
      /** Replaces the metadata as a whole. */
      meta: Schema.optionalKey(meta),
    }),
    Result: Schema.Struct({
      status: OperationStatus,
      revision: Revision,
      applied: Schema.Array(VersionedItem),
      deleted: Schema.Array(ItemId),
      /** `current` is the item that won, or null when it has been deleted since the writer read it. */
      conflicts: Schema.Array(Schema.Struct({ id: ItemId, current: Schema.NullOr(VersionedItem) })),
      order: Schema.Array(ItemId),
    }),
  };
};
