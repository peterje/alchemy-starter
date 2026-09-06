import { Schema } from "effect";

/** Selects a user's Durable Object. Demo routing, not authorization: authenticate before choosing one. */
export const UserId = Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9_-]{1,128}$/)).pipe(
  Schema.brand("UserId"),
);
export type UserId = typeof UserId.Type;

/** Internal details are logged at the storage boundary, not sent to clients. */
export class StorageError extends Schema.TaggedError<StorageError>()(
  "StorageError",
  {},
  { httpApiStatus: 500 },
) {}
