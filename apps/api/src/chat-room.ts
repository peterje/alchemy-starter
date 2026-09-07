import { ChatApi } from "@starter/contract/api";
import {
  ChatId,
  ChatInput,
  ChatNotFound,
  Message,
  MessageId,
  messageListLimit,
  NotAMember,
} from "@starter/contract/chats";
import { UserId } from "@starter/contract/user";
import * as Cloudflare from "alchemy/Cloudflare";
import { Array, Clock, Effect, Layer, Option, Schema } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";

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

/**
 * One object per chat: the single writer for its members and messages.
 * RPC methods return plain values, so each caller raises its own typed errors.
 */
export default class ChatRoom extends Cloudflare.DurableObject<ChatRoom>()(
  "ChatRoom",
  Effect.gen(function* () {
    return Effect.gen(function* () {
      const { query, queryFirst, queryOne } = yield* ObjectDatabase;

      // Joining twice returns the original membership, so callers can retry safely.
      const addMember = Effect.fn("ChatRoom.addMember")(function* (
        chatId: ChatId,
        title: string,
        userId: UserId,
      ) {
        const now = yield* Clock.currentTimeMillis;
        const member = yield* queryOne(
          MemberRow,
          `INSERT INTO members (user_id, joined_at) VALUES (?, ?)
           ON CONFLICT (user_id) DO UPDATE SET joined_at = joined_at
           RETURNING user_id AS userId, joined_at AS joinedAt`,
          userId,
          now,
        );
        return { chatId, title, joinedAt: member.joinedAt };
      });

      const handlers = HttpApiBuilder.group(ChatApi, "chat", (handlers) =>
        handlers.handleAll({
          get: ({ params }) =>
            Effect.gen(function* () {
              const chat = yield* queryFirst(
                ChatRow,
                "SELECT id, title, created_at AS createdAt FROM chat",
              ).pipe(
                Effect.flatMap(Effect.fromOption(() => new ChatNotFound({ id: params.chatId }))),
              );
              const members = yield* query(
                Schema.Array(MemberRow),
                "SELECT user_id AS userId, joined_at AS joinedAt FROM members ORDER BY joined_at ASC, user_id ASC",
              );
              return { ...chat, members: members.map((member) => member.userId) };
            }),
          messages: () =>
            query(
              Schema.Array(Message),
              `SELECT id, author, body, created_at AS createdAt FROM messages
               ORDER BY created_at DESC, id DESC LIMIT ${messageListLimit}`,
            ).pipe(Effect.map(Array.reverse)),
          post: ({ params, payload }) =>
            Effect.gen(function* () {
              yield* queryFirst(
                MemberRow,
                "SELECT user_id AS userId, joined_at AS joinedAt FROM members WHERE user_id = ?",
                payload.author,
              ).pipe(
                Effect.flatMap(
                  Effect.fromOption(
                    () => new NotAMember({ chatId: params.chatId, userId: payload.author }),
                  ),
                ),
              );
              const now = yield* Clock.currentTimeMillis;
              return yield* queryOne(
                Message,
                `INSERT INTO messages (id, author, body, created_at) VALUES (?, ?, ?, ?)
                 RETURNING id, author, body, created_at AS createdAt`,
                MessageId.make(crypto.randomUUID()),
                payload.author,
                payload.body,
                now,
              );
            }),
        }),
      );

      return {
        fetch: HttpApiBuilder.layer(ChatApi).pipe(
          Layer.provide(handlers),
          Layer.provide(HttpServer.layerServices),
          HttpRouter.toHttpEffect,
        ),
        create: Effect.fn("ChatRoom.create")(function* (
          id: ChatId,
          title: string,
          creator: UserId,
        ) {
          const now = yield* Clock.currentTimeMillis;
          const chat = yield* queryOne(
            ChatRow,
            `INSERT INTO chat (id, title, created_at) VALUES (?, ?, ?)
             RETURNING id, title, created_at AS createdAt`,
            id,
            title,
            now,
          );
          return yield* addMember(chat.id, chat.title, creator);
        }),
        join: Effect.fn("ChatRoom.join")(function* (userId: UserId) {
          const chat = yield* queryFirst(
            ChatRow,
            "SELECT id, title, created_at AS createdAt FROM chat",
          );
          return Option.isSome(chat)
            ? yield* addMember(chat.value.id, chat.value.title, userId)
            : undefined;
        }),
      };
    }).pipe(Effect.provide(ObjectDatabase.layer(chatMigrations)));
  }),
) {}
