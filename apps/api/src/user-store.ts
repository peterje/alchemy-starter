import { type Deck, DeckId } from "@starter/contract/decks";
import { type Document, DocumentId } from "@starter/contract/documents";
import { FileRef } from "@starter/contract/files";
import { UserId } from "@starter/contract/user";
import * as Cloudflare from "alchemy/Cloudflare";
import { Clock, Effect, Schema } from "effect";

import DeckObject from "./deck-object.ts";
import DocumentObject from "./document-object.ts";
import { ObjectDatabase } from "./object-database.ts";

// Append only: each user's database runs the statements past its stored version on its next activation.
const migrations = [
  "CREATE TABLE files (id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, created_at INTEGER NOT NULL)",
];

/** One object per user: an index of the files they created. */
export default class UserStore extends Cloudflare.DurableObject<UserStore>()(
  "UserStore",
  Effect.gen(function* () {
    const documents = yield* DocumentObject;
    const decks = yield* DeckObject;
    return Effect.gen(function* () {
      const db = yield* ObjectDatabase;
      // Objects are addressed by their user's ID, so the object's name is the owner of its files.
      const owner = Schema.decodeUnknownSync(UserId)(
        (yield* Cloudflare.DurableObjectState).id.name,
      );

      // Creating a file writes to two objects. The file's object is written first, so a failure
      // between the writes leaves an object nobody can reach, never a pointer to a missing file.
      const remember = (file: {
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
        list: () =>
          db.query({
            schema: Schema.Array(FileRef),
            sql: "SELECT kind, id, title, created_at AS createdAt FROM files ORDER BY created_at DESC, id ASC",
          }),
        createDocument: Effect.fn("UserStore.createDocument")(function* (document: Document) {
          const id = DocumentId.make(crypto.randomUUID());
          // A fresh random ID cannot already belong to someone else.
          yield* Effect.orDie(documents.getByName(id).create({ owner, document }));
          return yield* remember({ kind: "document", id, title: document.meta.title });
        }),
        createDeck: Effect.fn("UserStore.createDeck")(function* (deck: Deck) {
          const id = DeckId.make(crypto.randomUUID());
          yield* Effect.orDie(decks.getByName(id).create({ owner, deck }));
          return yield* remember({ kind: "deck", id, title: deck.meta.title });
        }),
      };
    }).pipe(Effect.provide(ObjectDatabase.layer(migrations)));
  }),
) {}
