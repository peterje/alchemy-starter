import {
  ChatId,
  ChatInput,
  ChatNotFound,
  Message,
  MessageId,
  type MessageInput,
  messageListLimit,
  NotAMember,
} from "@starter/contract/chats";
import { UserId } from "@starter/contract/user";
import * as Cloudflare from "alchemy/Cloudflare";
import { Array, Clock, Effect, Option, Schema } from "effect";

import { ObjectDatabase } from "./object-database.ts";

// Append only: each chat's database runs the statements past its stored version on its next activation.
const chatMigrations = [
  "CREATE TABLE chat (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at INTEGER NOT NULL)",
  "CREATE TABLE members (user_id TEXT PRIMARY KEY, joined_at INTEGER NOT NULL)",
  `CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  "CREATE INDEX messages_created_at ON messages (created_at ASC, id ASC)",
];
const ChatRow = Schema.Struct({ id: ChatId, ...ChatInput.fields, createdAt: Schema.Natural });
const MemberRow = Schema.Struct({ userId: UserId, joinedAt: Schema.Natural });

/** One object per chat: the single writer for its members and messages. */
export default class ChatRoom extends Cloudflare.DurableObject<ChatRoom>()(
  "ChatRoom",
  // No bindings to resolve in the isolate phase; each instance provides its own database.
  Effect.succeed(
    Effect.gen(function* () {
      const state = yield* Cloudflare.DurableObjectState;
      const db = yield* ObjectDatabase;
      // Objects are addressed by chat ID, so the object's name is its ID.
      const id = Schema.decodeUnknownSync(ChatId)(state.id.name);

      // Joining twice returns the original membership, so callers can retry safely.
      const addMember = Effect.fn("ChatRoom.addMember")(function* (member: {
        readonly title: string;
        readonly userId: UserId;
      }) {
        const now = yield* Clock.currentTimeMillis;
        const row = yield* db.queryOne({
          schema: MemberRow,
          sql: `INSERT INTO members (user_id, joined_at) VALUES (?, ?)
                ON CONFLICT (user_id) DO UPDATE SET joined_at = joined_at
                RETURNING user_id AS userId, joined_at AS joinedAt`,
          values: [member.userId, now],
        });
        return { chatId: id, title: member.title, joinedAt: row.joinedAt };
      });

      return {
        get: Effect.fn("ChatRoom.get")(function* () {
          const chat = yield* db.queryFirst({
            schema: ChatRow,
            sql: "SELECT id, title, created_at AS createdAt FROM chat",
          });
          if (Option.isNone(chat)) return yield* Effect.fail(new ChatNotFound({ id }));
          const members = yield* db.query({
            schema: Schema.Array(MemberRow),
            sql: "SELECT user_id AS userId, joined_at AS joinedAt FROM members ORDER BY joined_at ASC, user_id ASC",
          });
          return { ...chat.value, members: members.map((member) => member.userId) };
        }),
        messages: Effect.fn("ChatRoom.messages")(function* () {
          const latest = yield* db.query({
            schema: Schema.Array(Message),
            sql: `SELECT id, author, body, created_at AS createdAt FROM messages
                  ORDER BY created_at DESC, id DESC LIMIT ${messageListLimit}`,
          });
          return Array.reverse(latest);
        }),
        post: Effect.fn("ChatRoom.post")(function* (input: MessageInput) {
          const member = yield* db.queryFirst({
            schema: MemberRow,
            sql: "SELECT user_id AS userId, joined_at AS joinedAt FROM members WHERE user_id = ?",
            values: [input.author],
          });
          if (Option.isNone(member)) {
            return yield* Effect.fail(new NotAMember({ chatId: id, userId: input.author }));
          }
          const now = yield* Clock.currentTimeMillis;
          return yield* db.queryOne({
            schema: Message,
            sql: `INSERT INTO messages (id, author, body, created_at) VALUES (?, ?, ?, ?)
                  RETURNING id, author, body, created_at AS createdAt`,
            values: [MessageId.make(crypto.randomUUID()), input.author, input.body, now],
          });
        }),
        create: Effect.fn("ChatRoom.create")(function* (chat: {
          readonly title: string;
          readonly creator: UserId;
        }) {
          const now = yield* Clock.currentTimeMillis;
          const row = yield* db.queryOne({
            schema: ChatRow,
            sql: `INSERT INTO chat (id, title, created_at) VALUES (?, ?, ?)
                  RETURNING id, title, created_at AS createdAt`,
            values: [id, chat.title, now],
          });
          return yield* addMember({ title: row.title, userId: chat.creator });
        }),
        join: Effect.fn("ChatRoom.join")(function* (userId: UserId) {
          const chat = yield* db.queryFirst({
            schema: ChatRow,
            sql: "SELECT id, title, created_at AS createdAt FROM chat",
          });
          if (Option.isNone(chat)) return yield* Effect.fail(new ChatNotFound({ id }));
          return yield* addMember({ title: chat.value.title, userId });
        }),
      };
    }).pipe(Effect.provide(ObjectDatabase.layer(chatMigrations))),
  ),
) {}
