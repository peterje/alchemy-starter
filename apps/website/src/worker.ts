import * as Cloudflare from "alchemy/Cloudflare";
import { Clock, Config, Effect, Layer, Option, Schema } from "effect";
import { HttpRouter, HttpServer, HttpServerResponse } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { ChatApi, UserApi } from "./api.ts";
import {
  ChatId,
  ChatNotFound,
  Membership,
  Message,
  MessageId,
  messageListLimit,
  NotAMember,
} from "./chats.ts";
import { openDatabase } from "./database.ts";
import { UserId } from "./user.ts";

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
const ChatRow = Schema.Struct({ id: ChatId, title: Schema.String, createdAt: Schema.Natural });
const MemberRow = Schema.Struct({ userId: UserId, joinedAt: Schema.Natural });

/**
 * One object per chat: the single writer for its members and messages.
 * RPC methods return plain values, so each caller raises its own typed errors.
 */
export class ChatRoom extends Cloudflare.DurableObject<ChatRoom>()(
  "ChatRoom",
  Effect.gen(function* () {
    const state = yield* Cloudflare.DurableObjectState;
    return Effect.gen(function* () {
      const { query, queryFirst, queryOne } = yield* openDatabase(state, chatMigrations);

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
              `SELECT id, author, body, createdAt FROM (
                 SELECT id, author, body, created_at AS createdAt FROM messages
                 ORDER BY created_at DESC, id DESC LIMIT ${messageListLimit}
               ) ORDER BY createdAt ASC, id ASC`,
            ),
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
    });
  }),
) {}

// Append only: each user's database runs the statements past its stored version on its next activation.
const userMigrations = [
  "CREATE TABLE memberships (chat_id TEXT PRIMARY KEY, title TEXT NOT NULL, joined_at INTEGER NOT NULL)",
];

/** One object per user: an index of the chats they belong to. */
export class UserStore extends Cloudflare.DurableObject<UserStore>()(
  "UserStore",
  Effect.gen(function* () {
    const rooms = yield* ChatRoom;
    const state = yield* Cloudflare.DurableObjectState;
    return Effect.gen(function* () {
      const { query, queryOne } = yield* openDatabase(state, userMigrations);

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
    });
  }),
) {}

export default class ApiWorker extends Cloudflare.Worker<ApiWorker>()(
  "Api",
  {
    main: import.meta.url,
    workersDev: false,
    dev: { port: Config.number("API_PORT").pipe(Config.withDefault(1338)) },
  },
  Effect.gen(function* () {
    const users = yield* UserStore;
    const rooms = yield* ChatRoom;
    // Demo routing only. Select the user's object from a verified session before storing private data.
    return {
      fetch: HttpRouter.addAll([
        HttpRouter.route("*", "/api/users/:userId/*", (request) =>
          HttpRouter.schemaPathParams(Schema.Struct({ userId: UserId })).pipe(
            Effect.flatMap(({ userId }) => users.getByName(userId).fetch(request)),
            Effect.catchTag("SchemaError", () =>
              Effect.succeed(HttpServerResponse.empty({ status: 400 })),
            ),
          ),
        ),
        HttpRouter.route("*", "/api/chats/:chatId/*", (request) =>
          HttpRouter.schemaPathParams(Schema.Struct({ chatId: ChatId })).pipe(
            Effect.flatMap(({ chatId }) => rooms.getByName(chatId).fetch(request)),
            Effect.catchTag("SchemaError", () =>
              Effect.succeed(HttpServerResponse.empty({ status: 400 })),
            ),
          ),
        ),
      ]).pipe(HttpRouter.toHttpEffect),
    };
  }),
) {}
