import { Api } from "@starter/contract/api";
import { CurrentUser, User, UserId } from "@starter/contract/user";
import { Context, Effect, Layer, Option } from "effect";
import { HttpApiBuilder, HttpApiError } from "effect/http-api";
import { SqlClient, SqlSchema } from "effect/sql";

/** The stage's `users` table: everyone who has signed in to it. */
export class Users extends Context.Service<Users>()("Users", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const upsert = SqlSchema.findOne({
      Request: User,
      Result: User,
      execute: (user) => sql`INSERT INTO users ${sql.insert(user)}
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email
        RETURNING id, name, email`,
    });
    const findById = SqlSchema.findOneOption({
      Request: UserId,
      Result: User,
      execute: (id) => sql`SELECT id, name, email FROM users WHERE id = ${id}`,
    });
    // Storage failures are defects: the HTTP boundary logs them and answers 500.
    return {
      /** Records a signed-in user, refreshing the name and email WorkOS last reported. */
      save: Effect.fn("Users.save")(function* (user: User) {
        return yield* Effect.orDie(upsert(user));
      }),
      find: Effect.fn("Users.find")(function* (id: UserId) {
        return yield* Effect.orDie(findById(id));
      }),
    };
  }),
}) {
  static readonly layer = Layer.effect(this)(this.make);
}

export const UsersHandlers = HttpApiBuilder.group(Api, "users", (handlers) =>
  Effect.gen(function* () {
    const users = yield* Users;
    return handlers.handleAll({
      me: () =>
        Effect.gen(function* () {
          const { id } = yield* CurrentUser;
          const user = yield* users.find(id);
          if (Option.isNone(user)) return yield* Effect.fail(new HttpApiError.Unauthorized());
          return user.value;
        }),
    });
  }),
);
