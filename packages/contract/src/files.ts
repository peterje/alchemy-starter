import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api";

import { Deck, DeckId } from "./decks.ts";
import { Document, DocumentId } from "./documents.ts";
import { Authentication } from "./user.ts";
import { Title } from "./versioning.ts";

/**
 * A user's files: pointers to the document and deck objects they created.
 * The title is the one the file was created with; the file's object stays
 * authoritative.
 */
export const FileRef = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("document"),
    id: DocumentId,
    title: Title,
    createdAt: Schema.Natural,
  }),
  Schema.Struct({
    kind: Schema.Literal("deck"),
    id: DeckId,
    title: Title,
    createdAt: Schema.Natural,
  }),
]);
export type FileRef = typeof FileRef.Type;

/** Backed by the signed-in user's object: the files they created. */
export class FilesGroup extends HttpApiGroup.make("files")
  .add(
    HttpApiEndpoint.get("list", "/", {
      success: Schema.Array(FileRef),
    }),
    HttpApiEndpoint.post("createDocument", "/documents", {
      payload: Document,
      success: FileRef,
    }),
    HttpApiEndpoint.post("createDeck", "/decks", {
      payload: Deck,
      success: FileRef,
    }),
  )
  .middleware(Authentication)
  .prefix("/files") {}
