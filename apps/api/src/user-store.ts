import { type Document, DocumentId } from "@starter/contract/documents";
import { FileRef } from "@starter/contract/files";
import { type Deck, DeckId } from "@starter/contract/slides";
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

      // Creating a file writes to two objects. The file's object is authoritative and this row is
      // the user's pointer to it, so a retry after a partial failure converges instead of diverging.
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
          yield* documents.getByName(id).set(document);
          return yield* remember({ kind: "document", id, title: document.meta.title });
        }),
        createDeck: Effect.fn("UserStore.createDeck")(function* (deck: Deck) {
          const id = DeckId.make(crypto.randomUUID());
          yield* decks.getByName(id).set(deck);
          return yield* remember({ kind: "deck", id, title: deck.meta.title });
        }),
      };
    }).pipe(Effect.provide(ObjectDatabase.layer(migrations)));
  }),
) {}
