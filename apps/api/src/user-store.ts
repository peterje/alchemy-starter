import { ChatId, type ChatInput, Membership } from "@starter/contract/chats";
import { type Document, DocumentId } from "@starter/contract/documents";
import { FileRef } from "@starter/contract/files";
import { type Deck, DeckId } from "@starter/contract/slides";
import { UserId } from "@starter/contract/user";
import * as Cloudflare from "alchemy/Cloudflare";
import { Clock, Effect, Schema } from "effect";

import ChatRoom from "./chat-room.ts";
import DeckObject from "./deck-object.ts";
import DocumentObject from "./document-object.ts";
import { ObjectDatabase } from "./object-database.ts";

// Append only: each user's database runs the statements past its stored version on its next activation.
const userMigrations = [
  "CREATE TABLE memberships (chat_id TEXT PRIMARY KEY, title TEXT NOT NULL, joined_at INTEGER NOT NULL)",
  "CREATE TABLE files (id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, created_at INTEGER NOT NULL)",
];

/** One object per user: an index of the chats they belong to and the files they created. */
export default class UserStore extends Cloudflare.DurableObject<UserStore>()(
  "UserStore",
  Effect.gen(function* () {
    const rooms = yield* ChatRoom;
    const documents = yield* DocumentObject;
    const decks = yield* DeckObject;
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

      // The file's object is authoritative; this row is the user's pointer to it.
      const rememberFile = (file: {
        readonly kind: string;
        readonly id: string;
        readonly title: string;
      }) =>
        Effect.flatMap(Clock.currentTimeMillis, (now) =>
          db.queryOne({
            schema: FileRef,
            sql: `INSERT INTO files (id, kind, title, created_at) VALUES (?, ?, ?, ?)
                  RETURNING kind, id, title, created_at AS createdAt`,
            values: [file.id, file.kind, file.title, now],
          }),
        );

      return {
        listFiles: () =>
          db.query({
            schema: Schema.Array(FileRef),
            sql: "SELECT kind, id, title, created_at AS createdAt FROM files ORDER BY created_at DESC, id ASC",
          }),
        createDocument: Effect.fn("UserStore.createDocument")(function* (document: Document) {
          const id = DocumentId.make(crypto.randomUUID());
          yield* documents.getByName(id).set(document);
          return yield* rememberFile({ kind: "document", id, title: document.meta.title });
        }),
        createDeck: Effect.fn("UserStore.createDeck")(function* (deck: Deck) {
          const id = DeckId.make(crypto.randomUUID());
          yield* decks.getByName(id).set(deck);
          return yield* rememberFile({ kind: "deck", id, title: deck.meta.title });
        }),
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
