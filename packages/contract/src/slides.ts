import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

import {
  DocumentTitle,
  ImageBlock,
  Inline,
  ListBlock,
  MathBlock,
  ParagraphBlock,
  TableBlock,
} from "./documents.ts";
import { InvalidOperation, ItemId, VersionedFile } from "./versioning.ts";

/**
 * A deck is an ordered list of slides. A slide holds the same content blocks
 * documents use, minus headings and page breaks, which have no meaning on a
 * slide. Slides are the unit of versioning, so one slide can be rewritten
 * without touching the rest.
 */

export const DeckId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand("DeckId"));
export type DeckId = typeof DeckId.Type;

export const SlideBlock = Schema.Union([
  ParagraphBlock,
  ListBlock,
  TableBlock,
  ImageBlock,
  MathBlock,
]);
export type SlideBlock = typeof SlideBlock.Type;

const SlideBlocks = Schema.Array(SlideBlock).check(Schema.isMaxLength(40));

export const Slide = Schema.Struct({
  id: ItemId,
  layout: Schema.Literals(["title", "content", "twoColumn", "blank"]),
  /** Ignored by the blank layout. */
  title: Schema.optionalKey(Schema.Array(Inline)),
  /** Used by the title layout. */
  subtitle: Schema.optionalKey(Schema.Array(Inline)),
  /** Main content, or the left column for the two-column layout. */
  body: SlideBlocks,
  /** Right column for the two-column layout. */
  secondary: Schema.optionalKey(SlideBlocks),
  /** Speaker notes; never rendered on the slide. */
  notes: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(5_000))),
});
export type Slide = typeof Slide.Type;

export const DeckMeta = Schema.Struct({ title: DocumentTitle });
export type DeckMeta = typeof DeckMeta.Type;

export const DeckFile = VersionedFile(DeckMeta, Slide);
export const Deck = DeckFile.Content;
export type Deck = typeof Deck.Type;
export const DeckState = DeckFile.State;
export type DeckState = typeof DeckState.Type;
export const DeckOperation = DeckFile.Operation;
export type DeckOperation = typeof DeckOperation.Type;
export const DeckOperationResult = DeckFile.Result;
export type DeckOperationResult = typeof DeckOperationResult.Type;

export class DeckNotFound extends Schema.TaggedError<DeckNotFound>()(
  "DeckNotFound",
  { id: DeckId },
  { httpApiStatus: 404 },
) {}

/** Backed by the deck's object: its state and slide-granularity edits. */
export class DecksGroup extends HttpApiGroup.make("decks")
  .add(
    HttpApiEndpoint.get("get", "/", {
      params: { deckId: DeckId },
      success: DeckState,
      error: DeckNotFound,
    }),
    HttpApiEndpoint.put("set", "/", {
      params: { deckId: DeckId },
      payload: Deck,
      success: DeckState,
    }),
    HttpApiEndpoint.post("apply", "/operations", {
      params: { deckId: DeckId },
      payload: DeckOperation,
      success: DeckOperationResult,
      error: [DeckNotFound, InvalidOperation],
    }),
  )
  .prefix("/decks/:deckId") {}
