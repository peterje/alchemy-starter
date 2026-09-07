import { ChatId, type ChatInput, Membership } from "@starter/contract/chats";
import { UserId } from "@starter/contract/user";
import * as Cloudflare from "alchemy/Cloudflare";
import { Effect, Schema } from "effect";

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
      const state = yield* Cloudflare.DurableObjectState;
      const db = yield* ObjectDatabase;
      // Objects are addressed by user ID, so the object's name is its ID.
      const userId = Schema.decodeUnknownSync(UserId)(state.id.name);

      // Creating or joining writes to two objects. The chat's write is authoritative and both
      // writes are idempotent, so a retry after a partial failure converges instead of diverging.
      const remember = (membership: Membership) =>
        db.queryOne({
          schema: Membership,
          sql: `INSERT INTO memberships (chat_id, title, joined_at) VALUES (?, ?, ?)
                ON CONFLICT (chat_id) DO UPDATE SET title = excluded.title
                RETURNING chat_id AS chatId, title, joined_at AS joinedAt`,
          values: [membership.chatId, membership.title, membership.joinedAt],
        });

      return {
        list: () =>
          db.query({
            schema: Schema.Array(Membership),
            sql: "SELECT chat_id AS chatId, title, joined_at AS joinedAt FROM memberships ORDER BY joined_at DESC, chat_id ASC",
          }),
        create: Effect.fn("UserStore.create")(function* (input: ChatInput) {
          const chatId = ChatId.make(crypto.randomUUID());
          const membership = yield* rooms
            .getByName(chatId)
            .create({ title: input.title, creator: userId });
          return yield* remember(membership);
        }),
        join: Effect.fn("UserStore.join")(function* (chatId: ChatId) {
          const membership = yield* rooms.getByName(chatId).join(userId);
          return yield* remember(membership);
        }),
      };
    }).pipe(Effect.provide(ObjectDatabase.layer(userMigrations)));
  }),
) {}
