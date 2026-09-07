import { UserApi } from "@starter/contract/api";
import { ChatId, ChatNotFound, Membership } from "@starter/contract/chats";
import * as Cloudflare from "alchemy/Cloudflare";
import { Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";

import ChatRoom from "./chat-room.ts";
import { ObjectDatabase } from "./object-database.ts";

// Append only: each user's database runs the statements past its stored version on its next activation.
const userMigrations = [
  "CREATE TABLE memberships (chat_id TEXT PRIMARY KEY, title TEXT NOT NULL, joined_at INTEGER NOT NULL)",
];

/** One object per user: an index of the chats they belong to. */
export default class UserStore extends Cloudflare.DurableObject<UserStore>()(
  "UserStore",
  Effect.gen(function* () {
    const rooms = yield* ChatRoom;
    return Effect.gen(function* () {
      const { query, queryOne } = yield* ObjectDatabase;

      // Creating or joining writes to two objects. The chat's write is authoritative and both
      // writes are idempotent, so a retry after a partial failure converges instead of diverging.
      const remember = (membership: Membership) =>
        queryOne(
          Membership,
          `INSERT INTO memberships (chat_id, title, joined_at) VALUES (?, ?, ?)
           ON CONFLICT (chat_id) DO UPDATE SET title = excluded.title
           RETURNING chat_id AS chatId, title, joined_at AS joinedAt`,
          membership.chatId,
          membership.title,
          membership.joinedAt,
        );

      const handlers = HttpApiBuilder.group(UserApi, "memberships", (handlers) =>
        handlers.handleAll({
          list: () =>
            query(
              Schema.Array(Membership),
              "SELECT chat_id AS chatId, title, joined_at AS joinedAt FROM memberships ORDER BY joined_at DESC, chat_id ASC",
            ),
          create: ({ params, payload }) =>
            Effect.gen(function* () {
              const id = ChatId.make(crypto.randomUUID());
              const membership = yield* rooms
                .getByName(id)
                .create(id, payload.title, params.userId);
              return yield* remember(membership);
            }),
          join: ({ params }) =>
            Effect.gen(function* () {
              const membership = yield* rooms.getByName(params.chatId).join(params.userId);
              if (membership === undefined) return yield* new ChatNotFound({ id: params.chatId });
              return yield* remember(membership);
            }),
        }),
      );

      return {
        fetch: HttpApiBuilder.layer(UserApi).pipe(
          Layer.provide(handlers),
          Layer.provide(HttpServer.layerServices),
          HttpRouter.toHttpEffect,
        ),
      };
    }).pipe(Effect.provide(ObjectDatabase.layer(userMigrations)));
  }),
) {}
