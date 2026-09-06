import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import { StorageError, UserId } from "./store.ts";

export const NoteId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand("NoteId"));
export type NoteId = typeof NoteId.Type;

export const NoteInput = Schema.Struct({
  title: Schema.Trim.check(Schema.isNonEmpty(), Schema.isMaxLength(120)),
  body: Schema.String.check(Schema.isMaxLength(20_000)),
});
export type NoteInput = typeof NoteInput.Type;

export const Note = Schema.Struct({
  id: NoteId,
  ...NoteInput.fields,
  createdAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  updatedAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export type Note = typeof Note.Type;

export class NoteNotFound extends Schema.TaggedError<NoteNotFound>()(
  "NoteNotFound",
  { id: NoteId },
  { httpApiStatus: 404 },
) {}

/** Keep the demo response bounded; introduce pagination for larger histories. */
export const noteListLimit = 100;

export class NotesGroup extends HttpApiGroup.make("notes")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { userId: UserId },
      success: Schema.Array(Note),
      error: StorageError,
    }),
    HttpApiEndpoint.get("get", "/:id", {
      params: { userId: UserId, id: NoteId },
      success: Note,
      error: [NoteNotFound, StorageError],
    }),
    HttpApiEndpoint.post("create", "/", {
      params: { userId: UserId },
      payload: NoteInput,
      success: Note,
      error: StorageError,
    }),
    HttpApiEndpoint.put("update", "/:id", {
      params: { userId: UserId, id: NoteId },
      payload: NoteInput,
      success: Note,
      error: [NoteNotFound, StorageError],
    }),
    HttpApiEndpoint.delete("remove", "/:id", {
      params: { userId: UserId, id: NoteId },
      success: Note,
      error: [NoteNotFound, StorageError],
    }),
  )
  .prefix("/users/:userId/notes") {}
