import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

import { Document, DocumentId, DocumentTitle } from "./documents.ts";
import { Deck, DeckId } from "./slides.ts";
import { UserId } from "./user.ts";

/**
 * A user's files: pointers to the document and deck objects they created.
 * The title is the one the file was created with; the file's object stays
 * authoritative, like a chat membership's title.
 */
export const FileRef = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("document"),
    id: DocumentId,
    title: DocumentTitle,
    createdAt: Schema.Natural,
  }),
  Schema.Struct({
    kind: Schema.Literal("deck"),
    id: DeckId,
    title: DocumentTitle,
    createdAt: Schema.Natural,
  }),
]);
export type FileRef = typeof FileRef.Type;

/** Backed by the user's object: the files a user created. */
export class FilesGroup extends HttpApiGroup.make("files")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { userId: UserId },
      success: Schema.Array(FileRef),
    }),
    HttpApiEndpoint.post("createDocument", "/documents", {
      params: { userId: UserId },
      payload: Document,
      success: FileRef,
    }),
    HttpApiEndpoint.post("createDeck", "/decks", {
      params: { userId: UserId },
      payload: Deck,
      success: FileRef,
    }),
  )
  .prefix("/users/:userId/files") {}
