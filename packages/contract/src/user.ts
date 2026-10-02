import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api";

/** Selects a user's Durable Object. Demo routing, not authorization: authenticate before choosing one. */
export const UserId = Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9_-]{1,128}$/)).pipe(
  Schema.brand("UserId"),
);
export type UserId = typeof UserId.Type;

export const UserName = Schema.Trim.check(Schema.isNonEmpty(), Schema.isMaxLength(80));

/** A row in the Postgres `users` table. */
export const User = Schema.Struct({ id: UserId, name: UserName });
export type User = typeof User.Type;

/** Backed by Postgres: everyone who can own files. */
export class UsersGroup extends HttpApiGroup.make("users")
  .add(
    HttpApiEndpoint.get("list", "/", { success: Schema.Array(User) }),
    HttpApiEndpoint.post("create", "/", {
      payload: Schema.Struct({ name: UserName }),
      success: User,
    }),
  )
  .prefix("/users") {}
