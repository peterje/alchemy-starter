import * as Cloudflare from "alchemy/Cloudflare";
import { Clock, Config, Effect, Layer, Schema } from "effect";
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
import { StorageError, UserId } from "./store.ts";

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
const ChatRow = Schema.Struct({ id: ChatId, title: Schema.String, createdAt: Schema.Number });
const chatColumns = "id, title, created_at AS createdAt";
const MemberRow = Schema.Struct({ userId: UserId, joinedAt: Schema.Number });
const memberColumns = "user_id AS userId, joined_at AS joinedAt";
const messageColumns = "id, author, body, created_at AS createdAt";

/**
 * One object per chat: the single writer for its members and messages.
 * RPC methods return plain values; typed errors are raised at the HTTP boundary of the caller.
 */
export class ChatRoom extends Cloudflare.DurableObject<ChatRoom>()(
  "ChatRoom",
  Effect.gen(function* () {
    const state = yield* Cloudflare.DurableObjectState;
    return Effect.gen(function* () {
      const { query, queryOne } = yield* openDatabase(state.raw.storage, chatMigrations);

      // Joining twice returns the original membership, so callers can retry safely.
      const addMember = (chatId: ChatId, title: string, userId: UserId) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          const member = yield* queryOne(
            MemberRow,
            () => new StorageError(),
            `INSERT INTO members (user_id, joined_at) VALUES (?, ?)
             ON CONFLICT (user_id) DO UPDATE SET joined_at = joined_at RETURNING ${memberColumns}`,
            userId,
            now,
          );
          return { chatId, title, joinedAt: member.joinedAt };
        });

      const handlers = HttpApiBuilder.group(ChatApi, "chat", (handlers) =>
        handlers.handleAll({
          get: ({ params }) =>
            Effect.gen(function* () {
              const chat = yield* queryOne(
                ChatRow,
                () => new ChatNotFound({ id: params.chatId }),
                `SELECT ${chatColumns} FROM chat`,
              );
              const members = yield* query(
                Schema.Array(MemberRow),
                `SELECT ${memberColumns} FROM members ORDER BY joined_at ASC, user_id ASC`,
              );
              return { ...chat, members: members.map((member) => member.userId) };
            }),
          messages: () =>
            query(
              Schema.Array(Message),
              `SELECT id, author, body, createdAt FROM (
                 SELECT ${messageColumns} FROM messages ORDER BY created_at DESC, id DESC LIMIT ${messageListLimit}
               ) ORDER BY createdAt ASC, id ASC`,
            ),
          post: ({ params, payload }) =>
            Effect.gen(function* () {
              yield* queryOne(
                MemberRow,
                () => new NotAMember({ chatId: params.chatId, userId: payload.author }),
                `SELECT ${memberColumns} FROM members WHERE user_id = ?`,
                payload.author,
              );
              const id = yield* Effect.sync(() => MessageId.make(crypto.randomUUID()));
              const now = yield* Clock.currentTimeMillis;
              return yield* queryOne(
                Message,
                () => new StorageError(),
                `INSERT INTO messages (id, author, body, created_at) VALUES (?, ?, ?, ?) RETURNING ${messageColumns}`,
                id,
                payload.author,
                payload.body,
                now,
              );
            }),
        }),
      );

      return {
        fetch: yield* HttpRouter.toHttpEffect(
          HttpApiBuilder.layer(ChatApi).pipe(
            Layer.provide(handlers),
            Layer.provide(HttpServer.layerServices),
          ),
        ),
        create: (id: ChatId, title: string, creator: UserId) =>
          Effect.gen(function* () {
            const now = yield* Clock.currentTimeMillis;
            const chat = yield* queryOne(
              ChatRow,
              () => new StorageError(),
              `INSERT INTO chat (id, title, created_at) VALUES (?, ?, ?) RETURNING ${chatColumns}`,
              id,
              title,
              now,
            );
            return yield* addMember(chat.id, chat.title, creator);
          }),
        join: (userId: UserId) =>
          Effect.gen(function* () {
            const chats = yield* query(Schema.Array(ChatRow), `SELECT ${chatColumns} FROM chat`);
            const chat = chats[0];
            return chat === undefined ? undefined : yield* addMember(chat.id, chat.title, userId);
          }),
      };
    });
  }),
) {}

// Append only: each user's database runs the statements past its stored version on its next activation.
const userMigrations = [
  "CREATE TABLE memberships (chat_id TEXT PRIMARY KEY, title TEXT NOT NULL, joined_at INTEGER NOT NULL)",
];
const membershipColumns = "chat_id AS chatId, title, joined_at AS joinedAt";

/** One object per user: an index of the chats they belong to. */
export class UserStore extends Cloudflare.DurableObject<UserStore>()(
  "UserStore",
  Effect.gen(function* () {
    const rooms = yield* ChatRoom;
    const state = yield* Cloudflare.DurableObjectState;
    return Effect.gen(function* () {
      const { query, queryOne } = yield* openDatabase(state.raw.storage, userMigrations);

      // Creating or joining writes to two objects. The chat's write is authoritative and both
      // writes are idempotent, so a retry after a partial failure converges instead of diverging.
      const remember = (membership: Membership) =>
        queryOne(
          Membership,
          () => new StorageError(),
          `INSERT INTO memberships (chat_id, title, joined_at) VALUES (?, ?, ?)
           ON CONFLICT (chat_id) DO UPDATE SET title = excluded.title RETURNING ${membershipColumns}`,
          membership.chatId,
          membership.title,
          membership.joinedAt,
        );

      const handlers = HttpApiBuilder.group(UserApi, "memberships", (handlers) =>
        handlers.handleAll({
          list: () =>
            query(
              Schema.Array(Membership),
              `SELECT ${membershipColumns} FROM memberships ORDER BY joined_at DESC, chat_id ASC`,
            ),
          create: ({ params, payload }) =>
            Effect.gen(function* () {
              const id = yield* Effect.sync(() => ChatId.make(crypto.randomUUID()));
              const membership = yield* rooms
                .getByName(id)
                .create(id, payload.title, params.userId);
              return yield* remember(membership);
            }),
          join: ({ params }) =>
            Effect.gen(function* () {
              const membership = yield* rooms.getByName(params.chatId).join(params.userId);
              return membership === undefined
                ? yield* Effect.fail(new ChatNotFound({ id: params.chatId }))
                : yield* remember(membership);
            }),
        }),
      );

      return {
        fetch: yield* HttpRouter.toHttpEffect(
          HttpApiBuilder.layer(UserApi).pipe(
            Layer.provide(handlers),
            Layer.provide(HttpServer.layerServices),
          ),
        ),
      };
    });
  }),
) {}

export default class ApiWorker extends Cloudflare.Worker<ApiWorker>()(
  "Api",
  Effect.gen(function* () {
    return {
      main: import.meta.url,
      workersDev: false,
      dev: { port: yield* Config.number("API_PORT").pipe(Config.withDefault(1338), Effect.orDie) },
    };
  }),
  Effect.gen(function* () {
    const users = yield* UserStore;
    const rooms = yield* ChatRoom;
    // Demo routing only. Select the user's object from a verified session before storing private data.
    const routes = Layer.mergeAll(
      HttpRouter.add("*", "/api/users/:userId/*", (request) =>
        HttpRouter.schemaPathParams(Schema.Struct({ userId: UserId })).pipe(
          Effect.flatMap(({ userId }) => users.getByName(userId).fetch(request)),
          Effect.catchTag("SchemaError", () =>
            Effect.succeed(HttpServerResponse.empty({ status: 400 })),
          ),
        ),
      ),
      HttpRouter.add("*", "/api/chats/:chatId/*", (request) =>
        HttpRouter.schemaPathParams(Schema.Struct({ chatId: ChatId })).pipe(
          Effect.flatMap(({ chatId }) => rooms.getByName(chatId).fetch(request)),
          Effect.catchTag("SchemaError", () =>
            Effect.succeed(HttpServerResponse.empty({ status: 400 })),
          ),
        ),
      ),
    );
    return { fetch: yield* HttpRouter.toHttpEffect(routes) };
  }),
) {}
